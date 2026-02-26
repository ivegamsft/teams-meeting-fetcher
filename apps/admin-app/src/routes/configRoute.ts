import { Router, Request, Response } from 'express';
import { configStore } from '../services/configStore';
import { config } from '../config';
import { getGraphToken } from '../config/graph';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    let appConfig = await configStore.get();

    if (!appConfig) {
      await configStore.put({
        tenantId: config.graph.tenantId,
      });
      appConfig = await configStore.get();
    }

    res.json(appConfig);
  } catch (err: any) {
    console.error('Failed to get config:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/health', async (req: Request, res: Response) => {
  const health: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    graphApi: 'unknown',
    database: 'unknown',
    eventhub: config.eventhub.namespace ? 'configured' : 'not configured',
  };

  try {
    await getGraphToken();
    health.graphApi = 'connected';
  } catch {
    health.graphApi = 'disconnected';
    health.status = 'degraded';
  }

  try {
    await configStore.get();
    health.database = 'connected';
  } catch {
    health.database = 'disconnected';
    health.status = 'degraded';
  }

  res.json(health);
});

export default router;
