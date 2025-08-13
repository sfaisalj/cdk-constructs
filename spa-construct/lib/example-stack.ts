import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SecureWebsite } from './constructs';

export interface ExampleStackProps extends cdk.StackProps {
  readonly domainName: string;
  readonly hostedZoneId?: string;
  readonly codeSourcePath?: string;
}

export class ExampleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ExampleStackProps) {
    super(scope, id, props);

    // Create a secure website with all components
    const website = new SecureWebsite(this, 'SecureWebsite', {
      domainName: props.domainName,
      hostedZoneId: props.hostedZoneId,
      bucketName: `${props.domainName.replace(/\./g, '-')}-website`,
      distributionComment: `Secure website for ${props.domainName}`,
      indexDocument: 'index.html',
      errorDocument: 'error.html',
      enableWaf: true,
      enableLogging: true,
      logsBucketName: `${props.domainName.replace(/\./g, '-')}-logs`,
      codeSourcePath: props.codeSourcePath,
      priceClass: cdk.aws_cloudfront.PriceClass.PRICE_CLASS_100,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      subjectAlternativeNames: [`www.${props.domainName}`],
      wafRules: [
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
          name: 'RateLimitRule',
          priority: 10,
          action: 'BLOCK',
          ruleType: 'RATE_LIMIT',
          configuration: { limit: 1000 },
        },
        {
          name: 'GeoBlockRule',
          priority: 11,
          action: 'BLOCK',
          ruleType: 'GEO_BLOCK',
          configuration: { countryCodes: ['CN', 'RU', 'KP'] },
        },
      ],
    });

    // Tag all resources
    cdk.Tags.of(this).add('Project', 'SecureWebsite');
    cdk.Tags.of(this).add('Environment', 'Production');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}