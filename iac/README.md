# Infrastructure as Code (IaC)

This folder contains Terraform deployments split by cloud provider.

## Structure

```
iac/
├── azure/  # Azure-only deployment (Container Apps + supporting services)
└── aws/    # AWS-only deployment (Lambda + API Gateway + supporting services)
```

## How to Use

- Azure full-stack deployment: see [specs/infrastructure-terraform-spec.md](../specs/infrastructure-terraform-spec.md)
- Minimal serverless deployment: see [specs/infrastructure-minimal-serverless-spec.md](../specs/infrastructure-minimal-serverless-spec.md)

Each subfolder will contain Terraform files and provider-specific configuration.
