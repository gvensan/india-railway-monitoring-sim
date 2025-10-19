/**
 * Independent Multi-Train UI Controls
 * Completely separate from single-train system
 * Handles UI interactions for multi-train mode
 */
class MultiTrainUIControls {
    constructor() {
        this.isInitialized = false;
    }

    /**
     * Initialize the multi-train UI controls
     */
    initialize() {
        console.log('🎮 MultiTrainUIControls: Initializing...');
        
        try {
            // Real-time controls removed
            
            // Setup event listeners
            this.setupEventListeners();
            
            this.isInitialized = true;
            console.log('✅ MultiTrainUIControls: Initialized successfully');
        } catch (error) {
            console.error('❌ MultiTrainUIControls: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize time controls visibility
     */
    initializeTimeControls() {
        const realtimeCheckbox = document.getElementById('realtimeCheckbox');
        const timeControls = document.getElementById('timeControls');
        
        if (realtimeCheckbox && timeControls) {
            // Hide time controls by default (checkbox unchecked)
            timeControls.style.display = 'none';
            console.log('🎮 MultiTrainUIControls: Time controls hidden by default');
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Real-time checkbox removed
        
        // Setup play button
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.handlePlayClick();
            });
        }
        
        // Setup stop button
        const stopBtn = document.getElementById('stopBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.handleStopClick();
            });
        }

        // Wire Reset button for multi-train reset when multi system is active
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                try {
                    if (window.multiTrainSystem && typeof window.multiTrainSystem.reset === 'function') {
                        await window.multiTrainSystem.reset();
                    }
                } catch (e) {
                    console.error('❌ MultiTrainUIControls: Reset failed', e);
                }
            });
        }

        // Setup pause button (toggle pause/resume)
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                if (window.multiTrainSystem && window.multiTrainSystem.simulationEngine) {
                    const engine = window.multiTrainSystem.simulationEngine;
                    if (!engine.isRunning) {
                        console.log('⏸️ Pause ignored - engine not running');
                        return;
                    }
                    if (engine.isPaused) {
                        console.log('▶️ Resume button clicked');
                        engine.resume();
                    } else {
                        console.log('⏸️ Pause button clicked');
                        engine.pause();
                    }
                    // Update UI status
                    this.updateSimulationStatus(engine.getStatus());
                }
            });
        }
        
        // Wire speed slider to multi-train speed control
        const speedSlider = document.getElementById('speedSlider');
        const speedValue = document.getElementById('speedValue');
        if (speedSlider) {
            const applySpeed = (val) => {
                const speed = parseFloat(val);
                if (!isNaN(speed)) {
                    if (speedValue) speedValue.textContent = `${speed}x`;
                    if (window.multiTrainSystem && typeof window.multiTrainSystem.setSpeed === 'function') {
                        window.multiTrainSystem.setSpeed(speed);
                    }
                }
            };
            speedSlider.addEventListener('input', (e) => applySpeed(e.target.value));
            // Initialize label/state from current slider position
            applySpeed(speedSlider.value);
        }
        
        console.log('🎮 MultiTrainUIControls: Event listeners setup complete');
    }

    /**
     * Handle real-time checkbox toggle
     */
    handleRealtimeToggle(isChecked) {
        console.log(`🎮 MultiTrainUIControls: Real-time toggle: ${isChecked}`);
        
        // Show/hide time controls based on real-time checkbox
        const timeControls = document.getElementById('timeControls');
        if (timeControls) {
            if (isChecked) {
                timeControls.style.display = 'block';
                console.log('🎮 MultiTrainUIControls: Time controls shown');
            } else {
                timeControls.style.display = 'none';
                console.log('🎮 MultiTrainUIControls: Time controls hidden');
            }
        }
    }
    
    /**
     * Handle play button click
     */
    async handlePlayClick() {
        console.log('🎮 MultiTrainUIControls: Play button clicked');
        if (!window.multiTrainSystem) {
            console.log('⚠️ MultiTrainUIControls: Multi-train system not available');
            return;
        }
        const sys = window.multiTrainSystem;
        const eng = sys.simulationEngine;
        // If nothing plotted yet, plot only when the selection is explicit
        try {
            if (eng && eng.multiTrainManager) {
                const mgr = eng.multiTrainManager;
                const nothingPlotted = !!(mgr && mgr.trainMarkers && mgr.trainMarkers.size === 0);
                if (nothingPlotted) {
                    const input = document.getElementById('trainSearchSelect');
                    const selectionRaw = input ? (input.value || '').trim() : '';
                    const looksLikeAll = selectionRaw.toLowerCase() === 'all trains' || selectionRaw.toLowerCase() === 'all';
                    // Expect either an explicit 'All Trains' or a CSV list of train numbers
                    let selectedTrainNumbers = [];
                    if (!looksLikeAll && selectionRaw) {
                        selectedTrainNumbers = selectionRaw.split(',').map(s => s.trim()).filter(Boolean);
                    }
                    if (looksLikeAll) {
                        // Plotting ALL trains prior to start
                        await mgr.plotAllTrains();
                    } else if (selectedTrainNumbers.length > 0) {
                        // Plotting selected trains prior to start
                        await mgr.plotSelectedTrains(selectedTrainNumbers);
                    } else {
                        // No explicit selection; Play ignored
                        return; // Do not start the engine without explicit selection
                    }
                }
            }
        } catch (e) {
            console.error('❌ MultiTrainUIControls: Pre-play plot failed', e);
        }
        if (sys.isRunning && eng && eng.isPaused) {
            console.log('▶️ MultiTrainUIControls: Resuming via Play');
            sys.resume();
            this.updateSimulationStatus(eng.getStatus());
            return;
        }
        if (!sys.isRunning) {
            sys.start();
            return;
        }
        console.log('⚠️ MultiTrainUIControls: Already running');
    }

    /**
     * Reset multi-train stats display to a clean state
     */
    resetMultiStatsDisplay() {
        const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
        setText('multi-total-trains', '0');
        setText('multi-status', 'Not Started');
        setText('multi-arrived', '0');
        setText('multi-running', '0');
        setText('multi-alerts-raised', '0');
        setText('multi-alerts-served', '0');
        setText('multi-alerts-unserved', '0');
    }
    
    /**
     * Handle stop button click
     */
    handleStopClick() {
        console.log('🎮 MultiTrainUIControls: Stop button clicked');
        
        if (window.multiTrainSystem && window.multiTrainSystem.isRunning) {
            window.multiTrainSystem.stop();
        } else {
            console.log('⚠️ MultiTrainUIControls: Multi-train system not available or not running');
        }
    }

    /**
     * Show multi-train mode status
     */
    showMultiTrainStatus() {
        const statusElement = document.getElementById('trainStatus');
        if (statusElement) {
            statusElement.textContent = 'Multi-Train Simulation Mode';
            statusElement.className = 'status-multi-train';
        }
    }

    /**
     * Hide multi-train mode status
     */
    hideMultiTrainStatus() {
        const statusElement = document.getElementById('trainStatus');
        if (statusElement) {
            statusElement.textContent = '';
            statusElement.className = '';
        }
    }

    /**
     * Update train count display
     */
    updateTrainCount(count) {
        const countElement = document.getElementById('trainCount');
        if (countElement) {
            countElement.textContent = `${count} trains`;
        }
    }

    // Multi-train status block updater (right sidebar)
    updateMultiStats(stats) {
        try {
            const isMulti = !!(window.multiTrainSystem && window.multiTrainSystem.simulationEngine);
            if (!isMulti) return;
            const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
            const mgr = window.multiTrainSystem.simulationEngine.multiTrainManager;
            const total = mgr ? mgr.trains.size : 0;
            const arrived = mgr ? Array.from(mgr.trainStates.values()).filter(s => s && s.journeyCompleted).length : 0;
            const running = Math.max(0, total - arrived);
            const status = window.multiTrainSystem.isRunning ? (window.multiTrainSystem.simulationEngine.isPaused ? 'Paused' : 'Running') : 'Not Started';
            // Alerts via EventManager
            const em = window.eventManager;
            let raised = 0, served = 0, unserved = 0;
            if (em && em.alertTracker) {
                for (const [, data] of em.alertTracker.entries()) {
                    raised += (data.summary?.received || 0);
                    served += (data.summary?.served || 0);
                    // unserved approximated as current received entries present
                    unserved += (data.alerts?.received ? data.alerts.received.length : 0);
                }
            }
            setText('multi-total-trains', String(total));
            setText('multi-status', status);
            setText('multi-arrived', String(arrived));
            setText('multi-running', String(running));
            setText('multi-alerts-raised', String(raised));
            setText('multi-alerts-served', String(served));
            setText('multi-alerts-unserved', String(unserved));
        } catch (_e) {}
    }

    /**
     * Show multi-train controls
     */
    showMultiTrainControls() {
        // Add any multi-train specific controls here
        console.log('🎮 MultiTrainUIControls: Showing multi-train controls');
    }

    /**
     * Hide multi-train controls
     */
    hideMultiTrainControls() {
        // Hide any multi-train specific controls here
        console.log('🎮 MultiTrainUIControls: Hiding multi-train controls');
    }

    /**
     * Handle train focus
     */
    onTrainFocus(trainNumber) {
        console.log(`🎯 MultiTrainUIControls: Train ${trainNumber} focused`);
        
        // Update UI to show focused train
        this.updateFocusedTrainDisplay(trainNumber);
    }

    /**
     * Update focused train display
     */
    updateFocusedTrainDisplay(trainNumber) {
        const focusedElement = document.getElementById('focusedTrain');
        if (focusedElement) {
            focusedElement.textContent = `Focused: Train ${trainNumber}`;
        }
    }

    /**
     * Handle overview mode
     */
    onOverviewMode() {
        console.log('🗺️ MultiTrainUIControls: Overview mode activated');
        
        // Clear focused train display
        const focusedElement = document.getElementById('focusedTrain');
        if (focusedElement) {
            focusedElement.textContent = '';
        }
    }

    /**
     * Show simulation controls
     */
    showSimulationControls() {
        console.log('🎮 MultiTrainUIControls: Showing simulation controls');
    }

    /**
     * Hide simulation controls
     */
    hideSimulationControls() {
        console.log('🎮 MultiTrainUIControls: Hiding simulation controls');
    }

    /**
     * Update simulation status
     */
    updateSimulationStatus(status) {
        const statusElement = document.getElementById('simulationStatus');
        if (statusElement) {
            if (status.isRunning) {
                statusElement.textContent = status.isPaused ? 'Paused' : 'Running';
                statusElement.className = status.isPaused ? 'status-paused' : 'status-running';
            } else {
                statusElement.textContent = 'Stopped';
                statusElement.className = 'status-stopped';
            }
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error('❌ MultiTrainUIControls:', message);
        
        // Show error in UI if needed
        const errorElement = document.getElementById('errorMessage');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            
            // Hide after 5 seconds
            setTimeout(() => {
                errorElement.style.display = 'none';
            }, 5000);
        }
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        console.log('✅ MultiTrainUIControls:', message);
        
        // Show success in UI if needed
        const successElement = document.getElementById('successMessage');
        if (successElement) {
            successElement.textContent = message;
            successElement.style.display = 'block';
            
            // Hide after 3 seconds
            setTimeout(() => {
                successElement.style.display = 'none';
            }, 3000);
        }
    }

    /**
     * Cleanup and destroy the UI controls
     */
    destroy() {
        console.log('🧹 MultiTrainUIControls: Destroying...');
        
        // Remove event listeners
        this.removeEventListeners();
        
        // Hide all UI elements
        this.hideMultiTrainStatus();
        this.hideMultiTrainControls();
        this.hideSimulationControls();
        
        this.isInitialized = false;
        console.log('✅ MultiTrainUIControls: Destroyed');
    }

    /**
     * Remove event listeners
     */
    removeEventListeners() {
        // Remove any event listeners that were added
        console.log('🎮 MultiTrainUIControls: Event listeners removed');
    }
}
