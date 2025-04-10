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
import { IConstruct } from "constructs";

// Apply removal policy to all resources
class EnforceDeletionPolicyAspect implements cdk.IAspect {
  private readonly policy: cdk.RemovalPolicy;

  constructor(policy: cdk.RemovalPolicy) {
    this.policy = policy;
  }

  public visit(node: IConstruct): void {
    if (cdk.CfnResource.isCfnResource(node)) {
      node.applyRemovalPolicy(this.policy);
    }
    if (this.policy === cdk.RemovalPolicy.DESTROY) {
      if (node instanceof cdk.aws_cognito.UserPool) {
        const cfnCognito = node.node
          .defaultChild as cdk.aws_cognito.CfnUserPool;
        cfnCognito.deletionProtection = "INACTIVE";
      } else if (node instanceof cdk.aws_dynamodb.Table) {
        const cfnTable = node.node.defaultChild as cdk.aws_dynamodb.CfnTable;
        cfnTable.deletionProtectionEnabled = false;
      }
    }
  }
}

export default EnforceDeletionPolicyAspect;
