/**
 * Broker Configuration Dialog Manager
 * Handles the broker configuration popup dialog and broker switching
 */

// Debug: Confirm this updated version is loading
console.log('🔧 Broker Config Dialog Script Loaded - Version 20251022-2358 with Enhanced Debugging');

class BrokerConfigDialog {
    constructor() {
        this.dialog = null;
        this.form = null;
        this.solaceFields = null;
        this.initializeDialog();
    }

    initializeDialog() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupDialog());
        } else {
            this.setupDialog();
        }
    }

    setupDialog() {
        console.log('🔧 Setting up broker configuration dialog');
        this.dialog = document.getElementById('broker-config-dialog');
        this.form = document.getElementById('broker-config-form');
        this.solaceFields = document.getElementById('solace-config-fields');
        this.hostedNote = document.getElementById('hosted-environment-note');

        console.log('🔧 Dialog elements found:', {
            dialog: !!this.dialog,
            form: !!this.form,
            solaceFields: !!this.solaceFields,
            hostedNote: !!this.hostedNote
        });

        if (!this.dialog || !this.form || !this.solaceFields) {
            console.error('❌ Broker configuration dialog elements not found');
            return;
        }

        // Load current configuration
        this.loadCurrentConfig();

        // Setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Broker type selection change
        const brokerTypeRadios = this.form.querySelectorAll('input[name="brokerType"]');
        brokerTypeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const isSolace = e.target.value === 'solace';
                this.toggleSolaceFields(isSolace);
                
                // If switching to Solace, reload the configuration
                if (isSolace) {
                    this.loadSolaceConfiguration();
                }
            });
        });

        // Form submission
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveConfiguration();
        });

        // Broker type change handler
        this.form.addEventListener('change', (e) => {
            if (e.target.name === 'brokerType') {
                const showSolace = e.target.value === 'solace';
                this.toggleSolaceFields(showSolace);
            }
        });

        // Close dialog on overlay click
        this.dialog.addEventListener('click', (e) => {
            if (e.target === this.dialog) {
                this.closeDialog();
            }
        });

        // Close dialog on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dialog.style.display !== 'none') {
                this.closeDialog();
            }
        });
    }

    loadCurrentConfig() {
        try {
            // Get current broker configuration
            const currentConfig = window.BrokerConfig ? window.BrokerConfig.getBrokerConfig() : null;
            
            // Check actual current broker mode first (most reliable)
            let currentBrokerType = 'inmemory'; // default
            
            // Check if we have an active broker connection
            if (window.solaceTrainMonitor && window.solaceTrainMonitor.brokerType) {
                currentBrokerType = window.solaceTrainMonitor.brokerType;
                console.log('🔧 Using actual broker type from active connection:', currentBrokerType);
            } else if (window.brokerMode) {
                currentBrokerType = window.brokerMode;
                console.log('🔧 Using window.brokerMode:', currentBrokerType);
            } else {
                // Check for stored user configuration as fallback
                const storedConfig = window.BrokerConfig ? window.BrokerConfig.getStoredBrokerConfig() : null;
                if (storedConfig && storedConfig.brokerType) {
                    currentBrokerType = storedConfig.brokerType;
                    console.log('🔧 Using stored broker configuration as fallback:', currentBrokerType);
                } else {
                    // Only apply hosted environment default if no user configuration exists
                    if (window.BrokerConfig && window.BrokerConfig.isHostedEnvironment()) {
                        currentBrokerType = 'inmemory';
                        console.log('🌐 Hosted environment detected, defaulting to in-memory broker (no user config)');
                    }
                }
            }
            
            // Show/hide hosted environment note based on environment detection
            if (window.BrokerConfig && window.BrokerConfig.isHostedEnvironment()) {
                // Show hosted environment note
                if (this.hostedNote) {
                    this.hostedNote.style.display = 'block';
                }
            } else {
                // Hide hosted environment note for local environments
                if (this.hostedNote) {
                    this.hostedNote.style.display = 'none';
                }
            }

            // Set broker type
            console.log('🔧 Dialog loading - setting broker type to:', currentBrokerType);
            console.log('🔧 Current state check:', {
                windowBrokerMode: window.brokerMode,
                solaceTrainMonitorBrokerType: window.solaceTrainMonitor ? window.solaceTrainMonitor.brokerType : 'not available',
                brokerConnected: window.brokerConnected
            });
            
            const brokerTypeRadio = this.form.querySelector(`input[name="brokerType"][value="${currentBrokerType}"]`);
            if (brokerTypeRadio) {
                brokerTypeRadio.checked = true;
                this.toggleSolaceFields(currentBrokerType === 'solace');
                console.log('🔧 Dialog set to:', currentBrokerType, 'radio button checked');
            } else {
                console.error('❌ Could not find radio button for broker type:', currentBrokerType);
            }

            // Load Solace configuration - check both current config and stored config
            let solaceConfig = null;
            
            // First, try to get stored Solace configuration (reuse storedConfig from above)
            if (storedConfig && storedConfig.brokerType === 'solace' && storedConfig.config) {
                solaceConfig = storedConfig.config;
                // console.log('📋 Loading stored Solace configuration');
            } else if (currentConfig) {
                // Fallback to current/default configuration
                solaceConfig = currentConfig;
                // console.log('📋 Loading default Solace configuration');
            }
            
            // Load Solace configuration into form fields
            if (solaceConfig) {
                document.getElementById('broker-url').value = solaceConfig.url || '';
                document.getElementById('broker-vpn').value = solaceConfig.vpnName || '';
                document.getElementById('broker-username').value = solaceConfig.userName || '';
                document.getElementById('broker-password').value = solaceConfig.password || '';
            } else {
                // Load default values if no stored config
                const defaultConfig = window.BrokerConfig ? window.BrokerConfig.getBrokerConfig('development') : null;
                if (defaultConfig) {
                    document.getElementById('broker-url').value = defaultConfig.url || '';
                    document.getElementById('broker-vpn').value = defaultConfig.vpnName || '';
                    document.getElementById('broker-username').value = defaultConfig.userName || '';
                    document.getElementById('broker-password').value = defaultConfig.password || '';
                    // console.log('📋 Loading default Solace configuration values');
                }
            }
        } catch (error) {
            // console.error('❌ Error loading current broker configuration:', error);
        }
    }

    toggleSolaceFields(show) {
        if (show) {
            this.solaceFields.style.display = 'block';
            // Make Solace fields required
            this.solaceFields.querySelectorAll('input').forEach(input => {
                input.required = true;
            });
        } else {
            this.solaceFields.style.display = 'none';
            // Remove required attribute
            this.solaceFields.querySelectorAll('input').forEach(input => {
                input.required = false;
            });
        }
    }

    /**
     * Load Solace configuration into form fields
     */
    loadSolaceConfiguration() {
        try {
            let solaceConfig = null;
            
            // First, try to get stored Solace configuration
            const storedConfig = window.BrokerConfig ? window.BrokerConfig.getStoredBrokerConfig() : null;
            if (storedConfig && storedConfig.brokerType === 'solace' && storedConfig.config) {
                solaceConfig = storedConfig.config;
                // console.log('📋 Loading stored Solace configuration for form');
            } else {
                // Fallback to default Solace configuration
                solaceConfig = window.BrokerConfig ? window.BrokerConfig.getBrokerConfig('development') : null;
                // console.log('📋 Loading default Solace configuration for form');
            }
            
            // Load configuration into form fields
            if (solaceConfig) {
                document.getElementById('broker-url').value = solaceConfig.url || '';
                document.getElementById('broker-vpn').value = solaceConfig.vpnName || '';
                document.getElementById('broker-username').value = solaceConfig.userName || '';
                document.getElementById('broker-password').value = solaceConfig.password || '';
                
                // console.log('✅ Solace configuration loaded into form fields');
            } else {
                // console.warn('⚠️ No Solace configuration available to load');
            }
        } catch (error) {
            // console.error('❌ Error loading Solace configuration:', error);
        }
    }

    saveConfiguration() {
        try {
            const formData = new FormData(this.form);
            const brokerType = formData.get('brokerType');
            
            let newConfig = null;
            
            if (brokerType === 'solace') {
                // Get values from form fields
                const url = document.getElementById('broker-url').value.trim();
                const vpnName = document.getElementById('broker-vpn').value.trim();
                const userName = document.getElementById('broker-username').value.trim();
                const password = document.getElementById('broker-password').value.trim();

                // Validate Solace configuration
                if (!url || !vpnName || !userName || !password) {
                    alert('Please fill in all Solace broker configuration fields.');
                    return;
                }

                newConfig = {
                    url: url,
                    vpnName: vpnName,
                    userName: userName,
                    password: password,
                    clientName: 'train-monitor',
                    connectionTimeout: 10000,
                    reconnectRetries: 5,
                    reconnectInterval: 3000,
                    logLevel: 'INFO'
                };
            }

            // Store configuration
            this.storeConfiguration(brokerType, newConfig);

            // Close dialog
            this.closeDialog();

            // Reset application
            this.resetApplication();

        } catch (error) {
            // console.error('❌ Error saving broker configuration:', error);
            alert('Error saving configuration. Please try again.');
        }
    }

    storeConfiguration(brokerType, config) {
        try {
            // Store in localStorage for persistence
            const configData = {
                brokerType: brokerType,
                config: config,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('brokerConfig', JSON.stringify(configData));
            console.log('💾 Broker configuration stored:', configData);

            // Update global broker configuration and mode
            if (window.BrokerConfig) {
                if (brokerType === 'solace' && config) {
                    // Update the default configuration
                    window.BrokerConfig.updateDefaultConfig(config);
                    console.log('🔧 Updated default broker config:', config);
                }
            }

            // Set global broker mode to match user's choice
            window.brokerMode = brokerType;
            console.log('🔧 Broker mode set to:', window.brokerMode);

            // Verify storage
            const stored = localStorage.getItem('brokerConfig');
            console.log('🔍 Verification - stored config:', stored ? JSON.parse(stored) : 'null');
        } catch (error) {
            console.error('❌ Error storing broker configuration:', error);
        }
    }

    resetApplication() {
        try {
            console.log('🔄 Resetting application due to broker configuration change...');
            console.log('🔍 Current state before reset:', {
                brokerMode: window.brokerMode,
                brokerConnected: window.brokerConnected,
                solaceTrainMonitor: window.solaceTrainMonitor ? 'exists' : 'null',
                storedConfig: localStorage.getItem('brokerConfig')
            });

            // Show loading message
            this.showResetMessage();

            // Disconnect current broker
            if (window.solaceTrainMonitor) {
                try {
                    console.log('🔌 Disconnecting current broker...');
                    window.solaceTrainMonitor.disconnect();
                    console.log('✅ Broker disconnected');
                } catch (error) {
                    console.warn('⚠️ Error disconnecting current broker:', error);
                }
            }

            // Clear global state (but preserve brokerMode as it will be restored from localStorage)
            window.brokerConnected = false;
            window.solaceTrainMonitor = null;
            window.eventManager = null;
            window.trainMonitorInstance = null;

            // Clear any existing broker status indicator
            const existingIndicator = document.querySelector('.broker-status-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }

            // Reload the page after a short delay to ensure configuration is stored
            setTimeout(() => {
                console.log('🔄 Reloading page to apply new broker configuration...');
                console.log('🔍 Final stored config before reload:', localStorage.getItem('brokerConfig'));
                window.location.reload();
            }, 1000);

        } catch (error) {
            // console.error('❌ Error resetting application:', error);
            alert('Error resetting application. Please refresh the page manually.');
        }
    }

    showResetMessage() {
        // Create a temporary overlay message
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 20000;
            color: white;
            font-size: 18px;
            text-align: center;
        `;
        overlay.innerHTML = `
            <div>
                <div style="font-size: 48px; margin-bottom: 20px;">🔄</div>
                <div>Resetting application with new broker configuration...</div>
                <div style="font-size: 14px; margin-top: 10px; opacity: 0.8;">Please wait...</div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    openDialog() {
        console.log('🔧 openDialog called, dialog element:', this.dialog);
        if (this.dialog) {
            console.log('🔧 Current state before loading config:', {
                windowBrokerMode: window.brokerMode,
                solaceTrainMonitorBrokerType: window.solaceTrainMonitor ? window.solaceTrainMonitor.brokerType : 'not available',
                brokerConnected: window.brokerConnected,
                storedConfig: window.BrokerConfig ? window.BrokerConfig.getStoredBrokerConfig() : 'not available'
            });
            
            console.log('🔧 Loading current config and showing dialog');
            this.loadCurrentConfig();
            this.dialog.style.display = 'flex';
            // Focus on the first input
            setTimeout(() => {
                const firstInput = this.dialog.querySelector('input');
                if (firstInput) firstInput.focus();
            }, 100);
        } else {
            console.error('❌ Dialog element not found');
        }
    }

    closeDialog() {
        if (this.dialog) {
            this.dialog.style.display = 'none';
        }
    }
}

// Global functions for HTML onclick handlers
function openBrokerConfigDialog() {
    console.log('🔧 openBrokerConfigDialog called');
    if (window.brokerConfigDialog) {
        console.log('🔧 Opening broker configuration dialog');
        window.brokerConfigDialog.openDialog();
    } else {
        console.error('❌ window.brokerConfigDialog not available');
    }
}

function closeBrokerConfigDialog() {
    console.log('🔧 closeBrokerConfigDialog called');
    if (window.brokerConfigDialog) {
        window.brokerConfigDialog.closeDialog();
    } else {
        console.error('❌ window.brokerConfigDialog not available for closing');
        // Fallback: try to hide the dialog directly
        const dialog = document.getElementById('broker-config-dialog');
        if (dialog) {
            dialog.style.display = 'none';
        }
    }
}

// Make functions available globally immediately
window.openBrokerConfigDialog = openBrokerConfigDialog;
window.closeBrokerConfigDialog = closeBrokerConfigDialog;

// Initialize the dialog when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 DOM loaded, initializing broker configuration dialog');
    window.brokerConfigDialog = new BrokerConfigDialog();
    // Ensure the global function is available
    window.openBrokerConfigDialog = openBrokerConfigDialog;
    window.closeBrokerConfigDialog = closeBrokerConfigDialog;
    console.log('🔧 Broker configuration dialog initialized');
    console.log('🔧 Global functions available:', {
        openBrokerConfigDialog: typeof window.openBrokerConfigDialog,
        closeBrokerConfigDialog: typeof window.closeBrokerConfigDialog,
        brokerConfigDialog: typeof window.brokerConfigDialog
    });
});

// Also try to initialize immediately if DOM is already ready
if (document.readyState === 'loading') {
    // DOM is still loading, wait for DOMContentLoaded
} else {
    // DOM is already ready, initialize immediately
    console.log('🔧 DOM already ready, initializing broker configuration dialog immediately');
    try {
        window.brokerConfigDialog = new BrokerConfigDialog();
        window.openBrokerConfigDialog = openBrokerConfigDialog;
        window.closeBrokerConfigDialog = closeBrokerConfigDialog;
        console.log('🔧 Broker configuration dialog initialized immediately');
    } catch (error) {
        console.error('❌ Error initializing broker configuration dialog:', error);
    }
}

// Add a simple fallback mechanism
setTimeout(() => {
    if (!window.brokerConfigDialog) {
        console.log('🔧 Broker dialog not initialized after timeout, attempting fallback initialization');
        try {
            window.brokerConfigDialog = new BrokerConfigDialog();
            console.log('🔧 Fallback initialization successful');
        } catch (error) {
            console.error('❌ Fallback initialization failed:', error);
        }
    }
}, 1000);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BrokerConfigDialog;
}
