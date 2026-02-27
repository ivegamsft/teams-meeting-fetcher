import { Router, Request, Response } from 'express';
import { meetingService } from '../services/meetingService';
import { transcriptService } from '../services/transcriptService';
import { transcriptPoller } from '../services/transcriptPoller';

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

export default router;
