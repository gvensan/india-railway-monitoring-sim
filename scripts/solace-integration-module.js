/**
 * Train Monitoring System - Solace Integration Module
 * Handles external broker integration (Solace PubSub+ and in-memory broker)
 */

class SolaceIntegration {
    constructor(trainMonitor) {
        this.trainMonitor = trainMonitor;
        this.solaceConnected = false;
        this.solaceEnabled = false;
    }

    /**
     * Connect to Solace broker (or in-memory broker)
     * @returns {Promise<boolean>} Success status
     */
    async connectToSolace() {
        try {
            if (!window.solaceTrainMonitor) {
                // console.warn('⚠️ Solace integration not available');
                return false;
            }
            
            // Check broker type before attempting connection
            const brokerType = window.solaceTrainMonitor.brokerType || 'solace';
            // console.log(`🔄 Connecting to ${brokerType} broker...`);
            
            await window.solaceTrainMonitor.connect();
            this.solaceConnected = true;
            this.solaceEnabled = true;
            
            // Subscribe to train events for real-time updates
            await this.setupSolaceSubscriptions();
            
            // console.log(`✅ Connected to ${brokerType} broker successfully`);
            return true;
        } catch (error) {
            // console.error('❌ Failed to connect to Solace broker:', error);
            this.solaceConnected = false;
            this.solaceEnabled = false;
            return false;
        }
    }

    /**
     * Set up Solace subscriptions for train events
     */
    async setupSolaceSubscriptions() {
        if (!this.solaceConnected) return;
        
        // Check if Solace integration is ready and connected
        if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
            // console.log('⚠️ Solace integration not ready, skipping subscriptions');
            return;
        }
        
        try {
            // Note: Legacy train/status/* and train/position/* subscriptions removed
            // All train events are now handled through TMS topics (tms/train/*, tms/station/*, tms/alert/*)
            // console.log('✅ Solace subscriptions set up successfully (using TMS topics only)');
        } catch (error) {
            // console.error('❌ Failed to set up Solace subscriptions:', error);
        }
    }

    /**
     * Disconnect from Solace broker
     */
    async disconnectFromSolace() {
        if (this.solaceConnected && window.solaceTrainMonitor) {
            try {
                await window.solaceTrainMonitor.disconnect();
                this.solaceConnected = false;
                this.solaceEnabled = false;
                // console.log('✅ Disconnected from Solace broker');
            } catch (error) {
                // console.error('❌ Error disconnecting from Solace broker:', error);
            }
        }
    }

    /**
     * Get current Solace connection status
     * @returns {Object} Status information
     */
    getSolaceStatus() {
        return {
            enabled: this.solaceEnabled,
            connected: this.solaceConnected,
            brokerStatus: window.solaceTrainMonitor ? window.solaceTrainMonitor.getConnectionStatus() : null
        };
    }

    /**
     * Initialize Solace integration
     */
    async initializeSolace() {
        // Try to connect to broker (Solace or in-memory)
        try {
            // Check if Solace integration is available and what broker type is configured
            if (window.solaceTrainMonitor) {
                const brokerType = window.solaceTrainMonitor.brokerType || 'solace';
                // console.log(`🔄 Attempting to connect to ${brokerType} broker...`);
                
                const connected = await this.connectToSolace();
                if (connected) {
                    // console.log(`✅ ${brokerType} broker integration enabled - train events will be published to broker`);
                } else {
                    // console.log(`⚠️ ${brokerType} broker not available - continuing without real-time messaging`);
                }
            } else {
                // console.log('⚠️ Solace integration not available - continuing without real-time messaging');
            }
        } catch (error) {
            // console.error('❌ Error initializing Solace integration:', error);
        }
    }

    /**
     * Publish alert event to broker
     * @param {string} topic - Topic to publish to
     * @param {Object} payload - Event payload
     */
    async publishAlertEvent(topic, payload) {
        if (!this.solaceConnected || !window.solaceTrainMonitor) {
            // console.log('⚠️ Broker not connected, skipping event publication');
            return;
        }

        try {
            await window.solaceTrainMonitor.publish(topic, payload);
            // console.log(`📤 Published alert event to ${topic}:`, payload);
        } catch (error) {
            // console.error('❌ Failed to publish alert event:', error);
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SolaceIntegration;
}
