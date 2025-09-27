/**
 * Broker Configuration for Train Monitoring System
 * 
 * This file contains the configuration settings for the Solace PubSub+ broker
 * connection. Modify these settings to match your broker environment.
 */

// Default Solace broker configuration
const BROKER_CONFIG = {
    // Broker connection URL
    url: 'ws://localhost:8008',
    
    // VPN (Virtual Private Network) name
    vpnName: 'default',
    
    // Authentication credentials
    userName: 'default',
    password: 'default',
    
    // Client name (will be appended with timestamp for uniqueness)
    clientName: 'train-monitor',
    
    // Connection timeout (in milliseconds)
    connectionTimeout: 10000,
    
    // Reconnection settings
    reconnectRetries: 5,
    reconnectInterval: 3000,
    
    // Log level for Solace client
    logLevel: 'INFO'
};

// Environment-specific configurations
const ENVIRONMENT_CONFIGS = {
    development: {
        url: 'ws://localhost1:8008',
        vpnName: 'default',
        userName: 'default',
        password: 'default'
    },
    
    staging: {
        url: 'ws://staging-broker.example.com:8008',
        vpnName: 'staging',
        userName: 'staging_user',
        password: 'staging_password'
    },
    
    production: {
        url: 'wss://prod-broker.example.com:8443',
        vpnName: 'production',
        userName: 'prod_user',
        password: 'prod_password'
    }
};

/**
 * Get broker configuration for the specified environment
 * @param {string} environment - Environment name (development, staging, production)
 * @returns {Object} Broker configuration object
 */
function getBrokerConfig(environment = 'development') {
    const baseConfig = { ...BROKER_CONFIG };
    const envConfig = ENVIRONMENT_CONFIGS[environment] || ENVIRONMENT_CONFIGS.development;
    
    // Merge environment-specific config with base config
    return {
        ...baseConfig,
        ...envConfig,
        // Ensure client name is unique
        clientName: `${baseConfig.clientName}-${Date.now()}`
    };
}

/**
 * Get default broker configuration
 * @returns {Object} Default broker configuration object
 */
function getDefaultBrokerConfig() {
    return getBrokerConfig('development');
}

/**
 * Update the default broker configuration dynamically
 */
function updateDefaultConfig(newConfig) {
    if (newConfig && typeof newConfig === 'object') {
        // Update the default configuration
        Object.assign(BROKER_CONFIG, newConfig);
        console.log('✅ Default broker configuration updated:', BROKER_CONFIG);
    }
}

/**
 * Get stored broker configuration from localStorage
 */
function getStoredBrokerConfig() {
    try {
        const stored = localStorage.getItem('brokerConfig');
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (error) {
        console.error('❌ Error reading stored broker configuration:', error);
    }
    return null;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BROKER_CONFIG,
        ENVIRONMENT_CONFIGS,
        getBrokerConfig,
        getDefaultBrokerConfig,
        updateDefaultConfig,
        getStoredBrokerConfig
    };
}

// Make available globally for browser usage
if (typeof window !== 'undefined') {
    window.BrokerConfig = {
        BROKER_CONFIG,
        ENVIRONMENT_CONFIGS,
        getBrokerConfig,
        getDefaultBrokerConfig,
        updateDefaultConfig,
        getStoredBrokerConfig
    };
}
