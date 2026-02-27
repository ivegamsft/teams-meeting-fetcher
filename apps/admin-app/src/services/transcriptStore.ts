import { PutCommand, GetCommand, ScanCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../config/dynamodb';
import { config } from '../config';
import { Transcript } from '../models';

const TABLE = config.aws.dynamodb.transcriptsTable;

export const transcriptStore = {
  async _resolveKey(transcriptId: string): Promise<{ transcript_id: string; meeting_id: string } | null> {
    const result = await dynamoDb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'transcript_id = :pk',
      ExpressionAttributeValues: { ':pk': transcriptId },
      Limit: 1,
    }));
    if (!result.Items || result.Items.length === 0) return null;
    return { transcript_id: result.Items[0].transcript_id, meeting_id: result.Items[0].meeting_id };
  },

  async put(transcript: Transcript): Promise<void> {
    await dynamoDb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...transcript,
        meeting_id: transcript.meetingId,
      },
    }));
  },

  async get(id: string): Promise<Transcript | null> {
    const key = await this._resolveKey(id);
    if (!key) return null;
    const result = await dynamoDb.send(new GetCommand({
      TableName: TABLE,
      Key: key,
    }));
    return (result.Item as Transcript) || null;
  },

  async getByMeetingId(meetingId: string): Promise<Transcript | null> {
    const scanParams: Record<string, unknown> = {
      TableName: TABLE,
      FilterExpression: 'meetingId = :mid',
      ExpressionAttributeValues: { ':mid': meetingId },
    };
    let lastKey: Record<string, unknown> | undefined;
    do {
      if (lastKey) scanParams.ExclusiveStartKey = lastKey;
      const result = await dynamoDb.send(new ScanCommand(scanParams as any));
      const items = result.Items as Transcript[];
      if (items && items.length > 0) return items[0];
      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
    return null;
  },

  async listAll(filters?: { status?: string }): Promise<Transcript[]> {
    const scanParams: Record<string, unknown> = { TableName: TABLE };

    if (filters?.status) {
      scanParams.FilterExpression = '#status = :status';
      scanParams.ExpressionAttributeNames = { '#status': 'status' };
      scanParams.ExpressionAttributeValues = { ':status': filters.status };
    }

    // Paginate through all scan results (DynamoDB returns max 1MB per call)
    const allItems: Transcript[] = [];
    let lastKey: Record<string, unknown> | undefined;
    do {
      if (lastKey) scanParams.ExclusiveStartKey = lastKey;
      const result = await dynamoDb.send(new ScanCommand(scanParams as any));
      if (result.Items) allItems.push(...(result.Items as Transcript[]));
      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
    return allItems;
  },

  async updateStatus(id: string, status: string, errorMessage?: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) throw new Error(`Transcript ${id} not found`);

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
      Key: key,
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: exprValues,
    }));
  },

  async updateS3Paths(id: string, rawS3Path?: string, sanitizedS3Path?: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) throw new Error(`Transcript ${id} not found`);

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
      Key: key,
      UpdateExpression: 'SET ' + updates.join(', '),
      ExpressionAttributeValues: exprValues,
    }));
  },
};
