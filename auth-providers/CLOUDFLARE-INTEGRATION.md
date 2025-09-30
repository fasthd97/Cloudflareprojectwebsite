# Cloudflare Workers Authentication Integration

Complete guide to integrate modern authentication providers with your Cloudflare Workers resume website.

## 🎯 Overview

The Cloudflare version now supports all three enterprise authentication providers:
- **AWS Cognito** - AWS-native with hosted UI
- **Okta** - Enterprise SSO and advanced security  
- **Keycloak** - Self-hosted open source solution
- **Basic JWT** - Simple fallback (existing implementation)

## 🚀 Quick Setup

### 1. Choose Your Provider

The system automatically detects which provider you've configured based on environment variables in `wrangler.toml`.

### 2. Update wrangler.toml

```toml
[vars]
# Basic JWT Auth (fallback - always keep this)
JWT_SECRET = "your-jwt-secret-here"

# Choose ONE of the following providers:

# AWS Cognito
COGNITO_USER_POOL_ID = "us-east-1_XXXXXXXXX"
COGNITO_CLIENT_ID = "your-cognito-client-id"
AWS_REGION = "us-east-1"

# OR Okta
# OKTA_ISSUER = "https://dev-123456.okta.com/oauth2/default"
# OKTA_CLIENT_ID = "your-okta-client-id"

# OR Keycloak
# KEYCLOAK_SERVER_URL = "https://auth.yourname.com"
# KEYCLOAK_REALM = "resume"
# KEYCLOAK_CLIENT_ID = "resume-website"
```

### 3. Update Frontend Configuration

Edit `public/index.html` to configure your chosen provider:

```html
<script>
// AWS Cognito
window.COGNITO_CONFIG = {
    userPoolId: 'us-east-1_XXXXXXXXX',
    clientId: 'your-client-id',
    domain: 'https://your-domain.auth.us-east-1.amazoncognito.com'
};

// OR Okta
// window.OKTA_CONFIG = {
//     domain: 'dev-123456.okta.com',
//     clientId: 'your-client-id',
//     issuer: 'https://dev-123456.okta.com/oauth2/default'
// };

// OR Keycloak
// window.KEYCLOAK_CONFIG = {
//     url: 'https://auth.yourname.com',
//     realm: 'resume',
//     clientId: 'resume-website'
// };
</script>
```

### 4. Deploy

```bash
# Deploy your updated worker
wrangler deploy

# Test the auth provider detection
curl https://your-worker.your-subdomain.workers.dev/api/auth/info
```

## 🔧 Provider-Specific Setup

### AWS Cognito with Cloudflare

1. **Follow the [Cognito Walkthrough](cognito/WALKTHROUGH.md)** to set up Cognito
2. **Add Cloudflare domain** to Cognito callback URLs:
   - `https://yourname.com/auth/callback`
   - `https://your-worker.your-subdomain.workers.dev/auth/callback`
3. **Update wrangler.toml** with Cognito variables
4. **Configure frontend** with Cognito config
5. **Deploy and test**

### Okta with Cloudflare

1. **Follow the [Okta Walkthrough](okta/WALKTHROUGH.md)** to set up Okta
2. **Add Cloudflare domain** to Okta app settings:
   - Login redirect URIs: `https://yourname.com/auth/callback`
   - Logout redirect URIs: `https://yourname.com/auth/logout`
3. **Update wrangler.toml** with Okta variables
4. **Configure frontend** with Okta config
5. **Deploy and test**

### Keycloak with Cloudflare

1. **Deploy Keycloak** (can be on AWS, other cloud, or on-premises)
2. **Follow the [Keycloak Walkthrough](keycloak/WALKTHROUGH.md)** for setup
3. **Configure Keycloak client** with Cloudflare domains:
   - Valid redirect URIs: `https://yourname.com/auth/callback`
   - Valid post logout redirect URIs: `https://yourname.com/auth/logout`
4. **Update wrangler.toml** with Keycloak variables
5. **Configure frontend** with Keycloak config
6. **Deploy and test**

## 🔒 Security Features

### JWT Token Validation

All providers use industry-standard JWT token validation:

```javascript
// The worker automatically:
// 1. Fetches JWKS from provider
// 2. Validates token signature
// 3. Checks expiration
// 4. Verifies issuer and audience
// 5. Extracts user claims
```

### Group-Based Authorization

Each provider supports group-based access control:

```javascript
// Cognito: Check 'resume-friends' group
// Okta: Check 'Resume Friends' group  
// Keycloak: Check 'resume-friends' group
// Basic: All authenticated users allowed
```

### CORS and Security Headers

The worker includes proper CORS headers and security measures:

```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
```

## 🧪 Testing Your Integration

### 1. Test Provider Detection

```bash
curl https://your-worker.your-subdomain.workers.dev/api/auth/info
```

Expected response:
```json
{
  "provider": "cognito",
  "features": ["hosted-ui", "mfa", "social-login", "user-pools"]
}
```

### 2. Test Authentication Flow

1. **Visit your website**: `https://yourname.com`
2. **Click "Friend Login"**: Should redirect to provider
3. **Login with test credentials**: Created during provider setup
4. **Return to site**: Should show protected content
5. **Check browser network tab**: Verify API calls use Bearer tokens

### 3. Test API Endpoints

```bash
# Get access token from browser dev tools after login
TOKEN="your-jwt-token-here"

# Test protected photos endpoint
curl -H "Authorization: Bearer $TOKEN" \
     https://your-worker.your-subdomain.workers.dev/api/protected/photos

# Test protected documents endpoint  
curl -H "Authorization: Bearer $TOKEN" \
     https://your-worker.your-subdomain.workers.dev/api/protected/documents
```

## 🔄 Switching Providers

You can easily switch between providers:

### 1. Update Environment Variables

```bash
# Comment out current provider in wrangler.toml
# Uncomment new provider variables
# Update with new provider values
```

### 2. Update Frontend Config

```javascript
// Comment out current provider config
// Uncomment new provider config  
// Update with new provider values
```

### 3. Deploy Changes

```bash
wrangler deploy
```

### 4. Test New Provider

The system will automatically detect and use the new provider.

## 📊 Provider Comparison for Cloudflare

| Feature | Cognito | Okta | Keycloak | Basic JWT |
|---------|---------|------|----------|-----------|
| **Edge Performance** | ✅ | ✅ | ✅ | ✅ |
| **Cold Start Impact** | Low | Low | Low | Minimal |
| **Token Validation** | JWKS | JWKS | JWKS | HMAC |
| **Caching** | 1 hour | 1 hour | 1 hour | N/A |
| **Group Support** | ✅ | ✅ | ✅ | Manual |
| **Social Login** | ✅ | ✅ | ✅ | ❌ |

## 🚀 Advanced Features

### Custom Claims Processing

```javascript
// Add custom logic in the worker for specific providers
if (authConfig.type === 'keycloak') {
  // Process Keycloak-specific claims
  const hasAdminRole = authProvider.hasRealmRole(user, 'admin');
  if (hasAdminRole) {
    // Grant additional permissions
  }
}
```

### Multi-Tenant Support

```javascript
// Support multiple realms/tenants
const realm = request.headers.get('X-Tenant') || 'default';
const authProvider = new KeycloakWorkerAuth(
  env.KEYCLOAK_SERVER_URL, 
  realm, 
  env.KEYCLOAK_CLIENT_ID
);
```

### Rate Limiting by User

```javascript
// Implement per-user rate limiting
const userId = user.sub;
const rateLimitKey = `rate_limit:${userId}`;
// Use Cloudflare KV or Durable Objects for rate limiting
```

## 🔧 Troubleshooting

### Common Issues

**Provider not detected:**
- Check environment variables in wrangler.toml
- Ensure variables are uncommented and have values
- Redeploy after changes

**Token validation fails:**
- Verify JWKS endpoint is accessible
- Check token hasn't expired
- Confirm issuer and audience match

**CORS errors:**
- Ensure your domain is in provider's allowed origins
- Check callback URLs are configured correctly

**Group authorization fails:**
- Verify user is in required group
- Check group name spelling (case-sensitive)
- Confirm group claim is in token

### Debug Commands

```bash
# Check worker logs
wrangler tail

# Test JWKS endpoint
curl https://cognito-idp.us-east-1.amazonaws.com/us-east-1_XXXXXXXXX/.well-known/jwks.json

# Decode JWT token (paste token after command)
echo "YOUR_TOKEN" | cut -d. -f2 | base64 -d | jq
```

## 🎉 You're Ready!

Your Cloudflare Workers resume website now supports enterprise-grade authentication with:

- ✅ **Automatic provider detection** based on configuration
- ✅ **Edge-optimized JWT validation** with JWKS caching
- ✅ **Group-based authorization** for protected content
- ✅ **Easy provider switching** without code changes
- ✅ **Modern OAuth 2.0 + OIDC** security standards

The system gracefully falls back to basic JWT if no provider is configured, ensuring your site always works while giving you the flexibility to upgrade to enterprise authentication when ready.

Choose your provider, follow the setup steps, and enjoy secure, scalable authentication at the edge! 🔐