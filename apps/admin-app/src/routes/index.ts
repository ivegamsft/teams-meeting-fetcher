import { Router } from 'express';
import authStatusRoutes from './auth';
import subscriptionRoutes from './subscriptions';
import meetingRoutes from './meetings';
import transcriptRoutes from './transcripts';
import webhookRoutes from './webhooks';
import configRoutes from './configRoute';
import { dashboardAuth } from '../middleware/auth';

const router = Router();

router.use('/auth', authStatusRoutes);

router.use('/webhooks', webhookRoutes);

router.use('/subscriptions', dashboardAuth, subscriptionRoutes);
router.use('/meetings', dashboardAuth, meetingRoutes);
router.use('/transcripts', dashboardAuth, transcriptRoutes);
router.use('/config', dashboardAuth, configRoutes);

export default router;
