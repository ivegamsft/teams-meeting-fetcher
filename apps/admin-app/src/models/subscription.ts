export type SubscriptionType = 'calendar' | 'callRecords' | 'transcripts' | 'recordings';

export interface Subscription {
  subscription_id: string;
  subscriptionType: SubscriptionType;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  clientState: string;
  expirationDateTime: string;
  renewalReminderAt: string;
  status: 'active' | 'expired' | 'error' | 'pending';
  createdAt: string;
  updatedAt: string;
  lastNotificationAt?: string;
  lastRenewalAt?: string;
  errorMessage?: string;
}

export interface CreateSubscriptionRequest {
  userId: string;
  userEmail: string;
  userDisplayName: string;
  resource?: string;
  changeType?: string;
  subscriptionType?: SubscriptionType;
}
