/**
 * Broker Configuration Dialog Manager
 * Handles the broker configuration popup dialog and broker switching
 */

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
        this.dialog = document.getElementById('broker-config-dialog');
        this.form = document.getElementById('broker-config-form');
        this.solaceFields = document.getElementById('solace-config-fields');
        this.hostedNote = document.getElementById('hosted-environment-note');

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
            let currentBrokerType = window.brokerMode || 'inmemory';
            
            // Check if we're in a hosted environment and set appropriate default
            if (window.BrokerConfig && window.BrokerConfig.isHostedEnvironment()) {
                currentBrokerType = 'inmemory';
                console.log('🌐 Hosted environment detected, defaulting to in-memory broker');
                
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
            const brokerTypeRadio = this.form.querySelector(`input[name="brokerType"][value="${currentBrokerType}"]`);
            if (brokerTypeRadio) {
                brokerTypeRadio.checked = true;
                this.toggleSolaceFields(currentBrokerType === 'solace');
            }

            // Load Solace configuration - check both current config and stored config
            let solaceConfig = null;
            
            // First, try to get stored Solace configuration
            const storedConfig = window.BrokerConfig ? window.BrokerConfig.getStoredBrokerConfig() : null;
            if (storedConfig && storedConfig.brokerType === 'solace' && storedConfig.config) {
                solaceConfig = storedConfig.config;
                console.log('📋 Loading stored Solace configuration');
            } else if (currentConfig) {
                // Fallback to current/default configuration
                solaceConfig = currentConfig;
                console.log('📋 Loading default Solace configuration');
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
                    console.log('📋 Loading default Solace configuration values');
                }
            }
        } catch (error) {
            console.error('❌ Error loading current broker configuration:', error);
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
                console.log('📋 Loading stored Solace configuration for form');
            } else {
                // Fallback to default Solace configuration
                solaceConfig = window.BrokerConfig ? window.BrokerConfig.getBrokerConfig('development') : null;
                console.log('📋 Loading default Solace configuration for form');
            }
            
            // Load configuration into form fields
            if (solaceConfig) {
                document.getElementById('broker-url').value = solaceConfig.url || '';
                document.getElementById('broker-vpn').value = solaceConfig.vpnName || '';
                document.getElementById('broker-username').value = solaceConfig.userName || '';
                document.getElementById('broker-password').value = solaceConfig.password || '';
                
                console.log('✅ Solace configuration loaded into form fields');
            } else {
                console.warn('⚠️ No Solace configuration available to load');
            }
        } catch (error) {
            console.error('❌ Error loading Solace configuration:', error);
        }
    }

    saveConfiguration() {
        try {
            const formData = new FormData(this.form);
            const brokerType = formData.get('brokerType');
            
            let newConfig = null;
            
            if (brokerType === 'solace') {
                newConfig = {
                    url: formData.get('url'),
                    vpnName: formData.get('vpnName'),
                    userName: formData.get('userName'),
                    password: formData.get('password'),
                    clientName: 'train-monitor',
                    connectionTimeout: 10000,
                    reconnectRetries: 5,
                    reconnectInterval: 3000,
                    logLevel: 'INFO'
                };

                // Validate Solace configuration
                if (!newConfig.url || !newConfig.vpnName || !newConfig.userName || !newConfig.password) {
                    alert('Please fill in all Solace broker configuration fields.');
                    return;
                }
            }

            // Store configuration
            this.storeConfiguration(brokerType, newConfig);

            // Close dialog
            this.closeDialog();

            // Reset application
            this.resetApplication();

        } catch (error) {
            console.error('❌ Error saving broker configuration:', error);
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

            // Update global broker configuration
            if (window.BrokerConfig) {
                if (brokerType === 'solace' && config) {
                    // Update the default configuration
                    window.BrokerConfig.updateDefaultConfig(config);
                }
            }

            console.log('✅ Broker configuration saved:', configData);
        } catch (error) {
            console.error('❌ Error storing broker configuration:', error);
        }
    }

    resetApplication() {
        try {
            console.log('🔄 Resetting application due to broker configuration change...');

            // Show loading message
            this.showResetMessage();

            // Disconnect current broker
            if (window.solaceTrainMonitor) {
                try {
                    window.solaceTrainMonitor.disconnect();
                } catch (error) {
                    console.warn('⚠️ Error disconnecting current broker:', error);
                }
            }

            // Clear global state
            window.brokerMode = undefined;
            window.brokerConnected = false;
            window.solaceTrainMonitor = null;
            window.eventManager = null;
            window.trainMonitorInstance = null;

            // Clear any existing broker status indicator
            const existingIndicator = document.querySelector('.broker-status-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }

            // Reload the page after a short delay
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('❌ Error resetting application:', error);
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
        if (this.dialog) {
            this.loadCurrentConfig();
            this.dialog.style.display = 'flex';
            // Focus on the first input
            setTimeout(() => {
                const firstInput = this.dialog.querySelector('input');
                if (firstInput) firstInput.focus();
            }, 100);
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
    if (window.brokerConfigDialog) {
        window.brokerConfigDialog.openDialog();
    }
}

function closeBrokerConfigDialog() {
    if (window.brokerConfigDialog) {
        window.brokerConfigDialog.closeDialog();
    }
}

// Initialize the dialog when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.brokerConfigDialog = new BrokerConfigDialog();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BrokerConfigDialog;
}
