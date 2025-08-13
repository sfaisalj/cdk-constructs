import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { RemovalPolicy, CfnOutput, Duration } from 'aws-cdk-lib';

export interface SecureWebsiteProps {
  readonly domainName: string;
  readonly account?: string;
  readonly hostedZoneId?: string;
  readonly bucketName?: string;
  readonly distributionComment?: string;
  readonly errorDocument?: string;
  readonly indexDocument?: string;
  readonly enableWaf?: boolean;
  readonly wafRules?: WafRule[];
  readonly codeSourcePath?: string;
  readonly priceClass?: cloudfront.PriceClass;
  readonly removalPolicy?: RemovalPolicy;
  readonly subjectAlternativeNames?: string[];
  readonly enableLogging?: boolean;
  readonly logsBucketName?: string;
}

export interface WafRule {
  readonly name: string;
  readonly priority: number;
  readonly action: 'ALLOW' | 'BLOCK' | 'COUNT';
  readonly ruleType: 'RATE_LIMIT' | 'GEO_BLOCK' | 'IP_SET' | 'MANAGED_RULE';
  readonly configuration?: {
    limit?: number;
    countryCodes?: string[];
    name?: string;
    ipAddresses?: string[];
  };
}

export class SecureWebsite extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly logsBucket?: s3.Bucket;
  public readonly certificate: acm.Certificate;
  public readonly webAcl?: wafv2.CfnWebACL;
  public readonly distribution: cloudfront.Distribution;
  public readonly hostedZone: route53.IHostedZone;
  public readonly aRecord: route53.ARecord;
  public readonly aaaaRecord: route53.AaaaRecord;
  public readonly deployment?: s3deploy.BucketDeployment;
  private readonly account: string;

  constructor(scope: Construct, id: string, props: SecureWebsiteProps) {
    super(scope, id);

    this.account = props.account || '*';

    // Get or create hosted zone
    this.hostedZone = props.hostedZoneId
      ? route53.HostedZone.fromHostedZoneId(this, 'HostedZone', props.hostedZoneId)
      : route53.HostedZone.fromLookup(this, 'HostedZone', {
          domainName: this.getApexDomain(props.domainName),
        });

    // Create ACM certificate
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      subjectAlternativeNames: props.subjectAlternativeNames,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // Create S3 bucket for website content
    this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: props.bucketName,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: props.removalPolicy || RemovalPolicy.DESTROY,
      autoDeleteObjects: props.removalPolicy === RemovalPolicy.DESTROY,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Create logs bucket if logging is enabled
    if (props.enableLogging) {
      this.logsBucket = new s3.Bucket(this, 'LogsBucket', {
        bucketName: props.logsBucketName,
        publicReadAccess: false,
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: props.removalPolicy || RemovalPolicy.DESTROY,
        autoDeleteObjects: props.removalPolicy === RemovalPolicy.DESTROY,
        lifecycleRules: [
          {
            id: 'DeleteOldLogs',
            enabled: true,
            expiration: Duration.days(90),
          },
        ],
      });
    }

    // Create Origin Access Control
    const originAccessControl = new cloudfront.S3OriginAccessControl(this, 'OAC', {
      description: `OAC for ${props.domainName}`,
    });

    // Create WAF WebACL if enabled
    if (props.enableWaf !== false) {
      this.webAcl = this.createWebAcl(props.wafRules || this.getDefaultWafRules());
    }

    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
          originAccessControl,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket, {
            originAccessControl,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
      domainNames: [props.domainName, ...(props.subjectAlternativeNames || [])],
      certificate: this.certificate,
      defaultRootObject: props.indexDocument || 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: `/${props.indexDocument || 'index.html'}`,
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: `/${props.indexDocument || 'index.html'}`,
          ttl: Duration.minutes(5),
        },
      ],
      priceClass: props.priceClass || cloudfront.PriceClass.PRICE_CLASS_100,
      comment: props.distributionComment || `Secure website for ${props.domainName}`,
      webAclId: this.webAcl?.attrArn,
      enableLogging: props.enableLogging,
      logBucket: this.logsBucket,
      logFilePrefix: 'cloudfront-logs/',
      logIncludesCookies: true,
    });

    // Grant CloudFront access to S3 bucket
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        resources: [`${this.bucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
          },
        },
      })
    );

    // Create Route53 records
    this.aRecord = new route53.ARecord(this, 'ARecord', {
      zone: this.hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });

    this.aaaaRecord = new route53.AaaaRecord(this, 'AaaaRecord', {
      zone: this.hostedZone,
      recordName: props.domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      ),
    });

    // Deploy website content if source path provided
    if (props.codeSourcePath) {
      this.deployment = new s3deploy.BucketDeployment(this, 'WebsiteDeployment', {
        sources: [s3deploy.Source.asset(props.codeSourcePath)],
        destinationBucket: this.bucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
        prune: true,
        retainOnDelete: false,
      });
    }

    // Create outputs
    this.createOutputs(props);
  }

  private createWebAcl(rules: WafRule[]): wafv2.CfnWebACL {
    const wafRules: wafv2.CfnWebACL.RuleProperty[] = rules.map(rule => ({
      name: rule.name,
      priority: rule.priority,
      action: this.createWafAction(rule.action),
      statement: this.createWafStatement(rule),
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: rule.name,
      },
    }));

    return new wafv2.CfnWebACL(this, 'WebACL', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      rules: wafRules,
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'SecureWebsiteWAF',
      },
    });
  }

  private createWafAction(action: string): any {
    switch (action) {
      case 'ALLOW': return { allow: {} };
      case 'BLOCK': return { block: {} };
      case 'COUNT': return { count: {} };
      default: return { allow: {} };
    }
  }

  private createWafStatement(rule: WafRule): any {
    switch (rule.ruleType) {
      case 'RATE_LIMIT':
        return {
          rateBasedStatement: {
            limit: rule.configuration?.limit || 2000,
            aggregateKeyType: 'IP',
          },
        };
      case 'MANAGED_RULE':
        return {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: rule.configuration?.name || 'AWSManagedRulesCommonRuleSet',
          },
        };
      case 'GEO_BLOCK':
        return {
          geoMatchStatement: {
            countryCodes: rule.configuration?.countryCodes || ['CN', 'RU'],
          },
        };
      case 'IP_SET':
        const ipSet = new wafv2.CfnIPSet(this, `IPSet-${rule.name}`, {
          scope: 'CLOUDFRONT',
          ipAddressVersion: 'IPV4',
          addresses: rule.configuration?.ipAddresses || [],
        });
        return {
          ipSetReferenceStatement: {
            arn: ipSet.attrArn,
          },
        };
      default:
        return {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesCommonRuleSet',
          },
        };
    }
  }

  private getDefaultWafRules(): WafRule[] {
    return [
      {
        name: 'AWSManagedRulesCommonRuleSet',
        priority: 1,
        action: 'BLOCK',
        ruleType: 'MANAGED_RULE',
        configuration: { name: 'AWSManagedRulesCommonRuleSet' },
      },
      {
        name: 'AWSManagedRulesKnownBadInputsRuleSet',
        priority: 2,
        action: 'BLOCK',
        ruleType: 'MANAGED_RULE',
        configuration: { name: 'AWSManagedRulesKnownBadInputsRuleSet' },
      },
      {
        name: 'AWSManagedRulesLinuxRuleSet',
        priority: 3,
        action: 'BLOCK',
        ruleType: 'MANAGED_RULE',
        configuration: { name: 'AWSManagedRulesLinuxRuleSet' },
      },
      {
        name: 'RateLimitRule',
        priority: 10,
        action: 'BLOCK',
        ruleType: 'RATE_LIMIT',
        configuration: { limit: 2000 },
      },
    ];
  }

  private getApexDomain(domainName: string): string {
    const parts = domainName.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    return domainName;
  }

  private createOutputs(props: SecureWebsiteProps): void {
    new CfnOutput(this, 'WebsiteUrl', {
      value: `https://${props.domainName}`,
      description: 'Website URL',
    });

    new CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name for website content',
    });

    new CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
    });

    new CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'ACM certificate ARN',
    });

    if (this.webAcl) {
      new CfnOutput(this, 'WebAclArn', {
        value: this.webAcl.attrArn,
        description: 'WAF WebACL ARN',
      });
    }

    if (this.logsBucket) {
      new CfnOutput(this, 'LogsBucketName', {
        value: this.logsBucket.bucketName,
        description: 'CloudFront logs bucket name',
      });
    }
  }

  public addWafRule(rule: WafRule): void {
    if (!this.webAcl) {
      throw new Error('WAF is not enabled for this construct');
    }
    // This would require updating the WebACL rules
    console.warn('Adding WAF rules after creation is not yet implemented');
  }

  public invalidateCache(paths: string[] = ['/*']): void {
    // This would create a CloudFront invalidation
    // Implementation would depend on deployment context
    console.log(`Cache invalidation requested for paths: ${paths.join(', ')}`);
  }
}