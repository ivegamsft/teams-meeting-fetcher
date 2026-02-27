import { Router, Request, Response } from 'express';
import { webhookAuth } from '../middleware/auth';

const router = Router();

// DEPRECATED: Webhook intake is no longer the primary notification path.
// Lambda now writes directly to DynamoDB (change data feed pattern).
// This endpoint is kept as a no-op for backward compatibility during transition.
router.post('/graph', webhookAuth, async (req: Request, res: Response) => {
  // Graph subscription validation handshake (still needed for active subscriptions)
  const validationToken = req.query.validationToken as string;
  if (validationToken) {
    res.status(200).contentType('text/plain').send(validationToken);
    return;
  }

  const notifications = req.body?.value || [];
  console.log(`[DEPRECATED] Webhook received ${notifications.length} notifications — Lambda writes directly to DynamoDB now`);
  res.json({ success: true, processed: 0, deprecated: true, message: 'Webhook intake deprecated. Lambda writes directly to DynamoDB.' });
});

export default router;
