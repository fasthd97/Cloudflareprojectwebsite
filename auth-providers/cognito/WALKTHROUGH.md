# AWS Cognito Integration Walkthrough

Complete guide to replace basic JWT authentication with AWS Cognito for enterprise-grade security.

## 🎯 What You'll Get

- ✅ **Hosted Authentication UI** - No custom login forms needed
- ✅ **Social Login Support** - Google, Facebook, Apple, etc.
- ✅ **Multi-Factor Authentication** - SMS, TOTP, email
- ✅ **Advanced Security** - Adaptive authentication, risk detection
- ✅ **User Management** - Admin portal, user pools
- ✅ **Compliance Ready** - SOC, PCI DSS, HIPAA eligible

## 💰 Cost

- **Free Tier**: 50,000 Monthly Active Users (MAU)
- **Paid**: $0.0055 per MAU after free tier
- **Advanced Security**: +$0.05 per MAU

## 🚀 Step 1: Add Cognito to Terraform

### For AWS Version

Add to your `aws-version/terraform/main.tf`:

```hcl
# Include Cognito module
module "cognito" {
  source = "../../auth-providers/cognito/terraform"
  
  # Pass required variables
  domain_name = var.domain_name
  aws_region  = var.aws_region
  
  # Reference existing resources
  s3_assets_bucket = aws_s3_bucket.assets
  common_tags      = local.common_tags
  name_prefix      = local.name_prefix
}
```

Add to your `aws-version/terraform/variables.tf`:

```hcl
variable "enable_cognito" {
  description = "Enable AWS Cognito authentication"
  type        = bool
  default     = false
}
```

### For Cloudflare Version

Create `cloudflare-version/terraform/cognito.tf`:

```hcl
# Cognito can be used with Cloudflare Workers
# The Worker will validate Cognito JWT tokens

module "cognito" {
  source = "../auth-providers/cognito/terraform"
  
  domain_name = var.domain_name
  aws_region  = "us-east-1" # Cognito region
  
  # Cloudflare-specific callback URLs
  callback_urls = [
    "https://${var.domain_name}/auth/callback"
  ]
  
  logout_urls = [
    "https://${var.domain_name}/auth/logout"
  ]
}
```

## 🚀 Step 2: Deploy Cognito Infrastructure

```bash
# Navigate to your project
cd aws-version  # or cloudflare-version

# Update terraform.tfvars
echo 'enable_cognito = true' >> terraform/terraform.tfvars

# Deploy Cognito resources
cd terraform
terraform plan
terraform apply

# Get Cognito configuration
terraform output cognito_user_pool_id
terraform output cognito_client_id
terraform output cognito_domain
```

## 🚀 Step 3: Update Backend Code

### For AWS Version (Express.js)

Update `aws-version/app/server.js`:

```javascript
// Add Cognito middleware
const CognitoAuth = require('./cognito-middleware');

// Initialize Cognito auth
const cognitoAuth = new CognitoAuth({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    region: process.env.AWS_REGION
});

// Replace JWT middleware with Cognito middleware
const authenticateToken = cognitoAuth.middleware();

// Add admin endpoints
app.post('/api/admin/create-user', authenticateToken, async (req, res) => {
    try {
        const { email, temporaryPassword } = req.body;
        const user = await cognitoAuth.createUser(email, temporaryPassword);
        res.json({ message: 'User created successfully', user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
```

Add to `aws-version/app/package.json`:

```json
{
  "dependencies": {
    "jwks-rsa": "^3.0.1"
  }
}
```

### For Cloudflare Version (Workers)

Update `src/worker.js`:

```javascript
// Add Cognito JWT verification
import { verifyJWT } from './cognito-jwt-verifier';

// Replace existing JWT verification
async function verifyCognitoToken(token) {
    const userPoolId = env.COGNITO_USER_POOL_ID;
    const region = env.AWS_REGION || 'us-east-1';
    
    return await verifyJWT(token, userPoolId, region);
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
    const user = await verifyCognitoToken(token);
    
    if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
            status: 401,
            headers: corsHeaders
        });
    }
    
    // Continue with protected logic...
}
```

## 🚀 Step 4: Update Frontend

### Add Cognito Configuration

Create configuration in your HTML:

```html
<!-- Add before your main script -->
<script>
window.COGNITO_CONFIG = {
    userPoolId: 'us-east-1_XXXXXXXXX',
    clientId: 'your-client-id',
    domain: 'https://your-domain.auth.us-east-1.amazoncognito.com'
};
</script>

<!-- Include Cognito auth script -->
<script src="cognito-auth.js"></script>
<script src="script.js"></script>
```

### Update Your HTML

Replace the login modal with a simple button:

```html
<!-- Remove the complex login modal -->
<!-- Keep just the login button - Cognito handles the UI -->
<button id="loginBtn" class="auth-btn">Friend Login</button>
<button id="logoutBtn" class="auth-btn hidden">Logout</button>
```

## 🚀 Step 5: Configure Cognito User Pool

### Create Your First User

```bash
# Using AWS CLI
aws cognito-idp admin-create-user \
    --user-pool-id us-east-1_XXXXXXXXX \
    --username friend@example.com \
    --user-attributes Name=email,Value=friend@example.com Name=email_verified,Value=true \
    --temporary-password TempPass123! \
    --message-action SUPPRESS

# Set permanent password
aws cognito-idp admin-set-user-password \
    --user-pool-id us-east-1_XXXXXXXXX \
    --username friend@example.com \
    --password SecurePassword123! \
    --permanent
```

### Or Use the Admin API

```bash
# Create user via your API
curl -X POST https://api.yourname.com/api/admin/create-user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{"email": "friend@example.com", "temporaryPassword": "TempPass123!"}'
```

## 🚀 Step 6: Test the Integration

1. **Visit your website**: https://yourname.com
2. **Click "Friend Login"**: Redirects to Cognito hosted UI
3. **Login with credentials**: Created in Step 5
4. **Access protected content**: Photos and documents

## 🎨 Step 7: Customize Cognito UI (Optional)

### Upload Custom Logo

```bash
aws cognito-idp set-ui-customization \
    --user-pool-id us-east-1_XXXXXXXXX \
    --client-id your-client-id \
    --css ".logo-customizable { max-height: 60px; }" \
    --image-file fileb://logo.png
```

### Custom CSS

```css
/* Cognito UI Customization */
.logo-customizable {
    max-height: 60px;
    max-width: 240px;
}

.banner-customizable {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.submitButton-customizable {
    background: #2563eb;
    border: none;
    border-radius: 8px;
}

.submitButton-customizable:hover {
    background: #1d4ed8;
}
```

## 🔐 Step 8: Enable Advanced Features

### Multi-Factor Authentication

```bash
# Enable MFA
aws cognito-idp set-user-pool-mfa-config \
    --user-pool-id us-east-1_XXXXXXXXX \
    --mfa-configuration ON \
    --sms-mfa-configuration SMSAuthenticationMessage="Your code: {####}",SMSConfiguration="{SNSCallerArn=arn:aws:iam::ACCOUNT:role/service-role/CognitoSNSRole,ExternalId=external-id}" \
    --software-token-mfa-configuration Enabled=true
```

### Social Identity Providers

```bash
# Add Google as identity provider
aws cognito-idp create-identity-provider \
    --user-pool-id us-east-1_XXXXXXXXX \
    --provider-name Google \
    --provider-type Google \
    --provider-details client_id=your-google-client-id,client_secret=your-google-client-secret,authorize_scopes="email openid profile" \
    --attribute-mapping email=email,name=name
```

## 📊 Step 9: Monitor and Analytics

### CloudWatch Metrics

- **SignInSuccesses**: Successful logins
- **SignInThrottles**: Throttled attempts
- **UserAuthEvents**: Authentication events

### Custom Analytics

```javascript
// Track authentication events
const trackAuthEvent = (event, user) => {
    // Send to your analytics service
    analytics.track(event, {
        userId: user.sub,
        email: user.email,
        timestamp: new Date().toISOString()
    });
};

// In your auth callbacks
cognitoAuth.on('login', (user) => {
    trackAuthEvent('login', user);
});
```

## 🔄 Step 10: Migration from Basic Auth

### Gradual Migration

1. **Deploy both systems** side by side
2. **Feature flag** to switch between auth methods
3. **Migrate users** gradually
4. **Remove old system** once complete

### User Migration Lambda

```javascript
// Cognito User Migration Lambda
exports.handler = async (event) => {
    if (event.triggerSource === 'UserMigration_Authentication') {
        // Verify user against old system
        const isValid = await verifyOldSystemUser(
            event.request.userAttributes.email,
            event.request.password
        );
        
        if (isValid) {
            event.response.userAttributes = {
                email: event.request.userAttributes.email,
                email_verified: 'true'
            };
            event.response.finalUserStatus = 'CONFIRMED';
            event.response.messageAction = 'SUPPRESS';
        }
    }
    
    return event;
};
```

## 🎉 You're Done!

Your resume website now has enterprise-grade authentication with:

- ✅ **Hosted UI** for seamless user experience
- ✅ **JWT tokens** for secure API access
- ✅ **User management** through AWS Console
- ✅ **Advanced security** features
- ✅ **Scalable architecture** for growth

## 🔧 Troubleshooting

### Common Issues

**Redirect URI mismatch:**
```bash
# Update callback URLs
aws cognito-idp update-user-pool-client \
    --user-pool-id us-east-1_XXXXXXXXX \
    --client-id your-client-id \
    --callback-urls https://yourname.com/auth/callback
```

**Token validation errors:**
- Check user pool ID and region
- Verify JWKS endpoint accessibility
- Ensure token hasn't expired

**CORS issues:**
- Add your domain to allowed origins
- Include credentials in CORS configuration

### Useful Commands

```bash
# Test token validation
curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://api.yourname.com/api/protected/photos

# Check user pool configuration
aws cognito-idp describe-user-pool --user-pool-id us-east-1_XXXXXXXXX

# List users
aws cognito-idp list-users --user-pool-id us-east-1_XXXXXXXXX
```

Your friends can now securely access your photos and documents with enterprise-grade authentication! 🔐