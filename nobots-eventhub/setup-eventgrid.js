// Create Event Grid subscription to route events to Event Hub
const { EventGrid } = require('@azure/eventgrid');
const config = require('./config');

async function createEventGridSubscription() {
  console.log('🔌 Setting up Event Grid subscription to Event Hub...\n');

  if (!config.eventGridTopicEndpoint || !config.eventGridTopicKey) {
    console.error(
      '❌ Event Grid not configured. Check EVENT_GRID_TOPIC_ENDPOINT and EVENT_GRID_TOPIC_KEY in .env\n'
    );
    process.exit(1);
  }

  console.log('   Event Grid Topic: tmf-egt-eus-6an5wk');
  console.log('   Destination: Event Hub');
  console.log('   Event Hub: ' + config.eventHubName);
  console.log('');

  // Note: Event Grid subscription creation requires Azure CLI or Portal
  // because it requires Azure Resource Manager access, not just the Event Grid Data Plane API

  console.log('📝 To create the Event Grid subscription manually, run:\n');
  console.log('az eventgrid event-subscription create \\');
  console.log('  --name "tm-eventhub-subscription" \\');
  console.log(
    '  --source-resource-id "/subscriptions/844eabcc-dc96-453b-8d45-bef3d566f3f8/resourceGroups/tmf-rg-eus-6an5wk/providers/Microsoft.EventGrid/topics/tmf-egt-eus-6an5wk" \\'
  );
  console.log('  --endpoint-type eventhub \\');
  console.log(
    '  --endpoint "/subscriptions/844eabcc-dc96-453b-8d45-bef3d566f3f8/resourceGroups/tmf-rg-eus-6an5wk/providers/Microsoft.EventHub/namespaces/tmf-ehns-eus-6an5wk/eventhubs/tmf-eh-eus-6an5wk" \\'
  );
  console.log('  --included-event-types "All" \\');
  console.log('  --subject-begins-with "graph"');
  console.log('');

  console.log('Or via Azure Portal:');
  console.log('1. Go to Event Grid Topic: tmf-egt-eus-6an5wk');
  console.log('2. Click "Create" → "Event Subscription"');
  console.log('3. Endpoint type: Event Hub');
  console.log('4. Select Event Hub: tmf-eh-eus-6an5wk');
  console.log('');
}

createEventGridSubscription();
