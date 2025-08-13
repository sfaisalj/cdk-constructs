import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SecureWebsite } from '../lib/constructs';

export class SimpleWebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Simple usage - minimal configuration
    new SecureWebsite(this, 'MyWebsite', {
      domainName: 'mysite.example.com',
    });
  }
}

export class AdvancedWebsiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Advanced usage - full configuration
    const website = new SecureWebsite(this, 'MyAdvancedWebsite', {
      domainName: 'myadvancedsite.example.com',
      hostedZoneId: 'Z1234567890123',
      bucketName: 'my-custom-bucket-name',
      distributionComment: 'My advanced website distribution',
      indexDocument: 'index.html',
      errorDocument: '404.html',
      enableWaf: true,
      enableLogging: true,
      logsBucketName: 'my-cloudfront-logs',
      codeSourcePath: './src/website',
      priceClass: cdk.aws_cloudfront.PriceClass.PRICE_CLASS_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      subjectAlternativeNames: ['www.myadvancedsite.example.com'],
      wafRules: [
        {
          name: 'CustomRateLimit',
          priority: 1,
          action: 'BLOCK',
          ruleType: 'RATE_LIMIT',
          configuration: { limit: 500 },
        },
        {
          name: 'BlockSpecificCountries',
          priority: 2,
          action: 'BLOCK',
          ruleType: 'GEO_BLOCK',
          configuration: { countryCodes: ['XX', 'YY'] },
        },
      ],
    });

    // Access individual components
    new cdk.CfnOutput(this, 'BucketArn', {
      value: website.bucket.bucketArn,
    });

    new cdk.CfnOutput(this, 'DistributionDomain', {
      value: website.distribution.distributionDomainName,
    });
  }
}