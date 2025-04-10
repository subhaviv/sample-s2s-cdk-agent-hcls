#!/bin/bash

#
# Copyright 2025 Amazon.com, Inc. and its affiliates. All Rights Reserved.
#
# Licensed under the Amazon Software License (the "License").
# You may not use this file except in compliance with the License.
# A copy of the License is located at
#
#   http://aws.amazon.com/asl/
#
# or in the "license" file accompanying this file. This file is distributed
# on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
# express or implied. See the License for the specific language governing
# permissions and limitations under the License.
#

set -euo pipefail

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting deployment...${NC}"

# 1. Check and display AWS credentials and region
echo -e "${GREEN}Checking AWS credentials and region...${NC}"
echo -ne "${YELLOW}AWS Identity:${NC} "
aws sts get-caller-identity --output text --query 'Arn'

echo -ne "\n${YELLOW}AWS Region:${NC} "
aws ec2 describe-availability-zones --output text --query 'AvailabilityZones[0].[RegionName]'
echo ""

# 2. Install frontend dependencies
echo -e "${GREEN}Installing frontend dependencies and building the asset...${NC}"
cd frontend
## Copy system prompt contents into /public
cp ../config/system_prompt.txt ./public
npm install
npm run build
cd ..

cp .env ./backend/

# Install CDK dependencies
echo -e "${GREEN}Installing CDK dependencies...${NC}"
cd cdk
npm install
cd ..

echo -e "${GREEN}Deploying the CDK stacks...${NC}"
cd cdk
npx aws-cdk deploy --all --require-approval never

echo "${GREEN}✅️ Deployment script exited with status 0.${NC}"
