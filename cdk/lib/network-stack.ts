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
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import EnforceDeletionPolicy from "./EnforceDeletionPolicyAspect";

export interface NetworkStackProps extends cdk.StackProps {
  deploymentId: string;
  vpcId?: string;
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly ecsSg: ec2.SecurityGroup;
  public readonly nlb: elbv2.NetworkLoadBalancer;
  public readonly mainListener: elbv2.NetworkListener;
  public readonly frontendBucket: s3.Bucket;
  public readonly frontendDistribution: cloudfront.Distribution;

  createNetworkResources(vpcId?: string) {
    const flowLogGroup = new logs.LogGroup(this, "VpcFlowLogs", {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const vpc = vpcId
      ? ec2.Vpc.fromLookup(this, "WebsocketAppVpc", {
          vpcId,
        })
      : new ec2.Vpc(this, "WebsocketAppVpc", {
          maxAzs: 2,
          natGateways: 1,
          flowLogs: {
            flowLogs: {
              destination:
                ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
              trafficType: ec2.FlowLogTrafficType.ALL,
            },
          },
        });
    if (!vpc) {
      throw Error(`Failed to initialize VPC. VPC_ID=${vpcId}.`);
    }

    // Add VPC endpoint for GuardDuty: without this, stack destruction becomes manual as GuardDuty automatically creates a VPC endpoint for ECS automatic scanning
    vpc.addInterfaceEndpoint("GuardDutyEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.GUARDDUTY_DATA,
    });

    const nlbSg = new ec2.SecurityGroup(this, "NlbSecurityGroup", {
      vpc: vpc,
      description: "Security group for Network Load Balancer",
      allowAllOutbound: true,
    });
    const cloudFrontPrefixList = ec2.PrefixList.fromPrefixListId(
      this,
      "CloudFrontPrefixList",
      "pl-3b927c52"
    );
    nlbSg.addIngressRule(
      ec2.Peer.prefixList(cloudFrontPrefixList.prefixListId),
      ec2.Port.tcp(80),
      "Allow HTTP traffic to ECS"
    );

    const ecsSg = new ec2.SecurityGroup(this, "WebsocketEcsSg", {
      vpc: vpc,
      description: "Security group for WebSocket ECS service",
      allowAllOutbound: true,
    });
    ecsSg.addIngressRule(
      nlbSg,
      ec2.Port.tcp(80),
      "Allow HTTP traffic from anywhere"
    );

    return { vpc, nlbSg, ecsSg };
  }

  selectSubnets(): ec2.SubnetSelection | undefined {
    const subnetIds = process.env.SUBNET_IDS?.split(",") || [];
    return subnetIds.length > 0
      ? {
          subnets: subnetIds.map((id, index) =>
            ec2.Subnet.fromSubnetId(this, `ImportedSubnet${index}`, id)
          ),
        }
      : undefined;
  }

  createNlb(deploymentId: string, vpc: ec2.IVpc, nlbSg: ec2.SecurityGroup) {
    const vpcSubnets = this.selectSubnets();
    const nlb = new elbv2.NetworkLoadBalancer(this, "WebsocketNLB", {
      vpc: vpc,
      internetFacing: true,
      crossZoneEnabled: false, // for performance reasons
      loadBalancerName: `websocket-nlb-${deploymentId}`,
      securityGroups: [nlbSg],
      vpcSubnets,
    });
    const mainListener = nlb.addListener("WebsocketListener", {
      port: 80,
      protocol: elbv2.Protocol.TCP,
    });

    return { nlb, mainListener };
  }

  createFrontend(nlb: elbv2.NetworkLoadBalancer, logsBucket: s3.Bucket) {
    const frontendBucket = new s3.Bucket(this, "StaticReactWebsiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      enforceSSL: true,
      serverAccessLogsBucket: logsBucket,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      "OriginAccessIdentity"
    );
    frontendBucket.grantRead(originAccessIdentity);

    const frontendDistribution = new cloudfront.Distribution(
      this,
      "FrontendDistribution",
      {
        defaultBehavior: {
          origin:
            origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        },
        additionalBehaviors: {
          "/api/*": {
            origin: new origins.HttpOrigin(nlb.loadBalancerDnsName, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
              httpPort: 80,
              readTimeout: cdk.Duration.seconds(60),
              keepaliveTimeout: cdk.Duration.seconds(60),
              connectionTimeout: cdk.Duration.seconds(10),
              connectionAttempts: 3,
            }),
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          },
        },
        defaultRootObject: "index.html",
        errorResponses: [
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.minutes(0),
          },
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.minutes(0),
          },
        ],
        // Path to prod: Enforce TLS 1.2 or higher by bringing your own custom domain
        // CloudFront default distribution overrides this setting to use TLSv1
        // minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        // Enable access logging
        enableLogging: true,
        logBucket: logsBucket,
        logFilePrefix: "cloudfront-logs/",
        // Enable geo restrictions
        // geoRestriction: cloudfront.GeoRestriction.allowlist("US", "EU"),
        // Associate WAF
        // webAclId: cfWaf.attrArn,
      }
    );

    return { frontendBucket, frontendDistribution };
  }

  logOutputs() {
    new cdk.CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId,
      description: "VPC ID",
      exportName: `${this.stackName}-VpcId`,
    });

    new cdk.CfnOutput(this, "NlbDnsName", {
      value: this.nlb.loadBalancerDnsName,
      description: "NLB DNS Name",
      exportName: `${this.stackName}-NlbDnsName`,
    });

    new cdk.CfnOutput(this, "NlbUrl", {
      value: `http://${this.nlb.loadBalancerDnsName}:80`,
      description: "NLB URL",
      exportName: `${this.stackName}-NlbUrl`,
    });
  }

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const logsBucket = new s3.Bucket(this, "StaticWebsiteAccessLogs", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
    });

    const { deploymentId } = props;

    const { vpc, nlbSg, ecsSg } = this.createNetworkResources(props.vpcId);
    this.vpc = vpc;
    this.ecsSg = ecsSg;

    const { nlb, mainListener } = this.createNlb(deploymentId, vpc, nlbSg);
    this.nlb = nlb;
    this.mainListener = mainListener;

    const { frontendBucket, frontendDistribution } = this.createFrontend(
      nlb,
      logsBucket
    );
    this.frontendDistribution = frontendDistribution;
    this.frontendBucket = frontendBucket;

    this.logOutputs();

    /**
     * Add aspect to enforce deletion policy for all resources in the stack
     */
    if (process.env.ENV !== "prod") {
      cdk.Aspects.of(this).add(
        new EnforceDeletionPolicy(cdk.RemovalPolicy.DESTROY)
      );
    }
  }
}
