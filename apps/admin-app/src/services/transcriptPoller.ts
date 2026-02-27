import { meetingService } from './meetingService';
import { meetingStore } from './meetingStore';
import { Meeting } from '../models';

const POLL_INTERVAL_MS = parseInt(process.env.TRANSCRIPT_POLL_INTERVAL_MS || '300000', 10);
const BATCH_SIZE = parseInt(process.env.TRANSCRIPT_POLL_BATCH_SIZE || '100', 10);
const RATE_LIMIT_MS = 100;

let pollerInterval: NodeJS.Timeout | null = null;
let isRunning = false;
let firstRun = true;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const transcriptPoller = {
  start(): void {
    if (pollerInterval) return;
    console.log(`[TranscriptPoller] Starting with ${POLL_INTERVAL_MS / 1000}s interval, batch=${BATCH_SIZE}`);

    // First run: catch-up mode (no batch limit) after 10s startup delay
    setTimeout(() => {
      this.runCycle(true).catch(err => console.error('[TranscriptPoller] Initial catch-up failed:', err.message));
    }, 10_000);

    pollerInterval = setInterval(() => {
      this.runCycle(false).catch(err => console.error('[TranscriptPoller] Cycle failed:', err.message));
    }, POLL_INTERVAL_MS);
  },

  stop(): void {
    if (pollerInterval) {
      clearInterval(pollerInterval);
      pollerInterval = null;
      console.log('[TranscriptPoller] Stopped');
    }
  },

  async runCycle(catchUp = false): Promise<{ enriched: number; transcriptsFound: number; errors: number }> {
    if (isRunning) {
      console.log('[TranscriptPoller] Cycle already running, skipping');
      return { enriched: 0, transcriptsFound: 0, errors: 0 };
    }

    isRunning = true;
    const isCatchUp = catchUp || firstRun;
    if (firstRun) firstRun = false;
    const batchLimit = isCatchUp ? Infinity : BATCH_SIZE;
    const mode = isCatchUp ? 'CATCH-UP' : 'regular';
    const startTime = Date.now();
    let enriched = 0;
    let transcriptsFound = 0;
    let errors = 0;

    try {
      const allMeetings = await meetingStore.listAll();

      // Phase 1: Enrich meetings that haven't been fetched from Graph yet
      const unenriched = allMeetings.filter(m => !m.detailsFetched && m.resource);
      const enrichBatch = isCatchUp ? unenriched : unenriched.slice(0, batchLimit);
      if (enrichBatch.length > 0) {
        console.log(`[TranscriptPoller] Phase 1 (${mode}): Enriching ${enrichBatch.length} of ${unenriched.length} meetings`);
      }

      for (const meeting of enrichBatch) {
        try {
          await meetingService.fetchDetails(meeting.meeting_id);
          enriched++;
          if (enriched % 100 === 0) {
            console.log(`[TranscriptPoller] Phase 1 progress: ${enriched}/${enrichBatch.length} enriched`);
          }
        } catch (err: any) {
          errors++;
          if (!err.message?.includes('404')) {
            console.error(`[TranscriptPoller] Enrich failed ${meeting.meeting_id}: ${err.message}`);
          }
        }
        await sleep(RATE_LIMIT_MS);
      }

      // Phase 2: Check for transcripts on meetings that have ended
      // Re-fetch all meetings after enrichment to get updated endTime/onlineMeetingId
      const refreshed = isCatchUp && enriched > 0 ? await meetingStore.listAll() : allMeetings;
      const now = new Date().toISOString();
      const candidates = refreshed.filter(m =>
        m.onlineMeetingId &&
        m.endTime && m.endTime < now &&
        !m.transcriptionId &&
        m.status !== 'completed' && m.status !== 'cancelled' && m.status !== 'failed'
      );

      const transcriptBatch = isCatchUp ? candidates : candidates.slice(0, batchLimit);
      if (transcriptBatch.length > 0) {
        console.log(`[TranscriptPoller] Phase 2 (${mode}): Checking ${transcriptBatch.length} of ${candidates.length} meetings for transcripts`);
      }

      for (const meeting of transcriptBatch) {
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
      console.log(`[TranscriptPoller] Cycle done (${mode}) in ${elapsed}s — enriched=${enriched}, transcripts=${transcriptsFound}, errors=${errors}`);
    } finally {
      isRunning = false;
    }

    return { enriched, transcriptsFound, errors };
  },

  isRunning(): boolean {
    return isRunning;
  },
};
