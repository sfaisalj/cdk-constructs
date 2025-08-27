# Account Config CDK Stack

A CDK stack that reads AWS account configuration from `cdk.context.json` and uploads the values to AWS Systems Manager Parameter Store.

## Features

- Reads account-specific configuration from `cdk.context.json`
- Automatically uploads all configuration values to Parameter Store
- Provides easy access to configuration values
- Supports custom parameter prefixes and file paths
- Type-safe configuration access

## Usage

### 1. Setup your `cdk.context.json`

The construct expects a JSON file where account IDs are keys:

```json
{
  "123456789012": {
    "stage": "dev",
    "appHostedZone": "dev.domain.com",
    "appHostedZoneId": "Z12312AFWASD",
    "customValue": "any value"
  },
  "123456789013": {
    "stage": "prod",
    "appHostedZone": "prod.domain.com", 
    "appHostedZoneId": "Z123ASDASDASD"
  }
}
```

### 2. Use the Stack

```typescript
import { App } from 'aws-cdk-lib';
import { AccountConfigStack } from 'account-config';

const app = new App();

// Create the account config stack
const accountConfigStack = new AccountConfigStack(app, 'AccountConfigStack', {
  env: {
    account: '123456789012', // This should match a key in cdk.context.json
    region: 'us-east-1',
  },
});

// Access configuration values
const stage = accountConfigStack.getConfigValue('stage');
const hostedZone = accountConfigStack.getConfigValue('appHostedZone');

// Access Parameter Store parameters
const stageParameter = accountConfigStack.getParameter('stage');

// Use parameter values in other resources
console.log('Parameter ARN:', stageParameter.parameterArn);
```

### 3. Configuration Options

```typescript
const accountConfigStack = new AccountConfigStack(app, 'AccountConfigStack', {
  // Optional: specify account ID (defaults to stack account from env)
  accountId: '123456789012',
  
  // Optional: path to context file (defaults to ./cdk.context.json)
  contextFilePath: './my-config.json',
  
  // Optional: Parameter Store prefix (defaults to /account-config/{accountId})
  parameterPrefix: '/my-app/config',
  
  env: {
    account: '123456789012',
    region: 'us-east-1',
  },
});
```

## API Reference

### Methods

- `getConfigValue<T>(key: string, defaultValue?: T): T` - Get a configuration value with optional default
- `getParameter(key: string): StringParameter` - Get the Parameter Store parameter for a config key
- `getParameterValue(key: string): string` - Get the parameter value as string
- `getAllConfigKeys(): string[]` - Get all available configuration keys
- `hasConfig(key: string): boolean` - Check if a configuration key exists

### Properties

- `config: AccountConfig` - The loaded configuration object
- `accountId: string` - The AWS account ID being used
- `parameters: { [key: string]: StringParameter }` - Map of created Parameter Store parameters

## Parameter Store Structure

Configuration values are stored in Parameter Store with the following structure:

- Default prefix: `/account-config/{accountId}/`
- Parameter names: `/account-config/{accountId}/{configKey}`
- Example: `/account-config/123456789012/stage`

## Error Handling

The construct will throw errors for:
- Missing or unreadable `cdk.context.json` file
- Account ID not found in configuration
- Missing Parameter Store parameters when accessing them

## Project Structure

```
account-config/
├── bin/
│   └── account-config.ts          # CDK app entry point
├── lib/
│   ├── account-config-stack.ts    # Main stack implementation
│   └── index.ts                   # Exports
├── test/
│   └── account-config.test.ts     # Unit tests
├── example/
│   └── simple-usage.ts            # Usage example
├── cdk.context.json               # Account configurations
├── cdk.json                       # CDK app configuration  
├── package.json                   # Dependencies and scripts
└── tsconfig.json                  # TypeScript configuration
```

## Development

```bash
# Install dependencies
npm install

# Build the stack
npm run build

# Run tests
npm test

# Deploy the stack
npm run cdk deploy

# Watch for changes
npm run watch
```

## Deployment

You can deploy this stack in two ways:

### 1. Standalone Deployment
```bash
cdk deploy --app "npx ts-node bin/account-config.ts"
```

### 2. As part of another CDK app
```typescript
import { AccountConfigStack } from 'account-config';

const app = new App();
new AccountConfigStack(app, 'AccountConfig', {
  env: { account: '123456789012', region: 'us-east-1' }
});
```
