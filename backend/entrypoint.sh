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

# Function to refresh credentials
refresh_aws_credentials() {
    CREDS=$(curl -s 169.254.170.2$AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)

    if [[ -z "$CREDS" ]]; then
        echo "Failed to fetch AWS credentials."
        exit 1
    fi

    export AWS_ACCESS_KEY_ID=$(echo $CREDS | jq -r '.AccessKeyId')
    export AWS_SECRET_ACCESS_KEY=$(echo $CREDS | jq -r '.SecretAccessKey')
    export AWS_SESSION_TOKEN=$(echo $CREDS | jq -r '.Token')
    export AWS_REGION=$(curl -s 169.254.169.254/latest/meta-data/placement/region || echo "us-east-1")

    echo "AWS credentials refreshed"
}

# Check if credentials are about to expire and refresh if necessary
check_and_refresh_credentials() {
    aws sts get-caller-identity > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        # Credentials are invalid or expired, refresh them
        refresh_aws_credentials
    fi
}

# Initial fetch
refresh_aws_credentials

(
  while true; do
    sleep 300  # Check every 5 minutes, you can adjust this if you want less frequent checks
    check_and_refresh_credentials
  done
) &


"$@"
