# Okta Integration Walkthrough

Complete guide to integrate Okta for enterprise-grade authentication with advanced security features.

## 🎯 What You'll Get

- ✅ **Enterprise SSO** - Single Sign-On across applications
- ✅ **Advanced Security** - Adaptive MFA, risk-based authentication
- ✅ **Social Login** - Google, Microsoft, Facebook, LinkedIn
- ✅ **User Management** - Admin dashboard, lifecycle management
- ✅ **Compliance** - SOC 2, FedRAMP, HIPAA ready
- ✅ **API Access Management** - Fine-grained authorization

## 💰 Cost

- **Free Tier**: 15,000 Monthly Active Users (MAU)
- **Workforce Identity**: $2/user/month
- **Customer Identity**: $0.01-0.05 per MAU
- **Advanced Features**: Additional cost

## 🚀 Step 1: Create Okta Developer Account

1. **Sign up**: Go to [developer.okta.com](https://developer.okta.com)
2. **Create account**: Use your email
3. **Note your Okta domain**: `dev-123456.okta.com`
4. **Get API token**: Admin → Security → API → Tokens

## 🚀 Step 2: Setup Terraform for Okta

### Install Okta Terraform Provider

Add to your `terraform/main.tf`:

```hcl
# Add Okta provider
terraform {
  required_providers {
    okta = {
      source  = "okta/okta"
      version = "~> 4.0"
    }
  }
}

# Include Okta module
module "okta" {
  source = "../auth-providers/okta/terraform"
  
  # Okta configuration
  okta_org_name  = var.okta_org_name
  okta_base_url  = var.okta_base_url
  okta_api_token = var.okta_api_token
  okta_domain    = var.okta_domain
  
  # Your domain
  domain_name = var.domain_name
  project_name = "Resume"
  
  # Optional: Custom authorization server
  use_custom_auth_server = false
}
```

### Add Variables

Add to your `terraform/variables.tf`:

```hcl
variable "okta_org_name" {
  description = "Okta organization name (e.g., 'dev-123456')"
  type        = string
}

variable "okta_base_url" {
  description = "Okta base URL"
  type        = string
  default     = "okta.com"
}

variable "okta_api_token" {
  description = "Okta API token"
  type        = string
  sensitive   = true
}

variable "okta_domain" {
  description = "Full Okta domain"
  type        = string
}

variable "enable_okta" {
  description = "Enable Okta authentication"
  type        = bool
  default     = false
}
```

### Configure Variables

Add to your `terraform/terraform.tfvars`:

```hcl
# Okta Configuration
enable_okta = true
okta_org_name = "dev-123456"
okta_base_url = "okta.com"
okta_api_token = "your-api-token-here"
okta_domain = "dev-123456.okta.com"
```

## 🚀 Step 3: Deploy Okta Configuration

```bash
cd terraform

# Initialize with Okta provider
terraform init

# Plan deployment
terraform plan

# Deploy Okta application
terraform apply

# Get Okta configuration
cat ../auth-providers/okta/config/okta-config.json
```

## 🚀 Step 4: Update Backend Code

### For AWS Version (Express.js)

Create `aws-version/app/okta-middleware.js`:

```javascript
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

class OktaAuth {
    constructor(options) {
        this.issuer = options.issuer;
        this.clientId = options.clientId;
        
        // JWKS client for token verification
        this.jwksClient = jwksClient({
            jwksUri: `${this.issuer}/v1/keys`,
            cache: true,
            cacheMaxEntries: 5,
            cacheMaxAge: 600000 // 10 minutes
        });
    }

    async verifyToken(token) {
        try {
            const decodedHeader = jwt.decode(token, { complete: true });
            if (!decodedHeader) {
                throw new Error('Invalid token format');
            }

            const kid = decodedHeader.header.kid;
            const signingKey = await this.getSigningKey(kid);

            const decoded = jwt.verify(token, signingKey, {
                algorithms: ['RS256'],
                audience: this.clientId,
                issuer: this.issuer
            });

            return decoded;
        } catch (error) {
            throw new Error(`Token verification failed: ${error.message}`);
        }
    }

    getSigningKey(kid) {
        return new Promise((resolve, reject) => {
            this.jwksClient.getSigningKey(kid, (err, key) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(key.getPublicKey());
                }
            });
        });
    }

    middleware() {
        return async (req, res, next) => {
            try {
                const authHeader = req.headers.authorization;
                
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    return res.status(401).json({ error: 'Access token required' });
                }

                const token = authHeader.substring(7);
                const decoded = await this.verifyToken(token);

                req.user = {
                    sub: decoded.sub,
                    email: decoded.email || decoded.preferred_username,
                    name: decoded.name,
                    groups: decoded.groups || []
                };

                next();
            } catch (error) {
                console.error('Okta auth error:', error);
                res.status(401).json({ error: 'Invalid or expired token' });
            }
        };
    }
}

module.exports = OktaAuth;
```

Update `aws-version/app/server.js`:

```javascript
const OktaAuth = require('./okta-middleware');

// Initialize Okta auth
const oktaAuth = new OktaAuth({
    issuer: process.env.OKTA_ISSUER,
    clientId: process.env.OKTA_CLIENT_ID
});

// Replace JWT middleware
const authenticateToken = oktaAuth.middleware();

// Add group-based authorization
const requireGroup = (groupName) => {
    return (req, res, next) => {
        if (!req.user.groups.includes(groupName)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

// Protected endpoints with group authorization
app.get('/api/protected/photos', 
    authenticateToken, 
    requireGroup('Resume Friends'), 
    async (req, res) => {
        // Your existing photo logic
    }
);
```

### For Cloudflare Version (Workers)

Update `src/worker.js`:

```javascript
// Okta JWT verification for Cloudflare Workers
async function verifyOktaToken(token, issuer, clientId) {
    try {
        // Get JWKS
        const jwksResponse = await fetch(`${issuer}/v1/keys`);
        const jwks = await jwksResponse.json();
        
        // Decode token header
        const [headerB64] = token.split('.');
        const header = JSON.parse(atob(headerB64));
        
        // Find matching key
        const key = jwks.keys.find(k => k.kid === header.kid);
        if (!key) {
            throw new Error('Key not found');
        }
        
        // Import key for verification
        const cryptoKey = await crypto.subtle.importKey(
            'jwk',
            key,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify']
        );
        
        // Verify signature
        const [headerB64, payloadB64, signatureB64] = token.split('.');
        const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
        const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
        
        const isValid = await crypto.subtle.verify(
            'RSASSA-PKCS1-v1_5',
            cryptoKey,
            signature,
            data
        );
        
        if (!isValid) {
            throw new Error('Invalid signature');
        }
        
        // Decode and validate payload
        const payload = JSON.parse(atob(payloadB64));
        
        if (payload.exp < Date.now() / 1000) {
            throw new Error('Token expired');
        }
        
        if (payload.iss !== issuer) {
            throw new Error('Invalid issuer');
        }
        
        if (payload.aud !== clientId) {
            throw new Error('Invalid audience');
        }
        
        return payload;
    } catch (error) {
        console.error('Token verification error:', error);
        return null;
    }
}

// Update protected endpoints
if (path.startsWith('/api/protected/')) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: corsHeaders
        });
    }
    
    const token = authHeader.substring(7);
    const user = await verifyOktaToken(
        token, 
        env.OKTA_ISSUER, 
        env.OKTA_CLIENT_ID
    );
    
    if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
            status: 401,
            headers: corsHeaders
        });
    }
    
    // Check group membership
    const groups = user.groups || [];
    if (!groups.includes('Resume Friends')) {
        return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
            status: 403,
            headers: corsHeaders
        });
    }
    
    // Continue with protected logic...
}
```

## 🚀 Step 5: Update Frontend

### Add Okta Configuration

Update your HTML:

```html
<!-- Add Okta configuration -->
<script>
window.OKTA_CONFIG = {
    domain: 'dev-123456.okta.com',
    clientId: 'your-client-id',
    issuer: 'https://dev-123456.okta.com/oauth2/default',
    redirectUri: window.location.origin + '/auth/callback',
    logoutUri: window.location.origin + '/auth/logout',
    scopes: ['openid', 'profile', 'email']
};
</script>

<!-- Include Okta auth script -->
<script src="../auth-providers/okta/frontend/okta-auth.js"></script>
<script src="script.js"></script>
```

### Update Login Flow

The Okta integration automatically handles:
- OAuth 2.0 with PKCE flow
- Token refresh
- Secure logout
- User info retrieval

## 🚀 Step 6: Create Users and Groups

### Using Okta Admin Dashboard

1. **Go to Admin Dashboard**: `https://dev-123456-admin.okta.com`
2. **Create Group**: Directory → Groups → Add Group
   - Name: "Resume Friends"
   - Description: "Friends who can access resume content"
3. **Add Users**: Directory → People → Add Person
   - Email: friend@example.com
   - First/Last Name
   - Assign to "Resume Friends" group

### Using Terraform (Automated)

Add to your Okta Terraform:

```hcl
# Create users
resource "okta_user" "friends" {
  for_each = toset(var.friend_emails)
  
  first_name = split("@", each.value)[0]
  last_name  = "Friend"
  login      = each.value
  email      = each.value
  
  password = "TempPassword123!"
  
  lifecycle {
    ignore_changes = [password]
  }
}

# Assign users to group
resource "okta_group_memberships" "resume_friends" {
  group_id = okta_group.resume_friends.id
  users    = [for user in okta_user.friends : user.id]
}
```

### Using API

```bash
# Create user via Okta API
curl -X POST "https://dev-123456.okta.com/api/v1/users" \
  -H "Authorization: SSWS your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "profile": {
      "firstName": "Friend",
      "lastName": "User",
      "email": "friend@example.com",
      "login": "friend@example.com"
    },
    "credentials": {
      "password": {"value": "TempPassword123!"}
    }
  }'
```

## 🚀 Step 7: Enable Advanced Features

### Multi-Factor Authentication

1. **Go to Security → Multifactor**
2. **Enable factors**: SMS, Voice, Okta Verify, Google Authenticator
3. **Create MFA policy**: Security → Authentication → Sign On
4. **Apply to group**: "Resume Friends"

### Social Identity Providers

```bash
# Add Google as IdP via API
curl -X POST "https://dev-123456.okta.com/api/v1/idps" \
  -H "Authorization: SSWS your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "GOOGLE",
    "name": "Google",
    "protocol": {
      "type": "OIDC",
      "endpoints": {
        "authorization": "https://accounts.google.com/oauth2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "userInfo": "https://openidconnect.googleapis.com/v1/userinfo",
        "jwks": "https://www.googleapis.com/oauth2/v3/certs"
      },
      "scopes": ["openid", "email", "profile"],
      "credentials": {
        "client": {
          "client_id": "your-google-client-id",
          "client_secret": "your-google-client-secret"
        }
      }
    }
  }'
```

### Adaptive Authentication

1. **Go to Security → Authentication → Sign On**
2. **Create policy**: "Resume Adaptive Auth"
3. **Add rules**:
   - New device: Require MFA
   - High risk: Block or require MFA
   - Unusual location: Require MFA

## 🚀 Step 8: Test the Integration

1. **Visit your website**: https://yourname.com
2. **Click "Friend Login"**: Redirects to Okta
3. **Login with credentials**: Created user
4. **Complete MFA**: If enabled
5. **Access protected content**: Photos and documents

## 🚀 Step 9: Monitor and Analytics

### Okta System Log

```bash
# Get authentication events
curl "https://dev-123456.okta.com/api/v1/logs?filter=eventType+eq+%22user.authentication.sso%22" \
  -H "Authorization: SSWS your-api-token"
```

### Custom Analytics

```javascript
// Track authentication events
window.oktaAuth.on('login', (user) => {
    analytics.track('User Login', {
        userId: user.sub,
        email: user.email,
        method: 'okta',
        timestamp: new Date().toISOString()
    });
});

window.oktaAuth.on('logout', () => {
    analytics.track('User Logout', {
        method: 'okta',
        timestamp: new Date().toISOString()
    });
});
```

## 🔐 Step 10: Security Best Practices

### Token Security

```javascript
// Implement token refresh before expiry
setInterval(async () => {
    if (oktaAuth.isAuthenticated()) {
        const token = oktaAuth.getAccessToken();
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresIn = payload.exp * 1000 - Date.now();
        
        // Refresh if expires in less than 5 minutes
        if (expiresIn < 5 * 60 * 1000) {
            await oktaAuth.refreshAccessToken();
        }
    }
}, 60000); // Check every minute
```

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self' 'unsafe-inline' https://dev-123456.okta.com;
    connect-src 'self' https://dev-123456.okta.com https://api.yourname.com;
    frame-src https://dev-123456.okta.com;
">
```

## 🎉 You're Done!

Your resume website now has enterprise-grade authentication with:

- ✅ **OAuth 2.0 + OIDC** with PKCE security
- ✅ **Group-based authorization** for content access
- ✅ **Multi-factor authentication** options
- ✅ **Social login** capabilities
- ✅ **Advanced security** features
- ✅ **User lifecycle management**

## 🔧 Troubleshooting

### Common Issues

**CORS errors:**
```javascript
// Add Okta domain to CORS whitelist
const corsOptions = {
    origin: [
        'https://yourname.com',
        'https://dev-123456.okta.com'
    ],
    credentials: true
};
```

**Token validation errors:**
- Check issuer URL matches exactly
- Verify client ID in token audience
- Ensure clock synchronization

**Group authorization failing:**
- Verify user is in "Resume Friends" group
- Check group claim is included in token
- Validate group name spelling

### Useful Commands

```bash
# Test token validation
curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://api.yourname.com/api/protected/photos

# Check user groups
curl "https://dev-123456.okta.com/api/v1/users/USER_ID/groups" \
  -H "Authorization: SSWS your-api-token"

# Validate token locally
echo "YOUR_TOKEN" | cut -d. -f2 | base64 -d | jq
```

Your friends now have enterprise-grade secure access to your content! 🔐