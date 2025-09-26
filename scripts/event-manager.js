/**
 * Event Manager for Train Monitoring System
 * 
 * This script manages the event subscription system and displays events
 * in the right sidebar with auto-scroll functionality.
 */

class EventManager {
    constructor() {
        this.events = [];
        this.maxEvents = 100; // Limit number of events to prevent memory issues
        this.autoCleanEnabled = true; // Auto-clean is enabled by default
        this.currentFilter = 'all';
        this.expandedEventId = null;
        
        // DOM elements
        this.eventsList = document.getElementById('eventsList');
        this.clearEventsBtn = document.getElementById('clearEventsBtn');
        this.filterBtns = document.querySelectorAll('.filter-btn');
        
        this.initializeEventHandlers();
        this.setupSolaceSubscriptions();
    }

    /**
     * Initialize event handlers for UI interactions
     */
    initializeEventHandlers() {
        // Clear events button
        if (this.clearEventsBtn) {
            this.clearEventsBtn.addEventListener('click', () => {
                this.clearAllEvents();
            });
        }

        // Filter buttons
        this.filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.getAttribute('data-filter');
                this.setFilter(filter);
            });
        });
    }

    /**
     * Setup Solace subscriptions for different event types
     */
    async setupSolaceSubscriptions() {
        // Wait for Solace to be available
        const checkSolace = () => {
            if (window.solaceTrainMonitor && window.solaceTrainMonitor.isConnected) {
                this.subscribeToEvents();
            } else {
                setTimeout(checkSolace, 1000);
            }
        };
        checkSolace();
    }

    /**
     * Subscribe to all TMS events
     */
    async subscribeToEvents() {
        try {
            console.log('🔄 Setting up event subscriptions...');
            
            // Subscribe to train events
            await window.solaceTrainMonitor.subscribeToTrainEvents((topic, payload, message) => {
                console.log('🚂 Train event received:', topic);
                this.handleTrainEvent(topic, payload, message);
            });

            // Subscribe to station events
            await window.solaceTrainMonitor.subscribeToStationEvents((topic, payload, message) => {
                console.log('🚉 Station event received:', topic);
                this.handleStationEvent(topic, payload, message);
            });

            // Subscribe to alert raised events
            await window.solaceTrainMonitor.subscribe('tms/alert/raised/>', (topic, payload, message) => {
                console.log('🚨 Alert raised event received:', topic);
                this.handleAlertRaisedEvent(topic, payload, message);
            });

            // Subscribe to alert missed events
            await window.solaceTrainMonitor.subscribe('tms/alert/missed/>', (topic, payload, message) => {
                console.log('🚨 Alert missed event received:', topic);
                this.handleAlertMissedEvent(topic, payload, message);
            });

            // Subscribe to alert served events
            await window.solaceTrainMonitor.subscribe('tms/alert/served/>', (topic, payload, message) => {
                console.log('🚨 Alert served event received:', topic);
                this.handleAlertServedEvent(topic, payload, message);
            });

            console.log('✅ Event subscriptions established');
        } catch (error) {
            console.error('❌ Failed to setup event subscriptions:', error);
        }
    }

    /**
     * Handle train events
     */
    handleTrainEvent(topic, payload, message) {
        try {
            console.log('🚂 Processing train event:', { topic, payload });
            
            // Handle empty or invalid payload
            if (!payload || payload === 'No payload' || payload === 'Unable to decode payload') {
                console.warn('⚠️ Empty or invalid payload for train event, skipping');
                return;
            }
            
            const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
            const event = {
                id: this.generateEventId(),
                type: 'train',
                topic: topic,
                timestamp: new Date(),
                data: eventData,
                brief: this.generateTrainEventBrief(eventData),
                details: this.generateTrainEventDetails(eventData)
            };
            
            console.log('🚂 Adding train event to list:', event.brief);
            this.addEvent(event);
        } catch (error) {
            console.error('❌ Error handling train event:', error, { topic, payload });
        }
    }

    /**
     * Handle station events
     */
    handleStationEvent(topic, payload, message) {
        try {
            console.log('🚉 Processing station event:', { topic, payload });
            
            // Handle empty or invalid payload
            if (!payload || payload === 'No payload' || payload === 'Unable to decode payload') {
                console.warn('⚠️ Empty or invalid payload for station event, skipping');
                return;
            }
            
            const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
            const event = {
                id: this.generateEventId(),
                type: 'station',
                topic: topic,
                timestamp: new Date(),
                data: eventData,
                brief: this.generateStationEventBrief(eventData),
                details: this.generateStationEventDetails(eventData)
            };
            
            console.log('🚉 Adding station event to list:', event.brief);
            this.addEvent(event);
            
            // Check if this is a departure event and move unserved alerts to next station
            if (eventData.status === 'departed') {
                this.moveUnservedAlertsToNextStation(eventData);
            }
        } catch (error) {
            console.error('❌ Error handling station event:', error, { topic, payload });
        }
    }

    
    /**
     * Get alert tracker data
     */
    getAlertTracker() {
        return this.alertTracker || new Map();
    }
    
    /**
     * Get alerts for a specific station
     */
    getStationAlerts(stationCode) {
        const alertTracker = this.getAlertTracker();
        for (const [key, data] of alertTracker.entries()) {
            if (data.stationCode === stationCode) {
                return data;
            }
        }
        return null;
    }

    /**
     * Handle alert raised events
     */
    handleAlertRaisedEvent(topic, payload, message) {
        try {
            const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
            const event = {
                id: this.generateEventId(),
                type: 'alert',
                topic: topic,
                timestamp: payload.timestamp,
                data: eventData,
                brief: this.generateAlertRaisedEventBrief(eventData),
                details: this.generateAlertEventDetails(eventData)
            };
            
            this.addEvent(event);
            
            // Track alert in alert tracker first
            this.trackAlert(eventData);
            
            // Add alert flag to map for the next station
            console.log('🚩 Checking for flag creation:', {
                nextStation: eventData.nextStation,
                nextStationName: eventData.nextStationName,
                trainMonitorInstance: !!window.trainMonitorInstance,
                map: window.trainMonitorInstance?.map ? 'exists' : 'missing',
                fullEventData: eventData
            });
            
            if (eventData.nextStation && window.trainMonitorInstance) {
                // Get alert count AFTER tracking the alert
                const alertCount = this.getAlertCountForStation(eventData.nextStation);
                console.log(`🚩 Creating flag for NEXT STATION: ${eventData.nextStation} (${eventData.nextStationName}) with ${alertCount} alerts`);
                console.log(`🚩 Alert tracker state for ${eventData.nextStation}:`, this.alertTracker?.get(`${eventData.nextStation}_${eventData.nextStationName}`)?.summary);
                window.trainMonitorInstance.updateAlertFlag(eventData.nextStation, alertCount);
            } else {
                console.warn('🚩 Cannot create flag:', {
                    nextStation: eventData.nextStation,
                    nextStationName: eventData.nextStationName,
                    trainMonitorInstance: !!window.trainMonitorInstance
                });
            }
            
            console.log('🚨 Alert raised event processed:', eventData);
            
        } catch (error) {
            console.error('❌ Error handling alert raised event:', error);
        }
    }

    /**
     * Handle alert missed events
     */
    handleAlertMissedEvent(topic, payload, message) {
        try {
            console.log('🚨 Alert missed event received:', topic);
            
            // Handle empty or invalid payload
            if (!payload || payload === 'No payload' || payload === 'Unable to decode payload') {
                console.warn('⚠️ Empty or invalid payload for missed alert event, skipping');
                return;
            }
            
            const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
            const event = {
                id: this.generateEventId(),
                type: 'alert_missed',
                topic: topic,
                timestamp: new Date(),
                data: eventData,
                brief: this.generateAlertMissedEventBrief(eventData),
                details: this.generateAlertMissedEventDetails(eventData)
            };
            
            console.log('🚨 Adding missed alert event to list:', event.brief);
            this.addEvent(event);
            
            // Track the missed alert
            this.trackMissedAlert(eventData);
            
            console.log('🚨 Alert missed event processed:', eventData);
        } catch (error) {
            console.error('❌ Error handling alert missed event:', error);
        }
    }

    /**
     * Handle alert served events
     */
    handleAlertServedEvent(topic, payload, message) {
        try {
            console.log('🚨 Alert served event received:', topic);
            
            // Handle empty or invalid payload
            if (!payload || payload === 'No payload' || payload === 'Unable to decode payload') {
                console.warn('⚠️ Empty or invalid payload for served alert event, skipping');
                return;
            }
            
            const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
            const event = {
                id: this.generateEventId(),
                type: 'alert_served',
                topic: topic,
                timestamp: new Date(),
                data: eventData,
                brief: this.generateAlertServedEventBrief(eventData),
                details: this.generateAlertServedEventDetails(eventData)
            };
            
            console.log('🚨 Adding served alert event to list:', event.brief);
            this.addEvent(event);
            
            console.log('🚨 Alert served event processed:', eventData);
        } catch (error) {
            console.error('❌ Error handling alert served event:', error);
        }
    }
    
    /**
     * Track alert in the alert tracker
     */
    trackAlert(alertData) {
        const { type, trainNumber, nextStation, nextStationName } = alertData;
        const stationKey = `${nextStation}_${nextStationName}`;
        
        if (!this.alertTracker) {
            this.alertTracker = new Map();
        }
        
        if (!this.alertTracker.has(stationKey)) {
            this.alertTracker.set(stationKey, {
                stationCode: nextStation,
                stationName: nextStationName,
                alerts: {
                    received: [],
                    served: [],
                    missed: []
                },
                summary: {
                    received: 0,
                    served: 0,
                    missed: 0
                }
            });
        }
        
        const stationData = this.alertTracker.get(stationKey);
        const alertRecord = {
            id: this.generateEventId(),
            type: type,
            trainNumber: trainNumber,
            trainName: alertData.trainName,
            timestamp: alertData.timestamp,
            status: 'received'
        };
        
        stationData.alerts.received.push(alertRecord);
        stationData.summary.received++;
        
        console.log(`📊 Alert tracked for station ${stationKey}:`, stationData.summary);
    }

    // Track missed alert in the alert tracker
    trackMissedAlert(alertData) {
        const { type, trainNumber, missedStation, missedStationName } = alertData;
        const stationKey = `${missedStation}_${missedStationName}`;
        
        if (!this.alertTracker) {
            this.alertTracker = new Map();
        }
        
        if (!this.alertTracker.has(stationKey)) {
            this.alertTracker.set(stationKey, {
                stationCode: missedStation,
                stationName: missedStationName,
                alerts: {
                    received: [],
                    served: [],
                    missed: []
                },
                summary: {
                    received: 0,
                    served: 0,
                    missed: 0
                }
            });
        }
        
        const stationData = this.alertTracker.get(stationKey);
        stationData.alerts.missed.push(alertData);
        stationData.summary.missed++;
        
        console.log(`📊 Missed alert tracked for station ${stationKey}:`, stationData.summary);
    }

    getAlertCountForStation(stationCode) {
        if (!this.alertTracker) return 0;
        
        // Find the station key that matches the station code
        for (const [key, data] of this.alertTracker.entries()) {
            if (key.startsWith(`${stationCode}_`)) {
                return data.summary.received;
            }
        }
        return 0;
    }

    // Move unserved alerts from current station to next station when train departs
    moveUnservedAlertsToNextStation(departureData) {
        const { currentStation, nextStation, trainNumber, trainName } = departureData;
        
        if (!this.alertTracker || !currentStation || !nextStation) {
            return;
        }
        
        // Find alerts for the current station
        const currentStationKey = `${currentStation}_${departureData.currentStationName}`;
        const currentStationData = this.alertTracker.get(currentStationKey);
        
        if (!currentStationData) {
            console.log(`🚩 No alert data found for station ${currentStation}`);
            return;
        }
        
        // Check if there are any alerts (served or unserved) at this station
        const hasUnservedAlerts = currentStationData.alerts.received.length > 0;
        const hasServedAlerts = currentStationData.alerts.served && currentStationData.alerts.served.length > 0;
        
        if (!hasUnservedAlerts && !hasServedAlerts) {
            console.log(`🚩 No alerts (served or unserved) at station ${currentStation}`);
            return;
        }
        
        // Handle unserved alerts (move them to next station)
        if (hasUnservedAlerts) {
            console.log(`🚩 Moving ${currentStationData.alerts.received.length} unserved alerts from ${currentStation} to ${nextStation}`);
            
            // Get or create next station data
            const nextStationKey = `${nextStation}_${departureData.nextStationName}`;
            if (!this.alertTracker.has(nextStationKey)) {
                this.alertTracker.set(nextStationKey, {
                    stationCode: nextStation,
                    stationName: departureData.nextStationName,
                    alerts: {
                        received: [],
                        served: [],
                        missed: []
                    },
                    summary: {
                        received: 0,
                        served: 0,
                        missed: 0
                    }
                });
            }
            
            const nextStationData = this.alertTracker.get(nextStationKey);
            
            // Move all unserved alerts from current station to next station
            const alertsToMove = [...currentStationData.alerts.received]; // Create a copy to avoid modification during iteration
            
            alertsToMove.forEach(alert => {
                // Update alert with new station information first
                const movedAlert = {
                    ...alert,
                    nextStation: nextStation,
                    nextStationName: departureData.nextStationName,
                    timestamp: new Date().toISOString(),
                    movedFrom: currentStation,
                    movedFromName: departureData.currentStationName
                };
                
                // Publish missed alert event with updated station information
                this.publishMissedAlertEvent(movedAlert, currentStation, departureData.currentStationName);
                
                // Add to next station's received alerts
                nextStationData.alerts.received.push(movedAlert);
                nextStationData.summary.received++;
                
                // Note: We don't publish a new alert raised event here because we're just moving
                // the alert internally. The alert was already published when it was originally raised.
            });
            
            // Clear current station's unserved alerts (remove from received array)
            currentStationData.alerts.received = [];
            currentStationData.summary.received = 0;
            
            // Update flag on map for next station
            if (window.trainMonitorInstance && nextStationData.summary.received > 0) {
                console.log(`🚩 Updating flag for next station ${nextStation} with ${nextStationData.summary.received} alerts`);
                console.log(`🚩 Next station alert tracker state:`, nextStationData.summary);
                window.trainMonitorInstance.updateAlertFlag(nextStation, nextStationData.summary.received);
            }
        }
        
        // Handle served alerts (publish served events)
        if (hasServedAlerts) {
            console.log(`🚩 Publishing served events for ${currentStationData.alerts.served.length} served alerts at ${currentStation}`);
            currentStationData.alerts.served.forEach(alert => {
                this.publishAlertServedEvent(alert, currentStation, departureData.currentStationName);
            });
        }
        
        // Always remove the flag from the current station when train departs
        if (window.trainMonitorInstance) {
            console.log(`🚩 Removing flag from current station ${currentStation} (train departing)`);
            window.trainMonitorInstance.removeAlertFlag(currentStation);
        }
        
        console.log(`✅ Processed alerts for station ${currentStation} - train departing`);
    }

    // Publish missed alert event when train departs without serving alert
    publishMissedAlertEvent(alertData, missedStation, missedStationName) {
        if (!window.solaceTrainMonitor) {
            console.warn('🚩 Solace integration not available for publishing missed alert');
            return;
        }
        
        const topic = `tms/alert/missed/${alertData.type}/${alertData.trainNumber}/${missedStation}`;
        const payload = {
            type: alertData.type,
            trainNumber: alertData.trainNumber,
            trainName: alertData.trainName,
            previousStation: alertData.previousStation,
            previousStationName: alertData.previousStationName,
            nextStation: alertData.nextStation,
            nextStationName: alertData.nextStationName,
            missedStation: missedStation,
            missedStationName: missedStationName,
            distanceTraveled: alertData.distanceTraveled || 0,
            lat: alertData.lat || 0,
            lon: alertData.lon || 0,
            timestamp: new Date().toISOString(),
            originalTimestamp: alertData.timestamp,
            reason: 'train_departed_without_service'
        };
        
        window.solaceTrainMonitor.publish(topic, JSON.stringify(payload))
            .then(() => {
                console.log(`📤 Published missed alert event to topic: ${topic}`);
            })
            .catch(error => {
                console.error('❌ Failed to publish missed alert event:', error);
            });
    }

    // Publish alert served event when train departs from station with served alerts
    publishAlertServedEvent(alertData, stationCode, stationName) {
        if (!window.solaceTrainMonitor) {
            console.warn('🚩 Solace integration not available for publishing alert served event');
            return;
        }
        
        const topic = `tms/alert/served/${alertData.type}/${alertData.trainNumber}/${stationCode}`;
        const payload = {
            type: alertData.type,
            trainNumber: alertData.trainNumber,
            trainName: alertData.trainName,
            stationCode: stationCode,
            stationName: stationName,
            servedAt: new Date().toISOString(),
            originalTimestamp: alertData.timestamp,
            servedBy: 'train_departed'
        };
        
        window.solaceTrainMonitor.publish(topic, JSON.stringify(payload))
            .then(() => {
                console.log(`📤 Published alert served event to topic: ${topic}`);
            })
            .catch(error => {
                console.error('❌ Failed to publish alert served event:', error);
            });
    }


    // Method to mark alerts as served (called when train arrives at station)
    markAlertsAsServed(stationCode) {
        if (!this.alertTracker) return;
        
        // Find the station key that matches the station code
        for (const [key, data] of this.alertTracker.entries()) {
            if (key.startsWith(`${stationCode}_`)) {
                // Move all received alerts to served
                data.alerts.served.push(...data.alerts.received);
                data.summary.served += data.alerts.received.length;
                data.alerts.received = [];
                data.summary.received = 0;
                
                // Don't remove flag immediately - let it blink until train departs
                // The flag will be removed when the train departs from the station
                console.log(`📊 Alerts marked as served for station ${stationCode}:`, data.summary);
                
                console.log(`✅ Alerts marked as served for station ${stationCode}:`, data.summary);
                break;
            }
        }
    }

    /**
     * Generate alert raised event brief description
     */
    generateAlertRaisedEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const alertType = data.type || 'Unknown';
        const stationName = data.nextStationName || 'Unknown Station';
        
        return `🚨 Alert raised: ${alertType.replace(/_/g, ' ')} for Train ${trainNumber} at ${stationName}`;
    }

    /**
     * Generate train event brief description
     */
    generateTrainEventBrief(data) {
        const trainNumber = data.trainNumber || 'UNKNOWN';
        const status = data.status || 'UNKNOWN';
        const origin = data.originName || data.origin || 'UNKNOWN';
        const destination = data.destinationName || data.destination || 'UNKNOWN';
        
        switch (status) {
            case 'departed':
                return `Train ${trainNumber} departed from ${origin}`;
            case 'arrived':
                return `Train ${trainNumber} arrived at ${destination}`;
            default:
                return `Train ${trainNumber} - ${status}`;
        }
    }

    /**
     * Generate station event brief description
     */
    generateStationEventBrief(data) {
        const trainNumber = data.trainNumber || 'UNKNOWN';
        const status = data.status || 'UNKNOWN';
        const station = data.currentStationName || data.currentStation || 'UNKNOWN';
        
        switch (status) {
            case 'arrived':
                return `Train ${trainNumber} arrived at ${station}`;
            case 'departed':
                return `Train ${trainNumber} departed from ${station}`;
            case 'stopped':
                return `Train ${trainNumber} stopped at ${station}`;
            default:
                return `Train ${trainNumber} at ${station} - ${status}`;
        }
    }

    /**
     * Generate alert event brief description
     */
    generateAlertEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const alertType = data.type || 'Unknown';
        const stationName = data.nextStationName || 'Unknown Station';
        
        return `⚠️ Alert: ${alertType.replace(/_/g, ' ')} for Train ${trainNumber} at ${stationName}`;
    }

    generateAlertMissedEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const alertType = data.type || 'Unknown';
        const missedStation = data.missedStationName || 'Unknown Station';
        const nextStation = data.nextStationName || 'Unknown Station';
        
        return `❌ Missed Alert: ${alertType.replace(/_/g, ' ')} for Train ${trainNumber} at ${missedStation} (moved to ${nextStation})`;
    }

    generateAlertServedEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const alertType = data.type || 'Unknown';
        const stationName = data.stationName || 'Unknown Station';
        const servedBy = data.servedBy || 'system';
        
        return `✅ Alert Served: ${alertType.replace(/_/g, ' ')} for Train ${trainNumber} at ${stationName} (${servedBy})`;
    }

    /**
     * Generate train event details
     */
    generateTrainEventDetails(data) {
        const details = [];
        
        if (data.trainNumber) details.push({ label: 'Train Number', value: data.trainNumber });
        if (data.trainName) details.push({ label: 'Train Name', value: data.trainName });
        if (data.status) details.push({ label: 'Status', value: data.status });
        if (data.originName) details.push({ label: 'Origin', value: data.originName });
        if (data.destinationName) details.push({ label: 'Destination', value: data.destinationName });
        if (data.currentStationName) details.push({ label: 'Current Station', value: data.currentStationName });
        if (data.nextStationName) details.push({ label: 'Next Station', value: data.nextStationName });
        if (data.distanceTraveled) details.push({ label: 'Distance Traveled', value: `${data.distanceTraveled} km` });
        if (data.time) details.push({ label: 'Time', value: data.time });
        
        return details;
    }

    /**
     * Generate station event details
     */
    generateStationEventDetails(data) {
        const details = [];
        
        if (data.trainNumber) details.push({ label: 'Train Number', value: data.trainNumber });
        if (data.trainName) details.push({ label: 'Train Name', value: data.trainName });
        if (data.status) details.push({ label: 'Status', value: data.status });
        if (data.currentStationName) details.push({ label: 'Current Station', value: data.currentStationName });
        if (data.previousStationName) details.push({ label: 'Previous Station', value: data.previousStationName });
        if (data.nextStationName) details.push({ label: 'Next Station', value: data.nextStationName });
        if (data.distanceTraveled) details.push({ label: 'Distance Traveled', value: `${data.distanceTraveled} km` });
        if (data.time) details.push({ label: 'Time', value: data.time });
        
        return details;
    }

    /**
     * Generate alert event details
     */
    generateAlertEventDetails(data) {
        const details = [];
        
        if (data.type) details.push({ label: 'Alert Type', value: data.type.replace(/_/g, ' ') });
        if (data.trainNumber) details.push({ label: 'Train Number', value: data.trainNumber });
        if (data.trainName) details.push({ label: 'Train Name', value: data.trainName });
        if (data.previousStation) details.push({ label: 'Previous Station', value: `${data.previousStation} - ${data.previousStationName}` });
        if (data.nextStation) details.push({ label: 'Next Station', value: `${data.nextStation} - ${data.nextStationName}` });
        if (data.distanceTraveled) details.push({ label: 'Distance Traveled', value: `${data.distanceTraveled} km` });
        if (data.lat && data.lon) details.push({ label: 'Location', value: `${data.lat.toFixed(6)}, ${data.lon.toFixed(6)}` });
        if (data.timestamp) details.push({ label: 'Timestamp', value: new Date(data.timestamp).toLocaleString() });
        
        return details;
    }

    generateAlertMissedEventDetails(data) {
        const details = [];
        
        if (data.type) details.push({ label: 'Alert Type', value: data.type.replace(/_/g, ' ') });
        if (data.trainNumber) details.push({ label: 'Train Number', value: data.trainNumber });
        if (data.trainName) details.push({ label: 'Train Name', value: data.trainName });
        if (data.missedStation) details.push({ label: 'Missed Station', value: `${data.missedStation} - ${data.missedStationName}` });
        if (data.nextStation) details.push({ label: 'Moved To Station', value: `${data.nextStation} - ${data.nextStationName}` });
        if (data.reason) details.push({ label: 'Reason', value: data.reason.replace(/_/g, ' ') });
        if (data.distanceTraveled) details.push({ label: 'Distance Traveled', value: `${data.distanceTraveled} km` });
        if (data.lat && data.lon) details.push({ label: 'Location', value: `${data.lat.toFixed(6)}, ${data.lon.toFixed(6)}` });
        if (data.originalTimestamp) details.push({ label: 'Original Alert Time', value: new Date(data.originalTimestamp).toLocaleString() });
        if (data.timestamp) details.push({ label: 'Missed Time', value: new Date(data.timestamp).toLocaleString() });
        
        return details;
    }

    generateAlertServedEventDetails(data) {
        const details = [];
        
        if (data.type) details.push({ label: 'Alert Type', value: data.type.replace(/_/g, ' ') });
        if (data.trainNumber) details.push({ label: 'Train Number', value: data.trainNumber });
        if (data.trainName) details.push({ label: 'Train Name', value: data.trainName });
        if (data.stationCode) details.push({ label: 'Served At Station', value: `${data.stationCode} - ${data.stationName}` });
        if (data.servedBy) details.push({ label: 'Served By', value: data.servedBy.replace(/_/g, ' ') });
        if (data.originalTimestamp) details.push({ label: 'Original Alert Time', value: new Date(data.originalTimestamp).toLocaleString() });
        if (data.servedAt) details.push({ label: 'Served Time', value: new Date(data.servedAt).toLocaleString() });
        
        return details;
    }

    /**
     * Add a new event to the list
     */
    addEvent(event) {
        // Add to beginning of array (newest first)
        this.events.unshift(event);
        
        // Limit number of events only if auto-clean is enabled
        if (this.autoCleanEnabled && this.events.length > this.maxEvents) {
            this.events = this.events.slice(0, this.maxEvents);
        }
        
        this.renderEvents();
        this.autoScrollToTop();
    }

    /**
     * Generate unique event ID
     */
    generateEventId() {
        return 'event_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Set event filter
     */
    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update filter button states
        this.filterBtns.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-filter') === filter) {
                btn.classList.add('active');
            }
        });
        
        this.renderEvents();
    }

    /**
     * Clear all events
     */
    clearAllEvents() {
        this.events = [];
        this.expandedEventId = null;
        this.renderEvents();
    }

    /**
     * Set auto-clean enabled state
     */
    setAutoCleanEnabled(enabled) {
        this.autoCleanEnabled = enabled;
        
        // If auto-clean is being enabled and we have more than maxEvents, clean up now
        if (enabled && this.events.length > this.maxEvents) {
            this.events = this.events.slice(0, this.maxEvents);
            this.renderEvents();
            console.log(`🧹 Auto-clean applied: reduced events from ${this.events.length + (this.events.length - this.maxEvents)} to ${this.maxEvents}`);
        }
    }

    /**
     * Toggle event expansion
     */
    toggleEventExpansion(eventId) {
        if (this.expandedEventId === eventId) {
            this.expandedEventId = null;
        } else {
            this.expandedEventId = eventId;
        }
        this.renderEvents();
    }

    /**
     * Auto scroll to top when new events arrive
     */
    autoScrollToTop() {
        if (this.eventsList) {
            this.eventsList.scrollTop = 0;
        }
    }

    /**
     * Render events based on current filter
     */
    renderEvents() {
        if (!this.eventsList) return;

        const filteredEvents = this.currentFilter === 'all' 
            ? this.events 
            : this.events.filter(event => {
                if (this.currentFilter === 'alert') {
                    // Include all alert-related events (raised, missed, served)
                    return event.type === 'alert' || event.type === 'alert_missed' || event.type === 'alert_served';
                }
                return event.type === this.currentFilter;
            });

        if (filteredEvents.length === 0) {
            this.eventsList.innerHTML = `
                <div class="no-events">
                    <p>No ${this.currentFilter === 'all' ? '' : this.currentFilter + ' '}events yet</p>
                    <small>Events will appear here as they are received</small>
                </div>
            `;
            return;
        }

        this.eventsList.innerHTML = filteredEvents.map(event => this.renderEventItem(event)).join('');
        
        // Add click handlers to event items
        this.eventsList.querySelectorAll('.event-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const eventId = item.getAttribute('data-event-id');
                this.toggleEventExpansion(eventId);
            });
        });
    }

    /**
     * Render individual event item
     */
    renderEventItem(event) {
        const isExpanded = this.expandedEventId === event.id;
        const timestamp = event.timestamp instanceof Date ? event.timestamp : new Date(event.timestamp);
        const timeStr = timestamp.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const iconMap = {
            train: '🚂',
            station: '🚉',
            alert: '⚠️'
        };

        return `
            <div class="event-item ${isExpanded ? 'expanded' : ''}" data-event-id="${event.id}">
                <div class="event-header">
                    <span class="event-icon">${iconMap[event.type] || '📋'}</span>
                    <span class="event-type ${event.type}">${event.type}</span>
                    <span class="event-time">${timeStr}</span>
                </div>
                <div class="event-brief">${event.brief}</div>
                <div class="event-details">
                    ${event.details.map(detail => `
                        <div class="event-detail-item">
                            <span class="event-detail-label">${detail.label}:</span>
                            <span class="event-detail-value">${detail.value}</span>
                        </div>
                    `).join('')}
                    <div class="event-topic">${event.topic}</div>
                </div>
            </div>
        `;
    }
}

// Initialize Event Manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.eventManager = new EventManager();
    console.log('📋 Event Manager initialized');
});
