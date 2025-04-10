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

import os
import json
import logging
import urllib.request
import jwt
import jwcrypto.jwk as jwk
from functools import lru_cache

# Configure logging
logger = logging.getLogger(__name__)

# Get environment variables
USER_POOL_ID = os.environ.get("USER_POOL_ID", "")
CLIENT_ID = os.environ.get("CLIENT_ID", "")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

if not USER_POOL_ID:
    logger.warning("USER_POOL_ID not set in environment variables")

if not CLIENT_ID:
    logger.warning("CLIENT_ID not set in environment variables")


# Cache for JWKs to avoid repeated downloads
@lru_cache(maxsize=1)
def get_cognito_jwks():
    """
    Retrieve the JWKs from the Cognito User Pool's JWKS endpoint.
    This function is cached to avoid repeated downloads.
    """
    jwks_url = f"https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json"
    try:
        with urllib.request.urlopen(jwks_url) as response:
            jwks = json.loads(response.read().decode("utf-8"))
            return jwks
    except Exception as e:
        logger.error(f"Error retrieving JWKS: {e}")
        return None


def extract_token_from_url(path):
    """
    Extract the JWT token from the WebSocket path.
    Token could be in formats like:
    - /api/{token}
    - /api/api/{token}
    - /?token={token}
    """
    try:
        logger.info(f"Extracting token from path: {path}")

        # Split path by '/' and look for a JWT-like token
        parts = path.strip("/").split("/")
        logger.info(f"Path parts: {parts}")

        # Check all parts of the path for a JWT-like token
        for part in parts:
            # Basic validation that this looks like a JWT
            if (
                "." in part and len(part) > 50
            ):  # JWTs typically contain dots and are long
                logger.info(
                    f"Found token in path part (first 10 chars): {part[:10]}..."
                )
                return part

        # Fallback to query parameter check
        if "?" in path and "token=" in path:
            import re
            from urllib.parse import parse_qs, urlparse

            # For path-only strings like '/api/?token=xyz'
            # Add a dummy scheme and netloc to ensure urlparse handles it correctly
            if path.startswith("/"):
                full_url = f"http://dummy{path}"
                parsed_url = urlparse(full_url)
            else:
                # Handle if it's already a full URL
                parsed_url = urlparse(path)

            logger.info(
                f"Parsed components: path={parsed_url.path}, query={parsed_url.query}"
            )

            query_params = parse_qs(parsed_url.query)
            logger.info(f"Query parameters: {query_params}")

            if "token" in query_params:
                token = query_params["token"][0]
                logger.info(
                    f"Found token in query params (first 10 chars): {token[:10]}..."
                )
                return token

            # Try regex as a last resort
            token_match = re.search(r"token=([^&]+)", path)
            if token_match:
                token = token_match.group(1)
                logger.info(f"Found token via regex (first 10 chars): {token[:10]}...")
                return token

        logger.warning(f"No token found in path: {path}")
        return None
    except Exception as e:
        logger.error(f"Error extracting token from URL: {e}", exc_info=True)
        return None


def validate_token(token):
    """
    Validate the JWT token against the Cognito User Pool.
    """
    if not token:
        logger.warning("No token provided")
        return False, None

    if not USER_POOL_ID or not CLIENT_ID:
        logger.error("Missing USER_POOL_ID or CLIENT_ID environment variables")
        return False, None

    try:
        # Get the header to determine the key ID (kid)
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        if not kid:
            logger.warning("No kid found in token header")
            return False, None

        # Get JWKs from Cognito
        jwks = get_cognito_jwks()
        if not jwks:
            logger.error("Failed to retrieve JWKS")
            return False, None

        # Find the key with matching kid
        key_data = None
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                key_data = key
                break

        if not key_data:
            logger.warning(f"No matching key found for kid: {kid}")
            return False, None

        # Create a JWK from the key data
        public_key = jwk.JWK.from_json(json.dumps(key_data))

        # Decode and verify the token
        options = {
            "verify_exp": True,
            "verify_aud": False,  # Don't require the audience claim
        }

        claims = jwt.decode(
            token,
            public_key.export_to_pem(),
            algorithms=["RS256"],
            options=options,  # Use the options to make audience optional
        )

        # Verify token use (either 'id' or 'access')
        token_use = claims.get("token_use")
        if token_use not in ["id", "access"]:
            logger.warning(f"Invalid token use: {token_use}")
            return False, None

        # Verify client_id claim matches our CLIENT_ID
        # This is an alternative to audience verification
        if claims.get("client_id") != CLIENT_ID:
            logger.warning(f"Token client_id does not match expected client_id")
            return False, None

        # Return success and the claims
        return True, claims

    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        return False, None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        return False, None
    except Exception as e:
        logger.error(f"Error validating token: {e}")
        return False, None


def validate_websocket_request(path, headers):
    """
    Validate a WebSocket upgrade request.
    Extract the token from the URL and validate it.
    """
    # Extract token from URL
    token = extract_token_from_url(path)

    if not token:
        return False, None

    # Validate the token
    is_valid, claims = validate_token(token)

    if not is_valid:
        logger.warning("Invalid token in WebSocket request")
        return False, None

    # Log successful authentication
    if claims and "sub" in claims:
        logger.info(f"Authenticated user: {claims.get('sub')}")

    return is_valid, claims
