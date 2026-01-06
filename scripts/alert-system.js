/**
 * Train Monitoring System - Alert System Module
 * Handles alert management, flag system, and event publishing
 */

class AlertSystem {
    constructor(trainMonitor) {
        this.trainMonitor = trainMonitor;
    }

    /**
     * Toggle alert panel
     */
    toggleAlertPanel() {
        const alertPanel = document.getElementById('alertBottomPanel');
        const container = document.querySelector('.container');
        if (alertPanel && container) {
            const isOpen = alertPanel.classList.contains('open');
            alertPanel.classList.toggle('open');
            container.classList.toggle('alert-panel-open');
            
            this.positionAlertButton(!isOpen);
            
            // Map size will be automatically adjusted by CSS
            
            // console.log(`🚨 Alert panel ${isOpen ? 'closed' : 'opened'}`);
        } else {
            // console.error('❌ Alert panel or container element not found');
        }
    }

    /**
     * Position alert button based on panel state
     * @param {boolean} isPanelOpen - Whether the alert panel is open
     */
    positionAlertButton(isPanelOpen) {
        const alertButton = document.querySelector('.alert-toggle-btn');
        if (alertButton) {
            if (isPanelOpen) {
                // Move to top when panel is open (multiple rows)
                alertButton.style.position = 'fixed';
                alertButton.style.top = '20px';
                alertButton.style.right = '20px';
                alertButton.style.zIndex = '1001';
            } else {
                // Move to bottom when panel is closed
                alertButton.style.position = 'fixed';
                alertButton.style.bottom = '20px';
                alertButton.style.right = '20px';
                alertButton.style.top = 'auto';
                alertButton.style.zIndex = '1001';
            }
        }
    }

    /**
     * Show alert
     * @param {string} message - Alert message
     * @param {string} type - Alert type (info, warning, error)
     */
    showAlert(message, type = 'info') {
        const alertPanel = document.getElementById('alertBottomPanel');
        if (!alertPanel) return;

        const alertItem = document.createElement('div');
        alertItem.className = `alert-item ${type}`;
        alertItem.innerHTML = `
            <span class="alert-message">${message}</span>
            <button class="alert-close" onclick="this.parentElement.remove()">×</button>
        `;

        alertPanel.appendChild(alertItem);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alertItem.parentNode) {
                alertItem.remove();
            }
        }, 5000);
    }

    /**
     * Hide alert
     * @param {string} message - Alert message to hide
     */
    hideAlert(message) {
        const alertPanel = document.getElementById('alertBottomPanel');
        if (!alertPanel) return;

        const alerts = alertPanel.querySelectorAll('.alert-item');
        alerts.forEach(alert => {
            if (alert.querySelector('.alert-message').textContent === message) {
                alert.remove();
            }
        });
    }

    /**
     * Create alert flag for a station
     * @param {string} stationCode - Station code
     * @param {number} alertCount - Number of alerts
     */
    createAlertFlag(stationCode, alertCount) {
        // Remove existing flag first
        this.removeAlertFlag(stationCode);

        // Don't create flag if alert count is 0
        if (alertCount === 0) {
            // console.log(`🚩 No flag created for ${stationCode} - alert count is 0`);
            return;
        }

        // Try to find a live marker; if not, we will position from CSV coords
        const stationMarker = this.findStationMarker(stationCode);

        // Create flag element
        const flag = document.createElement('div');
        flag.className = 'alert-flag';
        flag.dataset.stationCode = stationCode;
        flag.innerHTML = `
            <div class="alert-flag-icon">🚩</div>
            <div class="alert-flag-count">${alertCount}</div>
            <div class="alert-flag-tooltip">
                <div class="alert-flag-tooltip-content">
                    <div class="alert-flag-tooltip-header">Alerts for ${stationCode}</div>
                    <div class="alert-flag-tooltip-body">
                        <div class="alert-flag-tooltip-count">${alertCount} active alert${alertCount > 1 ? 's' : ''}</div>
                        <div class="alert-flag-tooltip-actions">
                            <button class="alert-flag-tooltip-button" onclick="window.trainMonitor.alertSystem.markAlertsAsServed('${stationCode}')">
                                Mark as Served
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (stationMarker) {
            // Position using marker for single-train mode
            this.positionAlertFlag(flag, stationMarker);
        } else {
            // Fallback: position from CSV coordinates (works in multi-train)
            const coords = typeof stationCoordinatesFromCSV !== 'undefined' ? stationCoordinatesFromCSV[stationCode] : null;
            if (coords && this.trainMonitor && this.trainMonitor.map) {
                const point = this.trainMonitor.map.latLngToContainerPoint([coords.lat, coords.lng]);
                const mapRect = this.trainMonitor.map.getContainer().getBoundingClientRect();
                flag.style.position = 'absolute';
                flag.style.left = (mapRect.left + point.x - 15) + 'px';
                flag.style.top = (mapRect.top + point.y - 40) + 'px';
                flag.style.display = 'block';
                if (!flag.parentNode) document.body.appendChild(flag);
                // Keep it updated on map moves
                const updateFromCSV = () => {
                    const p = this.trainMonitor.map.latLngToContainerPoint([coords.lat, coords.lng]);
                    flag.style.left = (mapRect.left + p.x - 15) + 'px';
                    flag.style.top = (mapRect.top + p.y - 40) + 'px';
                };
                this.trainMonitor.map.on('move zoomend', updateFromCSV);
                updateFromCSV();
            }
        }

        // Add click handler
        flag.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showAlertTooltip(stationCode);
        });

        // Store flag reference
        this.trainMonitor.alertFlags.set(stationCode, flag);

        // console.log(`🚩 Created alert flag for station ${stationCode} with ${alertCount} alerts`);
    }

    /**
     * Find station marker by station code
     * @param {string} stationCode - Station code
     * @returns {L.Marker|null} Station marker or null if not found
     */
    findStationMarker(stationCode) {
        // Check single train mode station markers
        if (this.trainMonitor.stationMarkers) {
            for (const marker of this.trainMonitor.stationMarkers) {
                if (marker._stationData && marker._stationData.code === stationCode) {
                    return marker;
                }
            }
        }

        return null;
    }

    /**
     * Position alert flag relative to station marker
     * @param {HTMLElement} flag - Flag element
     * @param {L.Marker} stationMarker - Station marker
     */
    positionAlertFlag(flag, stationMarker) {
        const updatePosition = () => {
            if (stationMarker && this.trainMonitor.map.hasLayer(stationMarker)) {
                const latLng = stationMarker.getLatLng();
                const point = this.trainMonitor.map.latLngToContainerPoint(latLng);
                
                // Check if marker is visible in current map bounds
                const mapBounds = this.trainMonitor.map.getBounds();
                const isVisible = mapBounds.contains(latLng);
                
                if (isVisible) {
                    // Get map container position
                    const mapContainer = this.trainMonitor.map.getContainer();
                    const mapRect = mapContainer.getBoundingClientRect();
                    
                    // Position flag above the marker
                    flag.style.position = 'absolute';
                    flag.style.left = (mapRect.left + point.x - 15) + 'px';
                    flag.style.top = (mapRect.top + point.y - 40) + 'px';
                    flag.style.display = 'block';
                    
                    // Add to document body if not already added
                    if (!flag.parentNode) {
                        document.body.appendChild(flag);
                    }
                } else {
                    flag.style.display = 'none';
                }
            }
        };

        // Update position on map events
        this.trainMonitor.map.on('move', updatePosition);
        this.trainMonitor.map.on('moveend', updatePosition);
        this.trainMonitor.map.on('zoomend', updatePosition);
        
        // Initial position
        updatePosition();
    }

    /**
     * Remove alert flag for a station
     * @param {string} stationCode - Station code
     */
    removeAlertFlag(stationCode) {
        if (this.trainMonitor.alertFlags.has(stationCode)) {
            const flag = this.trainMonitor.alertFlags.get(stationCode);
            if (flag && flag.parentNode) {
                flag.parentNode.removeChild(flag);
            }
            this.trainMonitor.alertFlags.delete(stationCode);
            // console.log(`🚩 Removed alert flag for station ${stationCode}`);
        }
    }

    /**
     * Update alert flags
     */
    updateAlertFlags() {
        // Update positions of all existing flags
        this.trainMonitor.alertFlags.forEach((flag, stationCode) => {
            const stationMarker = this.findStationMarker(stationCode);
            if (stationMarker) {
                this.positionAlertFlag(flag, stationMarker);
            }
        });
    }

    /**
     * Clear all alert flags
     */
    clearAlertFlags() {
        this.trainMonitor.alertFlags.forEach((flag, stationCode) => {
            this.removeAlertFlag(stationCode);
        });
    }

    /**
     * Show alert tooltip for a station
     * @param {string} stationCode - Station code
     */
    showAlertTooltip(stationCode) {
        const flag = this.trainMonitor.alertFlags.get(stationCode);
        if (flag) {
            const tooltip = flag.querySelector('.alert-flag-tooltip');
            if (tooltip) {
                tooltip.style.opacity = '1';
                tooltip.style.visibility = 'visible';
                
                // Hide tooltip after 3 seconds
                setTimeout(() => {
                    this.hideAlertTooltip(stationCode);
                }, 3000);
            }
        }
    }

    /**
     * Hide alert tooltip for a specific station
     * @param {string} stationCode - Station code
     */
    hideAlertTooltip(stationCode) {
        const flag = this.trainMonitor.alertFlags.get(stationCode);
        if (flag) {
            const tooltip = flag.querySelector('.alert-flag-tooltip');
            if (tooltip) {
                tooltip.style.opacity = '0';
                tooltip.style.visibility = 'hidden';
            }
        }
    }

    /**
     * Mark alerts as served for a station
     * @param {string} stationCode - Station code
     */
    markAlertsAsServed(stationCode) {
        // Get alert details for this station
        const alertDetails = this.trainMonitor.stationAlerts.get(stationCode) || [];
        
        // Mark all alerts as served
        alertDetails.forEach(alert => {
            alert.served = true;
        });
        
        // Make flag blink to indicate it's been marked as served
        this.makeFlagBlink(stationCode);
        
        // Hide tooltip
        this.hideAlertTooltip(stationCode);
        
        // console.log(`✅ Marked ${alertDetails.length} alerts as served for station ${stationCode} - flag will be removed when train departs`);
    }

    /**
     * Make alert flag blink to indicate it's been marked as served
     * @param {string} stationCode - Station code
     */
    makeFlagBlink(stationCode) {
        const flag = this.trainMonitor.alertFlags.get(stationCode);
        if (flag) {
            flag.classList.add('blinking');
            this.hideAlertTooltip(stationCode);
            // console.log(`🚩 Flag at station ${stationCode} is now blinking (marked as served) and tooltip is hidden`);
        }
    }

    /**
     * Show alert menu
     * @param {HTMLElement} iconBtn - Icon button element
     * @param {string} trainNumber - Train number
     */
    showAlertMenu(iconBtn, trainNumber) {
        // Remove any existing menu
        this.hideAlertMenu();
        
        // Create alert menu
        const menu = document.createElement('div');
        menu.className = 'alert-menu';
        menu.id = 'alertMenu';
        
        // Get icon button position
        const rect = iconBtn.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top = (rect.bottom + 5) + 'px';
        
        // Add menu items
        const alertTypes = [
            { type: 'water_tank', label: 'Water Tank Alert', icon: '💧' },
            { type: 'breakdown', label: 'Breakdown Alert', icon: '🔧' },
            { type: 'ac_malfunction', label: 'AC Malfunction Alert', icon: '❄️' },
            { type: 'emergency', label: 'Emergency Alert', icon: '🚨' }
        ];
        
        alertTypes.forEach(alertType => {
            const menuItem = document.createElement('div');
            menuItem.className = 'alert-menu-item';
            menuItem.innerHTML = `
                <span class="alert-menu-icon">${alertType.icon}</span>
                <span class="alert-menu-label">${alertType.label}</span>
            `;
            menuItem.addEventListener('click', () => {
                this.raiseAlert(trainNumber, alertType.type, 'Unknown');
                this.hideAlertMenu();
            });
            menu.appendChild(menuItem);
        });
        
        // Add menu to body to avoid overflow issues
        document.body.appendChild(menu);
        
        // Add click outside handler
        setTimeout(() => {
            document.addEventListener('click', this.handleClickOutsideMenu.bind(this));
        }, 100);
    }

    /**
     * Hide alert menu
     */
    hideAlertMenu() {
        const existingMenu = document.getElementById('alertMenu');
        if (existingMenu) {
            existingMenu.remove();
        }
        document.removeEventListener('click', this.handleClickOutsideMenu.bind(this));
    }

    /**
     * Handle click outside menu
     * @param {Event} event - Click event
     */
    handleClickOutsideMenu(event) {
        const menu = document.getElementById('alertMenu');
        if (menu && !menu.contains(event.target)) {
            this.hideAlertMenu();
        }
    }

    /**
     * Raise alert for a train
     * @param {string} trainNumber - Train number
     * @param {string} alertType - Alert type
     */
    async raiseAlert(trainNumber, alertType, coachNumber = null) {
        try {
            // Check if event publishing is enabled
            if (!window.publishEvents) {
                console.log('📤 Event publishing disabled, skipping alert raise event');
                return;
            }
            
            // Allow raising alerts in multi-train mode as well
            let allowRaise = false;
            if (window.multiTrainSystem && window.multiTrainSystem.simulationEngine) {
                allowRaise = true; // multi-train: any train can raise
            } else {
                allowRaise = this.trainMonitor.currentTrainNumber === trainNumber;
            }
            if (!allowRaise) return;
            
            // Get train data
            let trainData = null;
            if (window.multiTrainSystem && window.multiTrainSystem.simulationEngine) {
                // Pull from multi-train manager
                const mtm = window.multiTrainSystem.simulationEngine.multiTrainManager;
                const t = mtm && mtm.trains ? mtm.trains.get(String(trainNumber)) : null;
                if (t) {
                    trainData = { trainNumber: String(trainNumber), trainName: t.trainName, source: t.source, destination: t.destination };
                }
            } else if (this.trainMonitor.currentTrainNumber === trainNumber) {
                trainData = {
                    trainNumber: trainNumber,
                    trainName: this.trainMonitor.currentTrainName,
                    source: this.trainMonitor.stations[0]?.name || 'Unknown',
                    destination: this.trainMonitor.stations[this.trainMonitor.stations.length - 1]?.name || 'Unknown'
                };
            }

            if (!trainData) {
                // console.error(`❌ Train data not found for ${trainNumber}`);
                return;
            }

            // Get current train position and station context
            let currentPosition = this.trainMonitor.currentPosition || { lat: 0, lng: 0 };
            let previousStation = null;
            let nextStation = null;
            if (window.multiTrainSystem && window.multiTrainSystem.simulationEngine) {
                const mtm = window.multiTrainSystem.simulationEngine.multiTrainManager;
                const state = mtm && mtm.trainStates ? mtm.trainStates.get(String(trainNumber)) : null;
                const train = mtm && mtm.trains ? mtm.trains.get(String(trainNumber)) : null;
                if (state && train) {
                    currentPosition = state.currentPosition || currentPosition;
                    previousStation = train.route[state.currentStationIndex - 1] || null;
                    nextStation = train.route[state.currentStationIndex + 1] || null;
                }
            } else {
                const currentStationIndex = this.trainMonitor.currentStationIndex || 0;
                const stations = this.trainMonitor.stations || [];
                previousStation = currentStationIndex > 0 ? stations[currentStationIndex - 1] : null;
                nextStation = currentStationIndex < stations.length - 1 ? stations[currentStationIndex + 1] : null;
            }
            
            // Create comprehensive alert payload matching original structure
            const raisedTime = new Date().toISOString();
            let nextStationCode = nextStation?.code || 'Unknown';
            let nextStationName = nextStation?.name || 'Unknown';
            if (nextStationCode === 'Unknown' && typeof this.trainMonitor.getCurrentTrainData === 'function') {
                const derived = this.trainMonitor.getCurrentTrainData(trainNumber);
                if (derived && derived.nextStation) {
                    nextStationCode = derived.nextStation;
                    nextStationName = derived.nextStationName || nextStationName;
                }
            }
            const alertPayload = {
                type: alertType,                                    // Use 'type' instead of 'alertType'
                trainNumber: trainNumber.toString(),               // Convert to string
                trainName: trainData.trainName || 'Unknown Train',
                coachNumber: coachNumber || 'Unknown',             // Coach number included
                previousStation: previousStation?.code || 'Unknown',
                previousStationName: previousStation?.name || 'Unknown',
                nextStation: nextStationCode,
                nextStationName: nextStationName,
                distanceTraveled: this.trainMonitor.distanceTraveled || 0,
                lat: currentPosition.lat,
                lon: currentPosition.lng,                          // Note: original uses 'lon', not 'lng'
                timestamp: raisedTime,
                raisedTime: raisedTime,                            // Preserve original raised time
                source: trainData.source || 'Unknown',
                destination: trainData.destination || 'Unknown',
                status: 'active',
                // Random stickiness to carry to destination when enabled
                sticky: !!(window && window.MULTI_ALERT_STICKY_PROB && Math.random() < Number(window.MULTI_ALERT_STICKY_PROB))
            };

            // Publish alert event with proper topic structure
            const topic = `tms/alert/v1/raised/${alertType}/${trainNumber}/${nextStationCode}`;
            await this.trainMonitor.solaceIntegration.publishAlertEvent(topic, alertPayload);
            
            // console.log(`⚠️ Alert raised: ${alertType} for train ${trainNumber}`);
            // console.log(`📊 Alert payload:`, alertPayload);
            
        } catch (error) {
            // console.error('❌ Error raising alert:', error);
        }
    }

    /**
     * Publish alert event
     * @param {string} topic - Event topic
     * @param {Object} payload - Event payload
     */
    async publishAlertEvent(topic, payload) {
        if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
            // console.log('⚠️ Solace not connected, alert event not published');
            return;
        }
        
        try {
            await window.solaceTrainMonitor.publish(topic, payload);
            // console.log(`📢 Published alert event to topic: ${topic}`);
        } catch (error) {
            // console.error(`❌ Failed to publish alert event to topic ${topic}:`, error);
        }
    }

    // Removed duplicate method - using trainMonitor.publishTrainArrivedStationEvent() instead

    // Removed duplicate method - using trainMonitor.publishTrainStoppedStationEvent() instead

    // Removed duplicate method - using trainMonitor.publishTrainDepartedStationEvent() instead

    // Removed duplicate method - using trainMonitor.publishTrainArrivedDestinationEvent() instead

    // Removed duplicate method - using trainMonitor.publishAllTrainArrivedStationEvent() instead

    // Removed all duplicate multi-train event methods - using trainMonitor.publishAllTrain*Event() methods instead
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlertSystem;
}
