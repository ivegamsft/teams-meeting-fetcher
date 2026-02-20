// Setup helper for Event Hub-based workflow
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  nobots-eventhub - Setup Guide                                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('This workflow uses Azure Event Hub to receive Graph API notifications.');
console.log('');

console.log('📋 PREREQUISITES:\n');
console.log('1️⃣  Azure AD App Registration');
console.log('   - Create at: https://portal.azure.com');
console.log('   - Grant permissions:');
console.log('     • Calendars.Read (Application)');
console.log('     • OnlineMeetingTranscript.Read.All (Application)');
console.log('   - Grant admin consent');
console.log('');

console.log('2️⃣  Azure Event Hub');
console.log('   - Create Event Hub Namespace');
console.log('   - Create Event Hub called "teams-notifications"');
console.log('   - Get connection string with Send + Listen permissions');
console.log('');

console.log('3️⃣  Webhook Receiver (Required)');
console.log('   - Run: npm run webhook');
console.log('   - Expose via HTTPS (App Service, Functions, or tunnel)');
console.log('   - Notification URL: Your public webhook endpoint');
console.log('');
console.log('4️⃣  Microsoft Graph Subscription');
console.log('   - Notification URL: Your webhook endpoint');
console.log('   - Note: Graph API requires a validation response');
console.log('');

console.log('📝 CONFIGURATION:\n');
console.log('1. Copy .env.example to .env');
console.log('2. Fill in these values:');
console.log('   • GRAPH_TENANT_ID');
console.log('   • GRAPH_CLIENT_ID');
console.log('   • GRAPH_CLIENT_SECRET');
console.log('   • WATCH_USER_ID');
console.log('   • EVENT_HUB_NAMESPACE');
console.log('   • EVENT_HUB_NAME');
console.log('   • EVENT_HUB_CONNECTION_STRING');
console.log('   • WEBHOOK_URL');
console.log('   • NOTIFICATION_URL');
console.log('');

console.log('🚀 USAGE:\n');
console.log('1. Install dependencies:');
console.log('   npm install');
console.log('');
console.log('2. Start webhook receiver:');
console.log('   npm run webhook');
console.log('');
console.log('3. Create Graph API subscription:');
console.log('   npm run subscribe');
console.log('');
console.log('4. Start Event Hub consumer:');
console.log('   npm run process');
console.log('');

console.log('📌 IMPORTANT NOTES:\n');
console.log('• Subscriptions expire after 24 hours - run subscribe daily');
console.log('• Webhook must be publicly accessible for Graph API validation');
console.log('• Optional: forward webhook to Event Grid before Event Hub');
console.log('• Transcripts take 30-90 seconds to process after meeting ends');
console.log('');

console.log('🔗 Architecture:');
console.log('');
console.log('   Graph API');
console.log('      ↓ (webhook)');
console.log('   Webhook Receiver');
console.log('      ↓ (forward)');
console.log('   Event Hub');
console.log('      ↓ (consumer)');
console.log('   This Script → Download Transcript');
console.log('');
