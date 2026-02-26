// Admin App ECS Fargate module
// Deploys VPC, ECS cluster, ECR, IAM, Secrets Manager, CloudWatch
// Uses public subnets with public IP (no ALB — account does not support ELBv2)

locals {
  name_prefix = "tmf-admin-app-${var.resource_suffix}"
}

//=============================================================================
// VPC
//=============================================================================

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, { Name = "${local.name_prefix}-vpc" })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, { Name = "${local.name_prefix}-igw" })
}

resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, { Name = "${local.name_prefix}-public-${var.availability_zones[count.index]}" })
}

// Route table for public subnets
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-public-rt" })
}

resource "aws_route_table_association" "public" {
  count          = length(var.availability_zones)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

//=============================================================================
// ECR REPOSITORY
//=============================================================================

resource "aws_ecr_repository" "admin_app" {
  name                 = "tmf-admin-app-${var.resource_suffix}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = var.tags
}

resource "aws_ecr_lifecycle_policy" "admin_app" {
  repository = aws_ecr_repository.admin_app.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = {
        type = "expire"
      }
    }]
  })
}

//=============================================================================
// CLOUDWATCH LOG GROUP
//=============================================================================

resource "aws_cloudwatch_log_group" "admin_app" {
  name              = "/ecs/tmf-admin-app-${var.resource_suffix}"
  retention_in_days = 30

  tags = var.tags
}

//=============================================================================
// SECRETS MANAGER
//=============================================================================

resource "aws_secretsmanager_secret" "admin_app" {
  name        = "tmf/admin-app-${var.resource_suffix}"
  description = "Admin app secrets (Graph client secret, session secret, API key, dashboard password, Entra ID client secret)"

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "admin_app" {
  secret_id = aws_secretsmanager_secret.admin_app.id
  secret_string = jsonencode({
    GRAPH_CLIENT_SECRET = var.graph_client_secret
    SESSION_SECRET      = var.session_secret
    API_KEY             = var.api_key
    DASHBOARD_PASSWORD  = var.dashboard_password
    ENTRA_CLIENT_SECRET = var.entra_client_secret
  })
}

//=============================================================================
// SECURITY GROUPS
//=============================================================================

resource "aws_security_group" "ecs_tasks" {
  name_prefix = "${local.name_prefix}-ecs-"
  description = "Security group for admin app ECS tasks (public IP, no ALB)"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Container port from anywhere"
    from_port   = var.container_port
    to_port     = var.container_port
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${local.name_prefix}-ecs-sg" })

  lifecycle {
    create_before_destroy = true
  }
}

// (No ALB — this AWS account does not support creating load balancers.
// ECS tasks use public subnets with assigned public IPs instead.)

//=============================================================================
// IAM - ECS TASK EXECUTION ROLE
//=============================================================================

resource "aws_iam_role" "ecs_execution" {
  name = "${local.name_prefix}-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ecs_execution_base" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${local.name_prefix}-execution-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [aws_secretsmanager_secret.admin_app.arn]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = ["${aws_cloudwatch_log_group.admin_app.arn}:*"]
      }
    ]
  })
}

//=============================================================================
// IAM - ECS TASK ROLE (application permissions)
//=============================================================================

resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "ecs_task_dynamodb" {
  name = "${local.name_prefix}-task-dynamodb"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem"
      ]
      Resource = [
        var.subscriptions_table_arn,
        "${var.subscriptions_table_arn}/index/*",
        var.meetings_table_arn,
        "${var.meetings_table_arn}/index/*",
        var.transcripts_table_arn,
        "${var.transcripts_table_arn}/index/*",
        var.config_table_arn,
        "${var.config_table_arn}/index/*",
        var.eventhub_checkpoints_table_arn,
        "${var.eventhub_checkpoints_table_arn}/index/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name = "${local.name_prefix}-task-s3"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        var.webhook_bucket_arn,
        "${var.webhook_bucket_arn}/*",
        var.transcript_bucket_arn,
        "${var.transcript_bucket_arn}/*",
        var.sanitized_transcript_bucket_arn,
        "${var.sanitized_transcript_bucket_arn}/*",
        var.checkpoint_bucket_arn,
        "${var.checkpoint_bucket_arn}/*"
      ]
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_secrets" {
  name = "${local.name_prefix}-task-secrets"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "secretsmanager:GetSecretValue"
      ]
      Resource = [aws_secretsmanager_secret.admin_app.arn]
    }]
  })
}

resource "aws_iam_role_policy" "ecs_task_logs" {
  name = "${local.name_prefix}-task-logs"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = ["${aws_cloudwatch_log_group.admin_app.arn}:*"]
    }]
  })
}

//=============================================================================
// ECS CLUSTER
//=============================================================================

resource "aws_ecs_cluster" "admin_app" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = var.tags
}

//=============================================================================
// ECS TASK DEFINITION
//=============================================================================

resource "aws_ecs_task_definition" "admin_app" {
  family                   = local.name_prefix
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name      = "admin-app"
    image     = "${aws_ecr_repository.admin_app.repository_url}:latest"
    essential = true

    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    healthCheck = {
      command     = ["CMD-SHELL", "node -e \"const https=require('https');https.get({hostname:'localhost',port:${var.container_port},path:'/health',rejectUnauthorized:false},(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))\""]
      interval    = 30
      timeout     = 10
      retries     = 3
      startPeriod = 15
    }

    environment = [
      { name = "NODE_ENV", value = var.environment == "prod" ? "production" : "development" },
      { name = "PORT", value = tostring(var.container_port) },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "DYNAMODB_SUBSCRIPTIONS_TABLE", value = var.subscriptions_table_name },
      { name = "DYNAMODB_MEETINGS_TABLE", value = var.meetings_table_name },
      { name = "DYNAMODB_TRANSCRIPTS_TABLE", value = var.transcripts_table_name },
      { name = "DYNAMODB_CONFIG_TABLE", value = var.config_table_name },
      { name = "S3_RAW_TRANSCRIPT_BUCKET", value = var.transcript_bucket_name },
      { name = "S3_SANITIZED_TRANSCRIPT_BUCKET", value = var.sanitized_transcript_bucket_name },
      { name = "GRAPH_TENANT_ID", value = var.graph_tenant_id },
      { name = "GRAPH_CLIENT_ID", value = var.graph_client_id },
      { name = "ENTRA_GROUP_ID", value = var.entra_group_id },
      { name = "GRAPH_SECRET_NAME", value = aws_secretsmanager_secret.admin_app.name },
      { name = "ENTRA_TENANT_ID", value = var.entra_tenant_id },
      { name = "ENTRA_CLIENT_ID", value = var.entra_client_id },
      { name = "ENTRA_REDIRECT_URI", value = var.entra_redirect_uri },
      { name = "ADMIN_GROUP_ID", value = var.admin_group_id },
    ]

    secrets = [
      { name = "GRAPH_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.admin_app.arn}:GRAPH_CLIENT_SECRET::" },
      { name = "SESSION_SECRET", valueFrom = "${aws_secretsmanager_secret.admin_app.arn}:SESSION_SECRET::" },
      { name = "API_KEY", valueFrom = "${aws_secretsmanager_secret.admin_app.arn}:API_KEY::" },
      { name = "DASHBOARD_PASSWORD", valueFrom = "${aws_secretsmanager_secret.admin_app.arn}:DASHBOARD_PASSWORD::" },
      { name = "ENTRA_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.admin_app.arn}:ENTRA_CLIENT_SECRET::" },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.admin_app.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])

  tags = var.tags
}

//=============================================================================
// ECS SERVICE
//=============================================================================

resource "aws_ecs_service" "admin_app" {
  name            = local.name_prefix
  cluster         = aws_ecs_cluster.admin_app.id
  task_definition = aws_ecs_task_definition.admin_app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = true
  }

  tags = var.tags
}
