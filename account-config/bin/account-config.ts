#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AccountConfigStack } from '../lib/account-config-stack';

const app = new cdk.App();

new AccountConfigStack(app, 'AccountConfigStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});