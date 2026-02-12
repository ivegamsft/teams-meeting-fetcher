// AWS deployment entry point.
// See specs/infrastructure-minimal-serverless-spec.md for the full resource design.

resource "aws_s3_bucket" "webhook_payloads" {
  bucket = var.s3_bucket_name
}

resource "aws_iam_role" "lambda_role" {
  name = "tmf-lambda-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_s3" {
  name = "tmf-lambda-s3"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = "${aws_s3_bucket.webhook_payloads.arn}/*"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "webhook_writer" {
  function_name    = "tmf-webhook-writer-${var.environment}"
  role             = aws_iam_role.lambda_role.arn
  handler          = "handler.handler"
  runtime          = "nodejs18.x"
  filename         = var.lambda_package_path
  source_code_hash = filebase64sha256(var.lambda_package_path)

  environment {
    variables = {
      BUCKET_NAME = aws_s3_bucket.webhook_payloads.bucket
    }
  }
}

resource "aws_api_gateway_rest_api" "graph_webhooks" {
  name        = "tmf-graph-webhooks-${var.environment}"
  description = "Teams Meeting Fetcher Graph webhook receiver"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_resource" "graph" {
  rest_api_id = aws_api_gateway_rest_api.graph_webhooks.id
  parent_id   = aws_api_gateway_rest_api.graph_webhooks.root_resource_id
  path_part   = "graph"
}

resource "aws_api_gateway_method" "graph_post" {
  rest_api_id   = aws_api_gateway_rest_api.graph_webhooks.id
  resource_id   = aws_api_gateway_resource.graph.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "graph_lambda" {
  rest_api_id             = aws_api_gateway_rest_api.graph_webhooks.id
  resource_id             = aws_api_gateway_resource.graph.id
  http_method             = aws_api_gateway_method.graph_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.webhook_writer.invoke_arn
}

resource "aws_lambda_permission" "api_gateway_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook_writer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.graph_webhooks.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "graph" {
  rest_api_id = aws_api_gateway_rest_api.graph_webhooks.id
  stage_name  = var.environment

  depends_on = [aws_api_gateway_integration.graph_lambda]
}
