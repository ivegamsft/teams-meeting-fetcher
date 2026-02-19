/**
 * Azure Event Hub Client for Lambda
 * Allows Lambda to consume and process calendar change notifications from Event Hub
 */

const { EventHubConsumerClient, earliestEventPosition } = require('@azure/event-hubs');

class EventHubClient {
  constructor(config) {
    this.connectionString = config.connectionString;
    this.eventHubName = config.eventHubName;
    this.consumerGroup = config.consumerGroup || '$Default';
    this.client = null;
  }

  /**
   * Initialize the Event Hub consumer client
   */
  async connect() {
    try {
      if (!this.connectionString) {
        throw new Error('EVENT_HUB_CONNECTION_STRING not configured');
      }

      this.client = new EventHubConsumerClient(
        this.consumerGroup,
        this.connectionString
      );

      console.log(
        `✓ Connected to Event Hub: ${this.eventHubName} (consumer group: ${this.consumerGroup})`
      );
      return this.client;
    } catch (err) {
      console.error('Failed to connect to Event Hub:', err.message);
      throw err;
    }
  }

  /**
   * Receive messages from Event Hub
   * @param {Object} options - Configuration
   * @param {number} options.maxMessages - Maximum messages to receive (default: 100)
   * @param {number} options.maxWaitTimeInSeconds - Max wait time (default: 30)
   * @returns {Array} Array of received messages
   */
  async receiveMessages(options = {}) {
    if (!this.client) {
      await this.connect();
    }

    const {
      maxMessages = 100,
      maxWaitTimeInSeconds = 30,
    } = options;

    const messages = [];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(messages);
      }, maxWaitTimeInSeconds * 1000);

      (async () => {
        try {
          // Get partition IDs
          const partitionIds = await this.client.getPartitionIds();

          // Process messages from all partitions
          for (const partitionId of partitionIds) {
            const partitionReceiver = await this.client.subscribe(
              {
                processEvents: async (events, context) => {
                  for (const event of events) {
                    // Extract the change notification from Event Hub message
                    const notification = this.parseNotification(event);
                    messages.push(notification);

                    if (messages.length >= maxMessages) {
                      clearTimeout(timeout);
                      resolve(messages);
                      return;
                    }
                  }
                },
                processError: (err, context) => {
                  console.error('Error processing Event Hub message:', err);
                },
              },
              {
                startPosition: earliestEventPosition,
              }
            );
          }
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      })();
    });
  }

  /**
   * Parse a notification from Event Hub message
   * Graph API sends change notifications through Event Hub
   */
  parseNotification(event) {
    try {
      // Event Hub message body contains the change notification
      const body = event.body;
      const notification = typeof body === 'string' ? JSON.parse(body) : body;

      return {
        sequenceNumber: event.sequenceNumber,
        offset: event.offset,
        timestamp: new Date(event.enqueuedTimeUtc).toISOString(),
        data: notification, // The actual change notification
        partitionKey: event.partitionKey,
      };
    } catch (err) {
      console.error('Error parsing Event Hub notification:', err);
      return null;
    }
  }

  /**
   * Close the connection
   */
  async close() {
    if (this.client) {
      await this.client.close();
      console.log('Event Hub connection closed');
    }
  }
}

module.exports = EventHubClient;
