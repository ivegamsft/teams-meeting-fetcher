export interface Attendee {
  id: string;
  email: string;
  displayName: string;
  role: 'organizer' | 'required' | 'optional';
  status: 'accepted' | 'declined' | 'tentative' | 'notResponded';
}

export interface Meeting {
  meeting_id: string;
  tenantId: string;
  subject: string;
  description: string;
  startTime: string;
  endTime: string;
  organizerId: string;
  organizerEmail: string;
  organizerDisplayName: string;
  attendees: Attendee[];
  recordingUrl?: string;
  status: 'scheduled' | 'recording' | 'transcript_pending' | 'completed' | 'failed' | 'cancelled';
  transcriptionId?: string;
  subscriptionId: string;
  joinWebUrl?: string;
  onlineMeetingId?: string;
  createdAt: string;
  updatedAt: string;
}
