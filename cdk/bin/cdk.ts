/**
 * Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
 *
 * Licensed under the Amazon Software License (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *   http://aws.amazon.com/asl/
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

import * as cdk from "aws-cdk-lib";
import { S2SAppStack } from "../lib/s2s-stack";
import { NetworkStack } from "../lib/network-stack";
import * as dotenv from "dotenv";
import * as path from "path";
// import { AwsSolutionsChecks, NagSuppressions } from "cdk-nag";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const app = new cdk.App();
const env = process.env.ENV || "dev";
const vpcId = process.env.VPC_ID;

console.log(`Using VPC ${vpcId}`);

const cognitoDomainPrefix = app.node.tryGetContext("cognitoDomainPrefix");
const STACK_PREFIX = "S2SCDK";

// Create the network stack first
const networkStack = new NetworkStack(
  app,
  `${STACK_PREFIX}-NetworkStack-${env}`,
  {
    deploymentId: env,
    vpcId,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },
  }
);

// Create the main application stack, passing the network stack
const s2sStack = new S2SAppStack(app, `${STACK_PREFIX}-S2SStack-${env}`, {
  networkStack,
  cognitoDomainPrefix,
  knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID || "",
  dynamoDbTableName: process.env.DYNAMODB_TABLE_NAME || "",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

/*
// Enable AWS Solutions Checks
cdk.Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// PathToProd: These should be reviewed and refined in continuous security reviews
NagSuppressions.addStackSuppressions(networkStack, [
  {
    id: "AwsSolutions-ELB2",
    reason:
      "NLB access logging not necessary for a sample application. Enable this as needed for your organization's requirements when moving to production.",
  },
  {
    id: "AwsSolutions-CFR4",
    reason:
      "For a sample application, bringing your own custom certificate at the beginning can be too much. Handle this in production.",
  },
  {
    id: "AwsSolutions-CFR5",
    reason:
      "For a sample application, bringing your own custom certificate at the beginning can be too much. Handle this in production.",
  },
]);

NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/WebsocketTaskDef/Resource`,
  [
    {
      id: "AwsSolutions-ECS2",
      reason:
        "This is a sample/development application with non-sensitive environment variables",
    },
  ]
);

NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/WebsocketTaskRole/DefaultPolicy/Resource`,
  [
    {
      id: "AwsSolutions-IAM5",
      reason: "We allow invoke model* on only Amazon Nova Sonic",
      appliesTo: ["Action::bedrock:InvokeModel*"],
    },
  ]
);


// ========================================================================
// Everything below this point is related to custom resources deploying the
// frontend to the S3 bucket. These are required permissions for standard patterns.
// ========================================================================

// ConfigCreatorRole
NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/ConfigJsCreatorFunction/ServiceRole/Resource`,
  [
    {
      id: "AwsSolutions-IAM4",
      reason:
        "CR provider can use standard execution role, whereas the lambda is appropriately scoped down.",
      appliesTo: [
        "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      ],
    },
  ]
);

NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/ConfigJsCreatorFunction/ServiceRole/DefaultPolicy/Resource`,
  [
    {
      id: "AwsSolutions-IAM5",
      reason: "The wildcard is used to give necessary permissions.",
      appliesTo: [
        "Action::s3:Abort*",
        "Action::s3:DeleteObject*",
        "Resource::<StaticReactWebsiteBucketC08DA652.Arn>/*",
      ],
    },
  ]
);

// ConfigProvider/framework-onEvent
NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/ConfigProvider/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
  [
    {
      id: "AwsSolutions-IAM5",
      reason: "CDK custom resource framework requires access to the CR Lambda",
      appliesTo: ["Resource::<ConfigJsCreatorFunctionFA8C7E27.Arn>:*"],
    },
  ]
);

// // DeployFrontend
NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/DeployFrontend/CustomResourceHandler/inlinePolicyAddedToExecutionRole-0/Resource`,
  [
    {
      id: "AwsSolutions-IAM5",
      reason:
        "BucketDeployment requires these permissions for deployment and CloudFront invalidation",
      appliesTo: ["Resource::*"],
    },
  ]
);

// BucketDeployment permissions
NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/ServiceRole/DefaultPolicy/Resource`,
  [
    {
      id: "AwsSolutions-IAM5",
      reason:
        "CDK BucketDeployment construct requires these S3 permissions for deployment",
      appliesTo: [
        "Action::s3:GetBucket*",
        "Action::s3:GetObject*",
        "Action::s3:List*",
        "Action::s3:Abort*",
        "Action::s3:DeleteObject*",
        "Resource::arn:<AWS::Partition>:s3:::cdk-hnb659fds-assets-<AWS::AccountId>-<AWS::Region>/*",
        "Resource::<StaticReactWebsiteBucketC08DA652.Arn>/*",
        "Resource::*",
      ],
    },
  ]
);

NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/ConfigProvider/framework-onEvent/ServiceRole/Resource`,
  [
    {
      id: "AwsSolutions-IAM4",
      reason:
        "CR provider can use standard execution role, whereas the lambda is appropriately scoped down.",
      appliesTo: [
        "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      ],
    },
  ]
);

NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/ServiceRole/Resource`,
  [
    {
      id: "AwsSolutions-IAM4",
      reason:
        "CR provider can use standard execution role, whereas the lambda is appropriately scoped down.",
      appliesTo: [
        "Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      ],
    },
  ]
);

// Cognito outdated Nag rule
NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/WebSocketUserPool/Resource`,
  [
    {
      id: "AwsSolutions-COG3",
      reason:
        "This should be checking feature plan instead. Userpool turns on PLUS feature plan if ENV = prod otherwise ESSENTIALS",
    },
  ]
);

// Lambda runtime warnings
NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/ConfigJsCreatorFunction/Resource`,
  [
    {
      id: "AwsSolutions-L1",
      reason:
        "CR Using CDK-provided Lambda with current runtime. This is appropriate",
    },
  ]
);

NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/ConfigProvider/framework-onEvent/Resource`,
  [
    {
      id: "AwsSolutions-L1",
      reason:
        "CR Using CDK-provided Lambda with current runtime. This is appropriate",
    },
  ]
);

NagSuppressions.addResourceSuppressionsByPath(
  s2sStack,
  `/S2SStack-${env}/Custom::CDKBucketDeployment8693BB64968944B69AAFB0CC9EB8756C/Resource`,
  [
    {
      id: "AwsSolutions-L1",
      reason:
        "CR Using CDK-provided Lambda with current runtime. This is appropriate",
    },
  ]
);
*/
