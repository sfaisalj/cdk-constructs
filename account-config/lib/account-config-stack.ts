import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as fs from 'fs';
import * as path from 'path';

export interface AccountConfig {
  readonly [key: string]: any;
}

export interface AccountConfigStackProps extends StackProps {
  readonly accountId?: string;
  readonly contextFilePath?: string;
  readonly parameterPrefix?: string;
}

export class AccountConfigStack extends Stack {
  public readonly config: AccountConfig;
  public readonly accountId: string;
  public readonly parameters: { [key: string]: ssm.StringParameter } = {};

  constructor(scope: Construct, id: string, props: AccountConfigStackProps = {}) {
    super(scope, id, props);

    // Get account ID from props, stack, or AWS context
    this.accountId = props.accountId || this.account;
    
    const contextFilePath = props.contextFilePath || path.join(process.cwd(), 'cdk.context.json');
    const parameterPrefix = props.parameterPrefix || `/account-config/${this.accountId}`;

    // Read and parse cdk.context.json
    let accountsContext: { [key: string]: AccountConfig };
    try {
      const contextContent = fs.readFileSync(contextFilePath, 'utf8');
      accountsContext = JSON.parse(contextContent);
    } catch (error) {
      throw new Error(`Failed to read or parse context file at ${contextFilePath}: ${error}`);
    }

    if (!accountsContext[this.accountId]) {
      throw new Error(`No configuration found for account ID '${this.accountId}'. Available accounts: ${Object.keys(accountsContext).join(', ')}`);
    }

    this.config = accountsContext[this.accountId] as AccountConfig;

    // Upload all configuration values to Parameter Store
    this.uploadConfigToParameterStore(parameterPrefix);

    this.createOutputs(parameterPrefix);
  }

  private uploadConfigToParameterStore(parameterPrefix: string): void {
    Object.entries(this.config).forEach(([key, value]) => {
      const parameterName = `${parameterPrefix}/${key}`;
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      
      this.parameters[key] = new ssm.StringParameter(this, `Parameter${this.capitalizeFirst(key)}`, {
        parameterName,
        stringValue,
        description: `Account configuration value for ${key}`,
        tier: ssm.ParameterTier.STANDARD,
      });
    });
  }

  public getParameter(key: string): ssm.StringParameter {
    if (!this.parameters[key]) {
      throw new Error(`Parameter '${key}' not found. Available parameters: ${Object.keys(this.parameters).join(', ')}`);
    }
    return this.parameters[key];
  }

  public getParameterValue(key: string): string {
    return this.parameters[key].stringValue;
  }

  public getConfigValue<T>(key: string, defaultValue: T): T;
  public getConfigValue<T>(key: string): T | undefined;
  public getConfigValue<T>(key: string, defaultValue?: T): T | undefined {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }

  public getAllConfigKeys(): string[] {
    return Object.keys(this.config);
  }

  public hasConfig(key: string): boolean {
    return this.config[key] !== undefined;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private createOutputs(parameterPrefix: string): void {
    new CfnOutput(this, 'AccountId', {
      value: this.accountId,
      description: 'AWS Account ID',
    });

    new CfnOutput(this, 'ParameterPrefix', {
      value: parameterPrefix,
      description: 'Parameter Store prefix for account configuration',
    });

    new CfnOutput(this, 'ConfigKeys', {
      value: this.getAllConfigKeys().join(','),
      description: 'Available configuration keys',
    });

    // Output parameter ARNs
    Object.entries(this.parameters).forEach(([key, parameter]) => {
      new CfnOutput(this, `${this.capitalizeFirst(key)}ParameterArn`, {
        value: parameter.parameterArn,
        description: `Parameter Store ARN for ${key}`,
      });
    });
  }
}