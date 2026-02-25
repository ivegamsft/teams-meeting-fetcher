export interface AppConfig {
  id: string;
  tenantId: string;
  entraGroupId: string;
  webhookUrl: string;
  monitoredMeetingsCount: number;
  transcriptionsProcessed: number;
  transcriptionsPending: number;
  lastWebhookReceived?: string;
  createdAt: string;
  updatedAt: string;
}
