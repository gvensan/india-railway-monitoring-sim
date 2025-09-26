/**
 * Solace Integration for Train Monitoring System
 * 
 * This script provides integration with Solace PubSub+ broker running on local machine
 * with default settings for publishing and subscribing to train monitoring events.
 */

class SolaceTrainMonitor {
    constructor() {
        this.session = null;
        this.isConnected = false;
        this.subscriptions = new Set();
        this.messageHandlers = new Map();
        
        // Get broker configuration from external config file
        this.brokerConfig = this.getBrokerConfiguration();
        
        console.log('🚂 SolaceTrainMonitor initialized with config:', this.brokerConfig);
    }

    /**
     * Get broker configuration from external config file
     * @returns {Object} Broker configuration object
     */
    getBrokerConfiguration() {
        // Check if BrokerConfig is available globally
        if (typeof window !== 'undefined' && window.BrokerConfig) {
            return window.BrokerConfig.getDefaultBrokerConfig();
        }
        
        // Fallback to default configuration if external config is not available
        console.warn('⚠️ BrokerConfig not found, using fallback configuration');
        return {
            url: 'ws://localhost:8008',
            vpnName: 'default',
            userName: 'default',
            password: 'default',
            clientName: 'train-monitor-' + Date.now(),
            connectionTimeout: 10000,
            reconnectRetries: 5,
            reconnectInterval: 3000,
            logLevel: 'INFO'
        };
    }

    /**
     * Initialize connection to Solace broker
     */
    async connect() {
        try {
            console.log('🔄 Connecting to Solace broker...');
            
            // Create session
            this.session = solace.SolclientFactory.createSession({
                url: this.brokerConfig.url,
                vpnName: this.brokerConfig.vpnName,
                userName: this.brokerConfig.userName,
                password: this.brokerConfig.password,
                clientName: this.brokerConfig.clientName
            });

            // Set up event handlers
            this.setupEventHandlers();

            // Connect to broker
            this.session.connect();
            
            return new Promise((resolve, reject) => {
                this.connectionPromise = { resolve, reject };
            });
            
        } catch (error) {
            console.error('❌ Failed to connect to Solace broker:', error);
            throw error;
        }
    }

    /**
     * Set up event handlers for Solace session
     */
    setupEventHandlers() {
        this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
            console.log('✅ Connected to Solace broker successfully');
            this.isConnected = true;
            if (this.connectionPromise) {
                this.connectionPromise.resolve();
            }
        });

        this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (sessionEvent) => {
            console.error('❌ Failed to connect to Solace broker:', sessionEvent.getInfo());
            this.isConnected = false;
            if (this.connectionPromise) {
                this.connectionPromise.reject(new Error('Connection failed: ' + sessionEvent.getInfo()));
            }
        });

        this.session.on(solace.SessionEventCode.DISCONNECTED, () => {
            console.log('🔌 Disconnected from Solace broker');
            this.isConnected = false;
        });

        this.session.on(solace.SessionEventCode.MESSAGE, (message) => {
            this.handleIncomingMessage(message);
        });
    }

    /**
     * Handle incoming messages from subscriptions
     */
    handleIncomingMessage(message) {
        try {
            const topic = message.getDestination().getName();
            let payload = 'No payload';

            // Try to get payload from different sources
            try {
                const binaryAttachment = message.getBinaryAttachment();
                if (binaryAttachment) {
                    // Handle different types of binary attachments
                    if (binaryAttachment instanceof ArrayBuffer) {
                        payload = new TextDecoder().decode(binaryAttachment);
                    } else if (binaryAttachment instanceof Uint8Array) {
                        payload = new TextDecoder().decode(binaryAttachment);
                    } else if (binaryAttachment.buffer instanceof ArrayBuffer) {
                        payload = new TextDecoder().decode(binaryAttachment.buffer);
                    } else {
                        payload = JSON.parse(binaryAttachment);
                    }
                } else if (message.getSdtContainer && message.getSdtContainer()) {
                    payload = JSON.stringify(message.getSdtContainer());
                } else {
                    // Try to get text content as fallback
                    if (message.getText && message.getText()) {
                        payload = message.getText();
                    }
                }
            } catch (payloadError) {
                console.warn('⚠️ Could not decode message payload:', payloadError);
                payload = 'Unable to decode payload';
            }

            console.log('📨 Received message on topic:', topic, 'Payload:', payload);
            const binaryAttachment = message.getBinaryAttachment();
            console.log('📨 Message details:', {
                hasBinaryAttachment: !!binaryAttachment,
                hasText: !!(message.getText && message.getText()),
                hasSdtContainer: !!(message.getSdtContainer && message.getSdtContainer()),
                binaryAttachmentType: binaryAttachment ? typeof binaryAttachment : 'none',
                binaryAttachmentConstructor: binaryAttachment ? binaryAttachment.constructor.name : 'none',
                binaryAttachmentLength: binaryAttachment ? binaryAttachment.length : 'none'
            });

            // Call registered message handlers
            this.messageHandlers.forEach((handler, pattern) => {
                if (this.topicMatches(topic, pattern)) {
                    try {
                        handler(topic, payload, message);
                    } catch (error) {
                        console.error('❌ Error in message handler for topic', pattern, ':', error);
                    }
                }
            });

        } catch (error) {
            console.error('❌ Error handling incoming message:', error);
        }
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

    /**
     * Publish a message to a topic
     */
    async publish(topic, payload, options = {}) {
        if (!this.isConnected) {
            throw new Error('Not connected to Solace broker');
        }

        try {
            const message = solace.SolclientFactory.createMessage();
            
            // Set destination topic
            message.setDestination(solace.SolclientFactory.createTopicDestination(topic));
            
            // Set payload using binary attachment
            if (typeof payload === 'string') {
                message.setBinaryAttachment(new TextEncoder().encode(payload));
            } else if (typeof payload === 'object') {
                message.setBinaryAttachment(new TextEncoder().encode(JSON.stringify(payload)));
            } else {
                message.setBinaryAttachment(new TextEncoder().encode(String(payload)));
            }

            // Set additional properties if provided
            if (options.contentType) {
                message.setUserProperty('contentType', options.contentType);
            }
            if (options.correlationId) {
                message.setCorrelationId(options.correlationId);
            }

            // Publish message
            this.session.send(message);
            console.log('📤 Published message to topic:', topic, 'Payload:', payload);
            
        } catch (error) {
            console.error('❌ Failed to publish message:', error);
            throw error;
        }
    }

    /**
     * Subscribe to a topic with a message handler
     */
    async subscribe(topic, messageHandler) {
        if (!this.isConnected) {
            throw new Error('Not connected to Solace broker');
        }

        try {
            // Create subscription
            const subscription = solace.SolclientFactory.createTopicDestination(topic);
            
            // Add subscription to session
            this.session.subscribe(subscription, true, topic, 10000);
            
            // Store subscription and handler
            this.subscriptions.add(topic);
            this.messageHandlers.set(topic, messageHandler);
            
            console.log('📥 Subscribed to topic:', topic);
            
        } catch (error) {
            console.error('❌ Failed to subscribe to topic:', topic, error);
            throw error;
        }
    }

    /**
     * Unsubscribe from a topic
     */
    async unsubscribe(topic) {
        if (!this.isConnected) {
            throw new Error('Not connected to Solace broker');
        }

        try {
            const subscription = solace.SolclientFactory.createTopicSubscription(topic);
            this.session.unsubscribe(subscription, true, topic, 10000);
            
            this.subscriptions.delete(topic);
            this.messageHandlers.delete(topic);
            
            console.log('📤 Unsubscribed from topic:', topic);
            
        } catch (error) {
            console.error('❌ Failed to unsubscribe from topic:', topic, error);
            throw error;
        }
    }

    /**
     * Disconnect from Solace broker
     */
    async disconnect() {
        if (this.session && this.isConnected) {
            try {
                console.log('🔄 Disconnecting from Solace broker...');
                this.session.disconnect();
                this.isConnected = false;
                console.log('✅ Disconnected from Solace broker');
            } catch (error) {
                console.error('❌ Error disconnecting from Solace broker:', error);
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
            brokerConfig: this.brokerConfig
        };
    }

    /**
     * Publish train status update
     */
    async publishTrainStatus(trainNumber, status, data) {
        const topic = `train/status/${trainNumber}`;
        const payload = {
            trainNumber,
            status,
            timestamp: new Date().toISOString(),
            data
        };
        
        await this.publish(topic, payload, {
            contentType: 'application/json',
            correlationId: `train-${trainNumber}-${Date.now()}`
        });
    }

    /**
     * Publish train position update
     */
    async publishTrainPosition(trainNumber, position, speed, station) {
        const topic = `train/position/${trainNumber}`;
        const payload = {
            trainNumber,
            position: {
                lat: position.lat,
                lng: position.lng
            },
            speed,
            station,
            timestamp: new Date().toISOString()
        };
        
        await this.publish(topic, payload, {
            contentType: 'application/json',
            correlationId: `position-${trainNumber}-${Date.now()}`
        });
    }

    /**
     * Subscribe to all train status updates
     */
    async subscribeToAllTrainStatus(handler) {
        await this.subscribe('train/status/*', handler);
    }

    /**
     * Subscribe to specific train status
     */
    async subscribeToTrainStatus(trainNumber, handler) {
        await this.subscribe(`train/status/${trainNumber}`, handler);
    }

    /**
     * Subscribe to all train position updates
     */
    async subscribeToAllTrainPositions(handler) {
        await this.subscribe('train/position/*', handler);
    }

    /**
     * Subscribe to specific train position
     */
    async subscribeToTrainPosition(trainNumber, handler) {
        await this.subscribe(`train/position/${trainNumber}`, handler);
    }

    /**
     * Get current time in human-readable 24-hour format
     * @returns {string} Formatted time string
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
        console.log(`🚂 Published train departed origin event for train ${trainData.trainNumber}`);
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
        console.log(`🚂 Published train arrived destination event for train ${trainData.trainNumber}`);
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
        console.log(`🚂 Published train stopped at station event for train ${trainData.trainNumber}`);
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
        console.log(`🚂 Published train arrived at station event for train ${trainData.trainNumber}`);
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
        console.log(`🚂 Published train departed from station event for train ${trainData.trainNumber}`);
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

// Global instance
window.solaceTrainMonitor = null;

// Initialize Solace when the library is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check if Solace library is available
        if (typeof solace === 'undefined') {
            console.warn('⚠️ Solace library not loaded. Please include solace-web.js');
            return;
        }

        // Initialize Solace client
        solace.SolclientFactory.init({
            logLevel: solace.LogLevel.INFO
        });

        // Create global instance
        window.solaceTrainMonitor = new SolaceTrainMonitor();
        
        console.log('🚂 Solace integration ready. Use window.solaceTrainMonitor to interact with the broker.');
        
    } catch (error) {
        console.error('❌ Failed to initialize Solace integration:', error);
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SolaceTrainMonitor;
}
