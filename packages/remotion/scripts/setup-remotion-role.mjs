// Run: node scripts/setup-remotion-role.mjs
import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand,
  PutRolePolicyCommand,
} from '@aws-sdk/client-iam';

const REGION = 'us-east-1';
const ROLE_NAME = 'remotion-lambda-role';

const client = new IAMClient({ region: REGION });

const trustPolicy = JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Principal: { Service: 'lambda.amazonaws.com' },
      Action: 'sts:AssumeRole',
    },
  ],
});

const remotionPolicy = JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'HandleQuotas',
      Effect: 'Allow',
      Action: [
        'servicequotas:GetServiceQuota',
        'servicequotas:GetAWSDefaultServiceQuota',
        'servicequotas:RequestServiceQuotaIncrease',
        'servicequotas:ListRequestedServiceQuotaChangesByService',
      ],
      Resource: ['*'],
    },
    {
      Sid: 'PermissionValidation',
      Effect: 'Allow',
      Action: ['iam:SimulatePrincipalPolicy'],
      Resource: ['*'],
    },
    {
      Sid: 'LambdaInvokation',
      Effect: 'Allow',
      Action: ['iam:PassRole'],
      Resource: ['arn:aws:iam::*:role/remotion-lambda-role'],
    },
    {
      Sid: 'Storage',
      Effect: 'Allow',
      Action: [
        's3:GetObject',
        's3:DeleteObject',
        's3:PutObjectAcl',
        's3:PutObject',
        's3:CreateBucket',
        's3:ListBucket',
        's3:GetBucketLocation',
        's3:PutBucketAcl',
        's3:DeleteBucket',
        's3:GetBucketWebsite',
        's3:PutBucketWebsite',
        's3:DeleteBucketWebsite',
        's3:GetBucketPolicy',
        's3:PutBucketPolicy',
        's3:PutBucketCORS',
        's3:GetBucketCORS',
        's3:GetBucketVersioning',
        's3:PutBucketVersioning',
        's3:ListBucketVersions',
      ],
      Resource: ['arn:aws:s3:::remotionlambda-*', 'arn:aws:s3:::remotionlambda-*/*'],
    },
    {
      Sid: 'BucketListing',
      Effect: 'Allow',
      Action: ['s3:ListAllMyBuckets'],
      Resource: ['*'],
    },
    {
      Sid: 'FunctionListing',
      Effect: 'Allow',
      Action: ['lambda:ListFunctions', 'lambda:GetFunction'],
      Resource: ['*'],
    },
    {
      Sid: 'FunctionManagement',
      Effect: 'Allow',
      Action: [
        'lambda:InvokeFunction',
        'lambda:CreateFunction',
        'lambda:DeleteFunction',
        'lambda:PutFunctionEventInvokeConfig',
        'lambda:PutRuntimeManagementConfig',
        'lambda:TagResource',
      ],
      Resource: ['arn:aws:lambda:*:*:function:remotion-render-*'],
    },
    {
      Sid: 'LogsRetention',
      Effect: 'Allow',
      Action: ['logs:CreateLogGroup', 'logs:PutRetentionPolicy'],
      Resource: ['arn:aws:logs:*:*:log-group:/aws/lambda/remotion-render-*'],
    },
    {
      Sid: 'FetchBinaries',
      Effect: 'Allow',
      Action: ['lambda:GetLayerVersion'],
      Resource: [
        'arn:aws:lambda:*:678892195805:layer:remotion-binaries-*',
        'arn:aws:lambda:*:580247275435:layer:LambdaInsightsExtension*',
      ],
    },
  ],
});

async function setupRole() {
  console.log(`Creating IAM role: ${ROLE_NAME}...`);

  try {
    await client.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
    console.log('Role already exists, skipping creation.');
  } catch {
    await client.send(
      new CreateRoleCommand({
        RoleName: ROLE_NAME,
        AssumeRolePolicyDocument: trustPolicy,
        Description: 'Execution role for Remotion Lambda renders',
      })
    );
    console.log('Role created.');
  }

  await client.send(
    new AttachRolePolicyCommand({
      RoleName: ROLE_NAME,
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    })
  );
  console.log('Attached AWSLambdaBasicExecutionRole.');

  await client.send(
    new PutRolePolicyCommand({
      RoleName: ROLE_NAME,
      PolicyName: 'remotion-policy',
      PolicyDocument: remotionPolicy,
    })
  );
  console.log('Attached remotion-policy inline policy.');
  console.log('Done! remotion-lambda-role is ready.');
}

setupRole().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
