export interface MonitoredGroup {
  groupId: string;
  displayName: string;
  addedAt: string;
}

export interface AppConfig {
  config_key: string;
  tenantId: string;
  monitoredGroups: MonitoredGroup[];
  eventhubNamespace?: string;
  eventhubName?: string;
  monitoredMeetingsCount: number;
  transcriptionsProcessed: number;
  transcriptionsPending: number;
  createdAt: string;
  updatedAt: string;
}
