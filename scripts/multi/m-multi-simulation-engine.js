/**
 * Independent Multi-Train Simulation Engine
 * Completely separate from single-train system
 * Handles simulation logic for multiple trains
 */
class MultiSimulationEngine {
    constructor() {
        this.multiTrainManager = null;
        this.isRunning = false;
        this.isPaused = false;
        this.simulationLoop = null;
        this.lastUpdateTime = 0;
        this.simulationSpeed = 1.0; // 1x normal speed
        this.updateInterval = 50; // ms between updates
    }

    /**
     * Initialize the multi-train simulation engine
     */
    async initialize(dataManager) {
        console.log('🚀 MultiSimulationEngine: Initializing...');
        
        try {
            // Create multi-train manager
            this.multiTrainManager = new MultiTrainManager();
            
            // Initialize multi-train manager with data manager
            await this.multiTrainManager.initialize(dataManager);
            
            console.log('✅ MultiSimulationEngine: Initialized successfully');
        } catch (error) {
            console.error('❌ MultiSimulationEngine: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Start the multi-train simulation
     */
    start() {
        if (this.isRunning) {
            console.log('⚠️ MultiSimulationEngine: Simulation already running');
            return;
        }

        console.log('🚀 MultiSimulationEngine: Starting multi-train simulation');
        this.isRunning = true;
        this.isPaused = false;
        this.lastUpdateTime = Date.now();
        
        // Publish Departed Origin for all trains once at start
        try {
            if (!this._departedOriginPublished && this.multiTrainManager && window.solaceTrainMonitor && window.solaceTrainMonitor.isConnected) {
                this._departedOriginPublished = true;
                this.multiTrainManager.trains.forEach((train, trainNumber) => {
                    if (!train || !train.route || train.route.length < 2) return;
                    const origin = train.route[0];
                    const dest = train.route[train.route.length - 1];
                    const payload = {
                        trainNumber: trainNumber,
                        trainName: train.trainName,
                        origin: origin?.code,
                        originName: origin?.name,
                        destination: dest?.code,
                        destinationName: dest?.name,
                        distanceTraveled: 0
                    };
                    try { window.solaceTrainMonitor.publishTrainDepartedOrigin(payload); } catch (_e) {}
                });
            }
        } catch (_e) {}
        
        this.runSimulationLoop();
    }

    /**
     * Pause the simulation
     */
    pause() {
        if (!this.isRunning) {
            console.log('⚠️ MultiSimulationEngine: Simulation not running');
            return;
        }

        console.log('⏸️ MultiSimulationEngine: Pausing simulation');
        this.isPaused = true;
    }

    /**
     * Resume the simulation
     */
    resume() {
        if (!this.isRunning) {
            console.log('⚠️ MultiSimulationEngine: Simulation not running');
            return;
        }

        console.log('▶️ MultiSimulationEngine: Resuming simulation');
        this.isPaused = false;
        this.lastUpdateTime = Date.now();
    }

    /**
     * Stop the simulation
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️ MultiSimulationEngine: Simulation not running');
            return;
        }

        console.log('⏹️ MultiSimulationEngine: Stopping simulation');
        this.isRunning = false;
        this.isPaused = false;
        
        if (this.simulationLoop) {
            clearTimeout(this.simulationLoop);
            this.simulationLoop = null;
        }
    }

    /**
     * Main simulation loop
     */
    runSimulationLoop() {
        if (!this.isRunning) {
            return;
        }

        const currentTime = Date.now();
        const deltaTime = currentTime - this.lastUpdateTime;
        this.lastUpdateTime = currentTime;

        // Update trains if not paused
        if (!this.isPaused && this.multiTrainManager) {
            this.multiTrainManager.updateAllTrains(deltaTime * this.simulationSpeed);
        } else if (this.isPaused) {
            // Lightweight throttled debug when paused
            if (!this._lastPauseLog || currentTime - this._lastPauseLog > 1000) {
                console.log('⏸️ MultiSimulationEngine: Paused - skipping updates');
                this._lastPauseLog = currentTime;
            }
        }

        // Schedule next update
        this.simulationLoop = setTimeout(() => {
            this.runSimulationLoop();
        }, this.updateInterval);
    }

    /**
     * Set simulation speed
     */
    setSpeed(speed) {
        this.simulationSpeed = Math.max(0.1, Math.min(10.0, speed));
        console.log(`🏃 MultiSimulationEngine: Speed set to ${this.simulationSpeed}x`);
    }

    /**
     * Get simulation status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            speed: this.simulationSpeed,
            trainCount: this.multiTrainManager ? this.multiTrainManager.trains.size : 0
        };
    }

    /**
     * Focus on a specific train
     */
    focusOnTrain(trainNumber) {
        if (this.multiTrainManager) {
            this.multiTrainManager.focusOnTrain(trainNumber);
        }
    }

    /**
     * Return to overview mode
     */
    returnToOverview() {
        if (this.multiTrainManager) {
            this.multiTrainManager.returnToOverview();
        }
    }

    /**
     * Cleanup and destroy the simulation engine
     */
    destroy() {
        console.log('🧹 MultiSimulationEngine: Destroying...');
        
        this.stop();
        
        if (this.multiTrainManager) {
            this.multiTrainManager.destroy();
            this.multiTrainManager = null;
        }
        
        console.log('✅ MultiSimulationEngine: Destroyed');
    }
}
