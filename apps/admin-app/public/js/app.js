document.addEventListener('DOMContentLoaded', () => {
  const dashboard = document.getElementById('dashboard');
  const logoutBtn = document.getElementById('logout-btn');
  const userInfo = document.getElementById('user-info');

  async function checkAuth() {
    try {
      const result = await API.auth.status();
      if (result && result.authenticated) {
        if (result.user) {
          userInfo.textContent = result.user.displayName || result.user.email || '';
        }
        showDashboard();
      } else {
        window.location.href = '/auth/login';
      }
    } catch {
      window.location.href = '/auth/login';
    }
  }

  function showDashboard() {
    dashboard.classList.remove('hidden');
    loadPage('overview');
  }

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      loadPage(page);
    });
  });

  async function loadPage(page) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.add('hidden'));
    const el = document.getElementById(`page-${page}`);
    if (el) el.classList.remove('hidden');

    switch (page) {
      case 'overview': await loadOverview(); break;
      case 'subscriptions': await loadSubscriptions(); break;
      case 'meetings': await loadMeetings(); break;
      case 'transcripts': await loadTranscripts(); break;
      case 'settings': await loadSettings(); break;
    }
  }

  async function loadOverview() {
    try {
      const [subs, meetings, config, health] = await Promise.all([
        API.subscriptions.list().catch(() => ({ subscriptions: [], totalCount: 0 })),
        API.meetings.list().catch(() => ({ meetings: [], totalCount: 0 })),
        API.config.get().catch(() => null),
        API.config.health().catch(() => ({ status: 'unknown', graphApi: 'unknown', database: 'unknown' })),
      ]);

      document.getElementById('stat-subscriptions').textContent = subs.totalCount || subs.subscriptions?.length || 0;
      document.getElementById('stat-meetings').textContent = meetings.totalCount || 0;
      document.getElementById('stat-transcripts').textContent = config?.transcriptionsProcessed || 0;
      document.getElementById('stat-pending').textContent = config?.transcriptionsPending || 0;

      const healthEl = document.getElementById('health-status');
      healthEl.innerHTML = `
        <div class="health-item"><div class="health-dot ${health.graphApi}"></div><span>Graph API: ${health.graphApi}</span></div>
        <div class="health-item"><div class="health-dot ${health.database}"></div><span>Database: ${health.database}</span></div>
        <div class="health-item"><div class="health-dot ${health.status === 'healthy' ? 'connected' : 'disconnected'}"></div><span>System: ${health.status}</span></div>
        <div class="health-item"><span>Uptime: ${Math.floor((health.uptime || 0) / 60)} min</span></div>
      `;

      const recentEl = document.getElementById('recent-meetings');
      if (meetings.meetings && meetings.meetings.length > 0) {
        recentEl.innerHTML = meetings.meetings.slice(0, 5).map(m => `
          <div style="padding: 8px 0; border-bottom: 1px solid var(--gray-100); display: flex; justify-content: space-between;">
            <span>${m.subject}</span>
            <span class="status-badge status-${m.status}">${m.status}</span>
          </div>
        `).join('');
      } else {
        recentEl.innerHTML = '<div class="empty-state">No recent meetings</div>';
      }
    } catch (err) {
      console.error('Failed to load overview:', err);
    }
  }

  async function loadSubscriptions() {
    try {
      const result = await API.subscriptions.list();
      const tbody = document.getElementById('subscriptions-tbody');
      const empty = document.getElementById('subscriptions-empty');

      if (!result.subscriptions || result.subscriptions.length === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');
      tbody.innerHTML = result.subscriptions.map(s => `
        <tr>
          <td>${s.userDisplayName}</td>
          <td>${s.userEmail}</td>
          <td><code style="font-size:12px">${s.resource}</code></td>
          <td><span class="status-badge status-${s.status}">${s.status}</span></td>
          <td>${formatDate(s.expirationDateTime)}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="renewSubscription('${s.subscription_id}')">Renew</button>
            <button class="btn btn-sm btn-danger" onclick="deleteSubscription('${s.subscription_id}')">Delete</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
    }
  }

  async function loadMeetings(params = {}) {
    try {
      const status = document.getElementById('filter-status').value;
      const from = document.getElementById('filter-from').value;
      const to = document.getElementById('filter-to').value;

      const result = await API.meetings.list({ status, from, to, ...params });
      const tbody = document.getElementById('meetings-tbody');
      const empty = document.getElementById('meetings-empty');

      if (!result.meetings || result.meetings.length === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');
      tbody.innerHTML = result.meetings.map(m => `
        <tr>
          <td>${m.subject}</td>
          <td>${m.organizerDisplayName || m.organizerEmail}</td>
          <td>${formatDate(m.startTime)}</td>
          <td><span class="status-badge status-${m.status}">${m.status}</span></td>
          <td>${m.transcriptionId ? '<span class="status-badge status-completed">Available</span>' : '--'}</td>
          <td>
            ${m.transcriptionId ? `<button class="btn btn-sm btn-primary" onclick="viewTranscript('${m.meeting_id}')">View</button>` : ''}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load meetings:', err);
    }
  }

  async function loadTranscripts() {
    try {
      const result = await API.transcripts.list();
      const tbody = document.getElementById('transcripts-tbody');
      const empty = document.getElementById('transcripts-empty');

      if (!result.transcripts || result.transcripts.length === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');
      tbody.innerHTML = result.transcripts.map(t => `
        <tr>
          <td><code style="font-size:12px">${t.meetingId?.substring(0, 12)}...</code></td>
          <td><span class="status-badge status-${t.status}">${t.status}</span></td>
          <td>${t.language || 'en'}</td>
          <td>${formatDate(t.createdAt)}</td>
          <td>${t.processedAt ? formatDate(t.processedAt) : '--'}</td>
          <td>
            ${t.status === 'completed' ? `<button class="btn btn-sm btn-primary" onclick="viewTranscriptById('${t.transcript_id}', '${t.meetingId}')">View</button>` : ''}
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error('Failed to load transcripts:', err);
    }
  }

  async function loadSettings() {
    try {
      const [config, health] = await Promise.all([
        API.config.get().catch(() => null),
        API.config.health().catch(() => null),
      ]);

      if (config) {
        document.getElementById('setting-group-id').value = config.entraGroupId || '';
        document.getElementById('setting-webhook-url').textContent = config.webhookUrl || 'Not configured';
        document.getElementById('setting-tenant-id').textContent = config.tenantId || 'Not configured';

        document.getElementById('config-stats').innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div><strong>Meetings Monitored:</strong> ${config.monitoredMeetingsCount || 0}</div>
            <div><strong>Transcripts Processed:</strong> ${config.transcriptionsProcessed || 0}</div>
            <div><strong>Transcripts Pending:</strong> ${config.transcriptionsPending || 0}</div>
            <div><strong>Last Webhook:</strong> ${config.lastWebhookReceived ? formatDate(config.lastWebhookReceived) : 'Never'}</div>
          </div>
        `;
      }

      if (health) {
        document.getElementById('connection-status').innerHTML = `
          <div class="health-grid">
            <div class="health-item"><div class="health-dot ${health.graphApi}"></div><span>Graph API: ${health.graphApi}</span></div>
            <div class="health-item"><div class="health-dot ${health.database}"></div><span>Database: ${health.database}</span></div>
          </div>
        `;
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  }

  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const entraGroupId = document.getElementById('setting-group-id').value;
    try {
      await API.config.update({ entraGroupId });
      alert('Settings saved successfully');
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    }
  });

  document.getElementById('apply-filters-btn').addEventListener('click', () => loadMeetings());

  document.getElementById('new-subscription-btn').addEventListener('click', () => {
    const modal = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');
    content.innerHTML = `
      <h2>New Subscription</h2>
      <form id="create-sub-form">
        <div class="form-group">
          <label>User ID</label>
          <input type="text" id="sub-user-id" class="form-input" required placeholder="Azure AD User ID">
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="text" id="sub-email" class="form-input" required placeholder="user@company.com">
        </div>
        <div class="form-group">
          <label>Display Name</label>
          <input type="text" id="sub-name" class="form-input" required placeholder="John Doe">
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create</button>
        </div>
      </form>
    `;
    modal.classList.remove('hidden');

    document.getElementById('create-sub-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await API.subscriptions.create({
          userId: document.getElementById('sub-user-id').value,
          userEmail: document.getElementById('sub-email').value,
          userDisplayName: document.getElementById('sub-name').value,
        });
        closeModal();
        loadSubscriptions();
      } catch (err) {
        alert('Failed to create subscription: ' + err.message);
      }
    });
  });

  document.getElementById('sync-group-btn').addEventListener('click', async () => {
    if (!confirm('Sync subscriptions with Entra group members?')) return;
    try {
      const result = await API.subscriptions.syncGroup();
      alert(`Sync complete: ${result.added} added, ${result.removed} removed`);
      loadSubscriptions();
    } catch (err) {
      alert('Sync failed: ' + err.message);
    }
  });

  document.getElementById('close-viewer').addEventListener('click', () => {
    document.getElementById('transcript-viewer').classList.add('hidden');
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.tab;
      const meetingId = btn.closest('.modal').dataset.meetingId;
      if (meetingId) loadTranscriptContent(meetingId, type);
    });
  });

  window.renewSubscription = async (id) => {
    if (!confirm('Renew this subscription?')) return;
    try {
      await API.subscriptions.renew(id);
      loadSubscriptions();
    } catch (err) {
      alert('Renewal failed: ' + err.message);
    }
  };

  window.deleteSubscription = async (id) => {
    if (!confirm('Delete this subscription? This cannot be undone.')) return;
    try {
      await API.subscriptions.delete(id);
      loadSubscriptions();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  window.viewTranscript = async (meetingId) => {
    const viewer = document.getElementById('transcript-viewer');
    const modal = viewer.querySelector('.modal');
    modal.dataset.meetingId = meetingId;
    viewer.classList.remove('hidden');
    await loadTranscriptContent(meetingId, 'sanitized');

    document.getElementById('download-transcript-btn').onclick = () => {
      window.open(`/api/meetings/${meetingId}/transcript/download?type=sanitized`, '_blank');
    };
  };

  window.viewTranscriptById = async (transcriptId, meetingId) => {
    window.viewTranscript(meetingId);
  };

  async function loadTranscriptContent(meetingId, type) {
    const textEl = document.getElementById('transcript-text');
    textEl.textContent = 'Loading...';
    try {
      const result = await API.meetings.transcript(meetingId, type);
      textEl.textContent = result.content || 'No content available';
    } catch (err) {
      textEl.textContent = 'Failed to load transcript: ' + err.message;
    }
  }

  window.closeModal = () => {
    document.getElementById('modal-overlay').classList.add('hidden');
  };

  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  checkAuth();
});
