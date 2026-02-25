import { Router, Request, Response } from 'express';
import { graphSubscriptionService } from '../services/graphSubscriptionService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const subscriptions = await graphSubscriptionService.listSubscriptions();
    res.json({ subscriptions, totalCount: subscriptions.length });
  } catch (err: any) {
    console.error('Failed to list subscriptions:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const subscription = await graphSubscriptionService.getSubscription(id);
    if (!subscription) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }
    res.json(subscription);
  } catch (err: any) {
    console.error('Failed to get subscription:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { userId, userEmail, userDisplayName, resource, changeType } = req.body;

    if (!userId || !userEmail || !userDisplayName) {
      res.status(400).json({ error: 'userId, userEmail, and userDisplayName are required' });
      return;
    }

    const subscription = await graphSubscriptionService.createSubscription({
      userId, userEmail, userDisplayName, resource, changeType,
    });

    res.status(201).json(subscription);
  } catch (err: any) {
    console.error('Failed to create subscription:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/renew', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const subscription = await graphSubscriptionService.renewSubscription(id);
    res.json(subscription);
  } catch (err: any) {
    console.error('Failed to renew subscription:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await graphSubscriptionService.deleteSubscription(id);
    res.json({ success: true, message: 'Subscription deleted' });
  } catch (err: any) {
    console.error('Failed to delete subscription:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync-group', async (req: Request, res: Response) => {
  try {
    const result = await graphSubscriptionService.syncGroupMembers();
    res.json({
      success: true,
      added: result.added.length,
      removed: result.removed.length,
      details: result,
    });
  } catch (err: any) {
    console.error('Failed to sync group members:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
