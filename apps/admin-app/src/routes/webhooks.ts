import { Router, Request, Response } from 'express';
import { webhookAuth } from '../middleware/auth';
import { meetingService } from '../services/meetingService';
import { configStore } from '../services/configStore';
import { subscriptionStore } from '../services/subscriptionStore';
import { config } from '../config';

const router = Router();

router.post('/graph', webhookAuth, async (req: Request, res: Response) => {
  const validationToken = req.query.validationToken as string;
  if (validationToken) {
    res.set('Content-Type', 'text/plain');
    res.status(200).send(validationToken);
    return;
  }

  try {
    const body = req.body;
    const notifications = body.value || [];

    if (notifications.length === 0) {
      res.json({ success: true, processed: 0 });
      return;
    }

    const expectedClientState = config.webhook.clientState;

    for (const notification of notifications) {
      if (expectedClientState && notification.clientState !== expectedClientState) {
        console.warn('Invalid clientState received, skipping notification');
        continue;
      }

      if (notification.subscriptionId) {
        await subscriptionStore.updateLastNotification(notification.subscriptionId).catch(() => {});
      }

      try {
        await meetingService.processNotification(notification);
      } catch (err: any) {
        console.error('Failed to process notification:', err.message);
      }
    }

    await configStore.updateLastWebhook();

    res.json({ success: true, processed: notifications.length });
  } catch (err: any) {
    console.error('Webhook processing error:', err.message);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
