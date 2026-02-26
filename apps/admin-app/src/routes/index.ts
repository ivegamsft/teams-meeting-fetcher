import { Router } from 'express';
import authStatusRoutes from './auth';
import subscriptionRoutes from './subscriptions';
import meetingRoutes from './meetings';
import transcriptRoutes from './transcripts';
import configRoutes from './configRoute';
import groupRoutes from './groups';
import { dashboardAuth } from '../middleware/auth';

const router = Router();

router.use('/auth', authStatusRoutes);

router.use('/subscriptions', dashboardAuth, subscriptionRoutes);
router.use('/meetings', dashboardAuth, meetingRoutes);
router.use('/transcripts', dashboardAuth, transcriptRoutes);
router.use('/config', dashboardAuth, configRoutes);
router.use('/groups', dashboardAuth, groupRoutes);

export default router;
