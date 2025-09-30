# AWS Resume Website - Container Edition

Cost-optimized resume website with authentication using AWS containers and serverless services.

## Architecture

- **Frontend**: S3 + CloudFront (static hosting)
- **Backend**: ECS Fargate Spot (containerized API)
- **Database**: RDS Aurora Serverless v2 (pay-per-use)
- **Storage**: S3 (photos/documents)
- **Load Balancer**: Application Load Balancer
- **DNS**: Route 53

## Cost Optimization Features

- Fargate Spot instances (up to 70% savings)
- Aurora Serverless v2 (scales to zero)
- S3 Intelligent Tiering
- CloudFront caching
- Minimal resource allocation

Estimated monthly cost: $15-30 for low traffic