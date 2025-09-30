# AWS Resume Website Setup Guide

Complete guide to deploy your cost-optimized resume website with containers on AWS.

## 🏗️ Architecture Overview

**Cost-Optimized Stack:**
- **Frontend**: S3 + CloudFront (static hosting)
- **Backend**: ECS Fargate Spot (up to 70% savings)
- **Database**: Aurora Serverless v2 (scales to zero)
- **Storage**: S3 with Intelligent Tiering
- **Load Balancer**: Application Load Balancer
- **DNS**: Route 53

**Estimated Monthly Cost: $15-30** (for low traffic)

## 📋 Prerequisites

1. **AWS Account** with billing enabled
2. **Domain** added to Route 53 hosted zone
3. **AWS CLI** configured with appropriate permissions
4. **Terraform** >= 1.0
5. **Docker** for container builds
6. **Node.js** for local development

## 🚀 Step-by-Step Setup

### 1. AWS Setup

```bash
# Install AWS CLI (if not installed)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS CLI
aws configure
# Enter your Access Key ID, Secret Access Key, Region (us-east-1), and output format (json)
```

### 2. Domain Setup

1. **Purchase domain** (or use existing)
2. **Create Route 53 hosted zone**:
   ```bash
   aws route53 create-hosted-zone --name yourname.com --caller-reference $(date +%s)
   ```
3. **Update nameservers** at your domain registrar with Route 53 nameservers

### 3. Project Configuration

```bash
# Clone your repository
git clone <your-repo-url>
cd resume-website/aws-version

# Copy and configure variables
cp terraform/terraform.tfvars.example terraform/terraform.tfvars
```

Edit `terraform/terraform.tfvars`:
```hcl
# AWS Configuration
aws_region = "us-east-1"
environment = "prod"

# Domain (must have Route 53 hosted zone)
domain_name = "yourname.com"
api_subdomain = "api"

# Security (generate strong passwords)
jwt_secret = "your-super-secret-jwt-key-here"
admin_email = "your.email@example.com"
admin_password = "your-secure-admin-password"

# Cost optimization settings
container_cpu = 256
container_memory = 512
min_capacity = 1
max_capacity = 3
enable_spot_instances = true
db_min_capacity = 0.5
db_max_capacity = 1
```

### 4. Generate Secrets

```bash
# Generate JWT secret
openssl rand -base64 32

# Generate admin password
openssl rand -base64 16
```

### 5. Deploy Infrastructure

```bash
cd terraform

# Initialize Terraform
terraform init

# Plan deployment (review what will be created)
terraform plan

# Apply infrastructure (this takes 10-15 minutes)
terraform apply
```

**What gets created:**
- VPC with public/private subnets
- ECS cluster with Fargate Spot
- Aurora Serverless v2 database
- S3 buckets for website and assets
- CloudFront distribution
- Application Load Balancer
- Route 53 DNS records
- SSL certificates

### 6. Deploy Application

```bash
# Make deploy script executable
chmod +x scripts/deploy.sh

# Run deployment
./scripts/deploy.sh
```

This script will:
1. Build Docker container
2. Push to ECR
3. Deploy frontend to S3
4. Update ECS service
5. Invalidate CloudFront cache

### 7. Create First User

```bash
# Get API URL from Terraform
cd terraform
API_URL=$(terraform output -raw api_url)
cd ..

# Register admin user
curl -X POST $API_URL/api/register \
  -H "Content-Type: application/json" \
  -d '{"email": "your.email@example.com", "password": "your-secure-password"}'
```

### 8. Upload Protected Content

```bash
# Get S3 bucket name
cd terraform
S3_BUCKET=$(terraform output -raw s3_assets_bucket)
cd ..

# Upload photos
aws s3 cp photo1.jpg s3://$S3_BUCKET/photos/
aws s3 cp photo2.jpg s3://$S3_BUCKET/photos/

# Upload documents
aws s3 cp resume.pdf s3://$S3_BUCKET/documents/
aws s3 cp portfolio.pdf s3://$S3_BUCKET/documents/
```

## 🎯 Customization

### Update Website Content

1. Edit `frontend/index.html` with your information
2. Modify `frontend/styles.css` for styling
3. Run `./scripts/deploy.sh` to deploy changes

### Add API Features

1. Edit `app/server.js` to add endpoints
2. Update `frontend/script.js` for frontend integration
3. Run `./scripts/deploy.sh` to deploy

### Infrastructure Changes

1. Modify Terraform files in `terraform/`
2. Run `terraform plan` and `terraform apply`

## 💰 Cost Optimization Features

### Fargate Spot Instances
- **Savings**: Up to 70% vs regular Fargate
- **Trade-off**: Tasks may be interrupted (rare)
- **Mitigation**: Auto-scaling replaces interrupted tasks

### Aurora Serverless v2
- **Scales to zero** when not in use
- **Pay per use** - only for actual compute
- **Automatic scaling** based on demand

### S3 Intelligent Tiering
- **Automatic cost optimization** for stored files
- **Moves data** to cheaper storage classes
- **No retrieval fees** for frequent access

### CloudFront Caching
- **Reduces origin requests** to save costs
- **Improves performance** globally
- **Price Class 100** (North America + Europe only)

## 📊 Monitoring Costs

```bash
# Check current month costs
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE

# Set up billing alerts
aws budgets create-budget \
  --account-id $(aws sts get-caller-identity --query Account --output text) \
  --budget file://budget.json
```

## 🔧 Troubleshooting

### Common Issues

**Domain not resolving:**
- Check Route 53 nameservers match registrar
- Wait up to 48 hours for DNS propagation

**ECS tasks failing:**
- Check CloudWatch logs: `/ecs/resume-xxxx`
- Verify environment variables in task definition

**Database connection errors:**
- Ensure Aurora cluster is running
- Check security group rules

**High costs:**
- Verify Spot instances are enabled
- Check Aurora is scaling down when idle
- Review S3 storage classes

### Useful Commands

```bash
# Check ECS service status
aws ecs describe-services --cluster resume-xxxx-cluster --services resume-xxxx-service

# View application logs
aws logs tail /ecs/resume-xxxx --follow

# Check Aurora status
aws rds describe-db-clusters --db-cluster-identifier resume-xxxx-cluster

# Monitor costs
aws ce get-dimension-values --dimension SERVICE --time-period Start=2024-01-01,End=2024-01-31
```

## 🔒 Security Best Practices

- **JWT secrets** stored in SSM Parameter Store
- **Database passwords** auto-generated and encrypted
- **Container runs** as non-root user
- **Security groups** restrict access to necessary ports
- **SSL/TLS** enforced everywhere

## 🚀 Going to Production

### Additional Considerations

1. **Enable AWS Config** for compliance monitoring
2. **Set up CloudTrail** for audit logging
3. **Configure backup retention** for RDS
4. **Implement monitoring** with CloudWatch alarms
5. **Set up CI/CD pipeline** with GitHub Actions

### Scaling Up

- Increase `max_capacity` for more concurrent users
- Add more Aurora capacity units for database performance
- Enable additional CloudFront edge locations
- Consider adding ElastiCache for session storage

Your cost-optimized resume website is now live! 🎉

**Website**: https://yourname.com  
**API**: https://api.yourname.com