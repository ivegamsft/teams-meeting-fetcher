import { v4 as uuidv4 } from 'uuid';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getGraphClient } from '../config/graph';
import { config } from '../config';
import { s3Client } from '../config/s3';
import { Meeting, Transcript } from '../models';
import { transcriptStore } from './transcriptStore';
import { meetingStore } from './meetingStore';
import { configStore } from './configStore';
import { sanitizationService } from './sanitizationService';

export const transcriptService = {
  async fetchAndStore(meeting: Meeting, graphTranscriptId: string): Promise<Transcript> {
    const transcriptId = uuidv4();
    const now = new Date().toISOString();

    const transcript: Transcript = {
      transcript_id: transcriptId,
      meetingId: meeting.meeting_id,
      status: 'fetching',
      language: 'en',
      graphTranscriptId,
      createdAt: now,
      updatedAt: now,
    };

    await transcriptStore.put(transcript);
    await configStore.incrementCounter('transcriptionsPending', 1);

    try {
      const client = getGraphClient();

      // Resolve organizer userId GUID for app-only auth path
      let userId = meeting.organizerUserId;
      if (!userId && meeting.organizerEmail) {
        console.log(`[TranscriptService] Resolving userId for ${meeting.organizerEmail}`);
        const userResp = await client.api(`/users/${meeting.organizerEmail}`).select('id').get();
        userId = userResp.id;
        console.log(`[TranscriptService] Resolved userId: ${userId}`);
      }
      if (!userId) throw new Error('Cannot resolve organizer userId for transcript content');

      const apiPath = `/users/${userId}/onlineMeetings/${meeting.onlineMeetingId}/transcripts/${graphTranscriptId}/content`;
      console.log(`[TranscriptService] Fetching content: ${apiPath}`);

      const contentResponse = await client
        .api(apiPath)
        .responseType('text' as any)
        .get();

      const rawContent = typeof contentResponse === 'string' ? contentResponse : JSON.stringify(contentResponse);
      console.log(`[TranscriptService] Got ${rawContent.length} chars of content`);

      const rawKey = `raw/${meeting.meeting_id}/${transcriptId}.vtt`;
      await s3Client.send(new PutObjectCommand({
        Bucket: config.aws.s3.rawBucket,
        Key: rawKey,
        Body: rawContent,
        ContentType: 'text/vtt',
      }));

      await transcriptStore.updateS3Paths(transcriptId, `s3://${config.aws.s3.rawBucket}/${rawKey}`);
      await transcriptStore.updateStatus(transcriptId, 'raw_stored');

      // Only set transcriptionId on meeting AFTER content is stored
      await meetingStore.setTranscriptionId(meeting.meeting_id, transcriptId);

      if (config.sanitization.enabled) {
        await this.sanitizeTranscript(transcriptId, rawContent, meeting.meeting_id);
      } else {
        await transcriptStore.updateStatus(transcriptId, 'completed');
        await meetingStore.updateStatus(meeting.meeting_id, 'completed');
        await configStore.incrementCounter('transcriptionsProcessed', 1);
        await configStore.incrementCounter('transcriptionsPending', -1);
      }

      return (await transcriptStore.get(transcriptId))!;
    } catch (err: any) {
      const errMsg = err.message || err.statusCode || err.code || JSON.stringify(err).substring(0, 300);
      console.error(`[TranscriptService] Failed to fetch transcript ${graphTranscriptId}: ${errMsg}`);
      if (err.body) console.error(`[TranscriptService] Error body: ${typeof err.body === 'string' ? err.body.substring(0, 500) : JSON.stringify(err.body).substring(0, 500)}`);
      if (err.statusCode) console.error(`[TranscriptService] Status code: ${err.statusCode}`);
      await transcriptStore.updateStatus(transcriptId, 'failed', errMsg);
      await meetingStore.updateStatus(meeting.meeting_id, 'failed');
      throw err;
    }
  },

  async sanitizeTranscript(transcriptId: string, rawContent: string, meetingId: string): Promise<void> {
    await transcriptStore.updateStatus(transcriptId, 'sanitizing');

    try {
      const sanitizedContent = await sanitizationService.sanitize(rawContent);

      const sanitizedKey = `sanitized/${meetingId}/${transcriptId}.vtt`;
      await s3Client.send(new PutObjectCommand({
        Bucket: config.aws.s3.sanitizedBucket,
        Key: sanitizedKey,
        Body: sanitizedContent,
        ContentType: 'text/vtt',
      }));

      await transcriptStore.updateS3Paths(transcriptId, undefined, `s3://${config.aws.s3.sanitizedBucket}/${sanitizedKey}`);
      await transcriptStore.updateStatus(transcriptId, 'completed');
      await meetingStore.updateStatus(meetingId, 'completed');
      await configStore.incrementCounter('transcriptionsProcessed', 1);
      await configStore.incrementCounter('transcriptionsPending', -1);
    } catch (err: any) {
      console.error(`Sanitization failed for transcript ${transcriptId}:`, err.message);
      await transcriptStore.updateStatus(transcriptId, 'failed', `Sanitization failed: ${err.message}`);
    }
  },

  async getTranscript(id: string): Promise<Transcript | null> {
    return transcriptStore.get(id);
  },

  async getTranscriptByMeetingId(meetingId: string): Promise<Transcript | null> {
    return transcriptStore.getByMeetingId(meetingId);
  },

  async getTranscriptContent(transcript: Transcript, type: 'raw' | 'sanitized' = 'sanitized'): Promise<string | null> {
    const s3Path = type === 'raw' ? transcript.rawS3Path : transcript.sanitizedS3Path;
    if (!s3Path) return null;

    const match = s3Path.match(/s3:\/\/([^/]+)\/(.+)/);
    if (!match) return null;

    const [, bucket, key] = match;

    try {
      const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return await response.Body?.transformToString() || null;
    } catch (err: any) {
      console.error(`Failed to fetch transcript content from ${s3Path}:`, err.message);
      return null;
    }
  },

  async listTranscripts(filters?: { status?: string }): Promise<Transcript[]> {
    return transcriptStore.listAll(filters);
  },
};
