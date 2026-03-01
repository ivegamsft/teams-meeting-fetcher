// transcriptQueue.ts
// Serializes transcript fetch requests to avoid overwhelming Graph API.
// All triggers (poller, manual, by-user, by-timeframe) go through this queue.

import { Meeting } from '../models';
import { meetingService } from './meetingService';
import { meetingStore } from './meetingStore';

const RATE_LIMIT_MS = parseInt(process.env.TRANSCRIPT_RATE_LIMIT_MS || '500', 10);
const MAX_CONCURRENT = parseInt(process.env.TRANSCRIPT_MAX_CONCURRENT || '3', 10);
const MAX_QUEUE_SIZE = 500;

interface QueueItem {
  meeting: Meeting;
  source: 'poller' | 'manual' | 'by-user' | 'by-timeframe' | 'push-notification';
  resolve: (found: boolean) => void;
  reject: (err: Error) => void;
}

let queue: QueueItem[] = [];
let activeCount = 0;
let totalProcessed = 0;
let totalFound = 0;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function processItem(item: QueueItem): Promise<void> {
  activeCount++;
  try {
    await meetingService.checkForTranscript(item.meeting);
    const updated = await meetingStore.get(item.meeting.meeting_id);
    const found = !!updated?.transcriptionId;
    if (found) totalFound++;
    totalProcessed++;
    await meetingStore.updateLastTranscriptCheck(item.meeting.meeting_id);
    item.resolve(found);
  } catch (err: any) {
    totalProcessed++;
    item.reject(err);
  } finally {
    activeCount--;
    await sleep(RATE_LIMIT_MS);
    drain();
  }
}

function drain(): void {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;
    processItem(item);
  }
}

export const transcriptQueue = {
  enqueue(meeting: Meeting, source: QueueItem['source'] = 'poller'): Promise<boolean> {
    if (queue.length >= MAX_QUEUE_SIZE) {
      return Promise.reject(new Error('Transcript queue full'));
    }
    // Deduplicate: skip if already queued
    if (queue.some(q => q.meeting.meeting_id === meeting.meeting_id)) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve, reject) => {
      queue.push({ meeting, source, resolve, reject });
      drain();
    });
  },

  // Enqueue multiple meetings, returns count of transcripts found
  async enqueueBatch(meetings: Meeting[], source: QueueItem['source']): Promise<number> {
    let found = 0;
    const promises = meetings.map(m =>
      this.enqueue(m, source).then(f => { if (f) found++; }).catch(() => {})
    );
    await Promise.all(promises);
    return found;
  },

  stats() {
    return { queued: queue.length, active: activeCount, totalProcessed, totalFound };
  },

  clear() {
    queue.forEach(item => item.reject(new Error('Queue cleared')));
    queue = [];
  },
};
