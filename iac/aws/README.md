# AWS IaC

Terraform deployment for minimal serverless infrastructure (API Gateway, Lambda, IAM, CloudWatch) used for Graph webhooks.

Spec reference: [specs/infrastructure-minimal-serverless-spec.md](../../specs/infrastructure-minimal-serverless-spec.md)

Lambda stub source:

- [apps/aws-lambda](../../apps/aws-lambda)

Planned contents:

- main.tf
- variables.tf
- outputs.tf
- providers.tf
- modules/

Notes:

- API Gateway exposes `POST /graph` for Graph webhook delivery.
- Lambda package is built from [apps/aws-lambda](../../apps/aws-lambda).

Generate local environment file after apply:

```powershell
./scripts/generate-aws-env.ps1
```

```bash
./scripts/generate-aws-env.sh
```
