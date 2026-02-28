import { Router, Request, Response } from 'express';
import { meetingService } from '../services/meetingService';
import { transcriptService } from '../services/transcriptService';
import { transcriptPoller } from '../services/transcriptPoller';
import { transcriptQueue } from '../services/transcriptQueue';
import { meetingStore } from '../services/meetingStore';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, organizer, from, to, page, pageSize } = req.query;
    const result = await meetingService.listMeetings({
      status: status as string,
      organizerEmail: organizer as string,
      from: from as string,
      to: to as string,
      page: page ? parseInt(page as string, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined,
    });
    res.json({
      meetings: result.meetings,
      totalCount: result.totalCount,
      page: page ? parseInt(page as string, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize as string, 10) : 20,
    });
  } catch (err: any) {
    console.error('Failed to list meetings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const meeting = await meetingService.getMeeting(req.params.id as string);
    if (!meeting) {
      res.status(404).json({ error: 'Meeting not found' });
      return;
    }
    res.json(meeting);
  } catch (err: any) {
    console.error('Failed to get meeting:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/transcript', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const transcript = await transcriptService.getTranscriptByMeetingId(id);
    if (!transcript) {
      res.status(404).json({ error: 'Transcript not found for this meeting' });
      return;
    }

    const type = (req.query.type as string) === 'raw' ? 'raw' : 'sanitized';
    const content = await transcriptService.getTranscriptContent(transcript, type);

    res.json({
      ...transcript,
      content: content || undefined,
    });
  } catch (err: any) {
    console.error('Failed to get transcript:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/transcript/download', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const transcript = await transcriptService.getTranscriptByMeetingId(id);
    if (!transcript) {
      res.status(404).json({ error: 'Transcript not found' });
      return;
    }

    const type = (req.query.type as string) === 'raw' ? 'raw' : 'sanitized';
    const content = await transcriptService.getTranscriptContent(transcript, type);

    if (!content) {
      res.status(404).json({ error: 'Transcript content not available' });
      return;
    }

    res.setHeader('Content-Type', 'text/vtt');
    res.setHeader('Content-Disposition', `attachment; filename="transcript-${req.params.id}.vtt"`);
    res.send(content);
  } catch (err: any) {
    console.error('Failed to download transcript:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/poll-transcripts', async (req: Request, res: Response) => {
  try {
    const catchUp = req.query.catchUp === 'true';
    const result = await transcriptPoller.runCycle(catchUp);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Failed to run transcript poll cycle:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/discover-transcripts', async (req: Request, res: Response) => {
  try {
    const { userEmail } = req.body;
    if (!userEmail) {
      res.status(400).json({ error: 'userEmail is required' });
      return;
    }
    const found = await meetingService.discoverTranscriptsForUser(userEmail);
    res.json({ success: true, transcriptsFound: found });
  } catch (err: any) {
    console.error('Failed to discover transcripts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/batch-fetch-details', async (req: Request, res: Response) => {
  try {
    const { meetingIds } = req.body;
    if (!Array.isArray(meetingIds)) {
      res.status(400).json({ error: 'meetingIds must be an array' });
      return;
    }
    const result = await meetingService.fetchDetailsBatch(meetingIds);
    res.json(result);
  } catch (err: any) {
    console.error('Failed to batch fetch meeting details:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/fetch-details', async (req: Request, res: Response) => {
  try {
    const meeting = await meetingService.fetchDetails(req.params.id as string);
    res.json(meeting);
  } catch (err: any) {
    console.error('Failed to fetch meeting details:', err.message);
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.get('/:id/details', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const details = await meetingService.getMeetingDetails(id);
    res.json(details);
  } catch (err: any) {
    console.error('Failed to get meeting details:', err.message);
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

router.patch('/:id/transcription', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'Request body must include "enabled" boolean field' });
      return;
    }

    await meetingService.toggleTranscription(id, enabled);
    res.json({ success: true, message: `Transcription ${enabled ? 'enabled' : 'disabled'}` });
  } catch (err: any) {
    console.error('Failed to toggle transcription:', err.message);
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

// Fetch transcript for a specific meeting (on-demand)
router.post('/:id/fetch-transcript', async (req: Request, res: Response) => {
  try {
    const meeting = await meetingService.getMeeting(req.params.id as string);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!meeting.onlineMeetingId) return res.status(400).json({ error: 'Meeting has no onlineMeetingId — enrich first' });
    if (meeting.transcriptionId) return res.status(200).json({ message: 'Transcript already fetched', transcriptionId: meeting.transcriptionId });

    const found = await transcriptQueue.enqueue(meeting, 'manual');
    const stats = transcriptQueue.stats();
    res.json({ found, queueStats: stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch transcripts for all meetings by a specific user
router.post('/fetch-transcripts-by-user', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const allMeetings = await meetingStore.listAll();
    const userMeetings = allMeetings.filter(m =>
      m.onlineMeetingId &&
      !m.transcriptionId &&
      m.organizerEmail === email &&
      m.status !== 'completed' && m.status !== 'cancelled' && m.status !== 'failed'
    );

    const found = await transcriptQueue.enqueueBatch(userMeetings, 'by-user');
    const stats = transcriptQueue.stats();
    res.json({ email, checked: userMeetings.length, found, queueStats: stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch transcripts for meetings in a time frame
router.post('/fetch-transcripts-by-timeframe', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.body;
    if (!from) return res.status(400).json({ error: 'from is required (ISO 8601)' });

    const allMeetings = await meetingStore.listAll();
    const toDate = to || new Date().toISOString();
    const candidates = allMeetings.filter(m =>
      m.onlineMeetingId &&
      !m.transcriptionId &&
      m.startTime && m.startTime >= from && m.startTime <= toDate &&
      m.status !== 'completed' && m.status !== 'cancelled' && m.status !== 'failed'
    );

    const found = await transcriptQueue.enqueueBatch(candidates, 'by-timeframe');
    const stats = transcriptQueue.stats();
    res.json({ from, to: toDate, checked: candidates.length, found, queueStats: stats });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Queue status
router.get('/transcript-queue-stats', async (req: Request, res: Response) => {
  res.json(transcriptQueue.stats());
});

export default router;
