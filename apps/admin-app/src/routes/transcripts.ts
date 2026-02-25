import { Router, Request, Response } from 'express';
import { transcriptService } from '../services/transcriptService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const transcripts = await transcriptService.listTranscripts({
      status: status as string,
    });
    res.json({ transcripts, totalCount: transcripts.length });
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
