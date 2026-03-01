import { PutCommand, GetCommand, ScanCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb } from '../config/dynamodb';
import { config } from '../config';
import { Meeting } from '../models';

const TABLE = config.aws.dynamodb.meetingsTable;

export const meetingStore = {
  async _resolveKey(meetingId: string): Promise<{ meeting_id: string; created_at: string } | null> {
    const result = await dynamoDb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'meeting_id = :pk',
      ExpressionAttributeValues: { ':pk': meetingId },
      Limit: 1,
    }));
    if (!result.Items || result.Items.length === 0) return null;
    return { meeting_id: result.Items[0].meeting_id, created_at: result.Items[0].created_at };
  },

  async put(meeting: Meeting): Promise<void> {
    await dynamoDb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...meeting,
        created_at: meeting.createdAt,
      },
    }));
  },

  async get(id: string): Promise<Meeting | null> {
    const key = await this._resolveKey(id);
    if (!key) return null;
    const result = await dynamoDb.send(new GetCommand({
      TableName: TABLE,
      Key: key,
    }));
    return (result.Item as Meeting) || null;
  },

  async list(filters?: {
    status?: string;
    organizerEmail?: string;
    from?: string;
    to?: string;
    transcript?: string;
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

    // Paginate through all scan results (DynamoDB returns max 1MB per call)
    const allMeetings: Meeting[] = [];
    let lastKey: Record<string, unknown> | undefined;
    do {
      if (lastKey) scanParams.ExclusiveStartKey = lastKey;
      const result = await dynamoDb.send(new ScanCommand(scanParams as any));
      if (result.Items) allMeetings.push(...(result.Items as Meeting[]));
      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);

    allMeetings.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    // Apply transcript filter in-memory (attribute_exists not reliable in DynamoDB scans)
    let filtered = allMeetings;
    if (filters?.transcript === 'has') {
      filtered = allMeetings.filter(m => !!(m as any).transcriptionId);
    } else if (filters?.transcript === 'none') {
      filtered = allMeetings.filter(m => !(m as any).transcriptionId);
    }

    const page = filters?.page || 1;
    const pageSize = filters?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return { meetings: paged, totalCount: filtered.length };
  },

  async updateStatus(id: string, status: string, changeType?: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) throw new Error(`Meeting ${id} not found`);

    const updateExpr = changeType 
      ? 'SET #status = :status, changeType = :changeType, updatedAt = :now'
      : 'SET #status = :status, updatedAt = :now';
    
    const exprValues: Record<string, any> = {
      ':status': status,
      ':now': new Date().toISOString(),
    };
    
    if (changeType) {
      exprValues[':changeType'] = changeType;
    }

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: exprValues,
    }));
  },

  async listAll(): Promise<Meeting[]> {
    const scanParams: Record<string, unknown> = { TableName: TABLE };
    const allMeetings: Meeting[] = [];
    let lastKey: Record<string, unknown> | undefined;
    do {
      if (lastKey) scanParams.ExclusiveStartKey = lastKey;
      const result = await dynamoDb.send(new ScanCommand(scanParams as any));
      if (result.Items) allMeetings.push(...(result.Items as Meeting[]));
      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey);
    return allMeetings;
  },

  async markEnrichmentFailed(id: string, reason: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) return;

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: 'SET enrichmentStatus = :es, enrichmentError = :err, updatedAt = :now',
      ExpressionAttributeValues: {
        ':es': 'permanent_failure',
        ':err': reason,
        ':now': new Date().toISOString(),
      },
    }));
  },

  async setTranscriptionId(id: string, transcriptionId: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) throw new Error(`Meeting ${id} not found`);

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: 'SET transcriptionId = :tid, #status = :status, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':tid': transcriptionId,
        ':status': 'transcript_pending',
        ':now': new Date().toISOString(),
      },
    }));
  },

  async updateLastTranscriptCheck(id: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) return;
    
    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: 'SET lastTranscriptCheck = :ts, updatedAt = :now',
      ExpressionAttributeValues: {
        ':ts': new Date().toISOString(),
        ':now': new Date().toISOString(),
      },
    }));
  },

  async updateOnlineMeetingId(id: string, onlineMeetingId: string, status?: string): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) return;

    const updateExpr = status
      ? 'SET onlineMeetingId = :omid, #status = :status, updatedAt = :now'
      : 'SET onlineMeetingId = :omid, updatedAt = :now';

    const exprValues: Record<string, any> = {
      ':omid': onlineMeetingId,
      ':now': new Date().toISOString(),
    };
    if (status) exprValues[':status'] = status;

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: updateExpr,
      ...(status ? { ExpressionAttributeNames: { '#status': 'status' } } : {}),
      ExpressionAttributeValues: exprValues,
    }));
  },

  async findByOnlineMeetingId(onlineMeetingId: string): Promise<Meeting | null> {
    const scanParams: Record<string, unknown> = {
      TableName: TABLE,
      FilterExpression: 'onlineMeetingId = :omid',
      ExpressionAttributeValues: { ':omid': onlineMeetingId },
    };
    const result = await dynamoDb.send(new ScanCommand(scanParams as any));
    if (result.Items && result.Items.length > 0) {
      return result.Items[0] as Meeting;
    }
    return null;
  },

  async mergeDuplicate(duplicateId: string, canonicalId: string): Promise<void> {
    const key = await this._resolveKey(duplicateId);
    if (!key) throw new Error(`Meeting ${duplicateId} not found`);

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: 'SET #status = :status, mergedInto = :canonical, updatedAt = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'merged',
        ':canonical': canonicalId,
        ':now': new Date().toISOString(),
      },
    }));
  },

  async updateCallRecordData(id: string, data: { callRecordId?: string; actualStart?: string; actualEnd?: string; duration?: number; lifecycleState?: string }): Promise<void> {
    const key = await this._resolveKey(id);
    if (!key) throw new Error(`Meeting ${id} not found`);

    const setParts: string[] = ['updatedAt = :now'];
    const exprValues: Record<string, any> = { ':now': new Date().toISOString() };

    if (data.callRecordId !== undefined) {
      setParts.push('callRecordId = :crid');
      exprValues[':crid'] = data.callRecordId;
    }
    if (data.actualStart !== undefined) {
      setParts.push('actualStart = :astart');
      exprValues[':astart'] = data.actualStart;
    }
    if (data.actualEnd !== undefined) {
      setParts.push('actualEnd = :aend');
      exprValues[':aend'] = data.actualEnd;
    }
    if (data.duration !== undefined) {
      setParts.push('duration = :dur');
      exprValues[':dur'] = data.duration;
    }
    if (data.lifecycleState !== undefined) {
      setParts.push('lifecycleState = :lcs');
      exprValues[':lcs'] = data.lifecycleState;
    }

    await dynamoDb.send(new UpdateCommand({
      TableName: TABLE,
      Key: key,
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeValues: exprValues,
    }));
  },
};
