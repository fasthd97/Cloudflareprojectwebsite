# Resume Website Setup Guide

This guide will walk you through deploying your resume website with authentication using Terraform and Cloudflare.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Domain**: Add your domain to Cloudflare (free tier works)
3. **GitHub Account**: For code hosting and automatic deployments
4. **Terraform**: Install from [terraform.io](https://terraform.io)
5. **Node.js**: For local development

## Step 1: Cloudflare Setup

### Get Your API Token
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Custom token" template
4. Set permissions:
   - Zone: Zone Settings:Read, Zone:Read
   - Account: Cloudflare Pages:Edit, Account Settings:Read
   - Zone Resources: Include All zones

### Get Your Account ID
1. In Cloudflare dashboard, check the sidebar
2. Copy your Account ID

## Step 2: Local Setup

```bash
# Clone and setup the project
git clone <your-repo-url>
cd resume-website

# Install dependencies
npm install

# Copy and configure variables
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

Edit `terraform/terraform.tfvars` with your values:
```hcl
cloudflare_account_id = "your-account-id"
domain_name = "yourname.com"
github_username = "yourusername"
github_repo_name = "resume-website"
jwt_secret = "generate-with-openssl-rand-base64-32"
admin_email = "your.email@example.com"
```

## Step 3: Generate JWT Secret

```bash
# Generate a secure JWT secret
openssl rand -base64 32
```

Copy this value to your `terraform.tfvars` file.

## Step 4: Deploy Infrastructure

```bash
# Set your Cloudflare API token
export CLOUDFLARE_API_TOKEN="your-api-token-here"

# Initialize Terraform
cd terraform
terraform init

# Plan the deployment (see what will be created)
terraform plan

# Apply the changes
terraform apply
```

## Step 5: Setup Database

After Terraform completes, you'll need to initialize your database:

```bash
# Get your database ID from Terraform output
terraform output d1_database_id

# Use wrangler to run database migrations
npx wrangler d1 execute resume-auth-db --command "CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);"
```

## Step 6: Add Your First Friend

```bash
# Create a user account (replace with actual email/password)
curl -X POST https://api.yourname.com/api/register \
  -H "Content-Type: application/json" \
  -d '{"email": "friend@example.com", "password": "securepassword"}'
```

## Step 7: Upload Protected Content

Use the Cloudflare dashboard or wrangler CLI to upload photos and documents:

```bash
# Upload photos to the photos/ prefix
npx wrangler r2 object put resume-assets-xxxx/photos/photo1.jpg --file ./path/to/photo1.jpg

# Upload documents to the documents/ prefix  
npx wrangler r2 object put resume-assets-xxxx/documents/resume.pdf --file ./path/to/resume.pdf
```

## Understanding the Architecture

### What Terraform Creates:

1. **Cloudflare Pages Project**: Hosts your static website
2. **Custom Domain**: Points your domain to the Pages project
3. **D1 Database**: Stores user authentication data
4. **R2 Bucket**: Stores photos and documents
5. **Worker Script**: Handles API requests and authentication
6. **Worker Domain**: API subdomain (api.yourname.com)

### How Authentication Works:

1. Friends visit your site and click "Friend Login"
2. They enter credentials you've provided them
3. Worker validates credentials against D1 database
4. If valid, returns a JWT token
5. Token is used to access protected photos and documents
6. Content is served from R2 bucket through the Worker

### File Structure:
```
├── terraform/           # Infrastructure as code
│   ├── main.tf         # Main resources
│   ├── variables.tf    # Input variables
│   ├── workers.tf      # Worker configuration
│   └── outputs.tf      # Output values
├── src/
│   └── worker.js       # API backend code
├── public/
│   ├── index.html      # Main website
│   ├── styles.css      # Styling
│   └── script.js       # Frontend JavaScript
└── package.json        # Dependencies
```

## Customization

1. **Update Content**: Edit `public/index.html` with your information
2. **Styling**: Modify `public/styles.css` for your design
3. **Add Features**: Extend `src/worker.js` for new API endpoints
4. **Infrastructure**: Modify Terraform files for additional resources

## Troubleshooting

- **Domain not working**: Ensure domain is added to Cloudflare and nameservers are updated
- **API errors**: Check Worker logs in Cloudflare dashboard
- **Database issues**: Verify D1 database is created and tables exist
- **Authentication failing**: Check JWT secret is set correctly

## Security Notes

- JWT secret should be a strong random string
- Only share friend credentials with trusted people
- Consider adding rate limiting for production use
- Regularly rotate JWT secrets and friend passwords

Your resume website is now live with friend authentication! 🎉