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

// cognito.js - Handles Cognito authentication flow

export class CognitoAuth {
  constructor() {
    // First try to get config from window.APP_CONFIG injected by CDK
    // Then try to load from .env.local via Vite's import.meta.env
    // Finally fall back to hardcoded values
    this.config = window.APP_CONFIG || this.loadConfigFromEnv();

    // Initialize state
    this.accessToken = null;
    this.idToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;

    // Load tokens from session storage if available
    this.loadTokens();
  }

  // Load configuration from environment variables (.env.local)
  loadConfigFromEnv() {
    try {
      // Check if we have the VITE_APP_CONFIG environment variable
      if (import.meta.env.VITE_APP_CONFIG) {
        // Parse the JSON string from the environment variable
        return JSON.parse(import.meta.env.VITE_APP_CONFIG);
      }

      // Check for individual environment variables
      const config = {};
      let hasEnvConfig = false;

      if (import.meta.env.VITE_COGNITO_USER_POOL_ID) {
        config.cognitoUserPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
        hasEnvConfig = true;
      }

      if (import.meta.env.VITE_COGNITO_APP_CLIENT_ID) {
        config.cognitoAppClientId = import.meta.env.VITE_COGNITO_APP_CLIENT_ID;
        hasEnvConfig = true;
      }

      if (import.meta.env.VITE_BACKEND_ENDPOINT) {
        config.backendEndpoint = import.meta.env.VITE_BACKEND_ENDPOINT;
        hasEnvConfig = true;
      }

      if (import.meta.env.VITE_APP_URL) {
        config.appUrl = import.meta.env.VITE_APP_URL;
        hasEnvConfig = true;
      }

      if (import.meta.env.VITE_COGNITO_DOMAIN) {
        config.cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN;
        hasEnvConfig = true;
      }

      return hasEnvConfig ? config : null;
    } catch (error) {
      console.error("Error loading config from environment variables:", error);
      return null;
    }
  }

  // Load tokens from session storage
  loadTokens() {
    this.accessToken = sessionStorage.getItem("accessToken");
    this.idToken = sessionStorage.getItem("idToken");
    this.refreshToken = sessionStorage.getItem("refreshToken");

    const expiryStr = sessionStorage.getItem("tokenExpiry");
    if (expiryStr) {
      this.tokenExpiry = new Date(parseInt(expiryStr, 10));
    }
  }

  // Save tokens to session storage
  saveTokens() {
    if (this.accessToken)
      sessionStorage.setItem("accessToken", this.accessToken);
    if (this.idToken) sessionStorage.setItem("idToken", this.idToken);
    if (this.refreshToken)
      sessionStorage.setItem("refreshToken", this.refreshToken);
    if (this.tokenExpiry)
      sessionStorage.setItem(
        "tokenExpiry",
        this.tokenExpiry.getTime().toString()
      );
  }

  // Clear tokens from session storage
  clearTokens() {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("idToken");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("tokenExpiry");

    this.accessToken = null;
    this.idToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
  }

  // Check if user is authenticated
  isAuthenticated() {
    // First check if we have tokens
    if (!this.accessToken || !this.idToken) {
      return false;
    }

    // Then check if the token is expired
    if (this.tokenExpiry && new Date() > this.tokenExpiry) {
      return false;
    }

    return true;
  }

  // Get access token (for API calls)
  getAccessToken() {
    return this.accessToken;
  }

  // Get ID token (contains user info)
  getIdToken() {
    return this.idToken;
  }

  // Get WebSocket endpoint with authorization
  getWebSocketUrl() {
    // Make sure the endpoint doesn't end with '/' before we add our path
    let endpoint = this.config.backendEndpoint;
    if (endpoint.endsWith("/")) {
      endpoint = endpoint.slice(0, -1);
    }

    // Use path-based token instead of query parameter
    // This is more reliable for WebSocket connections
    if (this.accessToken) {
      // Add token directly to the path
      return `${endpoint}/api/${encodeURIComponent(this.accessToken)}`;
    }

    return endpoint;
  }

  // Handle authentication flow
  async handleAuth() {
    // Check if we have an authorization code in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      // Exchange code for tokens and clear the code from URL
      const success = await this.exchangeCodeForTokens(code);
      // Remove the code from the URL for cleaner navigation
      window.history.replaceState({}, document.title, window.location.pathname);
      return success;
    } else if (this.isAuthenticated()) {
      // Already authenticated
      return true;
    } else {
      // Redirect to Cognito login
      this.redirectToLogin();
      return false;
    }
  }

  // Redirect to Cognito login page
  redirectToLogin() {
    const redirectUri = encodeURIComponent(this.config.appUrl);

    // Use the provided domain if available, otherwise generate it
    const cognitoDomain =
      this.config.cognitoDomain || this.getDefaultCognitoDomain();

    const loginUrl = `${cognitoDomain}/login?client_id=${this.config.cognitoAppClientId}&response_type=code&scope=email+openid+profile&redirect_uri=${redirectUri}`;

    window.location.href = loginUrl;
  }

  // Get default Cognito domain hostname if not provided in config
  getDefaultCognitoDomain() {
    const region = this.config.cognitoUserPoolId.split("_")[0] || "us-east-1";
    return `https://${this.config.cognitoUserPoolId}.auth.${region}.amazoncognito.com`;
  }

  // Get Cognito domain hostname (either from config or default)
  getCognitoHostname() {
    if (this.config.cognitoDomain) {
      // Extract hostname from the domain URL
      try {
        const url = new URL(this.config.cognitoDomain);
        return url.hostname;
      } catch (e) {
        console.warn("Invalid cognitoDomain in config, using default");
      }
    }

    // Fall back to default domain pattern
    const region = this.config.cognitoUserPoolId.split("_")[0] || "us-east-1";
    return `${this.config.cognitoUserPoolId}.auth.${region}.amazoncognito.com`;
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(code) {
    try {
      const redirectUri = this.config.appUrl;
      const tokenEndpoint = this.config.cognitoDomain
        ? `${this.config.cognitoDomain}/oauth2/token`
        : `https://${this.getCognitoHostname()}/oauth2/token`;

      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("client_id", this.config.cognitoAppClientId);
      params.append("redirect_uri", redirectUri);
      params.append("code", code);

      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        console.error(
          `Token exchange failed: ${response.status} ${response.statusText}`
        );
        return false;
      }

      const data = await response.json();

      // Set tokens from response
      this.accessToken = data.access_token;
      this.idToken = data.id_token;
      this.refreshToken = data.refresh_token;

      // Calculate expiry time
      if (data.expires_in) {
        this.tokenExpiry = new Date(Date.now() + data.expires_in * 1000);
      }

      // Save tokens to session storage
      this.saveTokens();

      return true;
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      return false;
    }
  }

  // Log out the user
  logout() {
    // Clear tokens
    this.clearTokens();

    // Redirect to Cognito logout
    const redirectUri = encodeURIComponent(this.config.appUrl);

    // Use provided domain if available
    const logoutUrl = this.config.cognitoDomain
      ? `${this.config.cognitoDomain}/logout?client_id=${this.config.cognitoAppClientId}&logout_uri=${redirectUri}`
      : `https://${this.getCognitoHostname()}/logout?client_id=${
          this.config.cognitoAppClientId
        }&logout_uri=${redirectUri}`;

    window.location.href = logoutUrl;
  }
}

// Create singleton instance
let cognitoAuthInstance = null;

export function getCognitoAuth() {
  if (!cognitoAuthInstance) {
    cognitoAuthInstance = new CognitoAuth();
  }
  return cognitoAuthInstance;
}
