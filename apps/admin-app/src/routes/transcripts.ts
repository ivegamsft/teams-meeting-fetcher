import { Router, Request, Response } from 'express';
import { transcriptService } from '../services/transcriptService';
import { meetingStore } from '../services/meetingStore';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const transcripts = await transcriptService.listTranscripts({
      status: status as string,
    });

    // Enrich each transcript with its associated meeting data
    const enriched = await Promise.all(
      transcripts.map(async (t: any) => {
        let meeting = null;
        if (t.meetingId) {
          try {
            const m = await meetingStore.get(t.meetingId);
            if (m) {
              meeting = {
                subject: m.subject,
                startTime: m.startTime,
                endTime: m.endTime,
                organizerDisplayName: m.organizerDisplayName,
                attendeesCount: m.attendees?.length || 0,
              };
            }
          } catch {
            // Meeting lookup failed — leave meeting as null
          }
        }
        return { ...t, meeting };
      })
    );

    res.json({ transcripts: enriched, totalCount: enriched.length });
  } catch (err: any) {
    console.error('Failed to list transcripts:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const transcript = await transcriptService.getTranscript(req.params.id as string);
    if (!transcript) {
      res.status(404).json({ error: 'Transcript not found' });
      return;
    }
    res.json(transcript);
  } catch (err: any) {
    console.error('Failed to get transcript:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
