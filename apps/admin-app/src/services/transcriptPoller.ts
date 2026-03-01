import { meetingService } from './meetingService';
import { meetingStore } from './meetingStore';
import { subscriptionStore } from './subscriptionStore';
import { Meeting } from '../models';
import { transcriptQueue } from './transcriptQueue';

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

  async runCycle(catchUp = false): Promise<{ enriched: number; transcriptsFound: number; errors: number; skippedPermanent: number }> {
    if (isRunning) {
      console.log('[TranscriptPoller] Cycle already running, skipping');
      return { enriched: 0, transcriptsFound: 0, errors: 0, skippedPermanent: 0 };
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
    let skippedPermanent = 0;

    try {
      const allMeetings = await meetingStore.listAll();

      // Phase 1: Enrich meetings that haven't been fetched from Graph yet
      // Skip meetings already marked as permanent enrichment failures
      const unenriched = allMeetings.filter(m =>
        (!m.detailsFetched || m.changeType === 'updated') &&
        m.resource &&
        m.enrichmentStatus !== 'permanent_failure'
      );
      const permanentFailures = allMeetings.filter(m => m.enrichmentStatus === 'permanent_failure').length;
      const enrichBatch = isCatchUp ? unenriched : unenriched.slice(0, batchLimit);
      if (enrichBatch.length > 0 || permanentFailures > 0) {
        console.log(`[TranscriptPoller] Phase 1 (${mode}): Enriching ${enrichBatch.length} of ${unenriched.length} meetings (${permanentFailures} permanently failed, skipped)`);
      }

      for (const meeting of enrichBatch) {
        // Skip meetings with invalid event IDs (e.g., "NA" or empty)
        const eventId = meeting.resource?.split('/').pop() || '';
        if (!eventId || eventId === 'NA') {
          const reason = !eventId ? 'empty eventId' : 'eventId is NA';
          console.warn(`[TranscriptPoller] Permanent failure: ${meeting.meeting_id} — ${reason}, skipping future enrichment`);
          await meetingStore.markEnrichmentFailed(meeting.meeting_id, reason);
          skippedPermanent++;
          continue;
        }

        try {
          await meetingService.fetchDetails(meeting.meeting_id);
          enriched++;
          if (enriched % 100 === 0) {
            console.log(`[TranscriptPoller] Phase 1 progress: ${enriched}/${enrichBatch.length} enriched`);
          }
        } catch (err: any) {
          const statusCode = err.statusCode || err.code;
          const message = err.message || '';
          const isPermanent404 = statusCode === 404 ||
            message.includes('The specified object was not found in the store') ||
            message.includes('ErrorItemNotFound') ||
            (message.includes('404') && message.includes('not found'));

          if (isPermanent404) {
            const reason = `Graph 404: ${message.substring(0, 150)}`;
            console.warn(`[TranscriptPoller] Permanent failure: ${meeting.meeting_id} — stale/deleted event, skipping future enrichment`);
            await meetingStore.markEnrichmentFailed(meeting.meeting_id, reason);
            skippedPermanent++;
          } else {
            // Transient error (network timeout, 429, 500) — will be retried next cycle
            errors++;
            console.error(`[TranscriptPoller] Transient enrich error ${meeting.meeting_id}: [${statusCode}] ${message}`);
          }
        }
        await sleep(RATE_LIMIT_MS);
      }

      if (skippedPermanent > 0) {
        console.log(`[TranscriptPoller] Phase 1: Marked ${skippedPermanent} meetings as permanent enrichment failures`);
      }

      // Phase 1.5: Process meetings with push transcript/recording notifications
      // These were notified by Graph push subscription — skip the polling queue, process immediately
      const notifiedMeetings = allMeetings.filter(m =>
        m.transcriptNotifiedAt && !m.transcriptionId && m.onlineMeetingId &&
        m.status !== 'completed' && m.status !== 'cancelled' && m.status !== 'failed'
      );
      if (notifiedMeetings.length > 0) {
        console.log(`[TranscriptPoller] Phase 1.5: ${notifiedMeetings.length} meetings with push transcript notifications — fast-tracking`);
        const fastTrackFound = await transcriptQueue.enqueueBatch(notifiedMeetings, 'push-notification');
        transcriptsFound += fastTrackFound;
        console.log(`[TranscriptPoller] Phase 1.5: Fast-tracked ${fastTrackFound} transcripts from push notifications`);
      }

      // Phase 2: Check for transcripts on meetings that have ended
      // Re-fetch all meetings after enrichment to get updated endTime/onlineMeetingId
      const refreshed = isCatchUp && enriched > 0 ? await meetingStore.listAll() : allMeetings;
      const now = new Date();

      // Diagnostics
      const withOnlineMeetingId = refreshed.filter(m => m.onlineMeetingId).length;
      const transcriptCandidates = refreshed.filter(m => m.onlineMeetingId && !m.transcriptionId).length;
      const enrichedCount = refreshed.filter(m => m.detailsFetched).length;
      console.log(`[TranscriptPoller] Phase 2 diagnostics: total=${refreshed.length}, enriched=${enrichedCount}, withOnlineMeetingId=${withOnlineMeetingId}, transcriptCandidates=${transcriptCandidates}`);

      // Any meeting with onlineMeetingId is a transcript candidate.
      // Calendar times are metadata — meetings can start/end anytime.
      const RECHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min between rechecks
      const FUTURE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

      const candidates = refreshed.filter(m => {
        if (!m.onlineMeetingId) return false;
        if (m.transcriptionId) return false;
        if (m.status === 'completed' || m.status === 'cancelled' || m.status === 'failed') return false;
        if (m.enrichmentStatus === 'permanent_failure') return false;
        // Skip meetings already fast-tracked from push notifications
        if (m.transcriptNotifiedAt) return false;
        
        // Skip if we checked recently (30 min cooldown)
        if (m.lastTranscriptCheck) {
          const lastCheck = new Date(m.lastTranscriptCheck).getTime();
          const timeSinceCheck = now.getTime() - lastCheck;
          if (timeSinceCheck < RECHECK_INTERVAL_MS) return false;
        }
        
        // Optimization: meetings scheduled 7+ days in future are lower priority.
        // Still check them, but only if they haven't been checked recently (handled above).
        // This is an optimization hint, NOT a correctness gate.
        
        return true;
      });

      // Sort by proximity to now — check meetings closest to current time first
      // This prioritizes meetings likely to be happening/just ended
      candidates.sort((a, b) => {
        const aDist = Math.abs(now.getTime() - new Date(a.startTime || '2099-01-01').getTime());
        const bDist = Math.abs(now.getTime() - new Date(b.startTime || '2099-01-01').getTime());
        return aDist - bDist;
      });

      const transcriptBatch = isCatchUp ? candidates : candidates.slice(0, batchLimit);
      console.log(`[TranscriptPoller] Phase 2 (${mode}): ${candidates.length} candidates, checking ${transcriptBatch.length}`);

      // Route through the shared queue for rate limiting
      transcriptsFound += await transcriptQueue.enqueueBatch(transcriptBatch, 'poller');
      const qStats = transcriptQueue.stats();
      console.log(`[TranscriptPoller] Phase 2: Queue stats — processed=${qStats.totalProcessed}, found=${qStats.totalFound}, queued=${qStats.queued}`);

      // Phase 3: Direct transcript discovery from Graph online meetings API
      // Bypasses calendar event enrichment entirely
      if (isCatchUp) {
        console.log(`[TranscriptPoller] Phase 3 (${mode}): Discovering transcripts from Graph online meetings API`);
        const subscriptions = await subscriptionStore.listAll();
        const userEmails = [...new Set(subscriptions.filter(s => s.userEmail).map(s => s.userEmail!))];
        console.log(`[TranscriptPoller] Phase 3: Checking ${userEmails.length} subscribed users`);

        for (const email of userEmails) {
          try {
            const discovered = await meetingService.discoverTranscriptsForUser(email);
            transcriptsFound += discovered;
            console.log(`[TranscriptPoller] Phase 3: ${email} — found ${discovered} transcript(s)`);
          } catch (err: any) {
            errors++;
            console.error(`[TranscriptPoller] Phase 3 error for ${email}: ${err.message}`);
          }
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[TranscriptPoller] Cycle done (${mode}) in ${elapsed}s — enriched=${enriched}, transcripts=${transcriptsFound}, errors=${errors}, permanentFailures=${skippedPermanent}`);
    } finally {
      isRunning = false;
    }

    return { enriched, transcriptsFound, errors, skippedPermanent };
  },

  isRunning(): boolean {
    return isRunning;
  },
};
