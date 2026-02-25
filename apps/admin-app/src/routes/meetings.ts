import { Router, Request, Response } from 'express';
import { meetingService } from '../services/meetingService';
import { transcriptService } from '../services/transcriptService';

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

export default router;
