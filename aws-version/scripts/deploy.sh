#!/bin/bash

# AWS Resume Website Deployment Script
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION=${AWS_REGION:-us-east-1}
TERRAFORM_DIR="terraform"
APP_DIR="app"
FRONTEND_DIR="frontend"

echo -e "${BLUE}🚀 Starting AWS Resume Website Deployment${NC}"

# Check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}📋 Checking prerequisites...${NC}"
    
    command -v aws >/dev/null 2>&1 || { echo -e "${RED}❌ AWS CLI is required but not installed.${NC}" >&2; exit 1; }
    command -v terraform >/dev/null 2>&1 || { echo -e "${RED}❌ Terraform is required but not installed.${NC}" >&2; exit 1; }
    command -v docker >/dev/null 2>&1 || { echo -e "${RED}❌ Docker is required but not installed.${NC}" >&2; exit 1; }
    
    # Check if terraform.tfvars exists
    if [ ! -f "$TERRAFORM_DIR/terraform.tfvars" ]; then
        echo -e "${RED}❌ terraform.tfvars not found. Please copy terraform.tfvars.example and configure it.${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
}

# Get Terraform outputs
get_terraform_outputs() {
    echo -e "${YELLOW}📊 Getting Terraform outputs...${NC}"
    
    cd $TERRAFORM_DIR
    
    ECR_REPOSITORY_URL=$(terraform output -raw ecr_repository_url)
    S3_WEBSITE_BUCKET=$(terraform output -raw s3_website_bucket)
    CLOUDFRONT_DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id)
    
    cd ..
    
    echo -e "${GREEN}✅ Retrieved Terraform outputs${NC}"
}

# Build and push Docker image
build_and_push_image() {
    echo -e "${YELLOW}🐳 Building and pushing Docker image...${NC}"
    
    # Get AWS account ID for ECR login
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    
    # Login to ECR
    aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY_URL
    
    # Build image
    cd $APP_DIR
    docker build -t resume-api .
    docker tag resume-api:latest $ECR_REPOSITORY_URL:latest
    
    # Push image
    docker push $ECR_REPOSITORY_URL:latest
    
    cd ..
    
    echo -e "${GREEN}✅ Docker image built and pushed${NC}"
}

# Deploy frontend to S3
deploy_frontend() {
    echo -e "${YELLOW}🌐 Deploying frontend to S3...${NC}"
    
    # Sync frontend files to S3
    aws s3 sync $FRONTEND_DIR/ s3://$S3_WEBSITE_BUCKET/ --delete
    
    # Invalidate CloudFront cache
    aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"
    
    echo -e "${GREEN}✅ Frontend deployed to S3${NC}"
}

# Update ECS service
update_ecs_service() {
    echo -e "${YELLOW}🔄 Updating ECS service...${NC}"
    
    cd $TERRAFORM_DIR
    
    ECS_CLUSTER_NAME=$(terraform output -raw ecs_cluster_name)
    ECS_SERVICE_NAME=$(terraform output -raw ecs_service_name)
    
    cd ..
    
    # Force new deployment
    aws ecs update-service \
        --cluster $ECS_CLUSTER_NAME \
        --service $ECS_SERVICE_NAME \
        --force-new-deployment \
        --region $AWS_REGION
    
    echo -e "${GREEN}✅ ECS service updated${NC}"
}

# Wait for deployment
wait_for_deployment() {
    echo -e "${YELLOW}⏳ Waiting for deployment to complete...${NC}"
    
    cd $TERRAFORM_DIR
    
    ECS_CLUSTER_NAME=$(terraform output -raw ecs_cluster_name)
    ECS_SERVICE_NAME=$(terraform output -raw ecs_service_name)
    
    cd ..
    
    aws ecs wait services-stable \
        --cluster $ECS_CLUSTER_NAME \
        --services $ECS_SERVICE_NAME \
        --region $AWS_REGION
    
    echo -e "${GREEN}✅ Deployment completed successfully${NC}"
}

# Show deployment info
show_deployment_info() {
    echo -e "${BLUE}🎉 Deployment Summary${NC}"
    
    cd $TERRAFORM_DIR
    
    WEBSITE_URL=$(terraform output -raw website_url)
    API_URL=$(terraform output -raw api_url)
    
    cd ..
    
    echo -e "${GREEN}Website URL: $WEBSITE_URL${NC}"
    echo -e "${GREEN}API URL: $API_URL${NC}"
    echo -e "${YELLOW}Note: It may take a few minutes for DNS changes to propagate${NC}"
}

# Main deployment flow
main() {
    check_prerequisites
    get_terraform_outputs
    build_and_push_image
    deploy_frontend
    update_ecs_service
    wait_for_deployment
    show_deployment_info
    
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
}

# Run main function
main "$@"