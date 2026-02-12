// API Gateway module - REST API for webhook receiver

resource "aws_api_gateway_rest_api" "api" {
  name        = var.api_name
  description = var.api_description

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  tags = var.tags
}

resource "aws_api_gateway_resource" "resource" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = var.path_part
}

// Lambda authorizer for request validation
resource "aws_api_gateway_authorizer" "lambda_authorizer" {
  count = var.authorizer_invoke_arn != null ? 1 : 0

  name                   = "${var.api_name}-authorizer"
  rest_api_id            = aws_api_gateway_rest_api.api.id
  authorizer_uri         = var.authorizer_invoke_arn
  authorizer_credentials = var.authorizer_role_arn
  type                   = "REQUEST"
  identity_source        = "method.request.header.Content-Type"
  
  # Don't cache authorization results for webhook callbacks
  authorizer_result_ttl_in_seconds = 0
}

// Permission for API Gateway to invoke authorizer Lambda
resource "aws_lambda_permission" "authorizer_invoke" {
  count = var.authorizer_function_name != null ? 1 : 0

  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = var.authorizer_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/authorizers/*"
}

resource "aws_api_gateway_method" "method" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.resource.id
  http_method   = var.http_method
  authorization = var.authorizer_invoke_arn != null ? "CUSTOM" : var.authorization
  authorizer_id = var.authorizer_invoke_arn != null ? aws_api_gateway_authorizer.lambda_authorizer[0].id : null
}

resource "aws_api_gateway_integration" "lambda_integration" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.resource.id
  http_method             = aws_api_gateway_method.method.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = var.lambda_invoke_arn
}

resource "aws_lambda_permission" "api_gateway_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "deployment" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  stage_name  = var.stage_name

  depends_on = [
    aws_api_gateway_integration.lambda_integration,
    aws_api_gateway_authorizer.lambda_authorizer
  ]

  lifecycle {
    create_before_destroy = true
  }
}
