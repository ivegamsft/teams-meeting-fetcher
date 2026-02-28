import { v4 as uuidv4 } from 'uuid';
import { getGraphClient } from '../config/graph';
import { config } from '../config';
import { Meeting } from '../models';
import { meetingStore } from './meetingStore';
import { transcriptService } from './transcriptService';
import { configStore } from './configStore';

export const meetingService = {
  async processNotification(notification: any): Promise<void> {
    const { resource, changeType, subscriptionId, resourceData, tenantId } = notification;

    const parts = resource.split('/');
    const eventId = parts[parts.length - 1];

    const existing = await meetingStore.get(eventId);

    if (changeType === 'deleted') {
      if (existing) {
        await meetingStore.updateStatus(existing.meeting_id, 'cancelled', 'deleted');
      }
      return;
    }

    const now = new Date().toISOString();

    if (existing) {
      // Don't regress changeType — "created" replay must not overwrite "updated"/"deleted"
      const effectiveChangeType = (changeType === 'created' && existing.changeType && existing.changeType !== 'created')
        ? existing.changeType
        : changeType;
      await meetingStore.put({
        ...existing,
        changeType: effectiveChangeType,
        rawNotification: notification,
        resource,
        updatedAt: now,
      });
    } else {
      const meeting: Meeting = {
        meeting_id: eventId,
        tenantId: tenantId || config.graph.tenantId,
        subject: '',
        description: '',
        startTime: '',
        endTime: '',
        organizerId: '',
        organizerEmail: '',
        organizerDisplayName: '',
        attendees: [],
        status: 'notification_received',
        subscriptionId,
        changeType,
        resource,
        rawNotification: notification,
        detailsFetched: false,
        createdAt: now,
        updatedAt: now,
      };
      await meetingStore.put(meeting);
      await configStore.incrementCounter('monitoredMeetingsCount', 1);
    }
  },

  async fetchDetails(meetingId: string): Promise<Meeting> {
    const meeting = await meetingStore.get(meetingId);
    if (!meeting) throw new Error('Meeting not found');
    if (!meeting.resource) throw new Error('Meeting has no resource path');

    const client = getGraphClient();
    const eventData = await client.api(`/${meeting.resource}`).get();

    const joinWebUrl = eventData.onlineMeeting?.joinUrl || meeting.joinWebUrl || '';
    let onlineMeetingId = eventData.onlineMeetingId || meeting.onlineMeetingId || '';

    // Resolve onlineMeetingId from joinWebUrl if not directly available.
    // The /users/{id}/onlineMeetings endpoint with app-only auth (CsApplicationAccessPolicy)
    // requires a userId GUID — email/UPN will not work.
    if (!onlineMeetingId && joinWebUrl) {
      const organizerEmail = eventData.organizer?.emailAddress?.address || '';
      if (organizerEmail) {
        try {
          // Step 1: Resolve organizer email to userId GUID
          const userResp = await client.api(`/users/${organizerEmail}`).select('id').get();
          const userId = userResp.id;

          // Step 2: Query onlineMeetings by JoinWebUrl using the GUID
          const decodedUrl = decodeURIComponent(joinWebUrl);
          // Escape single quotes for OData filter
          const escapedUrl = decodedUrl.replace(/'/g, "''");
          const resp = await client
            .api(`/users/${userId}/onlineMeetings`)
            .filter(`JoinWebUrl eq '${escapedUrl}'`)
            .get();
          if (resp.value && resp.value.length > 0) {
            onlineMeetingId = resp.value[0].id;
            console.log(`[MeetingService] Resolved onlineMeetingId for ${meetingId} via joinWebUrl (userId=${userId})`);
          } else {
            // Fallback: try with the original (possibly encoded) URL
            const escapedOriginal = joinWebUrl.replace(/'/g, "''");
            const resp2 = await client
              .api(`/users/${userId}/onlineMeetings`)
              .filter(`JoinWebUrl eq '${escapedOriginal}'`)
              .get();
            if (resp2.value && resp2.value.length > 0) {
              onlineMeetingId = resp2.value[0].id;
              console.log(`[MeetingService] Resolved onlineMeetingId for ${meetingId} via encoded joinWebUrl (userId=${userId})`);
            }
          }
        } catch (err: any) {
          const errDetail = err.statusCode || err.code || err.message || JSON.stringify(err).substring(0, 200);
          console.warn(`[MeetingService] Failed to resolve onlineMeetingId for ${meetingId}: ${errDetail}`);
        }
      }
    }

    const enriched: Meeting = {
      ...meeting,
      subject: eventData.subject || 'Untitled Meeting',
      description: eventData.bodyPreview || '',
      startTime: eventData.start?.dateTime || meeting.startTime,
      endTime: eventData.end?.dateTime || meeting.endTime,
      organizerId: eventData.organizer?.emailAddress?.address || '',
      organizerEmail: eventData.organizer?.emailAddress?.address || '',
      organizerDisplayName: eventData.organizer?.emailAddress?.name || '',
      attendees: (eventData.attendees || []).map((a: any) => ({
        id: a.emailAddress?.address || '',
        email: a.emailAddress?.address || '',
        displayName: a.emailAddress?.name || '',
        role: a.type === 'required' ? 'required' : 'optional',
        status: a.status?.response || 'notResponded',
      })),
      status: meeting.status === 'notification_received' ? 'scheduled' : meeting.status,
      joinWebUrl,
      onlineMeetingId,
      rawEventData: eventData,
      detailsFetched: true,
      updatedAt: new Date().toISOString(),
    };

    await meetingStore.put(enriched);
    return enriched;
  },

  async fetchDetailsBatch(meetingIds: string[]): Promise<{ success: string[]; failed: Array<{ id: string; error: string }> }> {
    const success: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of meetingIds) {
      try {
        await this.fetchDetails(id);
        success.push(id);
      } catch (err: any) {
        failed.push({ id, error: err.message });
      }
      await new Promise(r => setTimeout(r, 100));
    }

    return { success, failed };
  },

  async checkForTranscript(meeting: Meeting): Promise<void> {
    if (!meeting.onlineMeetingId) return;

    const client = getGraphClient();

    try {
      const transcripts = await client
        .api(`/communications/onlineMeetings/${meeting.onlineMeetingId}/transcripts`)
        .get();

      if (transcripts.value && transcripts.value.length > 0) {
        const latest = transcripts.value[transcripts.value.length - 1];
        await transcriptService.fetchAndStore(meeting, latest.id);
      }
    } catch (err: any) {
      if (err.statusCode !== 404) {
        console.error(`Failed to check transcripts for meeting ${meeting.meeting_id}:`, err.message);
      }
    }
  },

  async findMeetingByResource(resource: string): Promise<Meeting | null> {
    const parts = resource.split('/');
    const eventId = parts[parts.length - 1];
    return meetingStore.get(eventId);
  },

  async getMeeting(id: string): Promise<Meeting | null> {
    return meetingStore.get(id);
  },

  async listMeetings(filters?: {
    status?: string;
    organizerEmail?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    return meetingStore.list(filters);
  },

  async getMeetingDetails(id: string): Promise<any> {
    const meeting = await meetingStore.get(id);
    if (!meeting) throw new Error('Meeting not found');
    if (!meeting.onlineMeetingId || !meeting.organizerEmail) {
      throw new Error('Meeting does not have online meeting information');
    }

    const client = getGraphClient();
    try {
      const onlineMeeting = await client
        .api(`/users/${meeting.organizerEmail}/onlineMeetings/${meeting.onlineMeetingId}`)
        .get();
      return onlineMeeting;
    } catch (err: any) {
      console.error(`Failed to fetch online meeting details for ${id}:`, err.message);
      throw new Error(`Unable to fetch meeting details: ${err.message}`);
    }
  },

  async toggleTranscription(id: string, enabled: boolean): Promise<void> {
    const meeting = await meetingStore.get(id);
    if (!meeting) throw new Error('Meeting not found');
    if (!meeting.onlineMeetingId || !meeting.organizerEmail) {
      throw new Error('Meeting does not have online meeting information');
    }

    const client = getGraphClient();
    try {
      await client
        .api(`/users/${meeting.organizerEmail}/onlineMeetings/${meeting.onlineMeetingId}`)
        .patch({
          isEntryExitAnnounced: enabled,
          recordAutomatically: enabled,
        });

      await meetingStore.put({
        ...meeting,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error(`Failed to toggle transcription for meeting ${id}:`, err.message);
      throw new Error(`Unable to update transcription settings: ${err.message}`);
    }
  },

  /**
   * Directly discover online meetings with transcripts for a user via Graph API.
   * Uses userId (GUID) and JoinWebUrl filter to resolve meetings.
   */
  async discoverTranscriptsForUser(userEmail: string): Promise<number> {
    const client = getGraphClient();
    let found = 0;

    // Resolve userId GUID (required for onlineMeetings API with CsApplicationAccessPolicy)
    let userId: string;
    try {
      const user = await client.api(`/users/${userEmail}`).select('id').get();
      userId = user.id;
      console.log(`[MeetingService] Resolved ${userEmail} -> userId ${userId}`);
    } catch (err: any) {
      console.error(`[MeetingService] Cannot resolve userId for ${userEmail}: ${err.statusCode || err.message}`);
      return 0;
    }

    // Get meetings from DynamoDB that have joinWebUrl for this organizer
    const allMeetings = await meetingStore.listAll();
    const userMeetings = allMeetings.filter(m =>
      m.joinWebUrl &&
      !m.transcriptionId &&
      m.organizerEmail === userEmail
    );

    console.log(`[MeetingService] Checking ${userMeetings.length} meetings with joinWebUrl for ${userEmail}`);

    let checked = 0;
    for (const meeting of userMeetings) {
      if (!meeting.joinWebUrl) continue;
      checked++;
      if (checked > 20) break; // Limit per cycle to avoid rate limiting

      try {
        // Try resolving online meeting ID via JoinWebUrl filter using userId (GUID)
        const decodedUrl = decodeURIComponent(meeting.joinWebUrl);
        const resp = await client
          .api(`/users/${userId}/onlineMeetings`)
          .filter(`JoinWebUrl eq '${decodedUrl}'`)
          .get();

        if (resp.value && resp.value.length > 0) {
          const om = resp.value[0];
          console.log(`[MeetingService] Resolved meeting "${meeting.subject}" -> onlineMeetingId ${om.id}`);

          // Update meeting with onlineMeetingId
          await meetingStore.put({
            ...meeting,
            onlineMeetingId: om.id,
            updatedAt: new Date().toISOString(),
          });

          // Check for transcripts
          try {
            const transcripts = await client
              .api(`/users/${userId}/onlineMeetings/${om.id}/transcripts`)
              .get();

            if (transcripts.value && transcripts.value.length > 0) {
              console.log(`[MeetingService] Found ${transcripts.value.length} transcript(s) for "${meeting.subject}"`);

              await meetingStore.put({
                ...meeting,
                onlineMeetingId: om.id,
                status: 'completed',
                updatedAt: new Date().toISOString(),
              });

              const latest = transcripts.value[transcripts.value.length - 1];
              await transcriptService.fetchAndStore(meeting, latest.id);
              found++;
            }
          } catch (tErr: any) {
            if (tErr.statusCode !== 404) {
              console.warn(`[MeetingService] Transcript check error for ${om.id}: ${tErr.statusCode || tErr.message}`);
            }
          }
        }
      } catch (err: any) {
        // Log first error in detail for debugging
        if (checked === 1) {
          console.warn(`[MeetingService] JoinWebUrl filter for ${userEmail}: status=${err.statusCode}, code=${err.code}, msg=${(err.message || '').substring(0, 100)}`);
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }

    return found;
  },
};
