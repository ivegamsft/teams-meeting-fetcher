export interface Transcript {
  transcript_id: string;
  meetingId: string;
  status: 'pending' | 'fetching' | 'raw_stored' | 'sanitizing' | 'completed' | 'failed';
  rawContent?: string;
  sanitizedContent?: string;
  rawS3Path?: string;
  sanitizedS3Path?: string;
  language: string;
  graphTranscriptId?: string;
  errorMessage?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}
