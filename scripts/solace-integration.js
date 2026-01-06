/**
 * Solace Integration for Train Monitoring System
 * 
 * This script provides integration with Solace PubSub+ broker running on local machine
 * with default settings for publishing and subscribing to train monitoring events.
 */

// Debug: Confirm this updated version is loading
console.log('🔧 Solace Integration Script Loaded - Version 20251022-2405 with CRITICAL FIX');

// Suppress verbose Solace library errors and show simplified messages
(function() {
    const originalConsoleError = console.error;
    console.error = function(...args) {
        const message = args.join(' ');
        
        // Suppress verbose Solace connection errors
        if (message.includes('WebSocket connection to') && message.includes('failed')) {
            // Extract just the essential error info
            const urlMatch = message.match(/WebSocket connection to '([^']+)'/);
            if (urlMatch) {
                // console.log('⚠️ Broker connection failed:', urlMatch[1]);
            }
            return;
        }
        
        // Suppress verbose HTTP connection errors
        if (message.includes('POST http://') && message.includes('net::ERR_NAME_NOT_RESOLVED')) {
            const urlMatch = message.match(/POST (http:\/\/[^\s]+)/);
            if (urlMatch) {
                // console.log('⚠️ Broker HTTP connection failed:', urlMatch[1]);
            }
            return;
        }
        
        // Suppress verbose Solace library stack traces
        if (message.includes('solclient.js:') && message.includes('connect @')) {
            return; // Skip verbose stack traces
        }
        
        // Suppress sessionEvent.getInfo errors
        if (message.includes('sessionEvent.getInfo is not a function')) {
            // console.log('⚠️ Solace session event error (handled gracefully)');
            return;
        }
        
        // Suppress verbose Solace library warnings
        if (message.includes('solclientjs:') && message.includes('WARN')) {
            return; // Skip verbose warnings
        }
        
        // Show other errors normally
        originalConsoleError.apply(console, args);
    };
})();

// Handle unhandled promise rejections gracefully
window.addEventListener('unhandledrejection', function(event) {
    const error = event.reason;
    if (error && error.message) {
        if (error.message.includes('Connection failed') || 
            error.message.includes('Solace connection timeout') ||
            error.message.includes('Broker connection failed')) {
            // console.log('⚠️ Broker connection issue (handled gracefully)');
            event.preventDefault(); // Prevent default error handling
        }
    }
});

// Handle general errors gracefully
window.addEventListener('error', function(event) {
    const error = event.error;
    if (error && error.message) {
        if (error.message.includes('sessionEvent.getInfo is not a function') ||
            error.message.includes('this.session.isConnected is not a function')) {
            // console.log('⚠️ Solace session error (handled gracefully)');
            event.preventDefault(); // Prevent default error handling
        }
    }
});

class SolaceTrainMonitor {
    constructor() {
        this.session = null;
        this.isConnected = false;
        this.subscriptions = new Set();
        this.messageHandlers = new Map();
        this.brokerType = 'unknown';
        this.broker = null;
        
        // Connection failure tracking
        this.solaceConnectionFailed = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 1; // Reduced to 1 attempt to fail fast
        this.lastConnectionAttempt = 0;
        this.connectionCooldown = 30000; // 30 seconds cooldown
        this.connectionStartTime = 0;
        this.isConnecting = false; // Prevent multiple simultaneous connection attempts
        this.notificationShown = false; // Prevent multiple notifications
        
        // Get broker configuration from external config file
        this.brokerConfig = this.getBrokerConfiguration();
        
        // console.log('🚂 SolaceTrainMonitor initialized with config:', this.brokerConfig);
    }

    /**
     * Get broker configuration from external config file
     * @returns {Object} Broker configuration object
     */
    getBrokerConfiguration() {
        // Check for stored broker configuration first
        if (typeof window !== 'undefined' && window.BrokerConfig) {
            const storedConfig = window.BrokerConfig.getStoredBrokerConfig();
            if (storedConfig) {
                if (storedConfig.brokerType === 'solace' && storedConfig.config) {
                    console.log('📋 Using stored Solace broker configuration');
                    // Ensure brokerType is included in the returned config
                    return {
                        ...storedConfig.config,
                        brokerType: 'solace'
                    };
                } else if (storedConfig.brokerType === 'inmemory') {
                    console.log('📋 Using stored in-memory broker configuration');
                    // Return in-memory broker config
                    return {
                        brokerType: 'inmemory',
                        url: 'ws://localhost:8008', // Not used for in-memory
                        vpnName: 'default',
                        userName: 'default',
                        password: 'default',
                        clientName: `train-monitor-${Date.now()}`,
                        connectionTimeout: 10000,
                        reconnectRetries: 5,
                        reconnectInterval: 3000,
                        logLevel: 'INFO'
                    };
                }
            }
            
            // Fallback to default configuration
            return window.BrokerConfig.getDefaultBrokerConfig();
        }
        
        // Fallback to default configuration if external config is not available
        // console.warn('⚠️ BrokerConfig not found, using fallback configuration');
        return {
            brokerType: 'solace', // Default to Solace if no config available
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
     * Initialize connection to broker (Solace or In-Memory)
     */
    async connect() {
        // Prevent multiple simultaneous connection attempts
        if (this.isConnecting) {
            // console.log('⏭️ Connection already in progress, skipping duplicate attempt');
            return this.isConnected;
        }
        
        this.isConnecting = true;
        
        try {
            // Check for stored broker type preference
            const storedConfig = window.BrokerConfig ? window.BrokerConfig.getStoredBrokerConfig() : null;
            const preferredBrokerType = storedConfig ? storedConfig.brokerType : null;
        
        // If user has explicitly configured a broker type, respect their choice
        if (preferredBrokerType === 'inmemory') {
            console.log('🧠 User configured in-memory broker - using in-memory broker');
            try {
                await this.connectToInMemoryBroker();
                this.brokerType = 'inmemory';
                window.brokerMode = 'inmemory';
                window.brokerConnected = true;
                this.updateBrokerStatusIndicator();
                console.log('✅ Connected to in-memory broker (user configured)');
                return true;
            } catch (error) {
                console.error('❌ Failed to connect to in-memory broker:', error);
                window.brokerConnected = false;
                this.updateBrokerStatusIndicator();
                throw error;
            }
        } else if (preferredBrokerType === 'solace') {
            console.log('☁️ User configured Solace broker - attempting Solace connection');
            console.log('🔍 Broker config for Solace connection:', this.brokerConfig);
            
            // Reset connection failure state since user explicitly chose Solace
            this.resetConnectionFailureState();
            
            // Actually attempt Solace connection since user explicitly chose it
            try {
                console.log('🔄 Attempting to connect to Solace broker (user configured)...');
                console.log('🔍 Using broker config:', this.brokerConfig);
                this.connectionStartTime = Date.now();
                await this.connectToSolace();
                
                // If successful, reset failure flag and set broker type
                console.log('✅ Solace broker connected successfully!');
                this.solaceConnectionFailed = false;
                this.connectionAttempts = 0;
                this.brokerType = 'solace';
                window.brokerMode = 'solace';
                window.brokerConnected = true;
                this.updateBrokerStatusIndicator();
                console.log('🔧 Broker state updated - type:', this.brokerType, 'mode:', window.brokerMode, 'connected:', window.brokerConnected);
                
                return true;
                
            } catch (error) {
                // Handle Solace connection failure
                console.log('❌ Solace connection failed, will fallback to in-memory broker:', error.message);
                console.log('🔍 Error details:', error);
                this.handleSolaceConnectionFailure();
                
                // Continue to fallback section below
            }
        } else if (this.shouldAttemptSolaceConnection()) {
            // Check if broker is likely unreachable for fast failure
            if (this.isBrokerLikelyUnreachable()) {
                // console.log('⏭️ Broker likely unreachable, skipping connection attempt');
                this.handleSolaceConnectionFailure();
            } else {
                try {
                    // First, try to connect to Solace broker
                    console.log('🔄 Attempting to connect to Solace broker...');
                    console.log('🔍 Using broker config:', this.brokerConfig);
                    this.connectionStartTime = Date.now();
                    await this.connectToSolace();
                    
                    // If successful, reset failure flag and set broker type
                    console.log('✅ Solace broker connected successfully!');
                    this.solaceConnectionFailed = false;
                    this.connectionAttempts = 0;
                    this.brokerType = 'solace';
                    window.brokerMode = 'solace';
                    window.brokerConnected = true;
                    this.updateBrokerStatusIndicator();
                    console.log('🔧 Broker state updated - type:', this.brokerType, 'mode:', window.brokerMode, 'connected:', window.brokerConnected);
                    
                    // Clear any stored in-memory preference since Solace is working
                    if (preferredBrokerType === 'inmemory') {
                        // console.log('🧹 Clearing stored in-memory preference since Solace broker is available');
                        this.clearStoredInMemoryPreference();
                    }
                    
                    // console.log('✅ Connected to Solace broker successfully - NOT using in-memory broker');
                    // console.log('🔍 Broker type set to:', this.brokerType);
                    // console.log('🔍 Global broker mode:', window.brokerMode);
                    return true;
                    
                } catch (error) {
                    // Handle Solace connection failure
                    console.log('❌ Solace connection failed, will fallback to in-memory broker:', error.message);
                    console.log('🔍 Error details:', error);
                    this.handleSolaceConnectionFailure();
                    
                    // If we've reached max attempts, the fallback will be handled by handleSolaceConnectionFailure
                    // If not, we'll continue to the fallback section below
                }
            }
        } else {
            // console.log('⏭️ Skipping Solace connection attempt (previous failures detected)');
        }
        
        // Fallback to in-memory broker (only if not already switched)
        if (this.brokerType !== 'inmemory') {
            try {
                console.log('🔄 FALLBACK: Connecting to in-memory broker (Solace connection failed or not attempted)...');
                await this.connectToInMemoryBroker();
                
                // Set broker type and update global state
                this.brokerType = 'inmemory';
                window.brokerMode = 'inmemory';
                window.brokerConnected = true;
                this.updateBrokerStatusIndicator();
                
                console.log('✅ FALLBACK: Connected to in-memory broker successfully');
                console.log('🔍 Broker type set to:', this.brokerType);
                console.log('🔍 Global broker mode:', window.brokerMode);
                return true;
                
            } catch (inMemoryError) {
                // console.error('❌ Failed to connect to in-memory broker:', inMemoryError);
                window.brokerConnected = false;
                this.updateBrokerStatusIndicator();
                throw inMemoryError;
            }
        } else {
            // console.log('✅ Already connected to in-memory broker');
            return true;
        }
        
        } catch (error) {
            console.error('❌ Connection failed:', error);
            // Ensure we're in a clean state
            this.brokerType = 'inmemory';
            window.brokerMode = 'inmemory';
            window.brokerConnected = false;
            this.updateBrokerStatusIndicator();
            throw error;
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * Clear stored in-memory broker preference
     */
    clearStoredInMemoryPreference() {
        try {
            const stored = localStorage.getItem('brokerConfig');
            if (stored) {
                const config = JSON.parse(stored);
                if (config.brokerType === 'inmemory') {
                    // Remove the stored preference to allow Solace connection on next load
                    localStorage.removeItem('brokerConfig');
                    // console.log('🧹 Cleared stored in-memory broker preference');
                }
            }
        } catch (error) {
            // console.warn('⚠️ Error clearing stored broker preference:', error);
        }
    }

    /**
     * Check if we should attempt Solace connection
     */
    shouldAttemptSolaceConnection() {
        const now = Date.now();
        
        console.log('🔍 shouldAttemptSolaceConnection() check:', {
            connectionAttempts: this.connectionAttempts,
            maxConnectionAttempts: this.maxConnectionAttempts,
            solaceConnectionFailed: this.solaceConnectionFailed,
            lastConnectionAttempt: this.lastConnectionAttempt,
            cooldownPeriod: this.connectionCooldown,
            timeSinceLastAttempt: now - this.lastConnectionAttempt
        });
        
        // If we've never failed, always try
        if (!this.solaceConnectionFailed) {
            console.log('✅ No previous failures, attempting Solace connection');
            return true;
        }
        
        // If we've failed but haven't exceeded max attempts, try again
        if (this.connectionAttempts < this.maxConnectionAttempts) {
            console.log('✅ Under max attempts, attempting Solace connection');
            return true;
        }
        
        // If we've exceeded max attempts, check cooldown period
        if (now - this.lastConnectionAttempt > this.connectionCooldown) {
            console.log('🔄 Cooldown period expired, resetting connection attempts');
            this.connectionAttempts = 0;
            this.solaceConnectionFailed = false;
            return true;
        }
        
        console.log('⏭️ Max attempts reached and still in cooldown, skipping Solace connection');
        return false;
    }

    /**
     * Check if broker is likely unreachable (for fast failure)
     */
    isBrokerLikelyUnreachable() {
        // Check if we're in a hosted environment trying to connect to localhost
        if (window.BrokerConfig && window.BrokerConfig.isHostedEnvironment()) {
            if (this.brokerConfig.url.includes('localhost') || this.brokerConfig.url.includes('127.0.0.1')) {
                // console.log('🌐 Hosted environment detected with localhost URL - likely unreachable');
                return true;
            }
        }
        
        // Check for obviously invalid URLs (like localhost1 typo)
        if (this.brokerConfig.url.includes('localhost1') || this.brokerConfig.url.includes('127.0.0.0')) {
            // console.log('❌ Invalid localhost URL detected - likely unreachable');
            return true;
        }
        
        // Check if we've had recent failures
        const now = Date.now();
        if (this.solaceConnectionFailed && (now - this.lastConnectionAttempt) < 5000) {
            return true;
        }
        
        return false;
    }

    /**
     * Handle Solace connection failure
     */
    handleSolaceConnectionFailure() {
        this.connectionAttempts++;
        this.lastConnectionAttempt = Date.now();
        
        if (this.connectionAttempts >= this.maxConnectionAttempts) {
            this.solaceConnectionFailed = true;
            // console.log(`❌ Solace broker connection failed after ${this.connectionAttempts} attempts. Switching to in-memory broker.`);
            // console.log(`⏰ Will retry Solace connection in ${this.connectionCooldown / 1000} seconds.`);
            
            // Automatically switch to in-memory broker
            this.switchToInMemoryBroker();
        } else {
            // console.log(`⚠️ Solace broker connection failed (attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}). Retrying...`);
        }
    }

    /**
     * Switch to in-memory broker and show notification
     */
    async switchToInMemoryBroker() {
        try {
            // console.log('🔄 Automatically switching to in-memory broker...');
            
            // Disconnect from Solace if connected
            if (this.session && this.isConnected) {
                try {
                    this.session.disconnect();
                } catch (e) {
                    // Ignore disconnect errors
                }
            }
            
            // Connect to in-memory broker
            await this.connectToInMemoryBroker();
            
            // Update broker state
            this.brokerType = 'inmemory';
            window.brokerMode = 'inmemory';
            window.brokerConnected = true;
            this.updateBrokerStatusIndicator();
            
            // console.log('✅ Successfully switched to in-memory broker');
            
            // Show popup notification for automatic fallback
            this.showBrokerSwitchNotification('automatic');
            
        } catch (error) {
            // console.error('❌ Failed to switch to in-memory broker:', error);
            window.brokerConnected = false;
            this.updateBrokerStatusIndicator();
        }
    }

    /**
     * Show popup notification for broker switch
     * @param {string} switchType - 'automatic' for fallback due to connection failure, 'manual' for user-initiated switch
     */
    showBrokerSwitchNotification(switchType = 'automatic') {
        // Prevent multiple notifications
        if (this.notificationShown) {
            // console.log('⏭️ Broker switch notification already shown, skipping duplicate');
            return;
        }
        
        this.notificationShown = true;
        
        // Create notification popup
        const notification = document.createElement('div');
        notification.id = 'broker-switch-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff6b35;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            max-width: 350px;
            border-left: 4px solid #ff4500;
            animation: slideInRight 0.3s ease-out;
        `;
        
        // Determine message content based on switch type
        let title, message, icon, backgroundColor, borderColor;
        
        if (switchType === 'automatic') {
            title = 'Broker Connection Switched';
            message = 'Solace broker connection failed. Automatically switched to <strong>In-Memory Broker</strong> for full functionality.';
            icon = '🧠';
            backgroundColor = '#ff6b35';
            borderColor = '#ff4500';
        } else {
            title = 'Broker Configuration Updated';
            message = 'Successfully switched to <strong>In-Memory Broker</strong> as configured.';
            icon = '✅';
            backgroundColor = '#28a745';
            borderColor = '#1e7e34';
        }
        
        // Update notification styling based on switch type
        notification.style.background = backgroundColor;
        notification.style.borderLeftColor = borderColor;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 18px; margin-right: 8px;">${icon}</span>
                <strong>${title}</strong>
            </div>
            <div style="font-size: 13px; line-height: 1.4;">
                ${message}
            </div>
            <div style="margin-top: 10px; font-size: 12px; opacity: 0.9;">
                Click the broker icon to configure connection settings.
            </div>
            <button onclick="this.parentElement.remove()" style="
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                color: white;
                font-size: 16px;
                cursor: pointer;
                opacity: 0.7;
            ">×</button>
        `;
        
        // Add CSS animation
        if (!document.getElementById('broker-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'broker-notification-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        // Add to page
        document.body.appendChild(notification);
        
        // Auto-remove after 8 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideOutRight 0.3s ease-in';
                setTimeout(() => {
                    if (notification.parentElement) {
                        notification.remove();
                    }
                }, 300);
            }
        }, 8000);
        
        // console.log('📢 Shown broker switch notification to user');
    }

    /**
     * Reset connection failure state (for manual retry)
     */
    resetConnectionFailureState() {
        console.log('🔄 Resetting connection failure state...');
        console.log('🔍 Previous state:', {
            solaceConnectionFailed: this.solaceConnectionFailed,
            connectionAttempts: this.connectionAttempts,
            lastConnectionAttempt: this.lastConnectionAttempt
        });
        
        this.solaceConnectionFailed = false;
        this.connectionAttempts = 0;
        this.lastConnectionAttempt = 0;
        
        console.log('✅ Connection failure state reset. Will attempt Solace connection on next connect.');
    }

    /**
     * Connect to Solace broker
     */
    async connectToSolace() {
        console.log('🔧 connectToSolace() called');
        console.log('🔍 Broker config:', this.brokerConfig);
        
        // Check if Solace library is available
        if (typeof solace === 'undefined') {
            console.error('❌ Solace library not available');
            throw new Error('Solace library not available');
        }

        console.log('🔧 Creating Solace session...');
        // Create session with minimal retry settings
            this.session = solace.SolclientFactory.createSession({
                url: this.brokerConfig.url,
                vpnName: this.brokerConfig.vpnName,
                userName: this.brokerConfig.userName,
                password: this.brokerConfig.password,
            clientName: this.brokerConfig.clientName + '-' + Date.now(),
            // Minimize retry attempts
            connectRetries: 1,
            connectTimeoutInMsecs: 5000,
            reconnectRetries: 0,
            reconnectRetryWaitInMsecs: 0
            });

            console.log('🔧 Setting up event handlers...');
            // Set up event handlers
            this.setupEventHandlers();

            console.log('🔧 Connecting to Solace broker...');
            // Connect to broker
            this.session.connect();
            
        // Wait for connection with shorter timeout
            return new Promise((resolve, reject) => {
                this.connectionPromise = { resolve, reject };
            
            // Set timeout for connection - very short timeout to fail fast
            setTimeout(() => {
                if (!this.isConnected) {
                    console.log('⏰ Solace connection timeout after 3 seconds');
                    // Force disconnect to stop internal retries
                    if (this.session) {
                        try {
                            this.session.disconnect();
                        } catch (e) {
                            // Ignore disconnect errors
                        }
                    }
                    reject(new Error('Solace connection timeout'));
                }
            }, 3000); // Reduced to 3 seconds for fast failure
        });
    }

    /**
     * Connect to in-memory broker
     */
    async connectToInMemoryBroker() {
        // Check if InMemoryBroker is available
        if (typeof window.InMemoryBroker === 'undefined') {
            throw new Error('InMemoryBroker not available');
        }
        
        // Create in-memory broker instance
        this.broker = new window.InMemoryBroker();
        
        // Connect to in-memory broker
        await this.broker.connect();
        
        // Set up message handling
        this.setupInMemoryMessageHandling();
        
        this.isConnected = true;
    }

    /**
     * Set up message handling for in-memory broker
     */
    setupInMemoryMessageHandling() {
        // Store message handlers for in-memory broker
        this.inMemoryMessageHandlers = new Map();
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
            // Handle sessionEvent safely - it might not have getInfo method
            let errorInfo = 'Unknown connection error';
            try {
                if (sessionEvent && typeof sessionEvent.getInfo === 'function') {
                    errorInfo = sessionEvent.getInfo();
                } else if (sessionEvent && sessionEvent.toString) {
                    errorInfo = sessionEvent.toString();
                }
            } catch (e) {
                errorInfo = 'Connection failed (unable to get error details)';
            }
            
            console.error('❌ Failed to connect to Solace broker:', errorInfo);
            this.isConnected = false;
            
            // Force disconnect to stop internal retries
            try {
                if (this.session && typeof this.session.disconnect === 'function') {
                    this.session.disconnect();
                }
            } catch (e) {
                // Ignore disconnect errors
            }
            
            if (this.connectionPromise) {
                this.connectionPromise.reject(new Error('Connection failed: ' + errorInfo));
            }
        });

        this.session.on(solace.SessionEventCode.DISCONNECTED, () => {
            // console.log('🔌 Disconnected from Solace broker');
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
                // console.warn('⚠️ Could not decode message payload:', payloadError);
                payload = 'Unable to decode payload';
            }

            // console.log('📨 Received message on topic:', topic, 'Payload:', payload);
            const binaryAttachment = message.getBinaryAttachment();
            // console.log('📨 Message details:', {
            //     hasBinaryAttachment: !!binaryAttachment,
            //     hasText: !!(message.getText && message.getText()),
            //     hasSdtContainer: !!(message.getSdtContainer && message.getSdtContainer()),
            //     binaryAttachmentType: binaryAttachment ? typeof binaryAttachment : 'none',
            //     binaryAttachmentConstructor: binaryAttachment ? binaryAttachment.constructor.name : 'none',
            //     binaryAttachmentLength: binaryAttachment ? binaryAttachment.length : 'none'
            // });

            // Call registered message handlers
            this.messageHandlers.forEach((handler, pattern) => {
                if (this.topicMatches(topic, pattern)) {
                    try {
                        handler(topic, payload, message);
                    } catch (error) {
                        // console.error('❌ Error in message handler for topic', pattern, ':', error);
                    }
                }
            });

        } catch (error) {
            // console.error('❌ Error handling incoming message:', error);
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
            throw new Error('Not connected to broker');
        }

        try {
            // console.log('🔍 Publishing message - Current broker type:', this.brokerType);
            if (this.brokerType === 'solace') {
                // Use Solace broker
                // console.log('📤 Using SOLACE broker for publishing');
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
                // console.log('📤 Published message to Solace broker topic:', topic, 'Payload:', payload);
                
            } else if (this.brokerType === 'inmemory') {
                // Use in-memory broker
                // console.log('📤 Using IN-MEMORY broker for publishing');
                await this.broker.publish(topic, payload, options);
                // console.log('📤 Published message to in-memory broker topic:', topic, 'Payload:', payload);
            } else {
                // console.error('❌ Unknown broker type:', this.brokerType);
            }
            
        } catch (error) {
            // console.error('❌ Failed to publish message:', error);
            throw error;
        }
    }

    /**
     * Subscribe to a topic with a message handler
     */
    async subscribe(topic, messageHandler) {
        if (!this.isConnected) {
            throw new Error('Not connected to broker');
        }

        try {
            if (this.brokerType === 'solace') {
                // Use Solace broker - check if session is ready
                if (!this.session || !this.isConnected) {
                    // console.log('⚠️ Solace session not ready, skipping subscription to:', topic);
                    return;
                }
                
                // Additional safety check - ensure session has the required methods
                if (typeof this.session.subscribe !== 'function') {
                    // console.log('⚠️ Solace session not properly initialized, skipping subscription to:', topic);
                    return;
                }
                
            const subscription = solace.SolclientFactory.createTopicDestination(topic);
            
            // Add subscription to session
            this.session.subscribe(subscription, true, topic, 10000);
            
            // Store subscription and handler
            this.subscriptions.add(topic);
            this.messageHandlers.set(topic, messageHandler);
            
                // console.log('📥 Subscribed to Solace broker topic:', topic);
                
            } else if (this.brokerType === 'inmemory') {
                // Use in-memory broker
                await this.broker.subscribe(topic, messageHandler);
                
                // Store subscription and handler
                this.subscriptions.add(topic);
                this.messageHandlers.set(topic, messageHandler);
                
                // console.log('📥 Subscribed to in-memory broker topic:', topic);
            }
            
        } catch (error) {
            // console.error('❌ Failed to subscribe to topic:', topic, error);
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
            
            // console.log('📤 Unsubscribed from topic:', topic);
            
        } catch (error) {
            // console.error('❌ Failed to unsubscribe from topic:', topic, error);
            throw error;
        }
    }

    /**
     * Disconnect from Solace broker
     */
    async disconnect() {
        console.log('🔌 disconnect() called');
        console.log('🔍 Current state:', {
            hasSession: !!this.session,
            isConnected: this.isConnected,
            brokerType: this.brokerType
        });
        
        if (this.session && this.isConnected) {
            try {
                console.log('🔄 Disconnecting from Solace broker...');
                this.session.disconnect();
                this.isConnected = false;
                console.log('✅ Disconnected from Solace broker');
            } catch (error) {
                console.error('❌ Error disconnecting from Solace broker:', error);
            }
        } else {
            console.log('⏭️ No active session to disconnect');
        }
        
        // Also disconnect in-memory broker if it exists
        if (this.broker && typeof this.broker.disconnect === 'function') {
            try {
                console.log('🔄 Disconnecting from in-memory broker...');
                await this.broker.disconnect();
                console.log('✅ Disconnected from in-memory broker');
            } catch (error) {
                console.error('❌ Error disconnecting from in-memory broker:', error);
            }
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            brokerType: this.brokerType,
            subscriptions: Array.from(this.subscriptions),
            brokerConfig: this.brokerConfig,
            connectionFailureInfo: {
                solaceConnectionFailed: this.solaceConnectionFailed,
                connectionAttempts: this.connectionAttempts,
                maxConnectionAttempts: this.maxConnectionAttempts,
                lastConnectionAttempt: this.lastConnectionAttempt,
                cooldownRemaining: Math.max(0, this.connectionCooldown - (Date.now() - this.lastConnectionAttempt))
            }
        };
    }

    /**
     * Manually retry Solace connection
     */
    async retrySolaceConnection() {
        // console.log('🔄 Manually retrying Solace connection...');
        this.resetConnectionFailureState();
        return await this.connect();
    }

    /**
     * Update broker status indicator in UI
     */
    updateBrokerStatusIndicator() {
        // console.log('🔄 Updating broker status indicator...', {
        //     brokerConnected: window.brokerConnected,
        //     brokerMode: window.brokerMode
        // });
        
        // Create or update the broker status indicator
        let indicator = document.getElementById('broker-status-indicator');
        
        if (!indicator) {
            // console.log('📌 Creating broker status indicator...');
            // Create the indicator if it doesn't exist
            indicator = document.createElement('div');
            indicator.id = 'broker-status-indicator';
            indicator.className = 'broker-status-indicator';
            indicator.innerHTML = `
                <img src="assets/images/broker.png" alt="Broker Status" />
                <span class="broker-tooltip">Broker Status</span>
            `;
            
            // Add click handler to open broker configuration dialog
            indicator.addEventListener('click', () => {
                console.log('🔧 Broker icon clicked - opening configuration dialog');
                console.log('🔧 window.openBrokerConfigDialog available:', typeof window.openBrokerConfigDialog);
                console.log('🔧 window.brokerConfigDialog available:', typeof window.brokerConfigDialog);
                
                if (window.openBrokerConfigDialog) {
                    window.openBrokerConfigDialog();
                } else if (window.brokerConfigDialog) {
                    console.log('🔧 Using direct dialog access');
                    window.brokerConfigDialog.openDialog();
                } else {
                    console.error('❌ Neither openBrokerConfigDialog function nor brokerConfigDialog available');
                    // Try to initialize the dialog on demand
                    console.log('🔧 Attempting to initialize dialog on demand');
                    try {
                        if (typeof BrokerConfigDialog !== 'undefined') {
                            window.brokerConfigDialog = new BrokerConfigDialog();
                            window.openBrokerConfigDialog = openBrokerConfigDialog;
                            window.closeBrokerConfigDialog = closeBrokerConfigDialog;
                            console.log('🔧 Dialog initialized on demand, opening now');
                            window.brokerConfigDialog.openDialog();
                        } else {
                            // Try to find and show the dialog directly
                            const dialog = document.getElementById('broker-config-dialog');
                            if (dialog) {
                                console.log('🔧 Found dialog element directly, showing it');
                                dialog.style.display = 'flex';
                                // Also try to load current config if dialog object exists
                                if (window.brokerConfigDialog && window.brokerConfigDialog.loadCurrentConfig) {
                                    window.brokerConfigDialog.loadCurrentConfig();
                                }
                            } else {
                                console.error('❌ Dialog element not found in DOM');
                                // List all elements with 'broker' in the id
                                const allElements = document.querySelectorAll('[id*="broker"]');
                                console.log('🔍 Elements with "broker" in ID:', Array.from(allElements).map(el => el.id));
                            }
                        }
                    } catch (error) {
                        console.error('❌ Error initializing dialog on demand:', error);
                    }
                }
            });
            
            // Add cursor pointer style
            indicator.style.cursor = 'pointer';
            
            document.body.appendChild(indicator);
            // console.log('✅ Broker status indicator created with click handler');
            
            // Small delay to ensure DOM elements are ready
            setTimeout(() => {
                this.updateIndicatorStatus(indicator);
            }, 10);
            return;
        }
        
        // Update the indicator based on broker status
        this.updateIndicatorStatus(indicator);
    }

    /**
     * Update indicator status (helper method)
     */
    updateIndicatorStatus(indicator) {
        if (window.brokerConnected) {
            if (window.brokerMode === 'solace') {
                indicator.className = 'broker-status-indicator connected';
                const tooltip = indicator.querySelector('.broker-tooltip');
                const img = indicator.querySelector('img');
                if (tooltip) tooltip.textContent = 'Connected to Solace Broker';
                if (img) img.style.filter = 'none'; // Green
                // console.log('🟢 Broker indicator set to Solace (green)');
            } else if (window.brokerMode === 'inmemory') {
                indicator.className = 'broker-status-indicator inmemory';
                const tooltip = indicator.querySelector('.broker-tooltip');
                const img = indicator.querySelector('img');
                if (tooltip) tooltip.textContent = 'Connected to In-Memory Broker';
                if (img) img.style.filter = 'grayscale(100%)'; // Gray
                // console.log('⚫ Broker indicator set to In-Memory (gray)');
            }
        } else {
            indicator.className = 'broker-status-indicator disconnected';
            const tooltip = indicator.querySelector('.broker-tooltip');
            const img = indicator.querySelector('img');
            if (tooltip) tooltip.textContent = 'Broker Disconnected';
            if (img) img.style.filter = 'grayscale(100%) brightness(0.5)'; // Dark gray
            // console.log('🔴 Broker indicator set to Disconnected (dark gray)');
        }
    }

    /**
     * Force create broker status indicator (for testing)
     */
    forceCreateBrokerIndicator() {
        // console.log('🔧 Force creating broker status indicator...');
        
        // Remove existing indicator if any
        const existing = document.getElementById('broker-status-indicator');
        if (existing) {
            existing.remove();
        }
        
        // Create new indicator
        const indicator = document.createElement('div');
        indicator.id = 'broker-status-indicator';
        indicator.className = 'broker-status-indicator';
        indicator.innerHTML = `
            <img src="assets/images/broker.png" alt="Broker Status" />
            <span class="broker-tooltip">Broker Status</span>
        `;
        document.body.appendChild(indicator);
        
        // Update it with current status
        this.updateBrokerStatusIndicator();
        
        // console.log('✅ Broker status indicator force created');
        return indicator;
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
        const topic = `tms/train/v1/departed/origin/${origin}/${trainNumber}/${destination}`;
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
        // console.log(`🚂 Published train departed origin event for train ${trainData.trainNumber}`);
    }

    /**
     * Publish train arrived at destination event
     */
    async publishTrainArrivedDestination(trainData) {
        const origin = trainData.origin || 'UNKNOWN';
        const trainNumber = trainData.trainNumber || 'UNKNOWN';
        const destination = trainData.destination || 'UNKNOWN';
        const topic = `tms/train/v1/arrived/destination/${origin}/${trainNumber}/${destination}`;
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
        // console.log(`🚂 Published train arrived destination event for train ${trainData.trainNumber}`);
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
        `tms/station/v1/stopped/${currentStation}/${previousStation}/${trainNumber}/${nextStation}` :
        `tms/station/v1/stopped/${currentStation}/${previousStation}/${trainNumber}/${currentStation}`;        
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
        // console.log(`🚂 Published train stopped at station event for train ${trainData.trainNumber}`);
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
        `tms/station/v1/arrived/${currentStation}/${previousStation}/${trainNumber}/${nextStation}` :
        `tms/station/v1/arrived/${currentStation}/${previousStation}/${trainNumber}/${currentStation}`;        
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
        // console.log(`🚂 Published train arrived at station event for train ${trainData.trainNumber}`);
    }

    /**
     * Publish train departed from station event
     */
    async publishTrainDepartedStation(trainData) {
        const currentStation = trainData.currentStation || 'UNKNOWN';
        const previousStation = trainData.previousStation || 'NONE';
        const trainNumber = trainData.trainNumber || 'UNKNOWN';
        const nextStation = trainData.nextStation || 'NONE';
        const topic = `tms/station/v1/departed/${currentStation}/${previousStation}/${trainNumber}/${nextStation}`;
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
        // console.log(`🚂 Published train departed from station event for train ${trainData.trainNumber}`);
    }

    /**
     * Subscribe to all train events with dedicated handler
     */
    async subscribeToTrainEvents(handler) {
        await this.subscribe('tms/train/v1/>', handler);
    }

    /**
     * Subscribe to all station events with dedicated handler
     */
    async subscribeToStationEvents(handler) {
        await this.subscribe('tms/station/v1/>', handler);
    }

    /**
     * Subscribe to all alert events with dedicated handler
     */
    async subscribeToAlertNotificationEvents(handler) {
        await this.subscribe('tms/alert/v1/notify/>', handler);
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
            // console.warn('⚠️ Solace library not loaded. Please include solace-web.js');
            return;
        }

        // Initialize Solace client
        solace.SolclientFactory.init({
            logLevel: solace.LogLevel.INFO
        });

        // Create global instance
        window.solaceTrainMonitor = new SolaceTrainMonitor();
        
        // Auto-connect based on stored user configuration or environment detection
        const storedConfig = window.BrokerConfig ? window.BrokerConfig.getStoredBrokerConfig() : null;
        console.log('🔍 Auto-connect check:', {
            storedConfig: storedConfig,
            brokerConfig: window.solaceTrainMonitor.brokerConfig,
            windowBrokerMode: window.brokerMode
        });
        
        // Determine broker type based on priority: stored config > environment default
        let targetBrokerType = 'solace'; // default fallback
        
        if (storedConfig && storedConfig.brokerType) {
            targetBrokerType = storedConfig.brokerType;
            console.log('🔧 Using stored broker configuration:', targetBrokerType);
        } else if (window.solaceTrainMonitor.brokerConfig.brokerType) {
            targetBrokerType = window.solaceTrainMonitor.brokerConfig.brokerType;
            console.log('🔧 Using environment default broker configuration:', targetBrokerType);
        }
        
        // Connect based on determined broker type
        if (targetBrokerType === 'inmemory') {
            console.log('🧠 Auto-connecting to in-memory broker');
            try {
                window.solaceTrainMonitor.brokerType = 'inmemory';
                window.brokerMode = 'inmemory';
                await window.solaceTrainMonitor.connectToInMemoryBroker();
                window.brokerConnected = true;
                window.solaceTrainMonitor.updateBrokerStatusIndicator();
                console.log('✅ Auto-connected to in-memory broker successfully');
            } catch (error) {
                console.error('❌ Failed to auto-connect to in-memory broker:', error);
                window.brokerConnected = false;
                window.solaceTrainMonitor.updateBrokerStatusIndicator();
            }
        } else {
            console.log('☁️ Auto-connecting to Solace broker');
            if (storedConfig && storedConfig.config) {
                console.log('🔍 Using stored Solace config:', storedConfig.config);
            }
            console.log('🔍 About to call connect() method...');
            // Use the connect() method which handles Solace connection and fallback
            window.solaceTrainMonitor.connect().then(() => {
                console.log('🔧 Connect() method completed');
            }).catch((error) => {
                console.error('❌ Connect() method failed:', error);
            });
        }
        
        // console.log('🚂 Solace integration ready. Use window.solaceTrainMonitor to interact with the broker.');
        
    } catch (error) {
        // console.error('❌ Failed to initialize Solace integration:', error);
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SolaceTrainMonitor;
}
