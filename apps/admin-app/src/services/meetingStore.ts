import { PutCommand, GetCommand, ScanCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../config/dynamodb';
import { config } from '../config';
import { Meeting } from '../models';

const TABLE = config.aws.dynamodb.meetingsTable;

export const meetingStore = {
  async put(meeting: Meeting): Promise<void> {
    await dynamoDb.send(new PutCommand({
      TableName: TABLE,
      Item: meeting,
    }));
  },

  async get(id: string): Promise<Meeting | null> {
    const result = await dynamoDb.send(new GetCommand({
      TableName: TABLE,
      Key: { id },
    }));
    return (result.Item as Meeting) || null;
  },

  async list(filters?: {
    status?: string;
    organizerEmail?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ meetings: Meeting[]; totalCount: number }> {
    const filterExpressions: string[] = [];
    const exprAttrNames: Record<string, string> = {};
    const exprAttrValues: Record<string, unknown> = {};

    if (filters?.status) {
      filterExpressions.push('#status = :status');
      exprAttrNames['#status'] = 'status';
      exprAttrValues[':status'] = filters.status;
    }
    if (filters?.organizerEmail) {
      filterExpressions.push('organizerEmail = :orgEmail');
      exprAttrValues[':orgEmail'] = filters.organizerEmail;
    }
    if (filters?.from) {
      filterExpressions.push('startTime >= :fromDate');
      exprAttrValues[':fromDate'] = filters.from;
    }
    if (filters?.to) {
      filterExpressions.push('startTime <= :toDate');
      exprAttrValues[':toDate'] = filters.to;
    }

    const scanParams: Record<string, unknown> = { TableName: TABLE };
    if (filterExpressions.length > 0) {
      scanParams.FilterExpression = filterExpressions.join(' AND ');
      if (Object.keys(exprAttrNames).length > 0) {
        scanParams.ExpressionAttributeNames = exprAttrNames;
      }
      scanParams.ExpressionAttributeValues = exprAttrValues;
    }

    const result = await dynamoDb.send(new ScanCommand(scanParams as any));
    const allMeetings = (result.Items as Meeting[]) || [];

    allMeetings.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const paged = allMeetings.slice(start, start + pageSize);

    return { meetings: paged, totalCount: allMeetings.length };
  },

  async updateStatus(id: string, status: string): Promise<void> {
    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id },
      UpdateExpression: 'SET #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':now': new Date().toISOString(),
      },
    }));
  },

  async setTranscriptionId(id: string, transcriptionId: string): Promise<void> {
    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id },
      UpdateExpression: 'SET transcriptionId = :tid, #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':tid': transcriptionId,
        ':status': 'transcript_pending',
        ':now': new Date().toISOString(),
      },
    }));
  },
};
