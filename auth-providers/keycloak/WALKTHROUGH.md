# Keycloak Self-Hosted Integration Walkthrough

Complete guide to deploy and integrate Keycloak for full control over your identity and access management.

## 🎯 What You'll Get

- ✅ **Full Control** - Self-hosted, no vendor lock-in
- ✅ **Open Source** - Free forever, community-driven
- ✅ **Enterprise Features** - SSO, SAML, LDAP, social login
- ✅ **Customizable** - Themes, extensions, custom flows
- ✅ **Standards Compliant** - OAuth 2.0, OIDC, SAML 2.0
- ✅ **Multi-Tenancy** - Multiple realms and applications

## 💰 Cost

- **Software**: Free (open source)
- **Infrastructure**: ~$30-50/month (AWS hosting)
- **Maintenance**: Your time and expertise
- **Scaling**: Pay only for infrastructure

## 🏗️ Architecture

```
Internet → ALB → ECS Fargate → Keycloak → RDS PostgreSQL
                     ↓
              Your Resume App ← JWT Tokens
```

## 🚀 Step 1: Add Keycloak to Terraform

### For AWS Version

Add to your `aws-version/terraform/main.tf`:

```hcl
# Include Keycloak module
module "keycloak" {
  source = "../../auth-providers/keycloak/terraform"
  
  # Enable Keycloak
  enable_keycloak = var.enable_keycloak
  
  # Pass existing infrastructure
  vpc_id             = aws_vpc.main.id
  private_subnet_ids = aws_subnet.private[*].id
  public_subnet_ids  = aws_subnet.public[*].id
  ecs_cluster_id     = aws_ecs_cluster.main.id
  route53_zone_id    = data.aws_route53_zone.main.zone_id
  
  # Configuration
  domain_name = var.domain_name
  aws_region  = var.aws_region
  
  # Keycloak settings
  keycloak_admin_user = var.keycloak_admin_user
  keycloak_version    = var.keycloak_version
  
  # Resource sizing
  keycloak_cpu    = var.keycloak_cpu
  keycloak_memory = var.keycloak_memory
  keycloak_db_instance_class = var.keycloak_db_instance_class
  
  # Common tags
  common_tags = local.common_tags
  name_prefix = local.name_prefix
}
```

Add to your `aws-version/terraform/variables.tf`:

```hcl
variable "enable_keycloak" {
  description = "Enable Keycloak self-hosted authentication"
  type        = bool
  default     = false
}

variable "keycloak_admin_user" {
  description = "Keycloak admin username"
  type        = string
  default     = "admin"
}

variable "keycloak_version" {
  description = "Keycloak version"
  type        = string
  default     = "23.0"
}

variable "keycloak_cpu" {
  description = "CPU units for Keycloak container"
  type        = number
  default     = 512
}

variable "keycloak_memory" {
  description = "Memory for Keycloak container in MB"
  type        = number
  default     = 1024
}

variable "keycloak_db_instance_class" {
  description = "RDS instance class for Keycloak database"
  type        = string
  default     = "db.t3.micro"
}
```

### Update terraform.tfvars

```hcl
# Keycloak Configuration
enable_keycloak = true
keycloak_admin_user = "admin"
keycloak_version = "23.0"
keycloak_cpu = 512
keycloak_memory = 1024
keycloak_db_instance_class = "db.t3.micro"
```

## 🚀 Step 2: Deploy Keycloak Infrastructure

```bash
cd aws-version/terraform

# Plan deployment
terraform plan

# Deploy Keycloak (takes 10-15 minutes)
terraform apply

# Get Keycloak admin password
terraform output keycloak_admin_password

# Get Keycloak URL
echo "Keycloak URL: https://auth.$(terraform output -raw domain_name)"
```

## 🚀 Step 3: Initial Keycloak Setup

### Access Admin Console

1. **Wait for deployment**: Check ECS service is running
2. **Visit admin console**: https://auth.yourname.com/admin
3. **Login**: 
   - Username: `admin`
   - Password: From terraform output

### Create Realm

1. **Click "Create Realm"**
2. **Realm name**: `resume`
3. **Display name**: `Resume Website`
4. **Enabled**: Yes
5. **Click "Create"**

### Configure Realm Settings

```bash
# Or use Keycloak Admin CLI
docker run --rm -it \
  -e KEYCLOAK_URL=https://auth.yourname.com \
  -e KEYCLOAK_REALM=master \
  -e KEYCLOAK_USERNAME=admin \
  -e KEYCLOAK_PASSWORD=your-admin-password \
  quay.io/keycloak/keycloak:23.0 \
  /opt/keycloak/bin/kcadm.sh create realms \
  -s realm=resume \
  -s displayName="Resume Website" \
  -s enabled=true
```

## 🚀 Step 4: Create Client Application

### Via Admin Console

1. **Go to Clients** → Create Client
2. **Client type**: OpenID Connect
3. **Client ID**: `resume-website`
4. **Name**: `Resume Website`
5. **Click Next**

6. **Client authentication**: Off (public client)
7. **Authorization**: Off
8. **Authentication flow**: 
   - Standard flow: On
   - Direct access grants: Off
9. **Click Next**

10. **Valid redirect URIs**:
    - `https://yourname.com/auth/callback`
    - `http://localhost:8080/auth/callback`
11. **Valid post logout redirect URIs**:
    - `https://yourname.com/auth/logout`
    - `http://localhost:8080/auth/logout`
12. **Web origins**: `https://yourname.com`
13. **Click Save**

### Via Admin CLI

```bash
# Create client via CLI
docker run --rm -it \
  -e KEYCLOAK_URL=https://auth.yourname.com \
  -e KEYCLOAK_REALM=resume \
  -e KEYCLOAK_USERNAME=admin \
  -e KEYCLOAK_PASSWORD=your-admin-password \
  quay.io/keycloak/keycloak:23.0 \
  /opt/keycloak/bin/kcadm.sh create clients \
  -s clientId=resume-website \
  -s name="Resume Website" \
  -s protocol=openid-connect \
  -s publicClient=true \
  -s standardFlowEnabled=true \
  -s directAccessGrantsEnabled=false \
  -s 'redirectUris=["https://yourname.com/auth/callback","http://localhost:8080/auth/callback"]' \
  -s 'postLogoutRedirectUris=["https://yourname.com/auth/logout","http://localhost:8080/auth/logout"]' \
  -s 'webOrigins=["https://yourname.com"]'
```

## 🚀 Step 5: Create Users and Groups

### Create Group

1. **Go to Groups** → Create Group
2. **Name**: `resume-friends`
3. **Click Create**

### Create User

1. **Go to Users** → Add User
2. **Username**: `friend@example.com`
3. **Email**: `friend@example.com`
4. **First Name**: `Friend`
5. **Last Name**: `User`
6. **Email Verified**: On
7. **Enabled**: On
8. **Click Create**

### Set Password

1. **Go to Credentials tab**
2. **Password**: `SecurePassword123!`
3. **Temporary**: Off
4. **Click Set Password**

### Assign to Group

1. **Go to Groups tab**
2. **Available Groups**: Select `resume-friends`
3. **Click Join**

## 🚀 Step 6: Configure Client Scopes

### Create Custom Scope

1. **Go to Client Scopes** → Create Client Scope
2. **Name**: `resume-access`
3. **Description**: `Access to resume protected content`
4. **Type**: Default
5. **Protocol**: openid-connect
6. **Click Save**

### Add Group Mapper

1. **Go to Mappers tab** → Create Mapper
2. **Mapper Type**: Group Membership
3. **Name**: `groups`
4. **Token Claim Name**: `groups`
5. **Full group path**: Off
6. **Add to ID token**: On
7. **Add to access token**: On
8. **Add to userinfo**: On
9. **Click Save**

### Assign to Client

1. **Go to Clients** → `resume-website`
2. **Client Scopes tab**
3. **Add client scope**: `resume-access`
4. **Click Add** → Default

## 🚀 Step 7: Update Backend Code

### For AWS Version (Express.js)

Create `aws-version/app/keycloak-middleware.js`:

```javascript
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

class KeycloakAuth {
    constructor(options) {
        this.realm = options.realm;
        this.serverUrl = options.serverUrl;
        this.clientId = options.clientId;
        
        // JWKS client for token verification
        this.jwksClient = jwksClient({
            jwksUri: `${this.serverUrl}/realms/${this.realm}/protocol/openid-connect/certs`,
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
                issuer: `${this.serverUrl}/realms/${this.realm}`
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
                    email: decoded.email,
                    name: decoded.name,
                    preferred_username: decoded.preferred_username,
                    groups: decoded.groups || [],
                    realm_access: decoded.realm_access || {},
                    resource_access: decoded.resource_access || {}
                };

                next();
            } catch (error) {
                console.error('Keycloak auth error:', error);
                res.status(401).json({ error: 'Invalid or expired token' });
            }
        };
    }

    requireGroup(groupName) {
        return (req, res, next) => {
            if (!req.user.groups.includes(groupName)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
            next();
        };
    }

    requireRole(roleName, clientId = null) {
        return (req, res, next) => {
            let hasRole = false;
            
            if (clientId) {
                // Check client-specific role
                const clientAccess = req.user.resource_access[clientId];
                hasRole = clientAccess && clientAccess.roles.includes(roleName);
            } else {
                // Check realm role
                hasRole = req.user.realm_access.roles && 
                         req.user.realm_access.roles.includes(roleName);
            }
            
            if (!hasRole) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
            next();
        };
    }
}

module.exports = KeycloakAuth;
```

Update `aws-version/app/server.js`:

```javascript
const KeycloakAuth = require('./keycloak-middleware');

// Initialize Keycloak auth
const keycloakAuth = new KeycloakAuth({
    realm: 'resume',
    serverUrl: process.env.KEYCLOAK_SERVER_URL || 'https://auth.yourname.com',
    clientId: 'resume-website'
});

// Replace JWT middleware
const authenticateToken = keycloakAuth.middleware();

// Protected endpoints with group authorization
app.get('/api/protected/photos', 
    authenticateToken, 
    keycloakAuth.requireGroup('resume-friends'), 
    async (req, res) => {
        // Your existing photo logic
    }
);

app.get('/api/protected/documents', 
    authenticateToken, 
    keycloakAuth.requireGroup('resume-friends'), 
    async (req, res) => {
        // Your existing document logic
    }
);

// Admin endpoints with role-based access
app.post('/api/admin/users', 
    authenticateToken, 
    keycloakAuth.requireRole('admin'), 
    async (req, res) => {
        // Admin functionality
    }
);
```

## 🚀 Step 8: Update Frontend

### Add Keycloak Configuration

Create `keycloak-config.js`:

```javascript
window.KEYCLOAK_CONFIG = {
    url: 'https://auth.yourname.com',
    realm: 'resume',
    clientId: 'resume-website',
    redirectUri: window.location.origin + '/auth/callback',
    logoutUri: window.location.origin + '/auth/logout'
};
```

### Create Keycloak Auth Client

Create `auth-providers/keycloak/frontend/keycloak-auth.js`:

```javascript
// Keycloak Authentication Integration
class KeycloakAuth {
    constructor(config) {
        this.url = config.url;
        this.realm = config.realm;
        this.clientId = config.clientId;
        this.redirectUri = config.redirectUri;
        this.logoutUri = config.logoutUri;
        
        this.currentUser = null;
        this.accessToken = null;
        this.refreshToken = null;
        this.idToken = null;
        
        this.init();
    }

    async init() {
        // Check for tokens in URL (OAuth callback)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        
        if (code && state) {
            await this.handleCallback(code, state);
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            // Check for existing session
            this.loadTokensFromStorage();
            if (this.accessToken && !this.isTokenExpired(this.accessToken)) {
                await this.getCurrentUser();
            } else if (this.refreshToken) {
                await this.refreshAccessToken();
            }
        }
    }

    async login() {
        try {
            // Generate PKCE parameters
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = await this.generateCodeChallenge(codeVerifier);
            const state = this.generateState();

            // Store PKCE parameters
            sessionStorage.setItem('pkce_code_verifier', codeVerifier);
            sessionStorage.setItem('oauth_state', state);

            // Build authorization URL
            const authUrl = `${this.url}/realms/${this.realm}/protocol/openid-connect/auth`;
            const params = new URLSearchParams({
                response_type: 'code',
                client_id: this.clientId,
                redirect_uri: this.redirectUri,
                scope: 'openid profile email',
                state: state,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256'
            });

            // Redirect to Keycloak
            window.location.href = `${authUrl}?${params.toString()}`;
        } catch (error) {
            console.error('Login initiation error:', error);
            throw error;
        }
    }

    async handleCallback(code, state) {
        try {
            // Validate state
            const storedState = sessionStorage.getItem('oauth_state');
            if (state !== storedState) {
                throw new Error('Invalid state parameter');
            }

            // Get PKCE code verifier
            const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
            if (!codeVerifier) {
                throw new Error('Missing PKCE code verifier');
            }

            // Clean up session storage
            sessionStorage.removeItem('oauth_state');
            sessionStorage.removeItem('pkce_code_verifier');

            // Exchange code for tokens
            const tokenUrl = `${this.url}/realms/${this.realm}/protocol/openid-connect/token`;
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    client_id: this.clientId,
                    code: code,
                    redirect_uri: this.redirectUri,
                    code_verifier: codeVerifier
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
            }

            const tokens = await response.json();
            
            this.accessToken = tokens.access_token;
            this.refreshToken = tokens.refresh_token;
            this.idToken = tokens.id_token;
            
            // Store tokens
            this.saveTokensToStorage();
            
            // Get user info
            await this.getCurrentUser();
            
            return true;
        } catch (error) {
            console.error('Callback handling error:', error);
            this.clearTokens();
            throw error;
        }
    }

    async getCurrentUser() {
        if (!this.accessToken) return null;

        try {
            const userInfoUrl = `${this.url}/realms/${this.realm}/protocol/openid-connect/userinfo`;
            const response = await fetch(userInfoUrl, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (response.ok) {
                this.currentUser = await response.json();
                return this.currentUser;
            } else {
                throw new Error('Failed to get user info');
            }
        } catch (error) {
            console.error('Get user error:', error);
            if (this.refreshToken) {
                const refreshed = await this.refreshAccessToken();
                if (refreshed) {
                    return this.getCurrentUser();
                }
            }
            this.clearTokens();
            return null;
        }
    }

    async refreshAccessToken() {
        if (!this.refreshToken) return false;

        try {
            const tokenUrl = `${this.url}/realms/${this.realm}/protocol/openid-connect/token`;
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: this.clientId,
                    refresh_token: this.refreshToken
                })
            });

            if (response.ok) {
                const tokens = await response.json();
                
                this.accessToken = tokens.access_token;
                if (tokens.refresh_token) {
                    this.refreshToken = tokens.refresh_token;
                }
                if (tokens.id_token) {
                    this.idToken = tokens.id_token;
                }
                
                this.saveTokensToStorage();
                await this.getCurrentUser();
                
                return true;
            } else {
                throw new Error('Token refresh failed');
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            this.clearTokens();
            return false;
        }
    }

    async logout() {
        const idToken = this.idToken;
        
        // Clear local tokens
        this.clearTokens();
        
        // Redirect to Keycloak logout
        if (idToken) {
            const logoutUrl = `${this.url}/realms/${this.realm}/protocol/openid-connect/logout`;
            const params = new URLSearchParams({
                id_token_hint: idToken,
                post_logout_redirect_uri: this.logoutUri
            });
            
            window.location.href = `${logoutUrl}?${params.toString()}`;
        } else {
            window.location.href = this.logoutUri;
        }
    }

    isAuthenticated() {
        return this.accessToken && !this.isTokenExpired(this.accessToken) && this.currentUser;
    }

    getAccessToken() {
        return this.accessToken;
    }

    getUser() {
        return this.currentUser;
    }

    hasGroup(groupName) {
        return this.currentUser && this.currentUser.groups && 
               this.currentUser.groups.includes(groupName);
    }

    // Utility methods (same as Okta implementation)
    generateCodeVerifier() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return this.base64URLEncode(array);
    }

    async generateCodeChallenge(verifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        return this.base64URLEncode(new Uint8Array(digest));
    }

    base64URLEncode(array) {
        return btoa(String.fromCharCode.apply(null, array))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    generateState() {
        return this.base64URLEncode(crypto.getRandomValues(new Uint8Array(32)));
    }

    isTokenExpired(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp * 1000 < Date.now();
        } catch {
            return true;
        }
    }

    saveTokensToStorage() {
        if (this.accessToken) {
            localStorage.setItem('keycloak_access_token', this.accessToken);
        }
        if (this.refreshToken) {
            localStorage.setItem('keycloak_refresh_token', this.refreshToken);
        }
        if (this.idToken) {
            localStorage.setItem('keycloak_id_token', this.idToken);
        }
    }

    loadTokensFromStorage() {
        this.accessToken = localStorage.getItem('keycloak_access_token');
        this.refreshToken = localStorage.getItem('keycloak_refresh_token');
        this.idToken = localStorage.getItem('keycloak_id_token');
    }

    clearTokens() {
        this.accessToken = null;
        this.refreshToken = null;
        this.idToken = null;
        this.currentUser = null;
        localStorage.removeItem('keycloak_access_token');
        localStorage.removeItem('keycloak_refresh_token');
        localStorage.removeItem('keycloak_id_token');
    }
}

// Enhanced Resume App with Keycloak Integration
class KeycloakResumeApp extends ResumeApp {
    constructor() {
        super();
        
        // Initialize Keycloak auth
        this.keycloakAuth = new KeycloakAuth(window.KEYCLOAK_CONFIG);
        
        // Override parent methods
        this.setupKeycloakAuth();
    }

    setupKeycloakAuth() {
        // Override authentication methods
        this.checkAuthStatus = () => {
            const loginBtn = document.getElementById('loginBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            const protectedSection = document.getElementById('protected');

            if (this.keycloakAuth.isAuthenticated()) {
                loginBtn?.classList.add('hidden');
                logoutBtn?.classList.remove('hidden');
                protectedSection?.classList.remove('hidden');
                
                const user = this.keycloakAuth.getUser();
                if (user && logoutBtn) {
                    logoutBtn.textContent = `Logout (${user.preferred_username || user.email})`;
                }
            } else {
                loginBtn?.classList.remove('hidden');
                logoutBtn?.classList.add('hidden');
                protectedSection?.classList.add('hidden');
                if (logoutBtn) {
                    logoutBtn.textContent = 'Logout';
                }
            }
        };

        this.showLoginModal = async () => {
            try {
                await this.keycloakAuth.login();
            } catch (error) {
                this.showNotification('Login failed: ' + error.message, 'error');
            }
        };

        this.logout = async () => {
            try {
                await this.keycloakAuth.logout();
            } catch (error) {
                this.showNotification('Logout failed: ' + error.message, 'error');
            }
        };

        this.makeAuthenticatedRequest = async (url, options = {}) => {
            const token = this.keycloakAuth.getAccessToken();
            
            return fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`
                }
            });
        };
    }

    async loadProtectedContent() {
        if (!this.keycloakAuth.isAuthenticated()) return;

        // Check if user has required group
        if (!this.keycloakAuth.hasGroup('resume-friends')) {
            this.showNotification('You need to be in the resume-friends group to access this content', 'error');
            return;
        }

        try {
            await Promise.all([
                this.loadPhotos(),
                this.loadDocuments()
            ]);
        } catch (error) {
            console.error('Error loading protected content:', error);
            this.showNotification('Error loading protected content', 'error');
        }
    }
}

// Auto-initialize if Keycloak config is available
document.addEventListener('DOMContentLoaded', () => {
    if (window.KEYCLOAK_CONFIG) {
        window.app = new KeycloakResumeApp();
    } else {
        window.app = new ResumeApp();
    }
});
```

### Update HTML

```html
<!-- Add Keycloak configuration -->
<script src="keycloak-config.js"></script>
<script src="../auth-providers/keycloak/frontend/keycloak-auth.js"></script>
<script src="script.js"></script>
```

## 🚀 Step 9: Test the Integration

1. **Visit your website**: https://yourname.com
2. **Click "Friend Login"**: Redirects to Keycloak
3. **Login with credentials**: Created user
4. **Access protected content**: Photos and documents

## 🚀 Step 10: Advanced Configuration

### Enable Social Login

1. **Go to Identity Providers** → Add Provider
2. **Choose provider**: Google, GitHub, Facebook, etc.
3. **Configure credentials**: Client ID/Secret from provider
4. **Map attributes**: Email, name, etc.
5. **Test login flow**

### Custom Themes

1. **Create theme directory**: `/opt/keycloak/themes/resume`
2. **Copy base theme**: `cp -r base/* resume/`
3. **Customize**: CSS, templates, messages
4. **Apply theme**: Realm Settings → Themes

### User Federation

1. **Go to User Federation** → Add Provider
2. **Choose**: LDAP, Active Directory, etc.
3. **Configure connection**: Host, credentials, search base
4. **Map attributes**: Username, email, groups
5. **Test sync**

## 🔧 Monitoring and Maintenance

### Health Checks

```bash
# Check Keycloak health
curl https://auth.yourname.com/health/ready

# Check database connection
curl https://auth.yourname.com/health/live
```

### Backup Database

```bash
# Create RDS snapshot
aws rds create-db-snapshot \
    --db-instance-identifier resume-xxxx-keycloak-db \
    --db-snapshot-identifier keycloak-backup-$(date +%Y%m%d)
```

### Update Keycloak

```bash
# Update Terraform with new version
echo 'keycloak_version = "24.0"' >> terraform.tfvars

# Apply update
terraform apply
```

## 🎉 You're Done!

Your resume website now has a fully self-hosted identity provider with:

- ✅ **Complete control** over authentication
- ✅ **Enterprise features** without vendor lock-in
- ✅ **Customizable** to your exact needs
- ✅ **Standards compliant** OAuth 2.0 + OIDC
- ✅ **Extensible** with plugins and themes

## 💡 Next Steps

- **Custom themes** for branded login experience
- **Social login** integration
- **User federation** with existing systems
- **Advanced security** policies
- **Multi-tenancy** for multiple applications

Your friends now have secure access through your own identity provider! 🔐