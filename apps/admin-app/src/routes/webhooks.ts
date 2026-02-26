import { Router, Request, Response } from 'express';
import { config } from '../config';
import { webhookAuth } from '../middleware/auth';
import { meetingService } from '../services/meetingService';
import { configStore } from '../services/configStore';

const router = Router();

router.post('/graph', webhookAuth, async (req: Request, res: Response) => {
  // Graph subscription validation handshake
  const validationToken = req.query.validationToken as string;
  if (validationToken) {
    res.status(200).contentType('text/plain').send(validationToken);
    return;
  }

  const notifications = req.body?.value || [];
  let processed = 0;

  for (const notification of notifications) {
    if (config.webhook.clientState && notification.clientState !== config.webhook.clientState) {
      console.warn(`Skipping notification with invalid clientState for subscription ${notification.subscriptionId}`);
      continue;
    }

    try {
      await meetingService.processNotification(notification);
      processed++;

      await configStore.updateLastNotification();
    } catch (err: any) {
      console.error(`Failed to process notification for ${notification.resource}:`, err.message);
    }
  }

  try {
    await configStore.updateLastWebhook();
  } catch (err: any) {
    console.error('Failed to update webhook timestamp:', err.message);
  }

  res.json({ success: true, processed });
});

export default router;
