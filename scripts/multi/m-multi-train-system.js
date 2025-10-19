/**
 * Independent Multi-Train System
 * Main entry point for multi-train simulation
 * Completely separate from single-train system
 */
class MultiTrainSystem {
    constructor() {
        this.dataManager = null;
        this.simulationEngine = null;
        this.uiControls = null;
        this.isInitialized = false;
        this.isRunning = false;
    }

    /**
     * Initialize the multi-train system
     */
    async initialize() {
        console.log('🚂 MultiTrainSystem: Initializing independent multi-train system...');
        
        try {
            // Initialize data manager
            this.dataManager = new MultiTrainDataManager();
            await this.dataManager.initialize();
            
            // Initialize simulation engine
            this.simulationEngine = new MultiSimulationEngine();
            await this.simulationEngine.initialize(this.dataManager);
            
            // Initialize UI controls
            this.uiControls = new MultiTrainUIControls();
            this.uiControls.initialize();
            
            this.isInitialized = true;
            console.log('✅ MultiTrainSystem: Initialized successfully');
        } catch (error) {
            console.error('❌ MultiTrainSystem: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize the multi-train system (create markers, etc.) without starting simulation
     */
    async initializeSystem() {
        console.log('🚀 MultiTrainSystem: Initializing multi-train system...');
        
        // Immediately set zoom level to 5 before any other operations
        if (window.trainMonitorInstance && window.trainMonitorInstance.map) {
            window.trainMonitorInstance.map.setZoom(5);
        }
        
        try {
            // Stop any existing single-train simulation
            if (window.trainMonitorInstance && window.trainMonitorInstance.simulationEngine) {
                window.trainMonitorInstance.simulationEngine.stop();
            }
            
            // Clear single-train markers
            if (window.trainMonitorInstance) {
                window.trainMonitorInstance.resetAll();
            }
            
            // Update UI
            this.uiControls.showMultiTrainStatus();
            this.uiControls.showMultiTrainControls();
            this.uiControls.showSimulationControls();
            // Show multi-train stats block and initialize
            const statsBlock = document.getElementById('multi-stats');
            if (statsBlock) statsBlock.style.display = 'block';
            // Hide single-train info fields while in multi-train mode
            try {
                const infoDisplay = document.querySelector('.info-display');
                if (infoDisplay) {
                    Array.from(infoDisplay.children).forEach(child => {
                        if (child && child.id !== 'multi-stats') {
                            child.dataset.__prevDisplay = child.style.display || '';
                            child.style.display = 'none';
                        }
                    });
                }
                // Also hide progress UI
                const progressBar = document.querySelector('.progress-bar');
                if (progressBar) { progressBar.dataset.__prevDisplay = progressBar.style.display || ''; progressBar.style.display = 'none'; }
                const progressText = document.getElementById('progressText')?.parentElement;
                if (progressText) { progressText.dataset.__prevDisplay = progressText.style.display || ''; progressText.style.display = 'none'; }
            } catch (_e) {}
            
            // Update train count
            const stats = this.dataManager.getStats();
            this.uiControls.updateTrainCount(stats.trainsWithRoutes);
            // Initialize multi-train stats in sidebar
            if (typeof this.uiControls.updateMultiStats === 'function') {
                this.uiControls.updateMultiStats();
            }
            
            console.log('✅ MultiTrainSystem: System initialized successfully (simulation not started)');
        } catch (error) {
            console.error('❌ MultiTrainSystem: Failed to initialize system:', error);
            throw error;
        }
    }

    /**
     * Start the multi-train system
     */
    async start() {
        if (!this.isInitialized) {
            console.error('❌ MultiTrainSystem: System not initialized');
            return;
        }

        if (this.isRunning) {
            console.log('⚠️ MultiTrainSystem: System already running');
            return;
        }

        console.log('🚀 MultiTrainSystem: Starting multi-train simulation...');
        
        try {
            // Start multi-train simulation
            this.simulationEngine.start();
            
            this.isRunning = true;
            console.log('✅ MultiTrainSystem: Simulation started successfully');
        } catch (error) {
            console.error('❌ MultiTrainSystem: Failed to start simulation:', error);
            this.uiControls.showError('Failed to start multi-train simulation');
        }
    }

    /**
     * Stop the multi-train system
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️ MultiTrainSystem: System not running');
            return;
        }

        console.log('⏹️ MultiTrainSystem: Stopping multi-train system...');
        
        try {
            // Stop simulation
            this.simulationEngine.stop();
            
            // Clear markers
            this.simulationEngine.multiTrainManager.clearAllMarkers();
            
            // Update UI
            this.uiControls.hideMultiTrainStatus();
            this.uiControls.hideMultiTrainControls();
            this.uiControls.hideSimulationControls();
            
            this.isRunning = false;
            console.log('✅ MultiTrainSystem: Stopped successfully');
        } catch (error) {
            console.error('❌ MultiTrainSystem: Failed to stop:', error);
        }
    }

    /**
     * Reset the multi-train system without changing user zoom/center
     */
    async reset() {
        try {
            // Reset start
            const map = window.trainMonitorInstance && window.trainMonitorInstance.map;
            const center = map ? map.getCenter() : null;
            const zoom = map ? map.getZoom() : null;
            if (this.simulationEngine) {
                this.simulationEngine.stop();
                // Always clear markers and internal state
                if (this.simulationEngine.multiTrainManager) {
                    this.simulationEngine.multiTrainManager.clearAllMarkers();
                    this.simulationEngine.multiTrainManager.trains.clear();
                    this.simulationEngine.multiTrainManager.trainStates.clear();
                    this.simulationEngine.multiTrainManager.isPlotting = false;
                    this.simulationEngine.multiTrainManager._plotToken++;
                }
            }
            // Reinitialize manager data only; do NOT auto-plot. Let Play trigger plotting.
            if (this.simulationEngine && this.simulationEngine.multiTrainManager) {
                const mgr = this.simulationEngine.multiTrainManager;
                // Load trains from data manager
                await mgr.loadTrainsFromDataManager(this.dataManager);
                // Trains loaded
                // Prepare plot state, but do not start plotting automatically
                mgr.trainNumbers = Array.from(mgr.trains.keys());
                mgr.currentTrainIndex = 0;
                mgr.isPlotting = false;
                // Clear any old token so next explicit plot creates a new session
                mgr._plotToken++;
                // Ready for plotting on Play
            }
            // Restore map view
            if (map && center && zoom !== null) {
                map.setView(center, zoom, { animate: false });
            }
            // Refresh sidebar stats
            if (this.uiControls && typeof this.uiControls.updateMultiStats === 'function') {
                this.uiControls.updateMultiStats();
            }
            // Reset the stats panel to zeroed state after reset
            if (this.uiControls && typeof this.uiControls.resetMultiStatsDisplay === 'function') {
                this.uiControls.resetMultiStatsDisplay();
            }
            // Reset complete
        } catch (e) {
            console.error('❌ MultiTrainSystem: Reset failed:', e);
        }
    }

    /**
     * Pause the multi-train system
     */
    pause() {
        if (!this.isRunning) {
            console.log('⚠️ MultiTrainSystem: System not running');
            return;
        }

        console.log('⏸️ MultiTrainSystem: Pausing multi-train system...');
        this.simulationEngine.pause();
        
        // Update UI
        const status = this.simulationEngine.getStatus();
        this.uiControls.updateSimulationStatus(status);
    }

    /**
     * Resume the multi-train system
     */
    resume() {
        if (!this.isRunning) {
            console.log('⚠️ MultiTrainSystem: System not running');
            return;
        }

        console.log('▶️ MultiTrainSystem: Resuming multi-train system...');
        this.simulationEngine.resume();
        
        // Update UI
        const status = this.simulationEngine.getStatus();
        this.uiControls.updateSimulationStatus(status);
    }

    /**
     * Set simulation speed
     */
    setSpeed(speed) {
        if (this.simulationEngine) {
            this.simulationEngine.setSpeed(speed);
        }
    }

    /**
     * Focus on a specific train
     */
    focusOnTrain(trainNumber) {
        if (this.simulationEngine) {
            this.simulationEngine.focusOnTrain(trainNumber);
            this.uiControls.onTrainFocus(trainNumber);
        }
    }

    /**
     * Return to overview mode
     */
    returnToOverview() {
        if (this.simulationEngine) {
            this.simulationEngine.returnToOverview();
            this.uiControls.onOverviewMode();
        }
    }

    /**
     * Get system status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isRunning: this.isRunning,
            simulationStatus: this.simulationEngine ? this.simulationEngine.getStatus() : null,
            dataStats: this.dataManager ? this.dataManager.getStats() : null
        };
    }

    /**
     * Cleanup and destroy the system
     */
    destroy() {
        console.log('🧹 MultiTrainSystem: Destroying...');
        
        this.stop();
        
        if (this.simulationEngine) {
            this.simulationEngine.destroy();
            this.simulationEngine = null;
        }
        
        if (this.uiControls) {
            this.uiControls.destroy();
            this.uiControls = null;
        }
        // Restore single-train info UI
        try {
            const statsBlock = document.getElementById('multi-stats');
            if (statsBlock) statsBlock.style.display = 'none';
            const infoDisplay = document.querySelector('.info-display');
            if (infoDisplay) {
                Array.from(infoDisplay.children).forEach(child => {
                    if (child && child.id !== 'multi-stats') {
                        const prev = child.dataset.__prevDisplay;
                        child.style.display = prev !== undefined ? prev : '';
                        delete child.dataset.__prevDisplay;
                    }
                });
            }
            const progressBar = document.querySelector('.progress-bar');
            if (progressBar) { const prev = progressBar.dataset.__prevDisplay; progressBar.style.display = prev !== undefined ? prev : ''; delete progressBar.dataset.__prevDisplay; }
            const progressText = document.getElementById('progressText')?.parentElement;
            if (progressText) { const prev = progressText.dataset.__prevDisplay; progressText.style.display = prev !== undefined ? prev : ''; delete progressText.dataset.__prevDisplay; }
        } catch (_e) {}
        
        this.dataManager = null;
        this.isInitialized = false;
        
        console.log('✅ MultiTrainSystem: Destroyed');
    }
}

// Global instance for multi-train system
window.multiTrainSystem = null;

/**
 * Launch multi-train system
 * This is the main entry point called from single-train system
 */
async function launchMultiTrainSystem() {
    console.log('🚀 Launching multi-train system...');
    
    try {
        // Create new instance
        window.multiTrainSystem = new MultiTrainSystem();
        
        // Initialize
        await window.multiTrainSystem.initialize();
        
        // Initialize system (create markers, etc.) but don't start simulation yet
        await window.multiTrainSystem.initializeSystem();
        
        console.log('✅ Multi-train system launched successfully');
    } catch (error) {
        console.error('❌ Failed to launch multi-train system:', error);
        
        // Cleanup on failure
        if (window.multiTrainSystem) {
            window.multiTrainSystem.destroy();
            window.multiTrainSystem = null;
        }
    }
}

/**
 * Stop multi-train system
 * This is called when switching back to single-train mode
 */
function stopMultiTrainSystem() {
    console.log('⏹️ Stopping multi-train system...');
    
    if (window.multiTrainSystem) {
        window.multiTrainSystem.destroy();
        window.multiTrainSystem = null;
    }
    
    console.log('✅ Multi-train system stopped');
}
