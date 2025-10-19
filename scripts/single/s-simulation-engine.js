/**
 * Unified Simulation Engine - Handles both single and multi-train modes
 * Replaces the complex manager hierarchy with a single, clean implementation
 */
class SimulationEngine {
    constructor(trainMonitor) {
        this.trainMonitor = trainMonitor;
        this.isRunning = false;
        this.isPaused = false;
        this.updateInterval = null;
        
        // Train management
        this.trains = new Map(); // Map<trainNumber, Train>
        this.currentMode = 'single'; // 'single' or 'multi'
        
        // Performance tracking
        this.lastUpdateTime = 0;
        this.updateCount = 0;
    }

    /**
     * Initialize the simulation engine
     */
    initialize() {
        // console.log('🚀 SimulationEngine: Initializing unified simulation engine');
        this.stop(); // Ensure clean state
        this.trains.clear();
    }

    /**
     * Load single train for single-train mode
     */
    loadSingleTrain(trainData) {
        console.log(`🚀 SimulationEngine: Loading single train ${trainData.trainNumber}`);
        
        this.currentMode = 'single';
        this.trains.clear();
        
        // Use existing train monitor state (set up by train data manager)
        const trainDataFromMonitor = {
            trainNumber: this.trainMonitor.currentTrainNumber,
            trainName: this.trainMonitor.currentTrainName,
            route: this.trainMonitor.stations
        };
        
        console.log(`🚀 SimulationEngine: trainDataFromMonitor: ${JSON.stringify({
            trainNumber: trainDataFromMonitor.trainNumber,
            trainName: trainDataFromMonitor.trainName,
            routeLength: trainDataFromMonitor.route ? trainDataFromMonitor.route.length : 0
        })}`);
        
        // Create train instance using the existing state
        const train = new Train(trainDataFromMonitor.trainNumber, trainDataFromMonitor, this.trainMonitor);
        
        // Override train's initial state with the train monitor's state (set by train data manager)
        train.currentPosition = this.trainMonitor.currentPosition;
        train.currentSpeed = this.trainMonitor.currentSpeed;
        train.isAtStation = this.trainMonitor.isAtStation;
        train.stationStopStartTime = this.trainMonitor.stationStopStartTime;
        train.currentStationIndex = this.trainMonitor.currentStationIndex;
        
        this.trains.set(trainDataFromMonitor.trainNumber, train);
        
        // Update train monitor state for compatibility (use train's current state)
        this.trainMonitor.currentPosition = train.getState().currentPosition;
        this.trainMonitor.currentSpeed = train.getState().currentSpeed;
        this.trainMonitor.isAtStation = train.getState().isAtStation;
        
        console.log(`✅ Single train ${trainDataFromMonitor.trainNumber} loaded successfully into SimulationEngine, trains.size=${this.trains.size}`);
    }

    /**
     * Start the simulation
     */
    start() {
        console.log(`🚀 SimulationEngine.start() called, isRunning=${this.isRunning}, trains.size=${this.trains.size}, currentMode=${this.currentMode}`);
        
        if (this.isRunning) {
            console.log('⚠️ SimulationEngine: Simulation is already running');
            return;
        }

        if (this.trains.size === 0) {
            console.log('❌ SimulationEngine: No trains loaded, cannot start simulation');
            return;
        }

        this.isRunning = true;
        this.isPaused = false;
        this.lastUpdateTime = Date.now();
        this.updateCount = 0;
        
        console.log(`🚀 SimulationEngine: Starting ${this.currentMode}-train simulation with ${this.trains.size} trains`);
        
        // Start the unified simulation loop
        this.runSimulationLoop();
    }

    /**
     * Stop the simulation
     */
    stop() {
        this.isRunning = false;
        this.isPaused = false;
        
        if (this.updateInterval) {
            clearTimeout(this.updateInterval);
            this.updateInterval = null;
        }
        
        // console.log('⏹️ SimulationEngine: Simulation stopped');
    }

    /**
     * Pause the simulation
     */
    pause() {
        this.isPaused = true;
        // console.log('⏸️ SimulationEngine: Simulation paused');
    }

    /**
     * Resume the simulation
     */
    resume() {
        this.isPaused = false;
        // console.log('▶️ SimulationEngine: Simulation resumed');
    }

    /**
     * Main simulation loop - handles both single and multi-train modes
     */
    async runSimulationLoop() {
        if (!this.isRunning) {
            return;
        }

        try {
            const currentTime = Date.now();
            const deltaTime = currentTime - this.lastUpdateTime;
            this.lastUpdateTime = currentTime;
            this.updateCount++;

            // Update the single train if not paused
            if (!this.isPaused) {
                await this.updateSingleTrain(deltaTime);
            }

            // Calculate next update interval
            const interval = this.calculateUpdateInterval();
            
            // Schedule next update
            this.updateInterval = setTimeout(() => {
                this.runSimulationLoop();
            }, interval);

        } catch (error) {
            // console.error('❌ SimulationEngine: Error in simulation loop:', error);
            // Try to continue the loop even if there's an error
            this.updateInterval = setTimeout(() => {
                this.runSimulationLoop();
            }, 1000);
        }
    }

    /**
     * Update individual train
     */
    async updateTrain(trainNumber, train, deltaTime) {
        try {
            // Add detailed logging for train 12462 only
            if (trainNumber === 12462) {
                const beforeState = train.getState();
                console.log(`🔍 MULTI-TRAIN UPDATE [${trainNumber}]: Before update - pos=(${beforeState.currentPosition?.lat?.toFixed(6)}, ${beforeState.currentPosition?.lng?.toFixed(6)}), stationIdx=${beforeState.currentStationIndex}, speed=${beforeState.currentSpeed}km/h, atStation=${beforeState.isAtStation}`);
            }
            
            await train.update(deltaTime);
            
            if (trainNumber === 12462) {
                const afterState = train.getState();
                console.log(`🔍 MULTI-TRAIN UPDATE [${trainNumber}]: After update - pos=(${afterState.currentPosition?.lat?.toFixed(6)}, ${afterState.currentPosition?.lng?.toFixed(6)}), stationIdx=${afterState.currentStationIndex}, speed=${afterState.currentSpeed}km/h, atStation=${afterState.isAtStation}`);
            }
            
            // Update train monitor state for compatibility
            if (this.currentMode === 'single') {
                const state = train.getState();
                this.trainMonitor.currentPosition = state.currentPosition;
                this.trainMonitor.currentSpeed = state.currentSpeed;
                this.trainMonitor.isAtStation = state.isAtStation;
                this.trainMonitor.currentStationIndex = state.currentStationIndex;
                
                // Update the single train marker position on the map
                if (this.trainMonitor.trainMarker) {
                    this.trainMonitor.trainMarker.setLatLng([
                        state.currentPosition.lat,
                        state.currentPosition.lng
                    ]);
                    
                    // Auto-pan to keep train visible (using existing logic from train-simulation.js)
                    if (this.trainMonitor.uiControls && this.trainMonitor.uiControls.autoPanToKeepTrainVisible) {
                        this.trainMonitor.uiControls.autoPanToKeepTrainVisible(
                            state.currentPosition,
                            20  // marginPercent
                        );
                    }
                }
            } else {
                // Multi-train mode - update train state and marker position
                const state = train.getState();
                // All train states removed - single train mode only
                
                // Update the multi-train marker position on the map
                // All train markers removed - single train mode only
            }
            
        } catch (error) {
            // console.error(`❌ SimulationEngine: Error updating train ${trainNumber}:`, error);
        }
    }

    /**
     * Update single train (for single-train mode)
     */
    async updateSingleTrain(deltaTime) {
        if (this.trains.size === 0) {
            return;
        }
        
        // Get the single train (should be only one)
        const trainEntry = this.trains.entries().next().value;
        if (!trainEntry) {
            return;
        }
        
        const [trainNumber, train] = trainEntry;
        await this.updateTrain(trainNumber, train, deltaTime);
        
        // Update global state
        this.updateGlobalState();
    }

    /**
     * Calculate optimal update interval based on mode and train count
     */
    calculateUpdateInterval() {
        const baseInterval = 100; // Base 100ms interval
        
        if (this.currentMode === 'single') {
            // Single train mode - use simulation speed
            return Math.max(50, baseInterval / this.trainMonitor.speed);
        } else {
            // Multi-train mode - adaptive interval based on train count
            const trainCount = this.trains.size;
            const adaptiveInterval = Math.max(50, Math.min(200, baseInterval + (trainCount * 2)));
            return adaptiveInterval;
        }
    }

    /**
     * Update global state for UI compatibility
     */
    updateGlobalState() {
        // Single train mode - update UI controls
        this.trainMonitor.uiControls.updateTrainInfo();
        this.trainMonitor.uiControls.updateProgressBar();
        this.trainMonitor.uiControls.updateSpeedDisplay(this.trainMonitor.currentSpeed);
        
        // Update status with origin/destination semantics
        const totalStations = this.trainMonitor.stations ? this.trainMonitor.stations.length : 0;
        const idx = this.trainMonitor.currentStationIndex || 0;
        const atDestination = totalStations > 0 && idx >= totalStations - 1;
        const atOrigin = idx === 0 && this.trainMonitor.isAtStation;
        if (atDestination) {
            this.trainMonitor.uiControls.updateStatus('At Destination');
        } else if (atOrigin) {
            this.trainMonitor.uiControls.updateStatus('At Origin');
        } else if (this.trainMonitor.isAtStation) {
            this.trainMonitor.uiControls.updateStatus('Stopped');
        } else {
            this.trainMonitor.uiControls.updateStatus('Running');
        }
    }

    /**
     * Get train by number
     */
    getTrain(trainNumber) {
        return this.trains.get(trainNumber);
    }

    /**
     * Get simulation statistics
     */
    getStats() {
        const trains = Array.from(this.trains.values());
        return {
            mode: this.currentMode,
            totalTrains: trains.length,
            movingTrains: trains.filter(train => !train.isAtStation).length,
            atStations: trains.filter(train => train.isAtStation).length,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            speed: this.trainMonitor.speed,
            updateCount: this.updateCount
        };
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stop();
        this.trains.clear();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimulationEngine;
}
