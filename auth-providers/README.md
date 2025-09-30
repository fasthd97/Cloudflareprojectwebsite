# Modern Authentication Providers

Optional authentication providers to replace the basic JWT system with enterprise-grade solutions.

## 🔐 Available Providers

### AWS Cognito
- **Best for**: AWS-native integration
- **Cost**: Free tier: 50,000 MAU
- **Features**: Social login, MFA, user pools
- **Platforms**: ✅ AWS ECS, ✅ Cloudflare Workers

### Okta
- **Best for**: Enterprise features
- **Cost**: Free tier: 15,000 MAU
- **Features**: SSO, advanced security, compliance
- **Platforms**: ✅ AWS ECS, ✅ Cloudflare Workers

### Keycloak
- **Best for**: Self-hosted, open source
- **Cost**: Infrastructure only
- **Features**: Full identity management, customizable
- **Platforms**: ✅ AWS ECS, ✅ Cloudflare Workers

## 🚀 Quick Setup

Each provider has:
- ✅ **Drop-in replacement** for existing auth
- ✅ **Terraform configuration** for infrastructure
- ✅ **Frontend integration** with modern SDKs
- ✅ **Backend validation** and token handling
- ✅ **AWS ECS integration** for containerized apps
- ✅ **Cloudflare Workers integration** for edge computing
- ✅ **Step-by-step walkthrough**

## 🏗️ Platform Support

### AWS Version (ECS + Express.js)
- Full container deployment with Terraform
- Express.js middleware for token validation
- Complete infrastructure as code

### Cloudflare Version (Workers + Edge)
- Edge-optimized JWT validation
- JWKS caching for performance
- Automatic provider detection

## 📚 Integration Guides

- **[General Integration Guide](INTEGRATION-GUIDE.md)** - Choose your provider
- **[AWS ECS Integration](../aws-version/SETUP.md)** - Container deployment
- **[Cloudflare Workers Integration](CLOUDFLARE-INTEGRATION.md)** - Edge deployment

## 📁 Structure

```
auth-providers/
├── cognito/           # AWS Cognito integration
├── okta/             # Okta integration  
├── keycloak/         # Keycloak self-hosted
└── shared/           # Common utilities
```

Choose your provider and follow the specific walkthrough!