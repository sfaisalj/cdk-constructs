import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AccountConfigStack } from '../lib';

// Example usage showing how to use AccountConfigStack in your application
class ExampleAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create the account config stack - will read cdk.context.json and upload to Parameter Store
    const accountConfigStack = new AccountConfigStack(this, 'AccountConfig', {
      // Optional: specify account ID, defaults to current stack's account from env
      // accountId: '12313123',
      
      // Optional: specify path to context file, defaults to ./cdk.context.json
      // contextFilePath: './cdk.context.json',
      
      // Optional: customize parameter prefix, defaults to /account-config/{accountId}
      // parameterPrefix: '/my-app/config',
    });

    // Use the loaded configuration
    console.log('Stage:', accountConfigStack.getConfigValue('stage'));
    console.log('Hosted Zone:', accountConfigStack.getConfigValue('appHostedZone'));

    // Access configuration values with defaults
    const stage = accountConfigStack.getConfigValue('stage', 'dev');
    console.log('Using stage:', stage);

    // Access Parameter Store parameters directly for use in other resources
    const stageParameter = accountConfigStack.getParameter('stage');
    console.log('Stage parameter ARN:', stageParameter.parameterArn);

    // Check if config exists before using
    if (accountConfigStack.hasConfig('appHostedZone')) {
      const hostedZone = accountConfigStack.getConfigValue('appHostedZone');
      console.log('Hosted zone configured:', hostedZone);
    }

    // Get all available config keys
    console.log('Available config keys:', accountConfigStack.getAllConfigKeys());
  }
}

const app = new App();
new ExampleAppStack(app, 'ExampleAppStack', {
  env: {
    account: '12313123', // This should match a key in cdk.context.json
    region: 'us-east-1',
  },
});