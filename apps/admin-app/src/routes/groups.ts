import { Router, Request, Response } from 'express';
import { getGraphClient } from '../config/graph';
import { configStore } from '../services/configStore';
import { MonitoredGroup } from '../models';

const router = Router();

// List available Entra groups from Graph API
router.get('/', async (req: Request, res: Response) => {
  try {
    const client = getGraphClient();
    const search = req.query.search as string;

    let apiPath = '/groups?$select=id,displayName,description,membershipRule&$top=50&$filter=securityEnabled eq true';
    if (search) {
      apiPath = `/groups?$select=id,displayName,description&$top=50&$search="displayName:${search}"&$count=true`;
    }

    const result = await client.api(apiPath)
      .header('ConsistencyLevel', 'eventual')
      .get();

    const groups = (result.value || []).map((g: any) => ({
      groupId: g.id,
      displayName: g.displayName,
      description: g.description || '',
    }));

    res.json({ groups });
  } catch (err: any) {
    console.error('Failed to list groups:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get monitored groups
router.get('/monitored', async (req: Request, res: Response) => {
  try {
    const groups = await configStore.getMonitoredGroups();
    res.json({ groups });
  } catch (err: any) {
    console.error('Failed to get monitored groups:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Add a monitored group
router.post('/monitored', async (req: Request, res: Response) => {
  try {
    const { groupId, displayName } = req.body;
    if (!groupId || !displayName) {
      res.status(400).json({ error: 'groupId and displayName are required' });
      return;
    }

    const group: MonitoredGroup = {
      groupId,
      displayName,
      addedAt: new Date().toISOString(),
    };

    await configStore.addMonitoredGroup(group);
    const groups = await configStore.getMonitoredGroups();
    res.json({ success: true, groups });
  } catch (err: any) {
    console.error('Failed to add monitored group:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Remove a monitored group
router.delete('/monitored/:groupId', async (req: Request, res: Response) => {
  try {
    await configStore.removeMonitoredGroup(req.params.groupId as string);
    const groups = await configStore.getMonitoredGroups();
    res.json({ success: true, groups });
  } catch (err: any) {
    console.error('Failed to remove monitored group:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
