import { meetingService } from './meetingService';
import { meetingStore } from './meetingStore';
import { Meeting } from '../models';

const POLL_INTERVAL_MS = parseInt(process.env.TRANSCRIPT_POLL_INTERVAL_MS || '300000', 10);
const BATCH_SIZE = parseInt(process.env.TRANSCRIPT_POLL_BATCH_SIZE || '50', 10);
const RATE_LIMIT_MS = 200;

let pollerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const transcriptPoller = {
  start(): void {
    if (pollerInterval) return;
    console.log(`[TranscriptPoller] Starting with ${POLL_INTERVAL_MS / 1000}s interval, batch=${BATCH_SIZE}`);

    // Delay first run by 10s to let the server finish startup
    setTimeout(() => {
      this.runCycle().catch(err => console.error('[TranscriptPoller] Initial cycle failed:', err.message));
    }, 10_000);

    pollerInterval = setInterval(() => {
      this.runCycle().catch(err => console.error('[TranscriptPoller] Cycle failed:', err.message));
    }, POLL_INTERVAL_MS);
  },

  stop(): void {
    if (pollerInterval) {
      clearInterval(pollerInterval);
      pollerInterval = null;
      console.log('[TranscriptPoller] Stopped');
    }
  },

  async runCycle(): Promise<{ enriched: number; transcriptsFound: number; errors: number }> {
    if (isRunning) {
      console.log('[TranscriptPoller] Cycle already running, skipping');
      return { enriched: 0, transcriptsFound: 0, errors: 0 };
    }

    isRunning = true;
    const startTime = Date.now();
    let enriched = 0;
    let transcriptsFound = 0;
    let errors = 0;

    try {
      const allMeetings = await meetingStore.listAll();

      // Phase 1: Enrich meetings that haven't been fetched from Graph yet
      const unenriched = allMeetings.filter(m => !m.detailsFetched && m.resource);
      if (unenriched.length > 0) {
        console.log(`[TranscriptPoller] Phase 1: Enriching ${Math.min(unenriched.length, BATCH_SIZE)} of ${unenriched.length} meetings`);
      }

      for (const meeting of unenriched.slice(0, BATCH_SIZE)) {
        try {
          await meetingService.fetchDetails(meeting.meeting_id);
          enriched++;
        } catch (err: any) {
          errors++;
          if (!err.message?.includes('404')) {
            console.error(`[TranscriptPoller] Enrich failed ${meeting.meeting_id}: ${err.message}`);
          }
        }
        await sleep(RATE_LIMIT_MS);
      }

      // Phase 2: Check for transcripts on meetings that have ended
      const now = new Date().toISOString();
      const candidates = allMeetings.filter(m =>
        m.onlineMeetingId &&
        m.endTime && m.endTime < now &&
        !m.transcriptionId &&
        m.status !== 'completed' && m.status !== 'cancelled' && m.status !== 'failed'
      );

      if (candidates.length > 0) {
        console.log(`[TranscriptPoller] Phase 2: Checking ${Math.min(candidates.length, BATCH_SIZE)} of ${candidates.length} meetings for transcripts`);
      }

      for (const meeting of candidates.slice(0, BATCH_SIZE)) {
        try {
          await meetingService.checkForTranscript(meeting);
          const updated = await meetingStore.get(meeting.meeting_id);
          if (updated?.transcriptionId) {
            transcriptsFound++;
          }
        } catch (err: any) {
          errors++;
          if (!err.message?.includes('404')) {
            console.error(`[TranscriptPoller] Transcript check failed ${meeting.meeting_id}: ${err.message}`);
          }
        }
        await sleep(RATE_LIMIT_MS);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[TranscriptPoller] Cycle done in ${elapsed}s — enriched=${enriched}, transcripts=${transcriptsFound}, errors=${errors}, remaining_unenriched=${Math.max(0, unenriched.length - BATCH_SIZE)}, remaining_candidates=${Math.max(0, candidates.length - BATCH_SIZE)}`);
    } finally {
      isRunning = false;
    }

    return { enriched, transcriptsFound, errors };
  },

  isRunning(): boolean {
    return isRunning;
  },
};
