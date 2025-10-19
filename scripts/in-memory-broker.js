/**
 * In-Memory Broker for Train Monitoring System
 * 
 * This provides a Solace-compatible in-memory broker implementation
 * for demonstration purposes when the real Solace broker is unavailable.
 */

class InMemoryBroker {
    constructor() {
        this.isConnected = false;
        this.subscriptions = new Set();
        this.messageHandlers = new Map();
        this.messageHistory = new Map();
        this.maxHistoryPerTopic = 100; // Keep last 100 messages per topic
        // Optional delivery batching (feature-flagged) - will be disabled by default
        this._deliveryQueue = [];
        this._deliveryScheduled = false;
        this._deliveryBatchLimit = 200; // max callbacks per frame when batching
        
        // console.log('🧠 InMemoryBroker initialized');
    }

    /**
     * Simulate connection to broker
     */
    async connect() {
        return new Promise((resolve) => {
            // console.log('🔄 Connecting to in-memory broker...');
            
            // Simulate connection delay
            setTimeout(() => {
                this.isConnected = true;
                // console.log('✅ Connected to in-memory broker successfully');
                resolve();
            }, 100);
        });
    }

    /**
     * Publish a message to a topic
     */
    async publish(topic, payload, options = {}) {
        if (!this.isConnected) {
            throw new Error('Not connected to in-memory broker');
        }

        try {
            const message = {
                topic: topic,
                payload: payload,
                timestamp: new Date().toISOString(),
                options: options
            };

            // Store in message history
            this.storeMessage(topic, message);

            // Notify subscribers
            this.notifySubscribers(topic, payload, message);

            // console.log('📤 Published message to in-memory broker:', topic, payload);
            
        } catch (error) {
            // console.error('❌ Failed to publish message to in-memory broker:', error);
            throw error;
        }
    }

    /**
     * Subscribe to a topic with a message handler
     */
    async subscribe(topic, messageHandler) {
        if (!this.isConnected) {
            throw new Error('Not connected to in-memory broker');
        }

        try {
            // Store subscription and handler
            this.subscriptions.add(topic);
            this.messageHandlers.set(topic, messageHandler);
            
            // console.log('📥 Subscribed to in-memory broker topic:', topic);
            
            // Send recent message history to new subscriber
            this.sendMessageHistory(topic, messageHandler);
            
        } catch (error) {
            // console.error('❌ Failed to subscribe to in-memory broker topic:', topic, error);
            throw error;
        }
    }

    /**
     * Unsubscribe from a topic
     */
    async unsubscribe(topic) {
        if (!this.isConnected) {
            throw new Error('Not connected to in-memory broker');
        }

        try {
            this.subscriptions.delete(topic);
            this.messageHandlers.delete(topic);
            
            // console.log('📤 Unsubscribed from in-memory broker topic:', topic);
            
        } catch (error) {
            // console.error('❌ Failed to unsubscribe from in-memory broker topic:', topic, error);
            throw error;
        }
    }

    /**
     * Disconnect from broker
     */
    async disconnect() {
        if (this.isConnected) {
            try {
                // console.log('🔄 Disconnecting from in-memory broker...');
                this.isConnected = false;
                this.subscriptions.clear();
                this.messageHandlers.clear();
                // console.log('✅ Disconnected from in-memory broker');
            } catch (error) {
                // console.error('❌ Error disconnecting from in-memory broker:', error);
            }
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            subscriptions: Array.from(this.subscriptions),
            brokerType: 'in-memory',
            messageHistoryCount: Array.from(this.messageHistory.values()).reduce((sum, messages) => sum + messages.length, 0)
        };
    }

    /**
     * Store message in history
     */
    storeMessage(topic, message) {
        if (!this.messageHistory.has(topic)) {
            this.messageHistory.set(topic, []);
        }
        
        const messages = this.messageHistory.get(topic);
        messages.push(message);
        
        // Keep only recent messages
        if (messages.length > this.maxHistoryPerTopic) {
            messages.shift();
        }
    }

    /**
     * Send message history to new subscriber
     */
    sendMessageHistory(topic, messageHandler) {
        const messages = this.messageHistory.get(topic) || [];
        // Restore original behavior: last 5 messages
        const recentMessages = messages.slice(-5);
        recentMessages.forEach(message => {
            try {
                messageHandler(topic, message.payload, message);
            } catch (error) {
                // console.error('❌ Error sending message history:', error);
            }
        });
    }

    /**
     * Notify subscribers of new message
     */
    notifySubscribers(topic, payload, message) {
        // Find matching subscribers
        this.messageHandlers.forEach((handler, subscribedTopic) => {
            if (this.topicMatches(topic, subscribedTopic)) {
                try {
                    // Original behavior: async delivery per message
                    setTimeout(() => {
                        handler(topic, payload, message);
                    }, 10);
                } catch (error) {
                    // console.error('❌ Error in message handler for topic', subscribedTopic, ':', error);
                }
            }
        });
    }


    /**
     * Check if a topic matches a subscription pattern
     */
    topicMatches(topic, pattern) {
        // Handle Solace wildcard patterns
        if (pattern.includes('>')) {
            // '>' matches everything after this level
            const prefix = pattern.replace('>', '');
            return topic.startsWith(prefix);
        } else if (pattern.includes('*')) {
            // '*' matches single level
            const regex = new RegExp('^' + pattern.replace(/\*/g, '[^/]*') + '$');
            return regex.test(topic);
        }
        return topic === pattern;
    }

    // Solace-compatible methods for train monitoring


    /**
     * Get current time in human-readable 24-hour format
     */
    getCurrentTime() {
        return new Date().toLocaleString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).replace(/,/g, '');
    }

    /**
     * Publish train departed from origin event
     */
    async publishTrainDepartedOrigin(trainData) {
        const origin = trainData.origin || 'UNKNOWN';
        const trainNumber = trainData.trainNumber || 'UNKNOWN';
        const destination = trainData.destination || 'UNKNOWN';
        const topic = `tms/train/departed/origin/${origin}/${trainNumber}/${destination}`;
        const payload = {
            status: "departed",
            origin: trainData.origin,
            originName: trainData.originName,
            destination: trainData.destination,
            destinationName: trainData.destinationName,
            currentStation: trainData.origin,
            nextStation: trainData.nextStation,
            previousStation: null,
            distanceTraveled: trainData.distanceTraveled || 0,
            trainNumber: trainData.trainNumber,
            trainName: trainData.trainName,
            time: this.getCurrentTime()
        };
        
        await this.publish(topic, JSON.stringify(payload));
        // console.log(`🚂 Published train departed origin event to in-memory broker for train ${trainData.trainNumber}`);
    }

    /**
     * Publish train arrived at destination event
     */
    async publishTrainArrivedDestination(trainData) {
        const origin = trainData.origin || 'UNKNOWN';
        const trainNumber = trainData.trainNumber || 'UNKNOWN';
        const destination = trainData.destination || 'UNKNOWN';
        const topic = `tms/train/arrived/destination/${origin}/${trainNumber}/${destination}`;
        const payload = {
            status: "arrived",
            origin: trainData.origin,
            originName: trainData.originName,
            destination: trainData.destination,
            destinationName: trainData.destinationName,
            currentStation: trainData.destination,
            nextStation: null,
            previousStation: trainData.previousStation,
            distanceTraveled: trainData.distanceTraveled || 0,
            trainNumber: trainData.trainNumber,
            trainName: trainData.trainName,
            time: this.getCurrentTime()
        };
        
        await this.publish(topic, JSON.stringify(payload));
        // console.log(`🚂 Published train arrived destination event to in-memory broker for train ${trainData.trainNumber}`);
    }

    /**
     * Publish train stopped at station event
     */
    async publishTrainStoppedStation(trainData) {
        const currentStation = trainData.currentStation || 'UNKNOWN';
        const previousStation = trainData.previousStation || 'NONE';
        const trainNumber = trainData.trainNumber || 'UNKNOWN';
        const nextStation = trainData.nextStation || 'NONE';
        const topic = trainData.nextStation ?
        `tms/station/stopped/${currentStation}/${previousStation}/${trainNumber}/${nextStation}` :
        `tms/station/stopped/${currentStation}/${previousStation}/${trainNumber}/${currentStation}`;        
        const payload = {
            status: "stopped",
            previousStation: trainData.previousStation,
            previousStationName: trainData.previousStationName,
            currentStation: trainData.currentStation,
            currentStationName: trainData.currentStationName,
            nextStation: trainData.nextStation,
            nextStationName: trainData.nextStationName,
            distanceTraveled: trainData.distanceTraveled || 0,
            trainNumber: trainData.trainNumber,
            trainName: trainData.trainName,
            time: this.getCurrentTime()
        };
        
        await this.publish(topic, JSON.stringify(payload));
        // console.log(`🚂 Published train stopped at station event to in-memory broker for train ${trainData.trainNumber}`);
    }

    /**
     * Publish train arrived at station event
     */
    async publishTrainArrivedStation(trainData) {
        const currentStation = trainData.currentStation || 'UNKNOWN';
        const previousStation = trainData.previousStation || 'NONE';
        const trainNumber = trainData.trainNumber || 'UNKNOWN';
        const nextStation = trainData.nextStation || 'NONE';
        const topic = trainData.nextStation ?
        `tms/station/arrived/${currentStation}/${previousStation}/${trainNumber}/${nextStation}` :
        `tms/station/arrived/${currentStation}/${previousStation}/${trainNumber}/${currentStation}`;        
        const payload = {
            status: "arrived",
            previousStation: trainData.previousStation,
            previousStationName: trainData.previousStationName,
            currentStation: trainData.currentStation,
            currentStationName: trainData.currentStationName,
            nextStation: trainData.nextStation,
            nextStationName: trainData.nextStationName,
            distanceTraveled: trainData.distanceTraveled || 0,
            trainNumber: trainData.trainNumber,
            trainName: trainData.trainName,
            time: this.getCurrentTime()
        };
        
        await this.publish(topic, JSON.stringify(payload));
        // console.log(`🚂 Published train arrived at station event to in-memory broker for train ${trainData.trainNumber}`);
    }

    /**
     * Publish train departed from station event
     */
    async publishTrainDepartedStation(trainData) {
        const currentStation = trainData.currentStation || 'UNKNOWN';
        const previousStation = trainData.previousStation || 'NONE';
        const trainNumber = trainData.trainNumber || 'UNKNOWN';
        const nextStation = trainData.nextStation || 'NONE';
        const topic = `tms/station/departed/${currentStation}/${previousStation}/${trainNumber}/${nextStation}`;
        const payload = {
            status: "departed",
            previousStation: trainData.previousStation,
            previousStationName: trainData.previousStationName,
            currentStation: trainData.currentStation,
            currentStationName: trainData.currentStationName,
            nextStation: trainData.nextStation,
            nextStationName: trainData.nextStationName,
            distanceTraveled: trainData.distanceTraveled || 0,
            trainNumber: trainData.trainNumber,
            trainName: trainData.trainName,
            time: this.getCurrentTime()
        };
        
        await this.publish(topic, JSON.stringify(payload));
        // console.log(`🚂 Published train departed from station event to in-memory broker for train ${trainData.trainNumber}`);
    }

    /**
     * Subscribe to all train events with dedicated handler
     */
    async subscribeToTrainEvents(handler) {
        await this.subscribe('tms/train/>', handler);
    }

    /**
     * Subscribe to all station events with dedicated handler
     */
    async subscribeToStationEvents(handler) {
        await this.subscribe('tms/station/>', handler);
    }

    /**
     * Subscribe to all alert events with dedicated handler
     */
    async subscribeToAlertNotificationEvents(handler) {
        await this.subscribe('tms/alert/notify/>', handler);
    }

    /**
     * Subscribe to all TMS events (train, station, alert)
     */
    async subscribeToAllTMSEvents(handler) {
        await this.subscribe('tms/>', handler);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = InMemoryBroker;
}

// Make available globally for browser usage
if (typeof window !== 'undefined') {
    window.InMemoryBroker = InMemoryBroker;
}
