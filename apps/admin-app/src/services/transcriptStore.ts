import { PutCommand, GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../config/dynamodb';
import { config } from '../config';
import { Transcript } from '../models';

const TABLE = config.aws.dynamodb.transcriptsTable;

export const transcriptStore = {
  async put(transcript: Transcript): Promise<void> {
    await dynamoDb.send(new PutCommand({
      TableName: TABLE,
      Item: transcript,
    }));
  },

  async get(id: string): Promise<Transcript | null> {
    const result = await dynamoDb.send(new GetCommand({
      TableName: TABLE,
      Key: { id },
    }));
    return (result.Item as Transcript) || null;
  },

  async getByMeetingId(meetingId: string): Promise<Transcript | null> {
    const result = await dynamoDb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'meetingId = :mid',
      ExpressionAttributeValues: { ':mid': meetingId },
    }));
    const items = result.Items as Transcript[];
    return items && items.length > 0 ? items[0] : null;
  },

  async listAll(filters?: { status?: string }): Promise<Transcript[]> {
    const scanParams: Record<string, unknown> = { TableName: TABLE };

    if (filters?.status) {
      scanParams.FilterExpression = '#status = :status';
      scanParams.ExpressionAttributeNames = { '#status': 'status' };
      scanParams.ExpressionAttributeValues = { ':status': filters.status };
    }

    const result = await dynamoDb.send(new ScanCommand(scanParams as any));
    return (result.Items as Transcript[]) || [];
  },

  async updateStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    let updateExpr = 'SET #status = :status, updatedAt = :now';
    const exprValues: Record<string, unknown> = {
      ':status': status,
      ':now': new Date().toISOString(),
    };

    if (errorMessage) {
      updateExpr += ', errorMessage = :err';
      exprValues[':err'] = errorMessage;
    }
    if (status === 'completed') {
      updateExpr += ', processedAt = :now';
    }

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: exprValues,
    }));
  },

  async updateS3Paths(id: string, rawS3Path?: string, sanitizedS3Path?: string): Promise<void> {
    const updates: string[] = ['updatedAt = :now'];
    const exprValues: Record<string, unknown> = { ':now': new Date().toISOString() };

    if (rawS3Path) {
      updates.push('rawS3Path = :rawPath');
      exprValues[':rawPath'] = rawS3Path;
    }
    if (sanitizedS3Path) {
      updates.push('sanitizedS3Path = :sanPath');
      exprValues[':sanPath'] = sanitizedS3Path;
    }

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id },
      UpdateExpression: 'SET ' + updates.join(', '),
      ExpressionAttributeValues: exprValues,
    }));
  },
};
