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
    this.subscriptionsInitialized = false; // avoid duplicate subscribes
    this.setupSolaceSubscriptions();
    }

  /**
   * Lightweight audit logger for alerts; enabled when window.ALERT_AUDIT === true
   */
  logAlertAudit(message, data) {
    try {
      if (window && window.ALERT_AUDIT) {
        // Use info (log/debug are disabled globally)
        if (data !== undefined) {
          console.info(`[ALERT_AUDIT] ${message}`, data);
        } else {
          console.info(`[ALERT_AUDIT] ${message}`);
        }
      }
    } catch (_e) {}
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
      if (this.subscriptionsInitialized) return;
      if (window.solaceTrainMonitor && window.solaceTrainMonitor.isConnected) {
        this.subscribeToEvents();
        this.subscriptionsInitialized = true;
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
            
            // Subscribe to train events
            await window.solaceTrainMonitor.subscribeToTrainEvents((topic, payload, message) => {
                this.handleTrainEvent(topic, payload, message);
            });

            // Subscribe to station events
            await window.solaceTrainMonitor.subscribeToStationEvents((topic, payload, message) => {
                this.handleStationEvent(topic, payload, message);
            });

            // Subscribe to alert raised events
            await window.solaceTrainMonitor.subscribe('tms/alert/raised/>', (topic, payload, message) => {
                this.handleAlertRaisedEvent(topic, payload, message);
            });

            // Subscribe to alert missed events
            await window.solaceTrainMonitor.subscribe('tms/alert/missed/>', (topic, payload, message) => {
                this.handleAlertMissedEvent(topic, payload, message);
            });

            // Subscribe to alert served events
            await window.solaceTrainMonitor.subscribe('tms/alert/served/>', (topic, payload, message) => {
                this.handleAlertServedEvent(topic, payload, message);
            });

            // Subscribe to alert unserved events
            await window.solaceTrainMonitor.subscribe('tms/alert/unserved/>', (topic, payload, message) => {
                // // console.log('🚫 Alert unserved event received:', topic);
                this.handleAlertUnservedEvent(topic, payload, message);
            });

            // // console.log('✅ Event subscriptions established');
        } catch (error) {
            // // console.error('❌ Failed to setup event subscriptions:', error);
        }
    }

    /**
     * Handle train events
     */
    handleTrainEvent(topic, payload, message) {
        try {
            // // console.log('🚂 Processing train event:', { topic, payload });
            
            // Handle empty or invalid payload
            if (!payload || payload === 'No payload' || payload === 'Unable to decode payload') {
                // // console.warn('⚠️ Empty or invalid payload for train event, skipping');
                return;
            }
            
            const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
            
            // Validate required fields
            if (!eventData.trainNumber && !eventData.trainName) {
                // // console.warn('⚠️ Train event missing both trainNumber and trainName, skipping');
                return;
            }
            
            const event = {
                id: this.generateEventId(),
                type: 'train',
                topic: topic,
                timestamp: new Date(),
                data: eventData,
                brief: this.generateTrainEventBrief(eventData),
                details: this.generateTrainEventDetails(eventData)
            };
            
            // // console.log('🚂 Adding train event to list:', event.brief);
            this.addEvent(event);
        } catch (error) {
            // // console.error('❌ Error handling train event:', error, { topic, payload });
        }
    }

    /**
     * Handle station events
     */
    handleStationEvent(topic, payload, message) {
        try {
            // // console.log('🚉 Processing station event:', { topic, payload });
            
            // Handle empty or invalid payload
            if (!payload || payload === 'No payload' || payload === 'Unable to decode payload') {
                // // console.warn('⚠️ Empty or invalid payload for station event, skipping');
                return;
            }
            
            const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
            
            // Validate required fields
            if (!eventData.trainNumber && !eventData.trainName) {
                // // console.warn('⚠️ Station event missing both trainNumber and trainName, skipping');
                return;
            }
            
            if (!eventData.status) {
                // console.warn('⚠️ Station event missing status, skipping');
                return;
            }
            
            const event = {
                id: this.generateEventId(),
                type: 'station',
                topic: topic,
                timestamp: new Date(),
                data: eventData,
                brief: this.generateStationEventBrief(eventData),
                details: this.generateStationEventDetails(eventData)
            };
            
            // console.log('🚉 Adding station event to list:', event.brief);
            this.addEvent(event);
            
            // Check if this is a departure event and move unserved alerts to next station
            if (eventData.status === 'departed') {
                this.moveUnservedAlertsToNextStation(eventData);
            }
        } catch (error) {
            // console.error('❌ Error handling station event:', error, { topic, payload });
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
                timestamp: eventData.timestamp,
                data: eventData,
                brief: this.generateAlertRaisedEventBrief(eventData),
                details: this.generateAlertEventDetails(eventData)
            };
            
            this.addEvent(event);
            
            // Track alert in alert tracker first
            this.trackAlert(eventData);
            
            // Add alert flag to map for the next station
            // console.log('🚩 Checking for flag creation:', {
            //     nextStation: eventData.nextStation,
            //     nextStationName: eventData.nextStationName,
            //     trainMonitorInstance: !!window.trainMonitorInstance,
            //     map: window.trainMonitorInstance?.map ? 'exists' : 'missing',
            //     fullEventData: eventData
            // });
            
            if (eventData.nextStation && window.trainMonitorInstance) {
                // Get alert count AFTER tracking the alert
                const alertCount = this.getAlertCountForStation(eventData.nextStation);
                // console.log(`🚩 Creating flag for NEXT STATION: ${eventData.nextStation} (${eventData.nextStationName}) with ${alertCount} alerts`);
                // console.log(`🚩 Alert tracker state for ${eventData.nextStation}:`, this.alertTracker?.get(`${eventData.nextStation}_${eventData.nextStationName}`)?.summary);
                window.trainMonitorInstance.updateAlertFlag(eventData.nextStation, alertCount);
            } else {
                // console.warn('🚩 Cannot create flag:', {
                //     nextStation: eventData.nextStation,
                //     nextStationName: eventData.nextStationName,
                //     trainMonitorInstance: !!window.trainMonitorInstance
                // });
            }
            
            // console.log('🚨 Alert raised event processed:', eventData);
            
        } catch (error) {
            // console.error('❌ Error handling alert raised event:', error);
        }
    }

    /**
     * Handle alert missed events
     */
    handleAlertMissedEvent(topic, payload, message) {
        try {
            // console.log('🚨 Alert missed event received:', topic);
            
            // Handle empty or invalid payload
            if (!payload || payload === 'No payload' || payload === 'Unable to decode payload') {
                // console.warn('⚠️ Empty or invalid payload for missed alert event, skipping');
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
            
            // console.log('🚨 Adding missed alert event to list:', event.brief);
            this.addEvent(event);
            
            // Track the missed alert
            this.trackMissedAlert(eventData);
            
            // console.log('🚨 Alert missed event processed:', eventData);
        } catch (error) {
            // console.error('❌ Error handling alert missed event:', error);
        }
    }

    /**
     * Handle alert served events
     */
    handleAlertServedEvent(topic, payload, message) {
        try {
            // console.log('🚨 Alert served event received:', topic);
            
            // Handle empty or invalid payload
            if (!payload || payload === 'No payload' || payload === 'Unable to decode payload') {
                // console.warn('⚠️ Empty or invalid payload for served alert event, skipping');
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
            
            // console.log('🚨 Adding served alert event to list:', event.brief);
            this.addEvent(event);
            
            // console.log('🚨 Alert served event processed:', eventData);
        } catch (error) {
            // console.error('❌ Error handling alert served event:', error);
        }
    }

    /**
     * Handle alert unserved events
     */
    handleAlertUnservedEvent(topic, payload, message) {
        try {
            // console.log('🚫 Processing alert unserved event:', topic, payload);
            // console.log('🚫 EventManager events count before:', this.events.length);
            
            const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
            const event = {
                id: this.generateEventId(),
                type: 'alert_unserved',
                topic: topic,
                timestamp: new Date(),
                data: eventData,
                brief: this.generateAlertUnservedEventBrief(eventData),
                details: this.generateAlertUnservedEventDetails(eventData)
            };
            
            // console.log('🚫 Created unserved event object:', event);
            // console.log('🚫 Adding unserved alert event to list:', event.brief);
            
            this.addEvent(event);
            
            // console.log('🚫 EventManager events count after:', this.events.length);
            // console.log('🚫 Alert unserved event processed successfully:', eventData);
        } catch (error) {
            // console.error('❌ Error handling alert unserved event:', error);
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
        
        // Check if alert already exists to prevent duplicates
        const existingAlert = stationData.alerts.received.find(existing => 
            existing.type === type && 
            existing.trainNumber === trainNumber &&
            existing.raisedTime === (alertData.raisedTime || alertData.timestamp)
        );
        
        if (!existingAlert) {
            const alertRecord = {
                id: this.generateEventId(),
                type: type,
                trainNumber: trainNumber,
                trainName: alertData.trainName,
                coachNumber: alertData.coachNumber || 'Unknown', // Include coach number
                timestamp: alertData.timestamp,
                raisedTime: alertData.raisedTime || alertData.timestamp, // Preserve raisedTime field
                status: 'received'
            };
            
            stationData.alerts.received.push(alertRecord);
            stationData.summary.received++;
            
            // console.log(`📊 Alert tracked for station ${stationKey}:`, stationData.summary);
        } else {
            // console.log(`⏭️ Skipping duplicate alert ${type} for train ${trainNumber} at station ${stationKey}`);
        }
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
        
        // console.log(`📊 Missed alert tracked for station ${stationKey}:`, stationData.summary);
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
            // console.log(`🚩 No alert data found for station ${currentStation}`);
            return;
        }
        
        // Check if there are any alerts (served or unserved) at this station
        const hasUnservedAlerts = currentStationData.alerts.received.length > 0;
        const hasServedAlerts = currentStationData.alerts.served && currentStationData.alerts.served.length > 0;
        
        if (!hasUnservedAlerts && !hasServedAlerts) {
            // console.log(`🚩 No alerts (served or unserved) at station ${currentStation}`);
            return;
        }
        
        // Handle unserved alerts (move them to next station)
        if (hasUnservedAlerts) {
            this.logAlertAudit(`Moving ${currentStationData.alerts.received.length} unserved alert(s) from ${departureData.currentStationName} -> ${departureData.nextStationName}`, {
                trainNumber,
                from: { code: currentStation, name: departureData.currentStationName },
                to: { code: nextStation, name: departureData.nextStationName }
            });
            // console.log(`🚩 Moving ${currentStationData.alerts.received.length} unserved alerts from ${currentStation} to ${nextStation}`);
            
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
            
            // Remove duplicates from alertsToMove array based on alert ID
            const uniqueAlertsToMove = alertsToMove.filter((alert, index, self) => 
                index === self.findIndex(a => a.id === alert.id)
            );
            
            if (uniqueAlertsToMove.length !== alertsToMove.length) {
                // console.log(`🔍 Removed ${alertsToMove.length - uniqueAlertsToMove.length} duplicate alerts from move operation`);
            }
            
            // console.log(`🔄 Moving ${uniqueAlertsToMove.length} unserved alerts from ${departureData.currentStationName} to ${departureData.nextStationName}`);
            // console.log(`🔍 Alerts to move:`, uniqueAlertsToMove.map(alert => ({ type: alert.type, trainNumber: alert.trainNumber, id: alert.id || 'no-id' })));
            
            uniqueAlertsToMove.forEach(alert => {
                // console.log(`📋 Moving alert: ${alert.type} for train ${alert.trainNumber} from ${departureData.currentStationName} to ${departureData.nextStationName}`);
                
                // Update alert with new station information first
                const movedAlert = {
                    ...alert,
                    nextStation: nextStation,
                    nextStationName: departureData.nextStationName,
                    timestamp: new Date().toISOString(),
                    movedFrom: currentStation,
                    movedFromName: departureData.currentStationName,
                    raisedTime: alert.raisedTime || alert.timestamp // Preserve original raised time
                };
                
                // Randomized processing: sometimes get served here, sometimes miss and move, sometimes remain sticky
                const serveProb = (window && typeof window.MULTI_ALERT_SERVE_PROB === 'number') ? window.MULTI_ALERT_SERVE_PROB : 0.5;
                const sticky = !!movedAlert.sticky; // if true, prefer to keep moving towards destination unserved
                const rnd = Math.random();
                if (!sticky && rnd < serveProb) {
                    // Mark as served at current station
                    this.publishAlertServedEvent(movedAlert, currentStation, departureData.currentStationName);
                    this.logAlertAudit('Published SERVED alert (randomized)', { type: movedAlert.type, station: departureData.currentStationName, trainNumber: movedAlert.trainNumber });
                    // Do not move to next station
                    return;
                }
                
                // Otherwise, mark missed and re-raise for next station
                this.publishMissedAlertEvent(movedAlert, currentStation, departureData.currentStationName);
                this.logAlertAudit('Published MISSED alert (randomized)', { type: movedAlert.type, station: departureData.currentStationName, trainNumber: movedAlert.trainNumber });
                this.publishAlertRaisedEvent(movedAlert, nextStation, departureData.nextStationName, true);
                this.logAlertAudit('Published RERAISED alert for next station (randomized)', { type: movedAlert.type, nextStation: departureData.nextStationName, trainNumber: movedAlert.trainNumber });
                
                // Check if alert already exists in next station to prevent duplicates
                const existingAlert = nextStationData.alerts.received.find(existing => 
                    existing.id === movedAlert.id
                );
                
                if (!existingAlert) {
                    // Add to next station's received alerts only if it doesn't already exist
                    nextStationData.alerts.received.push(movedAlert);
                    nextStationData.summary.received++;
                    // console.log(`✅ Added alert ${movedAlert.type} for train ${movedAlert.trainNumber} to station ${nextStation}`);
                } else {
                    // console.log(`⏭️ Skipping duplicate alert ${movedAlert.type} for train ${movedAlert.trainNumber} at station ${nextStation}`);
                }
            });
            
            // Clear current station's unserved alerts (remove from received array)
            currentStationData.alerts.received = [];
            currentStationData.summary.received = 0;
            
            // Update flag on map for next station
            if (window.trainMonitorInstance && nextStationData.summary.received > 0) {
                const summaryCount = nextStationData.summary.received;
                const actualCount = nextStationData.alerts.received.length;
                // console.log(`🚩 Updating flag for next station ${nextStation} with ${summaryCount} alerts (summary) vs ${actualCount} alerts (actual)`);
                // console.log(`🚩 Next station alert tracker state:`, nextStationData.summary);
                // console.log(`🚩 Alert details for next station:`, nextStationData.alerts.received);
                
                // Use actual count instead of summary count
                window.trainMonitorInstance.updateAlertFlag(nextStation, actualCount);
            } else {
                // console.log(`🚩 Not updating flag - trainMonitorInstance: ${!!window.trainMonitorInstance}, alerts: ${nextStationData?.summary?.received || 0}`);
            }
        }
        
        // Handle served alerts (publish served events)
        if (hasServedAlerts) {
            // console.log(`🚩 Publishing served events for ${currentStationData.alerts.served.length} served alerts at ${currentStation}`);
            currentStationData.alerts.served.forEach(alert => {
                this.publishAlertServedEvent(alert, currentStation, departureData.currentStationName);
                this.logAlertAudit('Published SERVED alert on departure', { type: alert.type, station: departureData.currentStationName, trainNumber: alert.trainNumber });
            });
        }
        
        // Always remove the flag from the current station when train departs
        if (window.trainMonitorInstance) {
            // console.log(`🚩 Removing flag from current station ${currentStation} (train departing)`);
            window.trainMonitorInstance.removeAlertFlag(currentStation);
        }
        
        // console.log(`✅ Processed alerts for station ${currentStation} - train departing`);
    }

    // Publish missed alert event when train departs without serving alert
    publishMissedAlertEvent(alertData, missedStation, missedStationName) {
        if (!window.solaceTrainMonitor) {
            // console.warn('🚩 Solace integration not available for publishing missed alert');
            return;
        }
        
        const topic = `tms/alert/missed/${alertData.type}/${alertData.trainNumber}/${missedStation}`;
        const payload = {
            type: alertData.type,
            trainNumber: alertData.trainNumber,
            trainName: alertData.trainName,
            coachNumber: alertData.coachNumber || 'Unknown',
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
            raisedTime: alertData.raisedTime || alertData.timestamp, // Preserve original raised time
            reason: 'train_departed_without_service'
        };
        
        window.solaceTrainMonitor.publish(topic, JSON.stringify(payload))
            .then(() => {
                // console.log(`📤 Published missed alert event to topic: ${topic}`);
            })
            .catch(error => {
                // console.error('❌ Failed to publish missed alert event:', error);
            });
    }

    // Publish alert raised event when alert is moved to next station
    publishAlertRaisedEvent(alertData, nextStation, nextStationName, reraised = false) {
        // Check if event publishing is enabled
        if (!window.publishEvents) {
            console.log('📤 Event publishing disabled, skipping alert raised event');
            return;
        }
        
        if (!window.solaceTrainMonitor) {
            // console.warn('🚩 Solace integration not available for publishing alert raised event');
            return;
        }
        
        const topic = `tms/alert/raised/${alertData.type}/${alertData.trainNumber}/${nextStation}`;
        
        if (reraised) {
            // console.log(`📤 Publishing alert re-raised event to topic: ${topic}`);
        }
        const payload = {
            type: alertData.type,
            trainNumber: alertData.trainNumber,
            trainName: alertData.trainName,
            coachNumber: alertData.coachNumber || 'Unknown',
            previousStation: alertData.movedFrom || alertData.previousStation,
            previousStationName: alertData.movedFromName || alertData.previousStationName,
            nextStation: nextStation,
            nextStationName: nextStationName,
            distanceTraveled: alertData.distanceTraveled || 0,
            lat: alertData.lat || 0,
            lon: alertData.lon || 0,
            timestamp: new Date().toISOString(), // Current time when event is published
            raisedTime: alertData.raisedTime || alertData.timestamp, // Preserve original raised time
            movedFrom: alertData.movedFrom,
            movedFromName: alertData.movedFromName,
            reason: 'alert_moved_from_previous_station'
        };
        
        window.solaceTrainMonitor.publish(topic, JSON.stringify(payload))
            .then(() => {
                // console.log(`📤 Published alert raised event to topic: ${topic}`);
                // console.log(`📊 Alert moved from ${alertData.movedFromName} to ${nextStationName}`);
            })
            .catch(error => {
                // console.error('❌ Failed to publish alert raised event:', error);
            });
    }

    // Publish alert served event when train departs from station with served alerts
    publishAlertServedEvent(alertData, stationCode, stationName) {
        // Check if event publishing is enabled
        if (!window.publishEvents) {
            console.log('📤 Event publishing disabled, skipping alert served event');
            return;
        }
        
        if (!window.solaceTrainMonitor) {
            // console.warn('🚩 Solace integration not available for publishing alert served event');
            return;
        }
        
        const topic = `tms/alert/served/${alertData.type}/${alertData.trainNumber}/${stationCode}`;
        const payload = {
            type: alertData.type,
            trainNumber: alertData.trainNumber,
            trainName: alertData.trainName,
            coachNumber: alertData.coachNumber || 'Unknown',
            stationCode: stationCode,
            stationName: stationName,
            servedAt: new Date().toISOString(),
            raisedTime: alertData.raisedTime || alertData.timestamp, // Preserve original raised time
            servedBy: 'train_departed'
        };
        
        window.solaceTrainMonitor.publish(topic, JSON.stringify(payload))
            .then(() => {
                // console.log(`📤 Published alert served event to topic: ${topic}`);
            })
            .catch(error => {
                // console.error('❌ Failed to publish alert served event:', error);
            });
    }

    // Publish alert unserved event when train reaches destination with unserved alerts
    publishAlertUnservedEvent(alertData, stationCode, stationName) {
        // Check if event publishing is enabled
        if (!window.publishEvents) {
            console.log('📤 Event publishing disabled, skipping alert unserved event');
            return;
        }
        
        if (!window.solaceTrainMonitor) {
            // console.warn('🚩 Solace integration not available for publishing alert unserved event');
            return;
        }
        
        const topic = `tms/alert/unserved/${alertData.type}/${alertData.trainNumber}/${stationCode}`;
        const payload = {
            type: alertData.type,
            trainNumber: alertData.trainNumber,
            trainName: alertData.trainName,
            coachNumber: alertData.coachNumber || 'Unknown',
            previousStation: alertData.previousStation,
            previousStationName: alertData.previousStationName,
            nextStation: stationCode,
            nextStationName: stationName,
            unservedStation: stationCode,
            unservedStationName: stationName,
            distanceTraveled: alertData.distanceTraveled || 0,
            lat: alertData.lat || 0,
            lon: alertData.lon || 0,
            timestamp: new Date().toISOString(),
            raisedTime: alertData.raisedTime || alertData.timestamp, // Preserve original raised time
            reason: 'train_reached_destination_with_unserved_alert'
        };
        
        window.solaceTrainMonitor.publish(topic, JSON.stringify(payload))
            .then(() => {
                // console.log(`📤 Published alert unserved event to topic: ${topic}`);
                // console.log(`📊 Alert unserved at destination: ${stationName}`);
            })
            .catch(error => {
                // console.error('❌ Failed to publish alert unserved event:', error);
            });
    }

    // Method to clear unserved alerts when train reaches destination
    clearUnservedAlertsAtDestination(trainNumber, destinationStation, destinationStationName) {
        // console.log(`🏁 CLEAR UNSERVED ALERTS CALLED for train ${trainNumber} at destination ${destinationStationName}`);
        
        if (!this.alertTracker) {
            // console.log(`❌ AlertTracker not available`);
            return;
        }
        
        // console.log(`🏁 Clearing unserved alerts for train ${trainNumber} at destination ${destinationStationName}`);
        // console.log(`🔍 Looking for station key: ${destinationStation}_${destinationStationName}`);
        // console.log(`📋 Available station keys:`, Array.from(this.alertTracker.keys()));
        // console.log(`📋 AlertTracker size:`, this.alertTracker.size);
        
        // Debug: Show all alerts in the tracker
        // console.log(`🔍 All alerts in tracker:`);
        for (const [key, data] of this.alertTracker.entries()) {
            // console.log(`  ${key}: ${data.alerts.received.length} alerts`);
            if (data.alerts.received.length > 0) {
                // console.log(`    Alerts:`, data.alerts.received.map(alert => `${alert.type} for train ${alert.trainNumber}`));
            }
        }
        
        let foundStation = false;
        let totalUnservedAlerts = 0;
        
        // First, check if there are any unserved alerts at other stations for this train
        // that should be moved to the destination before clearing
        let alertsToMoveToDestination = [];
        for (const [key, data] of this.alertTracker.entries()) {
            if (data.alerts.received.length > 0) {
                // Check if any alerts are for this train
                const trainAlerts = data.alerts.received.filter(alert => alert.trainNumber === trainNumber);
                if (trainAlerts.length > 0) {
                    // console.log(`🔍 Found ${trainAlerts.length} unserved alerts for train ${trainNumber} at station ${key}`);
                    // console.log(`🔍 Alert details:`, trainAlerts.map(alert => ({ type: alert.type, id: alert.id, raisedTime: alert.raisedTime })));
                    alertsToMoveToDestination.push(...trainAlerts);
                }
            }
        }
        
        // If there are alerts to move to destination, move them first
        if (alertsToMoveToDestination.length > 0) {
            // console.log(`🚩 Moving ${alertsToMoveToDestination.length} unserved alerts to destination ${destinationStationName} before clearing`);
            
            // Get or create destination station data
            const destinationStationKey = `${destinationStation}_${destinationStationName}`;
            if (!this.alertTracker.has(destinationStationKey)) {
                this.alertTracker.set(destinationStationKey, {
                    stationCode: destinationStation,
                    stationName: destinationStationName,
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
            
            const destinationStationData = this.alertTracker.get(destinationStationKey);
            
            // Move alerts to destination
            alertsToMoveToDestination.forEach(alert => {
                // Check if alert already exists in destination to prevent duplicates
                const existingAlert = destinationStationData.alerts.received.find(existing => 
                    existing.id === alert.id
                );
                
                if (!existingAlert) {
                    // Update alert with destination information
                    const movedAlert = {
                        ...alert,
                        nextStation: destinationStation,
                        nextStationName: destinationStationName,
                        timestamp: new Date().toISOString(),
                        movedFrom: alert.nextStation,
                        movedFromName: alert.nextStationName,
                        raisedTime: alert.raisedTime || alert.timestamp
                    };
                    
                    destinationStationData.alerts.received.push(movedAlert);
                    destinationStationData.summary.received++;
                    // console.log(`✅ Moved alert ${movedAlert.type} for train ${movedAlert.trainNumber} to destination ${destinationStationName}`);
                    // console.log(`✅ Alert details after move:`, { type: movedAlert.type, id: movedAlert.id, raisedTime: movedAlert.raisedTime });
                } else {
                    // console.log(`⏭️ Alert ${alert.type} for train ${alert.trainNumber} already exists in destination ${destinationStationName}`);
                }
            });
            
            // Remove alerts from their original stations
            for (const [key, data] of this.alertTracker.entries()) {
                if (key !== destinationStationKey) {
                    const originalLength = data.alerts.received.length;
                    data.alerts.received = data.alerts.received.filter(alert => alert.trainNumber !== trainNumber);
                    const removedCount = originalLength - data.alerts.received.length;
                    if (removedCount > 0) {
                        data.summary.received -= removedCount;
                        // console.log(`🗑️ Removed ${removedCount} alerts from station ${key}`);
                    }
                }
            }
            
            // Debug: Show the state after moving alerts
            // console.log(`🔍 Alert tracker state after moving alerts to destination:`);
            for (const [key, data] of this.alertTracker.entries()) {
                if (data.alerts.received.length > 0) {
                    // console.log(`  ${key}: ${data.alerts.received.length} alerts`);
                    data.alerts.received.forEach(alert => {
                        // console.log(`    - ${alert.type} for train ${alert.trainNumber} (id: ${alert.id})`);
                    });
                }
            }
        }
        
        // Now find the station key that matches the destination station
        for (const [key, data] of this.alertTracker.entries()) {
            // console.log(`🔍 Checking key: "${key}" against pattern: "${destinationStation}_"`);
            if (key.startsWith(`${destinationStation}_`)) {
                foundStation = true;
                // console.log(`✅ Found matching station key: ${key}`);
                // console.log(`📊 Station data:`, data);
                
                const unservedAlerts = [...data.alerts.received]; // Create a copy to avoid modification during iteration
                totalUnservedAlerts = unservedAlerts.length;
                
                // console.log(`📋 Found ${unservedAlerts.length} unserved alerts at destination ${destinationStationName}`);
                // console.log(`📋 Unserved alerts:`, unservedAlerts);
                
                if (unservedAlerts.length > 0) {
                    // Publish unserved events for each alert
                    const stickyProb = (window && typeof window.MULTI_ALERT_STICKY_PROB === 'number') ? window.MULTI_ALERT_STICKY_PROB : 0.1;
                    unservedAlerts.forEach((alert, index) => {
                        const shouldUnserve = alert.sticky ? true : (Math.random() < stickyProb);
                        if (shouldUnserve) {
                            this.publishAlertUnservedEvent(alert, destinationStation, destinationStationName);
                        } else {
                            // Treat as served upon arrival at destination
                            this.publishAlertServedEvent(alert, destinationStation, destinationStationName);
                        }
                    });
                    
                    // Clear the alerts from the tracker
                    data.alerts.received = [];
                    data.summary.received = 0;
                    
                    // Clear the flag on the map
                    if (window.trainMonitorInstance) {
                        // console.log(`🚩 Clearing flag for destination station ${destinationStation}`);
                        window.trainMonitorInstance.updateAlertFlag(destinationStation, 0);
                    }
                } else {
                    // console.log(`📋 No unserved alerts found at destination ${destinationStationName}`);
                }
                break;
            }
        }
        
        if (!foundStation) {
            // console.log(`❌ No station found with key starting with: ${destinationStation}_`);
        }
        
        // console.log(`🏁 CLEAR UNSERVED ALERTS COMPLETED - Found station: ${foundStation}, Unserved alerts: ${totalUnservedAlerts}`);
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
                // console.log(`📊 Alerts marked as served for station ${stationCode}:`, data.summary);
                
                // console.log(`✅ Alerts marked as served for station ${stationCode}:`, data.summary);
                break;
            }
        }
    }

    /**
     * Generate alert raised event brief description
     */
    generateAlertRaisedEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const trainName = data.trainName || 'Unknown Train';
        const alertType = data.type || 'Unknown';
        const stationName = data.nextStationName || 'Unknown Station';
        const coachNumber = data.coachNumber || 'Unknown';
        
        // Check if this is a re-raised alert (moved from previous station)
        if (data.reason === 'alert_moved_from_previous_station' && data.movedFromName) {
            return `🔄 Alert re-raised: ${alertType.replace(/_/g, ' ')} for Train ${trainNumber} (${trainName}) Coach ${coachNumber} at ${stationName} (moved from ${data.movedFromName})`;
        }
        
        return `🚨 Alert raised: ${alertType.replace(/_/g, ' ')} for Train ${trainNumber} (${trainName}) Coach ${coachNumber} at ${stationName}`;
    }


    /**
     * Generate train event brief description
     */
    generateTrainEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const trainName = data.trainName || 'Unknown Train';
        const status = data.status || 'Unknown';
        
        // Handle different event types based on the data structure
        if (data.eventType) {
            switch (data.eventType) {
                case 'train_arrival':
                    return `🚂 Train ${trainNumber} (${trainName}) arrived at ${data.stationName || 'Unknown Station'}`;
                case 'train_departure':
                    return `🚂 Train ${trainNumber} (${trainName}) departed from ${data.stationName || 'Unknown Station'}`;
                case 'train_stopped':
                    return `🚂 Train ${trainNumber} (${trainName}) stopped at ${data.stationName || 'Unknown Station'}`;
                case 'train_destination':
                    return `🏁 Train ${trainNumber} (${trainName}) arrived at destination: ${data.stationName || 'Unknown Station'}`;
                default:
                    return `🚂 Train ${trainNumber} (${trainName}) - ${data.eventType}`;
            }
        }
        
        // Fallback to status-based logic
        switch (status) {
            case 'departed':
                return `🚂 Train ${trainNumber} (${trainName}) departed from ${data.currentStationName || data.originName || 'Unknown Station'}`;
            case 'arrived':
                return `🚂 Train ${trainNumber} (${trainName}) arrived at ${data.currentStationName || data.destinationName || 'Unknown Station'}`;
            case 'stopped':
                return `🚂 Train ${trainNumber} (${trainName}) stopped at ${data.currentStationName || 'Unknown Station'}`;
            default:
                return `🚂 Train ${trainNumber} (${trainName}) - ${status}`;
        }
    }

    /**
     * Generate station event brief description
     */
    generateStationEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const trainName = data.trainName || 'Unknown Train';
        const status = data.status || 'Unknown';
        const station = data.currentStationName || data.stationName || data.currentStation || 'Unknown Station';
        
        switch (status) {
            case 'arrived':
                return `🚉 Train ${trainNumber} (${trainName}) arrived at ${station}`;
            case 'departed':
                return `🚉 Train ${trainNumber} (${trainName}) departed from ${station}`;
            case 'stopped':
                return `🚉 Train ${trainNumber} (${trainName}) stopped at ${station}`;
            default:
                return `🚉 Train ${trainNumber} (${trainName}) at ${station} - ${status}`;
        }
    }

    /**
     * Generate alert event brief description
     */
    generateAlertEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const trainName = data.trainName || 'Unknown Train';
        const alertType = data.type || 'Unknown';
        const stationName = data.nextStationName || data.stationName || data.currentStationName || 'Unknown Station';
        
        // Map alert types to user-friendly names
        const alertTypeMap = {
            'water_tank': 'Water Tank',
            'breakdown': 'Breakdown',
            'ac_malfunction': 'AC Malfunction',
            'emergency': 'Emergency'
        };
        
        const friendlyAlertType = alertTypeMap[alertType] || alertType.replace(/_/g, ' ');
        const coachNumber = data.coachNumber || 'Unknown';
        
        return `⚠️ Alert: ${friendlyAlertType} for Train ${trainNumber} (${trainName}) Coach ${coachNumber} at ${stationName}`;
    }

    generateAlertMissedEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const trainName = data.trainName || 'Unknown Train';
        const alertType = data.type || 'Unknown';
        const missedStation = data.missedStationName || 'Unknown Station';
        const nextStation = data.nextStationName || 'Unknown Station';
        const coachNumber = data.coachNumber || 'Unknown';
        
        return `❌ Missed Alert: ${alertType.replace(/_/g, ' ')} for Train ${trainNumber} (${trainName}) Coach ${coachNumber} at ${missedStation} (moved to ${nextStation})`;
    }

    generateAlertServedEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const trainName = data.trainName || 'Unknown Train';
        const alertType = data.type || 'Unknown';
        const stationName = data.stationName || 'Unknown Station';
        const servedBy = data.servedBy || 'system';
        const coachNumber = data.coachNumber || 'Unknown';
        
        return `✅ Alert Served: ${alertType.replace(/_/g, ' ')} for Train ${trainNumber} (${trainName}) Coach ${coachNumber} at ${stationName} (${servedBy})`;
    }

    generateAlertUnservedEventBrief(data) {
        const trainNumber = data.trainNumber || 'Unknown';
        const trainName = data.trainName || 'Unknown Train';
        const alertType = data.type || 'Unknown';
        const stationName = data.unservedStationName || 'Unknown Station';
        const coachNumber = data.coachNumber || 'Unknown';
        
        return `🚫 Alert Unserved: ${alertType.replace(/_/g, ' ')} for Train ${trainNumber} (${trainName}) Coach ${coachNumber} at ${stationName}`;
    }

    /**
     * Generate train event details
     */
    generateTrainEventDetails(data) {
        const details = [];
        
        if (data.trainNumber) details.push({ label: 'Train Number', value: data.trainNumber });
        if (data.trainName) details.push({ label: 'Train Name', value: data.trainName });
        if (data.status) details.push({ label: 'Status', value: data.status });
        if (data.eventType) details.push({ label: 'Event Type', value: data.eventType.replace(/_/g, ' ') });
        
        // Station information
        if (data.stationName) details.push({ label: 'Station', value: data.stationName });
        if (data.stationCode) details.push({ label: 'Station Code', value: data.stationCode });
        if (data.currentStationName) details.push({ label: 'Current Station', value: data.currentStationName });
        if (data.nextStationName) details.push({ label: 'Next Station', value: data.nextStationName });
        if (data.previousStationName) details.push({ label: 'Previous Station', value: data.previousStationName });
        
        // Origin and destination
        if (data.originName) details.push({ label: 'Origin', value: data.originName });
        if (data.destinationName) details.push({ label: 'Destination', value: data.destinationName });
        
        // Timing information
        if (data.arrivalTime) details.push({ label: 'Arrival Time', value: new Date(data.arrivalTime).toLocaleString() });
        if (data.departureTime) details.push({ label: 'Departure Time', value: new Date(data.departureTime).toLocaleString() });
        if (data.stopTime) details.push({ label: 'Stop Time', value: new Date(data.stopTime).toLocaleString() });
        if (data.haltDuration) details.push({ label: 'Halt Duration', value: `${data.haltDuration} seconds` });
        if (data.time) details.push({ label: 'Time', value: data.time });
        
        // Additional information
        if (data.distanceTraveled) details.push({ label: 'Distance Traveled', value: `${data.distanceTraveled} km` });
        if (data.platform) details.push({ label: 'Platform', value: data.platform });
        if (data.journeyCompleted) details.push({ label: 'Journey Completed', value: data.journeyCompleted ? 'Yes' : 'No' });
        if (data.totalStations) details.push({ label: 'Total Stations', value: data.totalStations });
        
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
        if (data.eventType) details.push({ label: 'Event Type', value: data.eventType.replace(/_/g, ' ') });
        
        // Station information
        if (data.stationName) details.push({ label: 'Station', value: data.stationName });
        if (data.stationCode) details.push({ label: 'Station Code', value: data.stationCode });
        if (data.currentStationName) details.push({ label: 'Current Station', value: data.currentStationName });
        if (data.previousStationName) details.push({ label: 'Previous Station', value: data.previousStationName });
        if (data.nextStationName) details.push({ label: 'Next Station', value: data.nextStationName });
        
        // Timing information
        if (data.arrivalTime) details.push({ label: 'Arrival Time', value: new Date(data.arrivalTime).toLocaleString() });
        if (data.departureTime) details.push({ label: 'Departure Time', value: new Date(data.departureTime).toLocaleString() });
        if (data.stopTime) details.push({ label: 'Stop Time', value: new Date(data.stopTime).toLocaleString() });
        if (data.haltDuration) details.push({ label: 'Halt Duration', value: `${data.haltDuration} seconds` });
        if (data.time) details.push({ label: 'Time', value: data.time });
        
        // Additional information
        if (data.distanceTraveled) details.push({ label: 'Distance Traveled', value: `${data.distanceTraveled} km` });
        if (data.platform) details.push({ label: 'Platform', value: data.platform });
        
        return details;
    }

    /**
     * Generate alert event details
     */
    generateAlertEventDetails(data) {
        const details = [];
        
        // Map alert types to user-friendly names
        const alertTypeMap = {
            'water_tank': 'Water Tank',
            'breakdown': 'Breakdown',
            'ac_malfunction': 'AC Malfunction',
            'emergency': 'Emergency'
        };
        
        if (data.type) {
            const friendlyAlertType = alertTypeMap[data.type] || data.type.replace(/_/g, ' ');
            details.push({ label: 'Alert Type', value: friendlyAlertType });
        }
        if (data.trainNumber) details.push({ label: 'Train Number', value: data.trainNumber });
        if (data.trainName) details.push({ label: 'Train Name', value: data.trainName });
        if (data.coachNumber) details.push({ label: 'Coach Number', value: data.coachNumber });
        
        // Station information
        if (data.stationName) details.push({ label: 'Station', value: data.stationName });
        if (data.stationCode) details.push({ label: 'Station Code', value: data.stationCode });
        if (data.previousStation) details.push({ label: 'Previous Station', value: `${data.previousStation} - ${data.previousStationName || 'Unknown'}` });
        if (data.nextStation) details.push({ label: 'Next Station', value: `${data.nextStation} - ${data.nextStationName || 'Unknown'}` });
        if (data.currentStation) details.push({ label: 'Current Station', value: `${data.currentStation} - ${data.currentStationName || 'Unknown'}` });
        
        // Show additional info for re-raised alerts
        if (data.reason === 'alert_moved_from_previous_station' && data.movedFromName) {
            details.push({ label: 'Moved From', value: data.movedFromName });
            details.push({ label: 'Reason', value: 'Alert moved from previous station' });
        }
        
        // Location and timing
        if (data.distanceTraveled) details.push({ label: 'Distance Traveled', value: `${data.distanceTraveled} km` });
        if (data.lat && data.lon) details.push({ label: 'Location', value: `${data.lat.toFixed(6)}, ${data.lon.toFixed(6)}` });
        if (data.raisedTime) details.push({ label: 'Original Alert Time', value: new Date(data.raisedTime).toLocaleString() });
        if (data.timestamp) details.push({ label: 'Event Time', value: new Date(data.timestamp).toLocaleString() });
        
        return details;
    }

    generateAlertMissedEventDetails(data) {
        const details = [];
        
        if (data.type) details.push({ label: 'Alert Type', value: data.type.replace(/_/g, ' ') });
        if (data.trainNumber) details.push({ label: 'Train Number', value: data.trainNumber });
        if (data.trainName) details.push({ label: 'Train Name', value: data.trainName });
        if (data.coachNumber) details.push({ label: 'Coach Number', value: data.coachNumber });
        if (data.missedStation) details.push({ label: 'Missed Station', value: `${data.missedStation} - ${data.missedStationName}` });
        if (data.nextStation) details.push({ label: 'Moved To Station', value: `${data.nextStation} - ${data.nextStationName}` });
        if (data.reason) details.push({ label: 'Reason', value: data.reason.replace(/_/g, ' ') });
        if (data.distanceTraveled) details.push({ label: 'Distance Traveled', value: `${data.distanceTraveled} km` });
        if (data.lat && data.lon) details.push({ label: 'Location', value: `${data.lat.toFixed(6)}, ${data.lon.toFixed(6)}` });
        if (data.raisedTime) details.push({ label: 'Original Alert Time', value: new Date(data.raisedTime).toLocaleString() });
        if (data.timestamp) details.push({ label: 'Missed Time', value: new Date(data.timestamp).toLocaleString() });
        
        return details;
    }

    generateAlertServedEventDetails(data) {
        const details = [];
        
        if (data.type) details.push({ label: 'Alert Type', value: data.type.replace(/_/g, ' ') });
        if (data.trainNumber) details.push({ label: 'Train Number', value: data.trainNumber });
        if (data.trainName) details.push({ label: 'Train Name', value: data.trainName });
        if (data.coachNumber) details.push({ label: 'Coach Number', value: data.coachNumber });
        if (data.stationCode) details.push({ label: 'Served At Station', value: `${data.stationCode} - ${data.stationName}` });
        if (data.servedBy) details.push({ label: 'Served By', value: data.servedBy.replace(/_/g, ' ') });
        if (data.raisedTime) details.push({ label: 'Original Alert Time', value: new Date(data.raisedTime).toLocaleString() });
        if (data.servedAt) details.push({ label: 'Served Time', value: new Date(data.servedAt).toLocaleString() });
        
        return details;
    }

    generateAlertUnservedEventDetails(data) {
        const details = [];
        
        if (data.type) details.push({ label: 'Alert Type', value: data.type.replace(/_/g, ' ') });
        if (data.trainNumber) details.push({ label: 'Train Number', value: data.trainNumber });
        if (data.trainName) details.push({ label: 'Train Name', value: data.trainName });
        if (data.coachNumber) details.push({ label: 'Coach Number', value: data.coachNumber });
        if (data.unservedStation) details.push({ label: 'Unserved At Station', value: `${data.unservedStation} - ${data.unservedStationName}` });
        if (data.reason) details.push({ label: 'Reason', value: data.reason.replace(/_/g, ' ') });
        if (data.raisedTime) details.push({ label: 'Original Alert Time', value: new Date(data.raisedTime).toLocaleString() });
        if (data.timestamp) details.push({ label: 'Unserved Time', value: new Date(data.timestamp).toLocaleString() });
        
        return details;
    }

    /**
     * Add a new event to the list
     */
    addEvent(event) {
        // console.log('📝 addEvent called with event:', event.type, event.brief);
        // console.log('📝 Events count before adding:', this.events.length);
        
        // Add to beginning of array (newest first)
        this.events.unshift(event);
        
        // Limit number of events only if auto-clean is enabled
        if (this.autoCleanEnabled && this.events.length > this.maxEvents) {
            this.events = this.events.slice(0, this.maxEvents);
        }
        
        // console.log('📝 Events count after adding:', this.events.length);
        // console.log('📝 Calling renderEvents...');
        
        this.renderEvents();
        this.autoScrollToTop();
        try {
            if (window.multiTrainSystem && window.multiTrainSystem.uiControls && typeof window.multiTrainSystem.uiControls.updateMultiStats === 'function') {
                window.multiTrainSystem.uiControls.updateMultiStats();
            }
        } catch (_e) {}
        
        // console.log('📝 addEvent completed');
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
            // console.log(`🧹 Auto-clean applied: reduced events from ${this.events.length + (this.events.length - this.maxEvents)} to ${this.maxEvents}`);
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
                    // Include all alert-related events (raised, missed, served, unserved)
                    return event.type === 'alert' || event.type === 'alert_missed' || event.type === 'alert_served' || event.type === 'alert_unserved';
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
    // console.log('📋 Event Manager initialized');
});
