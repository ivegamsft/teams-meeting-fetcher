import { v4 as uuidv4 } from 'uuid';
import { getGraphClient } from '../config/graph';
import { config } from '../config';
import { Meeting } from '../models';
import { meetingStore } from './meetingStore';
import { transcriptService } from './transcriptService';
import { configStore } from './configStore';

export const meetingService = {
  async processNotification(notification: any): Promise<void> {
    const { resource, changeType, subscriptionId } = notification;

    if (changeType === 'deleted') {
      const existingMeeting = await this.findMeetingByResource(resource);
      if (existingMeeting) {
        await meetingStore.updateStatus(existingMeeting.meeting_id, 'cancelled');
      }
      return;
    }

    const client = getGraphClient();
    let eventData: any;
    try {
      eventData = await client.api(`/${resource}`).get();
    } catch (err: any) {
      console.error(`Failed to fetch event details for ${resource}:`, err.message);
      return;
    }

    const existingMeeting = await this.findMeetingByResource(resource);

    if (existingMeeting) {
      await this.updateMeeting(existingMeeting, eventData);
    } else {
      await this.createMeeting(eventData, subscriptionId, resource);
    }
  },

  async createMeeting(eventData: any, subscriptionId: string, resource: string): Promise<Meeting> {
    const now = new Date().toISOString();
    const meeting: Meeting = {
      meeting_id: eventData.id || uuidv4(),
      tenantId: config.graph.tenantId,
      subject: eventData.subject || 'Untitled Meeting',
      description: eventData.bodyPreview || '',
      startTime: eventData.start?.dateTime || now,
      endTime: eventData.end?.dateTime || now,
      organizerId: eventData.organizer?.emailAddress?.address || '',
      organizerEmail: eventData.organizer?.emailAddress?.address || '',
      organizerDisplayName: eventData.organizer?.emailAddress?.name || '',
      attendees: (eventData.attendees || []).map((a: any) => ({
        id: a.emailAddress?.address || '',
        email: a.emailAddress?.address || '',
        displayName: a.emailAddress?.name || '',
        role: a.type === 'required' ? 'required' : a.type === 'optional' ? 'optional' : 'required',
        status: a.status?.response || 'notResponded',
      })),
      status: eventData.isOnlineMeeting ? 'scheduled' : 'scheduled',
      subscriptionId,
      joinWebUrl: eventData.onlineMeeting?.joinUrl || '',
      onlineMeetingId: eventData.onlineMeetingId || '',
      createdAt: now,
      updatedAt: now,
    };

    await meetingStore.put(meeting);
    await configStore.incrementCounter('monitoredMeetingsCount', 1);

    if (eventData.isOnlineMeeting && eventData.onlineMeetingId) {
      this.checkForTranscript(meeting).catch(err =>
        console.error(`Transcript check failed for meeting ${meeting.meeting_id}:`, err.message)
      );
    }

    return meeting;
  },

  async updateMeeting(existing: Meeting, eventData: any): Promise<void> {
    if (eventData.isCancelled) {
      await meetingStore.updateStatus(existing.meeting_id, 'cancelled');
      return;
    }

    const updated: Meeting = {
      ...existing,
      subject: eventData.subject || existing.subject,
      startTime: eventData.start?.dateTime || existing.startTime,
      endTime: eventData.end?.dateTime || existing.endTime,
      attendees: (eventData.attendees || []).map((a: any) => ({
        id: a.emailAddress?.address || '',
        email: a.emailAddress?.address || '',
        displayName: a.emailAddress?.name || '',
        role: a.type === 'required' ? 'required' : 'optional',
        status: a.status?.response || 'notResponded',
      })),
      updatedAt: new Date().toISOString(),
    };

    await meetingStore.put(updated);

    if (eventData.isOnlineMeeting && !existing.transcriptionId) {
      this.checkForTranscript(updated).catch(err =>
        console.error(`Transcript check failed for meeting ${updated.meeting_id}:`, err.message)
      );
    }
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
};
