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
      await meetingStore.put({
        ...existing,
        changeType,
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
      joinWebUrl: eventData.onlineMeeting?.joinUrl || meeting.joinWebUrl || '',
      onlineMeetingId: eventData.onlineMeetingId || meeting.onlineMeetingId || '',
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
};
