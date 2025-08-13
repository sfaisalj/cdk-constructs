#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ExampleStack } from '../lib/example-stack';

const app = new cdk.App();

// Example usage of the SecureWebsite construct
new ExampleStack(app, 'ExampleWebsiteStack', {
  domainName: 'example.com', // Replace with your actual domain
  // hostedZoneId: 'Z1234567890', // Optional: specify if you know the hosted zone ID
  // codeSourcePath: './website', // Optional: path to your website files
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront certificates must be in us-east-1
  },
  description: 'Example stack showcasing the SecureWebsite construct',
});

// You can create multiple websites with different configurations
new ExampleStack(app, 'TestWebsiteStack', {
  domainName: 'test.example.com',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: 'Test environment website',
});