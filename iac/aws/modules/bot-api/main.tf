// Bot API Gateway module - REST API for meeting bot callbacks

resource "aws_api_gateway_rest_api" "api" {
  name        = var.api_name
  description = var.api_description

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = var.tags
}

data "aws_region" "current" {}

resource "aws_api_gateway_resource" "bot_root" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = var.root_path_part
}

resource "aws_api_gateway_resource" "callbacks" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.bot_root.id
  path_part   = "callbacks"
}

resource "aws_api_gateway_resource" "messages" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.bot_root.id
  path_part   = "messages"
}

// Lambda authorizer for request validation
resource "aws_api_gateway_authorizer" "lambda_authorizer" {
  name            = "${var.api_name}-authorizer"
  rest_api_id     = aws_api_gateway_rest_api.api.id
  authorizer_uri  = var.authorizer_invoke_arn
  type            = "REQUEST"
  identity_source = "method.request.header.Content-Type"

  # Don't cache authorization results for webhook callbacks
  authorizer_result_ttl_in_seconds = 0
}

// Permission for API Gateway to invoke authorizer Lambda
resource "aws_lambda_permission" "authorizer_invoke" {
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = var.authorizer_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/authorizers/*"
}

resource "aws_api_gateway_method" "callbacks_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.callbacks.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.lambda_authorizer.id
}

resource "aws_api_gateway_method" "messages_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.messages.id
  http_method   = "POST"
  authorization = "CUSTOM"
  authorizer_id = aws_api_gateway_authorizer.lambda_authorizer.id
}

resource "aws_api_gateway_integration" "callbacks_integration" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.callbacks.id
  http_method             = aws_api_gateway_method.callbacks_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.id}:lambda:path/2015-03-31/functions/${var.lambda_invoke_arn}/invocations"
}

resource "aws_api_gateway_integration" "messages_integration" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.messages.id
  http_method             = aws_api_gateway_method.messages_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = "arn:aws:apigateway:${data.aws_region.current.id}:lambda:path/2015-03-31/functions/${var.lambda_invoke_arn}/invocations"
}

resource "aws_lambda_permission" "api_gateway_invoke" {
  statement_id  = "AllowAPIGatewayInvokeMeetingBot"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = aws_api_gateway_rest_api.api.id

  triggers = {
    redeployment = sha1(jsonencode({
      methods = [
        aws_api_gateway_method.callbacks_post.id,
        aws_api_gateway_method.messages_post.id
      ]
      method_auth = {
        callbacks = aws_api_gateway_method.callbacks_post.authorization
        messages  = aws_api_gateway_method.messages_post.authorization
      }
      integrations = [
        aws_api_gateway_integration.callbacks_integration.id,
        aws_api_gateway_integration.messages_integration.id
      ]
      authorizer = aws_api_gateway_authorizer.lambda_authorizer.id
    }))
  }

  depends_on = [
    aws_api_gateway_integration.callbacks_integration,
    aws_api_gateway_integration.messages_integration,
    aws_api_gateway_authorizer.lambda_authorizer
  ]

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "stage" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  deployment_id = aws_api_gateway_deployment.deployment.id
  stage_name    = var.stage_name

  tags = var.tags
}
