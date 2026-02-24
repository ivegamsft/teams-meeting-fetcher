/**
 * Shared E2E Test Utilities
 * Helper functions for testing AWS infrastructure and Graph API integrations
 */
'use strict';

const { execSync } = require('child_process');
const https = require('https');
const readline = require('readline');

/**
 * Execute AWS CLI command and parse JSON output
 * @param {string} command - AWS CLI command
 * @param {string} profile - AWS profile name
 * @param {string} region - AWS region
 * @returns {object|null} Parsed JSON result or null on error
 */
function executeAwsCli(command, profile = 'tmf-dev', region = 'us-east-1') {
  try {
    const fullCommand = `aws ${command} --profile ${profile} --region ${region} --output json`;
    const output = execSync(fullCommand, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output);
  } catch (error) {
    return { error: error.message, stderr: error.stderr?.toString() };
  }
}

/**
 * Check if AWS Lambda function exists
 * @param {string} functionName - Lambda function name
 * @param {string} profile - AWS profile name
 * @param {string} region - AWS region
 * @returns {object} Result with exists boolean and optional error
 */
function checkAwsLambdaExists(functionName, profile = 'tmf-dev', region = 'us-east-1') {
  const result = executeAwsCli(`lambda get-function --function-name ${functionName}`, profile, region);
  
  if (result.error) {
    return { exists: false, error: result.error };
  }
  
  return { 
    exists: true, 
    arn: result.Configuration?.FunctionArn,
    runtime: result.Configuration?.Runtime,
    lastModified: result.Configuration?.LastModified
  };
}

/**
 * Check if DynamoDB table exists
 * @param {string} tableName - DynamoDB table name
 * @param {string} profile - AWS profile name
 * @param {string} region - AWS region
 * @returns {object} Result with exists boolean and optional error
 */
function checkDynamoDBTable(tableName, profile = 'tmf-dev', region = 'us-east-1') {
  const result = executeAwsCli(`dynamodb describe-table --table-name ${tableName}`, profile, region);
  
  if (result.error) {
    return { exists: false, error: result.error };
  }
  
  return { 
    exists: true, 
    status: result.Table?.TableStatus,
    itemCount: result.Table?.ItemCount
  };
}

/**
 * Check if S3 bucket exists
 * @param {string} bucketName - S3 bucket name
 * @param {string} profile - AWS profile name
 * @param {string} region - AWS region
 * @returns {object} Result with exists boolean and optional error
 */
function checkS3Bucket(bucketName, profile = 'tmf-dev', region = 'us-east-1') {
  const result = executeAwsCli(`s3api head-bucket --bucket ${bucketName}`, profile, region);
  
  if (result.error) {
    return { exists: false, error: result.error };
  }
  
  return { exists: true };
}

/**
 * Get recent S3 objects from a bucket/prefix
 * @param {string} bucketName - S3 bucket name
 * @param {string} prefix - S3 key prefix
 * @param {string} profile - AWS profile name
 * @param {string} region - AWS region
 * @param {number} minutes - How many minutes back to look
 * @returns {Array} Array of S3 objects
 */
function getRecentS3Objects(bucketName, prefix = '', profile = 'tmf-dev', region = 'us-east-1', minutes = 10) {
  const result = executeAwsCli(`s3api list-objects-v2 --bucket ${bucketName} --prefix ${prefix}`, profile, region);
  
  if (result.error || !result.Contents) {
    return [];
  }
  
  const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
  return result.Contents.filter(obj => new Date(obj.LastModified) > cutoffTime);
}

/**
 * Get S3 object content
 * @param {string} bucketName - S3 bucket name
 * @param {string} key - S3 object key
 * @param {string} profile - AWS profile name
 * @param {string} region - AWS region
 * @returns {object|null} Parsed JSON content or null
 */
function getS3Object(bucketName, key, profile = 'tmf-dev', region = 'us-east-1') {
  try {
    const command = `s3 cp s3://${bucketName}/${key} -`;
    const fullCommand = `aws ${command} --profile ${profile} --region ${region}`;
    const output = execSync(fullCommand, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return JSON.parse(output);
  } catch (error) {
    return null;
  }
}

/**
 * Scan DynamoDB table items
 * @param {string} tableName - DynamoDB table name
 * @param {string} profile - AWS profile name
 * @param {string} region - AWS region
 * @param {number} limit - Max items to return
 * @returns {Array} Array of DynamoDB items
 */
function scanDynamoDBItems(tableName, profile = 'tmf-dev', region = 'us-east-1', limit = 10) {
  const result = executeAwsCli(`dynamodb scan --table-name ${tableName} --max-items ${limit}`, profile, region);
  
  if (result.error || !result.Items) {
    return [];
  }
  
  return result.Items;
}

/**
 * Get recent CloudWatch logs for a Lambda function
 * @param {string} functionName - Lambda function name
 * @param {string} profile - AWS profile name
 * @param {string} region - AWS region
 * @param {number} minutes - How many minutes back to look
 * @returns {Array} Array of log events
 */
function getRecentLambdaLogs(functionName, profile = 'tmf-dev', region = 'us-east-1', minutes = 10) {
  const startTimeMs = Date.now() - minutes * 60 * 1000;
  const logGroup = `/aws/lambda/${functionName}`;
  
  const result = executeAwsCli(
    `logs filter-log-events --log-group-name "${logGroup}" --start-time ${startTimeMs}`,
    profile,
    region
  );
  
  if (result.error || !result.events) {
    return [];
  }
  
  return result.events;
}

/**
 * Check HTTP endpoint health
 * @param {string} url - URL to check
 * @returns {Promise<object>} Result with status and optional error
 */
async function checkEndpointHealth(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: 5000
    };
    
    const client = urlObj.protocol === 'https:' ? https : require('http');
    
    const req = client.request(options, (res) => {
      resolve({ 
        healthy: res.statusCode >= 200 && res.statusCode < 500,
        statusCode: res.statusCode 
      });
    });
    
    req.on('error', (error) => {
      resolve({ healthy: false, error: error.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, error: 'Request timeout' });
    });
    
    req.end();
  });
}

/**
 * Prompt human to perform an action and wait for confirmation
 * @param {string} message - Instructions for the human
 * @returns {Promise<void>}
 */
async function promptHumanAction(message) {
  console.log('\n┌────────────────────────────────────────────────────────────────┐');
  console.log('│                     HUMAN ACTION REQUIRED                      │');
  console.log('└────────────────────────────────────────────────────────────────┘\n');
  console.log(message);
  console.log('\n┌────────────────────────────────────────────────────────────────┐');
  console.log('│  Press ENTER when you have completed the above steps...       │');
  console.log('└────────────────────────────────────────────────────────────────┘\n');
  
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Get Microsoft Graph API access token
 * @param {string} tenantId - Azure AD tenant ID
 * @param {string} clientId - Application client ID
 * @param {string} clientSecret - Application client secret
 * @returns {Promise<string>} Access token
 */
async function getGraphAccessToken(tenantId, clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    }).toString();
    
    const options = {
      hostname: 'login.microsoftonline.com',
      path: `/${tenantId}/oauth2/v2.0/token`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          const parsed = JSON.parse(data);
          resolve(parsed.access_token);
        } else {
          reject(new Error(`Token request failed: ${res.statusCode} ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Create a Microsoft Graph API subscription
 * @param {string} token - Graph API access token
 * @param {string} resource - Resource to subscribe to (e.g., /users/{id}/events)
 * @param {string} notificationUrl - Webhook URL to receive notifications
 * @param {string} clientState - Client state value for validation
 * @param {string} changeType - Type of changes (created,updated,deleted)
 * @returns {Promise<object>} Subscription object
 */
async function createGraphSubscription(token, resource, notificationUrl, clientState, changeType = 'created,updated') {
  return new Promise((resolve, reject) => {
    const expirationDateTime = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    
    const subscriptionBody = JSON.stringify({
      changeType,
      notificationUrl,
      resource,
      expirationDateTime,
      clientState
    });
    
    const options = {
      hostname: 'graph.microsoft.com',
      path: '/v1.0/subscriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(subscriptionBody)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 201) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Subscription creation failed: ${res.statusCode} ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(subscriptionBody);
    req.end();
  });
}

/**
 * Delete a Microsoft Graph API subscription
 * @param {string} token - Graph API access token
 * @param {string} subscriptionId - Subscription ID to delete
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteGraphSubscription(token, subscriptionId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'graph.microsoft.com',
      path: `/v1.0/subscriptions/${subscriptionId}`,
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
    
    const req = https.request(options, (res) => {
      if (res.statusCode === 204) {
        resolve(true);
      } else {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          reject(new Error(`Subscription deletion failed: ${res.statusCode} ${data}`));
        });
      }
    });
    
    req.on('error', reject);
    req.end();
  });
}

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  executeAwsCli,
  checkAwsLambdaExists,
  checkDynamoDBTable,
  checkS3Bucket,
  getRecentS3Objects,
  getS3Object,
  scanDynamoDBItems,
  getRecentLambdaLogs,
  checkEndpointHealth,
  promptHumanAction,
  getGraphAccessToken,
  createGraphSubscription,
  deleteGraphSubscription,
  sleep
};
