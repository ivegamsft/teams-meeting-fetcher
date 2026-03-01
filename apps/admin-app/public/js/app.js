document.addEventListener('DOMContentLoaded', () => {
  const dashboard = document.getElementById('dashboard');
  const logoutBtn = document.getElementById('logout-btn');
  const userInfo = document.getElementById('user-info');

  // Meetings pagination and sorting state
  let meetingsPage = 1;
  const meetingsPageSize = 25;
  let meetingsTotalCount = 0;
  let meetingsSortField = 'startTime';
  let meetingsSortDir = 'desc'; // default: newest first

  // Transcripts pagination state
  let transcriptsPage = 1;
  const transcriptsPageSize = 25;
  let allTranscripts = [];

  function showLoading(id) { document.getElementById(id)?.classList.remove('hidden'); }
  function hideLoading(id) { document.getElementById(id)?.classList.add('hidden'); }

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
            <span>${m.subject || 'Untitled Meeting'}</span>
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
    showLoading('meetings-loading');
    try {
      const status = document.getElementById('filter-status').value;
      const from = document.getElementById('filter-from').value;
      const to = document.getElementById('filter-to').value;

      const result = await API.meetings.list({
        status, from, to,
        page: String(meetingsPage),
        pageSize: String(meetingsPageSize),
        ...params,
      });
      const tbody = document.getElementById('meetings-tbody');
      const empty = document.getElementById('meetings-empty');

      meetingsTotalCount = result.totalCount || 0;

      if (!result.meetings || result.meetings.length === 0) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        renderMeetingsPagination();
        hideLoading('meetings-loading');
        return;
      }

      // Client-side sort
      const sorted = [...result.meetings].sort((a, b) => {
        let av = a[meetingsSortField] || '';
        let bv = b[meetingsSortField] || '';
        if (meetingsSortField === 'startTime') {
          av = new Date(av).getTime() || 0;
          bv = new Date(bv).getTime() || 0;
        } else {
          av = String(av).toLowerCase();
          bv = String(bv).toLowerCase();
        }
        if (av < bv) return meetingsSortDir === 'asc' ? -1 : 1;
        if (av > bv) return meetingsSortDir === 'asc' ? 1 : -1;
        return 0;
      });

      empty.classList.add('hidden');
      tbody.innerHTML = sorted.map(m => `
        <tr>
          <td><a href="#" onclick="event.preventDefault();showMeetingDetail('${m.meeting_id}')" style="color:var(--primary);text-decoration:none;font-weight:500;">${m.subject || 'Untitled Meeting'}</a></td>
          <td>${m.organizerDisplayName || m.organizerEmail || '--'}</td>
          <td>${formatDate(m.startTime)}</td>
          <td><span class="status-badge status-${m.status}">${m.status}</span></td>
          <td>${m.transcriptionId ? '<span class="status-badge status-completed">Available</span>' : '--'}</td>
          <td>
            ${m.transcriptionId ? `<button class="btn btn-sm btn-primary" onclick="viewTranscript('${m.meeting_id}')">View</button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="showMeetingDetail('${m.meeting_id}')">Details</button>
          </td>
        </tr>
      `).join('');

      renderMeetingsPagination();
    } catch (err) {
      console.error('Failed to load meetings:', err);
    } finally {
      hideLoading('meetings-loading');
    }
  }

  function renderMeetingsPagination() {
    const container = document.getElementById('meetings-pagination');
    const totalPages = Math.max(1, Math.ceil(meetingsTotalCount / meetingsPageSize));
    if (meetingsTotalCount <= meetingsPageSize) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <button class="btn btn-sm btn-outline" ${meetingsPage <= 1 ? 'disabled' : ''} id="meetings-prev">Prev</button>
      <span style="display:inline-flex;align-items:center;font-size:14px;color:var(--gray-600);">
        Page ${meetingsPage} of ${totalPages} (${meetingsTotalCount} total)
      </span>
      <button class="btn btn-sm btn-outline" ${meetingsPage >= totalPages ? 'disabled' : ''} id="meetings-next">Next</button>
    `;
    document.getElementById('meetings-prev')?.addEventListener('click', () => {
      if (meetingsPage > 1) { meetingsPage--; loadMeetings(); }
    });
    document.getElementById('meetings-next')?.addEventListener('click', () => {
      if (meetingsPage < totalPages) { meetingsPage++; loadMeetings(); }
    });
  }

  function handleMeetingSort(field) {
    if (meetingsSortField === field) {
      meetingsSortDir = meetingsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      meetingsSortField = field;
      meetingsSortDir = field === 'startTime' ? 'desc' : 'asc';
    }
    updateSortIndicators();
    loadMeetings();
  }

  function updateSortIndicators() {
    document.querySelectorAll('#meetings-table th[data-sort]').forEach(th => {
      const field = th.dataset.sort;
      const indicator = th.querySelector('.sort-indicator');
      if (field === meetingsSortField) {
        indicator.textContent = meetingsSortDir === 'asc' ? ' \u25B2' : ' \u25BC';
      } else {
        indicator.textContent = '';
      }
    });
  }

  async function loadTranscripts() {
    showLoading('transcripts-loading');
    try {
      const result = await API.transcripts.list();
      const empty = document.getElementById('transcripts-empty');

      if (!result.transcripts || result.transcripts.length === 0) {
        document.getElementById('transcripts-tbody').innerHTML = '';
        empty.classList.remove('hidden');
        document.getElementById('transcripts-pagination').innerHTML = '';
        hideLoading('transcripts-loading');
        return;
      }

      allTranscripts = result.transcripts;
      empty.classList.add('hidden');
      renderTranscriptsPage();
    } catch (err) {
      console.error('Failed to load transcripts:', err);
    } finally {
      hideLoading('transcripts-loading');
    }
  }

  function renderTranscriptsPage() {
    const tbody = document.getElementById('transcripts-tbody');
    const start = (transcriptsPage - 1) * transcriptsPageSize;
    const page = allTranscripts.slice(start, start + transcriptsPageSize);

    tbody.innerHTML = page.map(t => {
      const m = t.meeting;
      const subject = m?.subject || ('Meeting ' + (t.meetingId?.substring(0, 12) || '?') + '...');
      const organizer = m?.organizerDisplayName || '--';
      const dateTime = m?.startTime ? formatDate(m.startTime) : formatDate(t.createdAt);
      let duration = '--';
      if (m?.startTime && m?.endTime) {
        const mins = Math.round((new Date(m.endTime) - new Date(m.startTime)) / 60000);
        duration = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
      }
      return `
      <tr>
        <td><a href="#" onclick="event.preventDefault();showMeetingDetail('${t.meetingId}')" style="color:var(--primary);text-decoration:none;font-weight:500;" title="${subject}">${subject}</a></td>
        <td>${organizer}</td>
        <td>${dateTime}</td>
        <td>${duration}</td>
        <td><span class="status-badge status-${t.status}">${t.status}</span></td>
        <td>
          ${t.status === 'completed' ? `<button class="btn btn-sm btn-primary" onclick="viewTranscriptById('${t.transcript_id}', '${t.meetingId}')">View</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="showMeetingDetail('${t.meetingId}')">Details</button>
        </td>
      </tr>`;
    }).join('');

    renderTranscriptsPagination();
  }

  function renderTranscriptsPagination() {
    const container = document.getElementById('transcripts-pagination');
    const totalPages = Math.max(1, Math.ceil(allTranscripts.length / transcriptsPageSize));
    if (allTranscripts.length <= transcriptsPageSize) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <button class="btn btn-sm btn-outline" ${transcriptsPage <= 1 ? 'disabled' : ''} id="transcripts-prev">Prev</button>
      <span style="display:inline-flex;align-items:center;font-size:14px;color:var(--gray-600);">
        Page ${transcriptsPage} of ${totalPages} (${allTranscripts.length} total)
      </span>
      <button class="btn btn-sm btn-outline" ${transcriptsPage >= totalPages ? 'disabled' : ''} id="transcripts-next">Next</button>
    `;
    document.getElementById('transcripts-prev')?.addEventListener('click', () => {
      if (transcriptsPage > 1) { transcriptsPage--; renderTranscriptsPage(); }
    });
    document.getElementById('transcripts-next')?.addEventListener('click', () => {
      if (transcriptsPage < totalPages) { transcriptsPage++; renderTranscriptsPage(); }
    });
  }

  async function loadSettings() {
    try {
      const [config, health, monitored] = await Promise.all([
        API.config.get().catch(() => null),
        API.config.health().catch(() => null),
        API.groups.monitored().catch(() => ({ groups: [] })),
      ]);

      // Render monitored groups
      renderMonitoredGroups(monitored.groups || []);

      if (config) {
        const ehDisplay = config.eventhubNamespace ? `${config.eventhubNamespace}/${config.eventhubName || ''}` : 'Not configured';
        document.getElementById('setting-eventhub').textContent = ehDisplay;
        document.getElementById('setting-tenant-id').textContent = config.tenantId || 'Not configured';

        document.getElementById('config-stats').innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div><strong>Meetings Monitored:</strong> ${config.monitoredMeetingsCount || 0}</div>
            <div><strong>Transcripts Processed:</strong> ${config.transcriptionsProcessed || 0}</div>
            <div><strong>Transcripts Pending:</strong> ${config.transcriptionsPending || 0}</div>
            <div><strong>Monitored Groups:</strong> ${(monitored.groups || []).length}</div>
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

  function renderMonitoredGroups(groups) {
    const container = document.getElementById('monitored-groups-list');
    if (!groups || groups.length === 0) {
      container.innerHTML = '<div class="empty-state">No monitored groups. Search and add groups below.</div>';
      return;
    }
    container.innerHTML = groups.map(g => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--gray-100);border-radius:6px;margin-bottom:6px;">
        <div>
          <strong>${g.displayName}</strong>
          <span style="color:var(--gray-400);font-size:12px;margin-left:8px;">${g.groupId}</span>
        </div>
        <button class="btn btn-sm btn-danger" onclick="removeMonitoredGroup('${g.groupId}')">Remove</button>
      </div>
    `).join('');
  }

  window.removeMonitoredGroup = async (groupId) => {
    if (!confirm('Remove this group from monitoring?')) return;
    try {
      const result = await API.groups.removeMonitored(groupId);
      renderMonitoredGroups(result.groups || []);
    } catch (err) {
      alert('Failed to remove group: ' + err.message);
    }
  };

  window.addMonitoredGroup = async (groupId, displayName) => {
    try {
      const result = await API.groups.addMonitored({ groupId, displayName });
      renderMonitoredGroups(result.groups || []);
      document.getElementById('group-search-results').innerHTML = '';
    } catch (err) {
      alert('Failed to add group: ' + err.message);
    }
  };

  document.getElementById('search-groups-btn').addEventListener('click', async () => {
    const search = document.getElementById('group-search').value.trim();
    const resultsEl = document.getElementById('group-search-results');
    resultsEl.innerHTML = 'Searching...';
    try {
      const result = await API.groups.list(search);
      if (!result.groups || result.groups.length === 0) {
        resultsEl.innerHTML = '<div style="padding:8px;color:var(--gray-400);">No groups found</div>';
        return;
      }
      resultsEl.innerHTML = result.groups.map(g => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;border:1px solid var(--gray-100);border-radius:4px;margin-bottom:4px;">
          <div>
            <strong>${g.displayName}</strong>
            ${g.description ? `<span style="color:var(--gray-400);font-size:12px;margin-left:8px;">${g.description}</span>` : ''}
          </div>
          <button class="btn btn-sm btn-primary" onclick="addMonitoredGroup('${g.groupId}', '${g.displayName.replace(/'/g, "\\'")}')">Add</button>
        </div>
      `).join('');
    } catch (err) {
      resultsEl.innerHTML = '<div style="padding:8px;color:#e74c3c;">Search failed: ' + err.message + '</div>';
    }
  });

  document.getElementById('group-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('search-groups-btn').click();
    }
  });

  document.getElementById('apply-filters-btn').addEventListener('click', () => {
    meetingsPage = 1;
    loadMeetings();
  });

  document.querySelectorAll('#meetings-table th.sortable').forEach(th => {
    th.addEventListener('click', () => handleMeetingSort(th.dataset.sort));
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

  window.goToMeetingDetails = (meetingId) => showMeetingDetail(meetingId);

  window.showMeetingDetail = async (meetingId) => {
    const overlay = document.getElementById('meeting-detail-overlay');
    const body = document.getElementById('meeting-detail-body');
    const title = document.getElementById('meeting-detail-title');
    overlay.classList.remove('hidden');
    body.innerHTML = '<div style="text-align:center;padding:32px;"><div class="spinner" style="margin:0 auto;"></div><p style="margin-top:12px;color:var(--gray-500);">Fetching meeting details...</p></div>';
    title.textContent = 'Meeting Details';

    try {
      const d = await API.meetings.details(meetingId);
      title.textContent = d.subject || 'Meeting Details';
      const duration = d.startTime && d.endTime
        ? (() => { const mins = Math.round((new Date(d.endTime) - new Date(d.startTime)) / 60000); return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`; })()
        : '--';
      const attendeeList = (d.attendees || []).map(a =>
        `<div style="padding:4px 0;border-bottom:1px solid var(--gray-100);font-size:13px;">
          <span style="font-weight:500;">${a.displayName || a.email}</span>
          <span style="color:var(--gray-400);margin-left:8px;">${a.role || ''}</span>
          <span class="status-badge status-${a.status === 'accepted' ? 'completed' : 'pending'}" style="margin-left:8px;">${a.status || '--'}</span>
        </div>`
      ).join('') || '<span style="color:var(--gray-400);">No attendee data</span>';

      body.innerHTML = `
        <div class="detail-grid">
          <div class="detail-label">Subject</div><div class="detail-value">${d.subject || '--'}</div>
          <div class="detail-label">Organizer</div><div class="detail-value">${d.organizerDisplayName || '--'} ${d.organizerEmail && d.organizerEmail !== '--' ? `(${d.organizerEmail})` : ''}</div>
          <div class="detail-label">Start</div><div class="detail-value">${formatDate(d.startTime)}</div>
          <div class="detail-label">End</div><div class="detail-value">${formatDate(d.endTime)}</div>
          <div class="detail-label">Duration</div><div class="detail-value">${duration}</div>
          <div class="detail-label">Status</div><div class="detail-value"><span class="status-badge status-${d.status}">${d.status || '--'}</span></div>
          <div class="detail-label">Transcript</div><div class="detail-value">${d.transcriptionId ? '<span class="status-badge status-completed">Available</span>' : '<span style="color:var(--gray-400);">None</span>'}</div>
          <div class="detail-label">Enriched</div><div class="detail-value">${d.detailsFetched ? 'Yes' : 'No'}</div>
        </div>
        <div style="margin-top:16px;">
          <h3 style="font-size:14px;color:var(--gray-500);margin-bottom:8px;">Attendees (${d.attendees?.length || 0})</h3>
          ${attendeeList}
        </div>
        ${d.joinWebUrl ? `<div style="margin-top:16px;"><a href="${d.joinWebUrl}" target="_blank" class="btn btn-sm btn-primary">Join Meeting</a></div>` : ''}
      `;
    } catch (err) {
      body.innerHTML = `<div class="empty-state" style="color:var(--danger);">Failed to load details: ${err.message}</div>`;
    }
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
