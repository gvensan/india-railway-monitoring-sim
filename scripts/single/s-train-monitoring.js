// Train Monitoring POC - Updated to fix updateDisplay method calls
class TrainMonitor {
    constructor() {
        // Prevent multiple instances
        if (window.trainMonitorInstance) {
            return window.trainMonitorInstance;
        }
        
        this.map = null;
        this.trainMarker = null;
        this.trainTrail = null;
        this.stationMarkers = [];
        this.routeLine = null;
        this.transportLayer = null;
        this.currentLayer = 'standard';
        this.coordinateCache = new Map(); // Cache for OSM coordinates
        
        // Alert flags on map
        this.alertFlags = new Map(); // stationCode -> flagElement
        
        // Simulation state
        this.isRunning = false;
        this.isPaused = false;
        this.speed = 1;
        this.isRealtimeMode = false;
        this.timeControlsVisible = false;
        this.timeUpdateInterval = null;
        this.currentDisplayTime = null;
        this.timeIncrementMinutes = 1;
        
        // Train processing state
        this.isProcessingTrain = false;
        this.currentProcessingTrain = null;
        this.currentPosition = { lat: 20.5937, lng: 78.9629 }; // Initialize to India's center coordinates
        this.currentWaypointIndex = 0;
        this.currentStationIndex = 0; // Add missing property
        this.trainSpeed = 0;
        this.currentSpeed = 0; // Add missing property
        this.maxSpeed = 120; // km/h
        this.acceleration = 0.5;
        this.deceleration = 0.8;
        
        // Station stop state
        this.isAtStation = false;
        this.stationStopStartTime = null;
        this.stationStopDuration = 2000; // 2 seconds in milliseconds
        
        // Route data - will be loaded when train is selected
        this.stations = [];
        this.waypoints = [];
        this.totalDistance = 0;
        
        
        // Solace integration
        this.solaceEnabled = false;
        this.solaceConnected = false;
        this.solaceIntegration = new SolaceIntegration(this);
        
        // Tooltip system
        this.tooltipSystem = new TooltipSystem(this);
        
        
        // Unified simulation engine
        this.simulationEngine = new SimulationEngine(this);
        
        // Real-time monitor removed - single train mode only
        
        // Alert system
        this.alertSystem = new AlertSystem(this);
        this.alertGeneration = {
            timerId: null,
            remaining: 0,
            mode: null
        };
        
        // Train simulation engine
        this.trainSimulation = new TrainSimulation(this);
        
        // UI controls
        this.uiControls = new UIControls(this);
        
        // Train data manager
        this.trainDataManager = new TrainDataManager(this);
        
        this.init();
    }

    /**
     * Check if a train number is the debug train (12461)
     * @param {string|number} trainNumber - The train number to check
     * @returns {boolean} - True if this is the debug train
     */
    isDebugTrain(trainNumber) {
        return parseInt(trainNumber) === 12461;
    }
    
    init() {
        // Prevent multiple initializations
        if (this.initialized) {
            return;
        }
        
        this.initializeMap();
        this.setupEventListeners();
        
        // Initialize right sidebar as collapsed by default
        this.initializeRightSidebar();
        
        // Initialize Solace connection (optional)
        this.solaceIntegration.initializeSolace();
        
        // Initialize with default Mumbai-Pune route (like index-old.html)
        // this.initializeDefaultRoute();
        
        // Initialize display with default state
        this.trainSimulation.updateDisplay();
        
        // Load available trains into dropdown
        this.loadAvailableTrains();
        
        // Generate train icons for the bottom panel
        this.generateTrainIcons();

        this.autoStartFirstLoad();
        
        this.initialized = true;
    }
    
    initializeMap() {
        // Check if map is already initialized
        if (this.map) {
            return;
        }
        
        // Initialize map centered on India
        this.map = L.map('map', {
            center: [20.5937, 78.9629], // Center of India
            zoom: 5,
            zoomControl: true
        });
        
        // Create base layer (OpenStreetMap)
        this.baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        });
        
        // Create transport layer (shows railways prominently)
        const thunderforestKey = (window.APP_CONFIG && window.APP_CONFIG.thunderforestApiKey) || '';
        const transportUrl = thunderforestKey
            ? `https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=${thunderforestKey}`
            : 'https://tile.thunderforest.com/transport/{z}/{x}/{y}.png';
        this.transportLayer = L.tileLayer(transportUrl, {
            attribution: '© Thunderforest, © OpenStreetMap contributors',
            opacity: 0.7,
            maxZoom: 18
        });
        
        // Add base layer first
        this.baseLayer.addTo(this.map);
        
        // Add transport layer on top (enabled by default)
        this.transportLayer.addTo(this.map);
        
        // Store layers for toggling
        this.layers = {
            standard: this.baseLayer,
            transport: this.transportLayer
        };
        
        this.currentLayer = 'transport'; // Transport layer is active by default
        
        // Add zoom level display
        this.addZoomLevelDisplay();
        
        // Record user pan/zoom interactions to pause auto-pan after manual moves
        if (this.uiControls && this.uiControls.attachUserPanZoomGuards) {
            this.uiControls.attachUserPanZoomGuards();
        }
        
        // Add event listeners for map movement to update alert flag positions and tooltips
        this.map.on('move', () => {
            this.updateAlertFlagPositions();
            this.updateTooltipPositions();
        });
        
        // Create transient zoom overlay (auto-hides)
        this._zoomOverlay = document.createElement('div');
        this._zoomOverlay.id = 'zoom-level-overlay';
        this._zoomOverlay.style.cssText = `
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.55);
            color: #fff;
            font-size: 64px;
            font-weight: 800;
            padding: 12px 24px;
            border-radius: 12px;
            z-index: 2147483647;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;
        this.map.getContainer().appendChild(this._zoomOverlay);
        this._zoomOverlayTimer = null;
        const showZoomOverlay = (zoom) => {
            if (!this._zoomOverlay) return;
            this._zoomOverlay.textContent = String(zoom);
            this._zoomOverlay.style.opacity = '1';
            if (this._zoomOverlayTimer) clearTimeout(this._zoomOverlayTimer);
            this._zoomOverlayTimer = setTimeout(() => {
                if (this._zoomOverlay) this._zoomOverlay.style.opacity = '0';
            }, 1500);
        };
        this.map.on('zoom', () => {
            this.updateAlertFlagPositions();
            this.updateTooltipPositions();
            // overlay shown on zoomend
        });
        this.map.on('zoomend', () => showZoomOverlay(this.map.getZoom()));
        
        // Map events handled by individual markers
    }
    
    initializeDefaultRoute() {
        // Initialize with default Mumbai-Pune route (same as index-old.html)
        this.stations = [
            { id: 'mumbai', name: 'Mumbai CSMT', lat: 18.9398, lng: 72.8355, distance: 0 },
            { id: 'thane', name: 'Thane Railway Station', lat: 19.1976, lng: 72.9702, distance: 34 },
            { id: 'kalyan', name: 'Kalyan Railway Station', lat: 19.2437, lng: 73.1305, distance: 54 },
            { id: 'lonavala', name: 'Lonavala Railway Station', lat: 18.7500, lng: 73.4000, distance: 96 },
            { id: 'pune', name: 'Pune Railway Station', lat: 18.5314, lng: 73.8744, distance: 192 }
        ];
        
        // Set default train information
        this.currentTrainNumber = '12345';
        this.currentTrainName = 'Mumbai-Thane Local';
        this.currentTrainData = null; // Will store complete train data including coach information
        
        // Initialize simulation state
        this.currentStationIndex = 0;
        this.currentPosition = { lat: this.stations[0].lat, lng: this.stations[0].lng };
        this.currentSpeed = 0;
        this.trainSpeed = 0;
        
        // Generate waypoints for the default route
        this.waypoints = this.trainDataManager.generateWaypoints();
        this.totalDistance = this.trainDataManager.calculateTotalDistance();
        
        this.initializeTrain();
        
    }
    
    generateWaypoints() {
        // Generate intermediate waypoints for smooth train movement
        const waypoints = [];
        
        for (let i = 0; i < this.stations.length - 1; i++) {
            const start = this.stations[i];
            const end = this.stations[i + 1];
            
            // Add start station
            waypoints.push({ lat: start.lat, lng: start.lng, station: start.name });
            
            // Generate intermediate points
            const steps = 20; // Number of intermediate points
            for (let j = 1; j < steps; j++) {
                const ratio = j / steps;
                const lat = start.lat + (end.lat - start.lat) * ratio;
                const lng = start.lng + (end.lng - start.lng) * ratio;
                waypoints.push({ lat, lng, station: null });
            }
        }
        
        // Add final station
        const lastStation = this.stations[this.stations.length - 1];
        waypoints.push({ lat: lastStation.lat, lng: lastStation.lng, station: lastStation.name });
        
        return waypoints;
    }
    
    calculateTotalDistance() {
        let total = 0;
        for (let i = 0; i < this.waypoints.length - 1; i++) {
            total += this.calculateDistance(this.waypoints[i].lat, this.waypoints[i].lng, this.waypoints[i + 1].lat, this.waypoints[i + 1].lng);
        }
        return total;
    }
    
    // Removed duplicate method - using calculateDistance(lat1, lng1, lat2, lng2) instead
    
    createTrainIcon(size = 24) {
        // Create train icon using the images/train.png image (no rotation)
        return `
            <img src="assets/images/train.png" 
                  style="width: ${size}px; height: ${size}px;" 
                  alt="Train" />
        `;
    }
    
    
    
    initializeTrain() {
        // Create train marker at starting position with proper train icon
        const startStation = this.stations[0];
        
        this.trainMarker = L.marker([startStation.lat, startStation.lng], {
            icon: L.divIcon({
                className: 'train-marker',
                html: this.createTrainIcon(24),
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            })
        }).addTo(this.map);
        
        
        // Store marker type
        this.trainMarker._markerType = 'train';
        this.trainMarker._trainNumber = this.currentTrainNumber;
        
        // Add train number hint
        this.tooltipSystem.addTrainNumberHint(this.trainMarker, this.currentTrainNumber);
        
        // Keep hint position synchronized with marker movement
        this.trainMarker.on('move', () => {
            if (this.tooltipSystem && this.tooltipSystem.updateAllTrainHints) {
                this.tooltipSystem.updateAllTrainHints();
            }
        });
        
        // Add simple click tooltip
        this.tooltipSystem.setupClickTooltip(this.trainMarker);
        
        
        // Initialize train trail
        this.trainTrail = L.polyline([], {
            color: '#dc3545',
            weight: 2,
            opacity: 0.6
        }).addTo(this.map);
    }
    
    setupEventListeners() {
        // Control buttons
        const playBtn = document.getElementById('playBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const stopBtn = document.getElementById('stopBtn');
        const toggleLayersBtn = document.getElementById('toggleLayersBtn');
        const showTrainBtn = document.getElementById('showTrainBtn');
        const centerMapBtn = document.getElementById('centerMapBtn');
        const resetBtn = document.getElementById('resetBtn');
        
        if (playBtn) playBtn.addEventListener('click', () => this.play());
        if (pauseBtn) pauseBtn.addEventListener('click', () => this.pause());
        if (stopBtn) stopBtn.addEventListener('click', () => this.stop());
        if (toggleLayersBtn) toggleLayersBtn.addEventListener('click', () => this.toggleLayers());
        if (showTrainBtn) showTrainBtn.addEventListener('click', () => this.trainDataManager.showTrain());
        if (centerMapBtn) centerMapBtn.addEventListener('click', () => this.centerMap());
        if (resetBtn) resetBtn.addEventListener('click', () => {
            this.resetAll();
            // Call showTrain after reset to center the map
            this.trainDataManager.showTrain();
        });
        
        // Auto-clean toggle
        const autoCleanToggle = document.getElementById('autoCleanToggle');
        if (autoCleanToggle) {
            autoCleanToggle.addEventListener('change', (e) => {
                this.toggleAutoClean(e.target.checked);
            });
        }
        
        // Real-time toggle removed - single train mode only
        // const realtimeCheckbox = document.getElementById('realtimeCheckbox');
        // if (realtimeCheckbox) {
        //     realtimeCheckbox.addEventListener('change', async (e) => {
        //         await this.realtimeMonitor.toggleRealtime(e.target.checked);
        //     });
        // }
        
        // Time controls removed - single train mode only
        // const timeChooserBtn = document.getElementById('timeChooserBtn');
        // if (timeChooserBtn) {
        //     timeChooserBtn.addEventListener('click', async () => {
        //         await this.realtimeMonitor.showTimeChooser();
        //     });
        // }
        
        // Time increment removed - single train mode only
        // const timeIncrementInput = document.getElementById('timeIncrement');
        // if (timeIncrementInput) {
        //     timeIncrementInput.addEventListener('change', (e) => {
        //         this.timeIncrementMinutes = parseInt(e.target.value) || 0;
        //         this.realtimeMonitor.updateTimeIncrement();
        //     });
        // }
        
        // Right sidebar toggle
        const toggleRightSidebarBtn = document.getElementById('toggleRightSidebarBtn');
        const floatingRightToggleBtn = document.getElementById('floatingRightToggleBtn');
        
        if (toggleRightSidebarBtn) {
            toggleRightSidebarBtn.addEventListener('click', () => {
                this.uiControls.toggleRightSidebar();
            });
        }
        
        if (floatingRightToggleBtn) {
            floatingRightToggleBtn.addEventListener('click', () => {
                this.uiControls.toggleRightSidebar();
            });
        }
        
        // Events sidebar toggle
        const eventsFloatingBtn = document.getElementById('eventsFloatingBtn');
        const closeLeftSidebarBtn = document.getElementById('closeLeftSidebarBtn');
        
        if (eventsFloatingBtn) {
            eventsFloatingBtn.addEventListener('click', () => {
                // Check if publish events is enabled
                if (!window.publishEvents) {
                    this.showPublishEventsDisabledPopup();
                    return;
                }
                this.uiControls.toggleLeftSidebar();
            });
        }
        
        if (closeLeftSidebarBtn) {
            closeLeftSidebarBtn.addEventListener('click', () => {
                this.uiControls.closeLeftSidebar();
            });
        }
        
        // Alert panel toggle
        const closeAlertPanelBtn = document.getElementById('closeAlertPanelBtn');
        if (closeAlertPanelBtn) closeAlertPanelBtn.addEventListener('click', () => this.closeAlertPanel());
        
        // Train selection with searchable select
        const selectTrainBtn = document.getElementById('selectTrainBtn');
        const trainSearchSelect = document.getElementById('trainSearchSelect');
        const trainDropdown = document.getElementById('trainDropdown');
        
        if (selectTrainBtn) selectTrainBtn.addEventListener('click', async () => {
            if (this.isDebugTrain(this.selectedTrainValue)) {
                console.log(`🔧 LOAD button clicked - selectedTrainValue: ${this.selectedTrainValue}`);
            }
            await this.uiControls.selectTrainFromSearchableSelect();
            // Only call showTrain for single train mode
            if (this.currentTrainNumber) {
                if (this.isDebugTrain(this.currentTrainNumber)) {
                    console.log(`🔧 LOAD button - calling showTrain for train ${this.currentTrainNumber}`);
                }
                this.trainDataManager.showTrain();
            }
        });
        
        // Initialize searchable select functionality
        if (trainSearchSelect && trainDropdown) {
            this.uiControls.initializeSearchableSelect();
        }
        
        
        // Speed slider
        const speedSlider = document.getElementById('speedSlider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                this.speed = parseInt(e.target.value);
                const speedValueEl = document.getElementById('speedValue');
                if (speedValueEl) speedValueEl.textContent = this.speed + 'x';
            });
        }
    }
    
    async play() {
        try {
        // If engine exists and is paused, resume instead of starting anew
        if (this.simulationEngine && this.simulationEngine.isPaused) {
            this.simulationEngine.resume();
            this.isPaused = false;
            this.isRunning = true;
            this.uiControls.updateStatus('Running');
            this.startAlertGeneration('single');
            return;
        }

        // Prevent multiple calls if already running
        if (this.isRunning) {
            return;
        }
        
        // Start simulation for single train
        // Ensure we have stations and train marker before starting simulation
        if (this.stations.length === 0) {
            return; // Don't start simulation without a selected train
        }
        
        // Publish train departed origin event
        await this.publishTrainDepartedOriginEvent();
        
        // Load train into unified simulation engine
        this.simulationEngine.loadSingleTrain({
            trainNumber: this.currentTrainNumber,
            trainName: this.currentTrainName,
            route: this.stations
        });
        
        this.isRunning = true;
        this.isPaused = false;
        this.uiControls.updateStatus('Running');
        
        // Start the unified simulation engine
        this.simulationEngine.start();

        const leftSidebar = document.getElementById('leftSidebar');
        if (leftSidebar && !leftSidebar.classList.contains('open')) {
            this.uiControls.toggleLeftSidebar();
        }

        this.startAlertGeneration('single');
    } catch (error) {
        console.error('❌ Error starting simulation:', error);
        this.isRunning = false;
        this.uiControls.updateStatus('Error');
    }
    }
    
    pause() {
        this.isPaused = true;
        // Keep engine running but paused so Play can resume quickly
        if (this.simulationEngine) {
            this.simulationEngine.pause();
        }
        this.isRunning = true;
        this.uiControls.updateStatus('Paused');
    }
    
    stop() {
        this.isRunning = false;
        this.isPaused = false;
        this.trainSpeed = 0;
        this.currentSpeed = 0;
        
        // Reset station stop state
        this.isAtStation = false;
        this.stationStopStartTime = null;
        
        // Stop unified simulation engine
        if (this.simulationEngine) {
            this.simulationEngine.stop();
        }

        this.stopAlertGeneration();

        this.uiControls.updateStatus('Stopped');
    }

    startAlertGeneration(mode) {
        if (!window.generateAlerts) {
            return;
        }

        this.stopAlertGeneration();

        const totalAlerts = 5 + Math.floor(Math.random() * 4);
        this.alertGeneration = {
            timerId: null,
            remaining: totalAlerts,
            mode: mode
        };

        this.scheduleNextAlert();
    }

    stopAlertGeneration() {
        if (this.alertGeneration && this.alertGeneration.timerId) {
            clearTimeout(this.alertGeneration.timerId);
        }
        this.alertGeneration = {
            timerId: null,
            remaining: 0,
            mode: null
        };
    }

    scheduleNextAlert() {
        if (!this.alertGeneration || this.alertGeneration.remaining <= 0) {
            return;
        }

        const delay = 5000 + Math.random() * 7000;
        this.alertGeneration.timerId = setTimeout(() => {
            this.runAlertGeneration();
        }, delay);
    }

    async runAlertGeneration() {
        if (!window.generateAlerts) {
            this.stopAlertGeneration();
            return;
        }

        if (this.alertGeneration.mode === 'single') {
            if (!this.isRunning || this.isPaused) {
                this.scheduleNextAlert();
                return;
            }
        } else if (this.alertGeneration.mode === 'multi') {
            const mts = window.multiTrainSystem;
            const isPaused = mts && mts.simulationEngine && mts.simulationEngine.isPaused;
            if (!mts || !mts.isRunning || isPaused) {
                this.scheduleNextAlert();
                return;
            }
        }

        if (!window.publishEvents) {
            this.scheduleNextAlert();
            return;
        }

        const alertTypes = ['water_tank', 'breakdown', 'ac_malfunction', 'emergency'];

        let trainNumber = null;
        let trainData = null;
        if (this.alertGeneration.mode === 'multi') {
            const mgr = window.multiTrainSystem &&
                window.multiTrainSystem.simulationEngine &&
                window.multiTrainSystem.simulationEngine.multiTrainManager;
            const trainKeys = mgr ? Array.from(mgr.trains.keys()) : [];
            if (trainKeys.length === 0) {
                this.stopAlertGeneration();
                return;
            }
            trainNumber = trainKeys[Math.floor(Math.random() * trainKeys.length)];
            trainData = mgr.trains.get(trainNumber);
        } else {
            trainNumber = this.currentTrainNumber;
            trainData = this.currentTrainData;
        }

        if (!trainNumber) {
            this.stopAlertGeneration();
            return;
        }

        const alertType = alertTypes[Math.floor(Math.random() * alertTypes.length)];
        const coachNumber = this.getRandomCoachNumber(trainData);
        await this.alertSystem.raiseAlert(trainNumber, alertType, coachNumber);

        this.alertGeneration.remaining -= 1;
        this.scheduleNextAlert();
    }

    getRandomCoachNumber(trainData) {
        const coachList = trainData && trainData.coaches ? String(trainData.coaches) : '';
        if (coachList) {
            const coaches = coachList.split(/[,/\\s]+/).map(item => item.trim()).filter(Boolean);
            if (coaches.length > 0) {
                return coaches[Math.floor(Math.random() * coaches.length)];
            }
        }

        const coachCountRaw = trainData && trainData.coachCount ? String(trainData.coachCount) : '';
        const coachCount = parseInt(coachCountRaw, 10);
        if (Number.isFinite(coachCount) && coachCount > 0) {
            const coachIndex = 1 + Math.floor(Math.random() * coachCount);
            return `C${coachIndex}`;
        }

        return 'Unknown';
    }
    
    // Removed duplicate method - using uiControls.updateStatus() instead
    
    // Removed duplicate method - using uiControls.updateTrainInfo() instead
    
    // Removed duplicate method - using uiControls.updateProgressBar() instead
    
    
    toggleLayers() {
        // Toggle transport layer (same logic as old implementation)
        const toggleBtn = document.getElementById('toggleLayersBtn');
        if (this.map.hasLayer(this.transportLayer)) {
            this.map.removeLayer(this.transportLayer);
            this.currentLayer = 'standard';
            if (toggleBtn) toggleBtn.textContent = '🚂 Show Railway Map';
        } else {
            this.map.addLayer(this.transportLayer);
            this.currentLayer = 'transport';
            if (toggleBtn) toggleBtn.textContent = '🚂 Hide Railway Map';
        }
    }
    
    centerMap() {
        // Center map on India with appropriate zoom level
        this.map.setView([20.5937, 78.9629], 5); // Center of India with zoom level 5
    }
    
    showTrain() {
        // Only work if a single train is selected
        if (!this.currentTrainNumber) {
            return;
        }
        
        // Get the actual train marker position from the map
        if (!this.trainMarker) {
            return;
        }
        
        // Get the current lat/lng of the train marker
        const trainPosition = this.trainMarker.getLatLng();
        if (!trainPosition) {
            return;
        }
        
        // Check if left sidebar is open
        const container = document.querySelector('.container');
        const isLeftSidebarOpen = container && container.classList.contains('left-sidebar-open');
        
        if (isLeftSidebarOpen) {
            // When sidebar is open, we need to account for the reduced map area
            // The sidebar is 400px wide, so we need to offset the center to the right
            const offsetX = 200; // Half of 400px to center in the remaining space
            
            // Convert the train position to container point
            const trainPoint = this.map.latLngToContainerPoint(trainPosition);
            
            // Apply the offset to center in the visible area
            const offsetPoint = [trainPoint.x + offsetX, trainPoint.y];
            
            // Convert back to lat/lng
            const finalCenter = this.map.containerPointToLatLng(offsetPoint);

            // Pan to the calculated final center
            this.map.setView([finalCenter.lat, finalCenter.lng], this.map.getZoom(), {
                animate: true,
                duration: 1.0
            });
        } else {
            // When sidebar is closed, simple panTo works fine
            this.map.panTo([trainPosition.lat, trainPosition.lng], {
                animate: true,
                duration: 1.0
            });
        }
                
        // Check sidebar state
        const leftSidebar = document.getElementById('leftSidebar');
        const rightSidebar = document.getElementById('rightSidebar');
        const leftOpen = leftSidebar && leftSidebar.classList.contains('open');
        const rightOpen = rightSidebar && rightSidebar.classList.contains('open');        
    }

    /**
     * Automatically pan to keep train in view during single-train simulation
     */
    
    updateShowTrainButtonState(enabled) {
        const showTrainBtn = document.getElementById('showTrainBtn');
        if (showTrainBtn) {
            showTrainBtn.disabled = !enabled;
            if (enabled) {
                showTrainBtn.classList.remove('disabled');
                showTrainBtn.title = 'Pan to train marker location';
            } else {
                showTrainBtn.classList.add('disabled');
                showTrainBtn.title = 'Select a train first';
            }
        }
    }
    
    toggleAutoClean(enabled) {
        // Update the EventManager's auto-clean setting
        if (window.eventManager) {
            window.eventManager.setAutoCleanEnabled(enabled);
        }
    }
    
    // Real-time monitoring methods moved to realtime-monitor.js
    
    
    
    
    restoreFullTrainList() {
        // Restore the full train list
        this.filteredTrainOptions = this.allTrainOptions;
        
        // Clear the search input
        const input = document.getElementById('trainSearchSelect');
        if (input) {
            input.value = '';
        }
        this.selectedTrainValue = '';
    }
    
    
    showTimeControls() {
        const timeControls = document.getElementById('timeControls');
        const timeChooserBtn = document.getElementById('timeChooserBtn');
        const timeIncrementInput = document.getElementById('timeIncrement');
        
        if (timeControls) {
            timeControls.style.display = 'flex';
            this.timeControlsVisible = true;
            this.startTimeUpdate();
            
            // Enable controls
            if (timeChooserBtn) timeChooserBtn.disabled = false;
            if (timeIncrementInput) timeIncrementInput.disabled = false;
        }
    }
    
    hideTimeControls() {
        const timeControls = document.getElementById('timeControls');
        const timeChooserBtn = document.getElementById('timeChooserBtn');
        const timeIncrementInput = document.getElementById('timeIncrement');
        
        if (timeControls) {
            timeControls.style.display = 'none';
            this.timeControlsVisible = false;
            this.stopTimeUpdate();
            
            // Disable controls
            if (timeChooserBtn) timeChooserBtn.disabled = true;
            if (timeIncrementInput) timeIncrementInput.disabled = true;
        }
    }
    
    startTimeUpdate() {
        this.stopTimeUpdate(); // Clear any existing interval
        
        // Initialize with current time
        this.currentDisplayTime = new Date();
        this.updateTimeDisplay();
        
        // Start the update interval
        this.timeUpdateInterval = setInterval(() => {
            this.updateTime();
        }, 1000); // Update every second
    }
    
    stopTimeUpdate() {
        if (this.timeUpdateInterval) {
            clearInterval(this.timeUpdateInterval);
            this.timeUpdateInterval = null;
        }
    }
    
    async updateTime() {
        try {
        if (!this.currentDisplayTime) {
            this.currentDisplayTime = new Date();
        }
        
        if (this.timeIncrementMinutes === 0) {
            // Normal second-by-second increment
            this.currentDisplayTime = new Date(this.currentDisplayTime.getTime() + 1000);
        } else {
            // Increment by specified minutes
            this.currentDisplayTime = new Date(this.currentDisplayTime.getTime() + (this.timeIncrementMinutes * 60 * 1000));
        }
        
        this.updateTimeDisplay();
        
        // Filter trains based on the new time
        await this.filterAndShowTrainsForTime();
        } catch (error) {
            console.error('❌ Error updating time:', error);
        }
    }
    
    updateTimeDisplay() {
        const timeElement = document.getElementById('currentTime');
        if (timeElement && this.currentDisplayTime) {
            const hours = this.currentDisplayTime.getHours().toString().padStart(2, '0');
            const minutes = this.currentDisplayTime.getMinutes().toString().padStart(2, '0');
            timeElement.textContent = `${hours}:${minutes}`;
        }
    }
    
    async showTimeChooser() {
        // Create a simple time input dialog
        const currentTime = this.currentDisplayTime || new Date();
        const hours = currentTime.getHours().toString().padStart(2, '0');
        const minutes = currentTime.getMinutes().toString().padStart(2, '0');
        const timeString = `${hours}:${minutes}`;
        
        const newTime = prompt('Enter time (HH:MM format):', timeString);
        if (newTime && newTime.match(/^\d{2}:\d{2}$/)) {
            const [hoursStr, minutesStr] = newTime.split(':');
            const newDate = new Date();
            newDate.setHours(parseInt(hoursStr), parseInt(minutesStr), 0, 0);
            
            this.currentDisplayTime = newDate;
            this.updateTimeDisplay();
            
            // Filter trains based on the new time
            await this.filterAndShowTrainsForTime();
        }
    }
    
    updateTimeIncrement() {
        // The actual increment logic is handled in updateTime()
    }
    
    
    
    
    
    // Tooltip methods moved to tooltip-system.js
    
    // Solace Integration Methods
    async connectToSolace() {
        try {
            if (!window.solaceTrainMonitor) {
                return false;
            }
            
            // Check broker type before attempting connection
            const brokerType = window.solaceTrainMonitor.brokerType || 'solace';
            
            await window.solaceTrainMonitor.connect();
            this.solaceConnected = true;
            this.solaceEnabled = true;
            
            // Subscribe to train events for real-time updates
            await this.setupSolaceSubscriptions();
            
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to broker:', error);
            this.solaceConnected = false;
            return false;
        }
    }
    
    async setupSolaceSubscriptions() {
        if (!this.solaceConnected) return;
        
        // Check if Solace integration is ready and connected
        if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
            return;
        }
        
        try {
            // Note: Legacy train/status/* and train/position/* subscriptions removed
            // All train events are now handled through TMS topics (tms/train/v1/*, tms/station/v1/*, tms/alert/v1/*)
        } catch (error) {
            console.error('❌ Failed to set up Solace subscriptions:', error);
        }
    }
    
    
    
    async disconnectFromSolace() {
        if (this.solaceConnected && window.solaceTrainMonitor) {
            try {
                await window.solaceTrainMonitor.disconnect();
                this.solaceConnected = false;
                this.solaceEnabled = false;
            } catch (error) {
                console.error('❌ Error disconnecting from Solace broker:', error);
            }
        }
    }
    
    getSolaceStatus() {
        return {
            enabled: this.solaceEnabled,
            connected: this.solaceConnected,
            brokerStatus: window.solaceTrainMonitor ? window.solaceTrainMonitor.getConnectionStatus() : null
        };
    }
    
    async initializeSolace() {
        // Try to connect to broker (Solace or in-memory)
        try {
            // Check if Solace integration is available and what broker type is configured
            if (window.solaceTrainMonitor) {
                const brokerType = window.solaceTrainMonitor.brokerType || 'solace';
                
                const connected = await this.solaceIntegration.connectToSolace();
            }
        } catch (error) {
            console.error('⚠️ Broker connection failed - continuing without real-time messaging');
        }
    }
    
    initializeRightSidebar() {
        // Set right sidebar to collapsed state by default
        const rightSidebar = document.getElementById('rightSidebar');
        const container = document.querySelector('.container');
        
        if (rightSidebar && container) {
            // Force initial collapsed state (panel starts off-screen)
            rightSidebar.classList.remove('open');
            container.classList.remove('right-sidebar-open');
            
            // Ensure the sidebar is positioned off-screen
            rightSidebar.style.right = '-400px';                        
        } else {
            console.error('❌ Right sidebar or container element not found during initialization');
        }
    }
    
    adjustMapBoundsForSidebars() {
        // Adjust map bounds when sidebars are open to ensure train markers are visible
        if (this.map && this.currentTrainData) {
            const leftSidebar = document.getElementById('leftSidebar');
            const rightSidebar = document.getElementById('rightSidebar');
            const leftOpen = leftSidebar && leftSidebar.classList.contains('open');
            const rightOpen = rightSidebar && rightSidebar.classList.contains('open');
            
            if (leftOpen || rightOpen) {
                // Re-fit the map bounds to show the train route
                setTimeout(() => {
                    if (this.currentTrainData && this.currentTrainData.route) {
                        const bounds = L.latLngBounds();
                        this.currentTrainData.route.forEach(station => {
                            if (station.lat && station.lng) {
                                bounds.extend([station.lat, station.lng]);
                            }
                        });
                        this.map.fitBounds(bounds, { padding: [20, 20] });
                        this.map.setZoom(5);
                    }
                }, 100);
            }
        }
    }
    
    
    /**
     * Auto-pan the map to keep the train visible within the visible bounds
     * @param {Object} trainLatLng - Train position as {lat, lng}
     * @param {number} marginPercent - Margin percentage (default 15%)
     * @returns {boolean} True if panning occurred, false if train is already visible
     */
    autoPanToKeepTrainVisible(trainLatLng, marginPercent = 15) {
        return this.uiControls.autoPanToKeepTrainVisible(trainLatLng, marginPercent);
    }
    
    
    
    toggleRightSidebar() {
        const rightSidebar = document.getElementById('rightSidebar');
        const container = document.querySelector('.container');
        const mapContainer = document.querySelector('.map-container');
        
        // Check if elements exist
        if (!rightSidebar) {
            return;
        }
        if (!container) {
            return;
        }
        if (!mapContainer) {
            return;
        }
        
        if (rightSidebar && container && mapContainer) {
            rightSidebar.classList.toggle('open');
            container.classList.toggle('right-sidebar-open');
            
            // Ensure proper positioning
            if (rightSidebar.classList.contains('open')) {
                // Opening right sidebar
                rightSidebar.style.right = '0px';
                // Check if left sidebar is also open
                const leftSidebar = document.getElementById('leftSidebar');
                if (leftSidebar && leftSidebar.classList.contains('open')) {
                    // Both sidebars open - center the map
                    mapContainer.style.setProperty('transform', 'translateX(0px)', 'important');
                    // Adjust map bounds for both sidebars
                    this.adjustMapBoundsForSidebars();
                } else {
                    // Only right sidebar open - move map left
                    mapContainer.style.setProperty('transform', 'translateX(-400px)', 'important');
                    // Adjust map bounds for single sidebar
                    this.adjustMapBoundsForSidebars();
                }
            } else {
                // Closing right sidebar
                rightSidebar.style.right = '-400px';
                // Check if left sidebar is still open
                const leftSidebar = document.getElementById('leftSidebar');
                if (leftSidebar && leftSidebar.classList.contains('open')) {
                    // Left sidebar still open - move map right
                    mapContainer.style.setProperty('transform', 'translateX(400px)', 'important');
                } else {
                    // No sidebars open - reset to center
                    mapContainer.style.setProperty('transform', 'translateX(0px)', 'important');
                }
            }
        }
    }
    
    toggleLeftSidebar() {
        const leftSidebar = document.getElementById('leftSidebar');
        const container = document.querySelector('.container');
        const mapContainer = document.querySelector('.map-container');
        
        if (leftSidebar && container && mapContainer) {
            leftSidebar.classList.toggle('open');
            container.classList.toggle('left-sidebar-open');
            
            // Ensure proper positioning
            if (leftSidebar.classList.contains('open')) {
                // Opening left sidebar
                leftSidebar.style.left = '0px';
                // Check if right sidebar is also open
                const rightSidebar = document.getElementById('rightSidebar');
                if (rightSidebar && rightSidebar.classList.contains('open')) {
                    // Both sidebars open - center the map
                    mapContainer.style.setProperty('transform', 'translateX(0px)', 'important');
                    // Adjust map bounds for both sidebars
                    this.adjustMapBoundsForSidebars();
            } else {
                    // Only left sidebar open - move map right
                    mapContainer.style.setProperty('transform', 'translateX(400px)', 'important');
                    // Adjust map bounds for single sidebar
                    this.adjustMapBoundsForSidebars();
                }
            } else {
                // Closing left sidebar
                leftSidebar.style.left = '-400px';
                // Check if right sidebar is still open
                const rightSidebar = document.getElementById('rightSidebar');
                if (rightSidebar && rightSidebar.classList.contains('open')) {
                    // Right sidebar still open - move map left
                    mapContainer.style.setProperty('transform', 'translateX(-400px)', 'important');
                } else {
                    // No sidebars open - reset to center
                    mapContainer.style.setProperty('transform', 'translateX(0px)', 'important');
                }
            }
        } else {
            console.error('❌ Left sidebar, container, or mapContainer element not found');
        }
    }
    
    closeLeftSidebar() {
        const leftSidebar = document.getElementById('leftSidebar');
        const container = document.querySelector('.container');
        const mapContainer = document.querySelector('.map-container');
        
        if (leftSidebar && container && mapContainer) {
            // Log current map container state
            leftSidebar.classList.remove('open');
            container.classList.remove('left-sidebar-open');
            leftSidebar.style.left = '-400px';
            
            // Reset map container transform
            mapContainer.style.setProperty('transform', 'translateX(0px)', 'important');            
        } else {
            console.error('❌ Left sidebar, container, or mapContainer element not found');
        }
    }
    
    // Alert panel methods moved to alert-system.js
    
    positionAlertButton(isPanelOpen) {
        const alertButton = document.querySelector('.alert-toggle-btn');
        if (alertButton) {
            if (isPanelOpen) {
                // Move to top when panel is open (multiple rows)
                alertButton.style.position = 'fixed';
                alertButton.style.top = '20px';
                alertButton.style.right = '20px';
                alertButton.style.bottom = 'auto';
                alertButton.style.zIndex = '10000';
                alertButton.title = 'Close Alert Panel';
        } else {
                // Move back to bottom when panel is closed
                alertButton.style.position = 'fixed';
                alertButton.style.bottom = '20px';
                alertButton.style.right = '20px';
                alertButton.style.top = 'auto';
                alertButton.style.zIndex = '1000';
                alertButton.title = 'Open Alert Panel';
            }
        }
    }
    
    closeAlertPanel() {
        const alertPanel = document.getElementById('alertBottomPanel');
        const container = document.querySelector('.container');
        if (alertPanel && container) {
            alertPanel.classList.remove('open');
            container.classList.remove('alert-panel-open');
        }
    }
    
    // Train icons management
    async generateTrainIcons() {
        const trainIconsGrid = document.getElementById('trainIconsGrid');
        if (!trainIconsGrid) {
            return;
        }
        
        // Clear existing icons
        trainIconsGrid.innerHTML = '';
        
        // Get available train numbers from CSV data
        const availableTrains = await this.getAvailableTrainNumbers();
        
        // Generate icons for each train
        availableTrains.forEach(trainNumber => {
            const iconBtn = document.createElement('button');
            iconBtn.className = 'train-icon-btn disabled';
            iconBtn.title = `Train ${trainNumber} - Not loaded`;
            iconBtn.addEventListener('click', () => this.onTrainIconClick(trainNumber));
            
            // Create train number element
            const trainNumberEl = document.createElement('div');
            trainNumberEl.className = 'train-number';
            trainNumberEl.textContent = trainNumber;
            
            // Create status indicator dot
            const statusDot = document.createElement('div');
            statusDot.className = 'status-dot';
            
            iconBtn.appendChild(trainNumberEl);
            iconBtn.appendChild(statusDot);
            
            trainIconsGrid.appendChild(iconBtn);
        });
        
        // Update train statistics
        this.updateTrainStats(availableTrains.length, 0, availableTrains.length);
        
    }
    
    async getAvailableTrainNumbers() {
        try {
            // Load train data directly from CSV to get all available trains
            // const response = await fetch('assets/data/trains.csv');
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.status}`);
            }
            
            const csvText = await response.text();
            const lines = csvText.split('\n');
            const trainNumbers = new Set();
            
            // Skip header line
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const columns = parseCSVLine(line);
                if (columns.length >= 17) {
                    const trainNumber = columns[0];
                    if (trainNumber) {
                        trainNumbers.add(trainNumber);
                    }
                }
            }
            
            return Array.from(trainNumbers).sort((a, b) => parseInt(a) - parseInt(b));
        } catch (error) {
            console.error('Error loading train numbers:', error);
        }
    }
    
    updateTrainIconState(trainNumber, isLoaded) {
        const trainIconsGrid = document.getElementById('trainIconsGrid');
        if (!trainIconsGrid) return;
        
        const iconBtn = Array.from(trainIconsGrid.children).find(btn => {
            const trainNumberEl = btn.querySelector('.train-number');
            return trainNumberEl && trainNumberEl.textContent === trainNumber.toString();
        });
        
        if (iconBtn) {
            if (isLoaded) {
                iconBtn.classList.remove('disabled');
                iconBtn.classList.add('enabled');
                iconBtn.title = `Train ${trainNumber} - Loaded`;
            } else {
                iconBtn.classList.remove('enabled');
                iconBtn.classList.add('disabled');
                iconBtn.title = `Train ${trainNumber} - Not loaded`;
            }
        }
        
        // Update stats after state change
        this.updateTrainStatsFromIcons();
    }

    // Alert flag management
    addAlertFlag(stationCode, alertCount) {
        
        if (!this.map) {
            return;
        }
        
        // Check if station coordinates are loaded
        if (typeof stationCoordinatesFromCSV === 'undefined' || Object.keys(stationCoordinatesFromCSV).length === 0) {
            // Retry after a short delay
            setTimeout(() => this.addAlertFlag(stationCode, alertCount), 500);
            return;
        }

        // Remove existing flag if any
        this.alertSystem.removeAlertFlag(stationCode);

        // Don't create flag if alert count is 0
        if (alertCount === 0) {
            return;
        }

        // Find station coordinates from global CSV data
        let station = null;
        if (typeof stationCoordinatesFromCSV !== 'undefined' && stationCoordinatesFromCSV[stationCode]) {
            station = stationCoordinatesFromCSV[stationCode];
        }
        
        if (!station || !station.lat || !station.lng) {
            //     station: station,
            //     stationsCount: this.stations?.length || 0,
            //     csvStationsCount: typeof stationCoordinatesFromCSV !== 'undefined' ? Object.keys(stationCoordinatesFromCSV).length : 0                          
            // });
            return;
        }


        // Convert lat/lng to pixel coordinates on the map
        const point = this.map.latLngToContainerPoint([station.lat, station.lng]);
        
        // Create flag element
        const flag = document.createElement('div');
        flag.className = 'alert-flag';
        flag.dataset.station = stationCode;
        // Position flag slightly above the station marker (offset by 15px up and 8px right for pole alignment)
        flag.style.left = `${point.x + 8}px`;
        flag.style.top = `${point.y - 15}px`;
        
        // Create enhanced tooltip with alert details
        const tooltip = document.createElement('div');
        tooltip.className = 'alert-flag-tooltip';
        // Force very high stacking for alert tooltip container as well
        tooltip.style.zIndex = '2147483647';
        
        // Close button (matches other dialogs)
        const closeBtn = document.createElement('button');
        closeBtn.className = 'alert-tooltip-close';
        closeBtn.innerText = '×';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            tooltip.style.opacity = '0';
            tooltip.style.visibility = 'hidden';
            tooltip.style.display = 'none';
        });
        tooltip.appendChild(closeBtn);
        
        // Get alert details from event manager
        const alertDetails = this.getAlertDetailsForStation(stationCode);
        
        // Use actual alert count from details instead of parameter
        const actualAlertCount = alertDetails ? alertDetails.length : 0;
        
        // Create tooltip content matching station tooltip format
        const tooltipContent = document.createElement('div');
        tooltipContent.className = 'alert-tooltip-content';
        
        // Header
        const header = document.createElement('div');
        header.className = 'alert-tooltip-header';
        header.textContent = `${station.name}`;
        tooltipContent.appendChild(header);
        
        // Alert details
        if (alertDetails && alertDetails.length > 0) {
            const detailsContainer = document.createElement('div');
            detailsContainer.className = 'alert-tooltip-details';
            
            // Group alerts by type for better display
            const alertsByType = {};
            alertDetails.forEach(alert => {
                if (!alertsByType[alert.type]) {
                    alertsByType[alert.type] = [];
                }
                alertsByType[alert.type].push(alert);
            });
            
            // Display each alert type as icon + wrapped train name(s)
            Object.entries(alertsByType).forEach(([alertType, alerts]) => {
                const line = document.createElement('div');
                line.className = 'alert-train-line';

                const emoji = document.createElement('span');
                emoji.className = 'emoji';
                emoji.textContent = alertType === 'water_tank' ? '💧' : alertType === 'breakdown' ? '🔧' : alertType === 'ac_malfunction' ? '❄️' : '🚨';

                const text = document.createElement('span');
                text.className = 'alert-train-text';
                const alertTypeLabel = alertType.replace(/_/g, ' ');
                if (alerts.length === 1) {
                    const coach = alerts[0].coachNumber || 'Unknown';
                    text.textContent = `${alertTypeLabel}: ${alerts[0].trainNumber} - ${alerts[0].trainName} (Coach ${coach})`;
                } else {
                    const uniqueTrains = [
                        ...new Set(
                            alerts.map(a => {
                                const coach = a.coachNumber || 'Unknown';
                                return `${a.trainNumber} - ${a.trainName} (Coach ${coach})`;
                            })
                        )
                    ];
                    text.textContent = `${alertTypeLabel}: ${uniqueTrains.join(', ')}`;
                }

                line.appendChild(emoji);
                line.appendChild(text);
                detailsContainer.appendChild(line);
            });
            
            tooltipContent.appendChild(detailsContainer);
        }
        
        // Footer actions
        const serveButton = document.createElement('button');
        serveButton.className = 'alert-serve-button';
        serveButton.textContent = `Mark ${actualAlertCount} as Served`;
        serveButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.markAlertsAsServed(stationCode);
        });
        tooltipContent.appendChild(serveButton);
        
        tooltip.appendChild(tooltipContent);
        flag.appendChild(tooltip);

        // Add to map container
        const mapContainer = this.map.getContainer();
        mapContainer.appendChild(flag);
        
        // Store reference
        this.alertFlags.set(stationCode, flag);
        
    }

    // Test methods removed - no longer needed

    updateAlertFlag(stationCode, alertCount) {
        if (this.alertFlags.has(stationCode)) {
            const existingFlag = this.alertFlags.get(stationCode);
            const isServed = existingFlag.classList.contains('served');
            
            // If alert count is 0, just remove the flag
            if (alertCount === 0) {
                this.alertSystem.removeAlertFlag(stationCode);
                return;
            }
            
            // Remove existing flag and recreate with updated content
            this.alertSystem.removeAlertFlag(stationCode);
            this.addAlertFlag(stationCode, alertCount);
            
            // Restore served state if it was served
            if (isServed) {
                this.makeFlagBlink(stationCode);
            }
            
        } else {
            this.addAlertFlag(stationCode, alertCount);
        }
    }

    removeAlertFlag(stationCode) {
        if (this.alertFlags.has(stationCode)) {
            const flag = this.alertFlags.get(stationCode);
            if (flag && flag.parentNode) {
                flag.parentNode.removeChild(flag);
            }
            this.alertFlags.delete(stationCode);
        }
    }

    clearAllAlertFlags() {
        for (const [stationCode, flag] of this.alertFlags.entries()) {
            if (flag && flag.parentNode) {
                flag.parentNode.removeChild(flag);
            }
        }
        this.alertFlags.clear();
    }

    // Reset all train monitoring data
    resetAll() {
        
        // Stop simulation if running
        if (this.isRunning) {
            this.stop();
        }
        
        // Reset simulation state
        this.isRunning = false;
        this.isPaused = false;
        this.isAtStation = false;
        this.currentStationIndex = 0;
        this.currentWaypointIndex = 0;
        this.distanceTraveled = 0;
        this.trainSpeed = 0;
        this.currentSpeed = 0;
        this.currentPosition = { lat: 20.5937, lng: 78.9629 };
        
        // Clear current train selection
        this.currentTrainNumber = null;
        this.currentTrainName = null;
        this.currentTrainData = null;
        this.stations = [];
        this.route = [];
        
        // Disable Show Train button
        this.updateShowTrainButtonState(false);
        
        // Clear all train states for multi-train mode
        // All train states removed - single train mode only
        
        // Clear all alert flags
        this.clearAllAlertFlags();
        
        // Clear train markers and trails
        if (this.clearTrainTrail) {
            this.clearTrainTrail();
        }
        
        // Remove train marker from map
        if (this.trainMarker) {
            // Remove number hint if present
            try {
                if (this.tooltipSystem && this.tooltipSystem.removeTrainNumberHint && this.trainMarker._trainNumberHint) {
                    this.tooltipSystem.removeTrainNumberHint(this.trainMarker);
                }
            } catch (_e) {}
            this.map.removeLayer(this.trainMarker);
            this.trainMarker = null;
        }
        
        // Clear all station markers from map
        if (this.stationMarkers && this.stationMarkers.length > 0) {
            this.stationMarkers.forEach(marker => {
                if (marker && this.map.hasLayer(marker)) {
                    this.map.removeLayer(marker);
                }
            });
            this.stationMarkers = [];
        }
        
        // Clear route line
        if (this.routeLine && this.map.hasLayer(this.routeLine)) {
            this.map.removeLayer(this.routeLine);
            this.routeLine = null;
        }
        
        // Disable all train icons
        this.disableAllTrainIcons();
        
        // Reset searchable select to default state
        const trainSearchSelect = document.getElementById('trainSearchSelect');
        if (trainSearchSelect) {
            trainSearchSelect.value = '';
        }
        this.selectedTrainValue = '';
        
        // Clear train info panel completely using the dedicated method
        this.uiControls.clearTrainInfo();
        
        // Reset progress bar
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        if (progressFill) {
            progressFill.style.width = '0%';
        }
        if (progressText) {
            progressText.textContent = '0%';
        }
        
        // Reset ETA and progress displays
        const etaElement = document.getElementById('eta');
        const stationProgressElement = document.getElementById('station-progress');
        if (etaElement) {
            etaElement.textContent = '--:--';
        }
        if (stationProgressElement) {
            stationProgressElement.textContent = '-';
        }
        
        // Clear events list
        if (window.eventManager) {
            window.eventManager.clearAllEvents();
        }
        
        // Clear alert tracker
        if (window.eventManager && window.eventManager.alertTracker) {
            window.eventManager.alertTracker.clear();
        }
        
        // Reset control buttons state - keep them enabled but they won't work without a train
        const playBtn = document.getElementById('playBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const stopBtn = document.getElementById('stopBtn');
        
        if (playBtn) playBtn.disabled = false;
        if (pauseBtn) pauseBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = false;
        
    }

    updateAlertFlagPositions() {
        if (!this.map) return;
        
        for (const [stationCode, flag] of this.alertFlags.entries()) {
            // Use global CSV data instead of this.stations
            let station = null;
            if (typeof stationCoordinatesFromCSV !== 'undefined' && stationCoordinatesFromCSV[stationCode]) {
                station = stationCoordinatesFromCSV[stationCode];
            }
            
            if (station && station.lat && station.lng) {
                const point = this.map.latLngToContainerPoint([station.lat, station.lng]);
                // Position flag slightly above the station marker (offset by 15px up and 8px right for pole alignment)
                flag.style.left = `${point.x + 8}px`;
                flag.style.top = `${point.y - 15}px`;
            }
        }
    }
    
    // Update tooltip positions when map moves or zooms
    updateTooltipPositions() {
        try {
            // Update single train marker tooltip
            if (this.trainMarker && this.trainMarker._tooltipElement && 
                this.trainMarker._tooltipElement.style.opacity === '1') {
                this.tooltipSystem.positionClickTooltip(this.trainMarker, this.trainMarker._tooltipElement);
            }
            
            // All train markers removed - single train mode only
        } catch (error) {
            console.error('❌ Error updating tooltip positions:', error);
        }
    }

    // Add zoom level display next to zoom controls
    addZoomLevelDisplay() {
        // Deprecated: replaced by transient overlay
        this.zoomLevelDisplay = null;
    }
    
    // Update zoom level display
    updateZoomLevelDisplay() {
        // Deprecated: handled by overlay on zoomend
    }

    // Get alert details for a specific station
    getAlertDetailsForStation(stationCode) {
        if (!window.eventManager || !window.eventManager.alertTracker) {
            return [];
        }
        
        
        // Find the station key that matches the station code
        for (const [key, data] of window.eventManager.alertTracker.entries()) {
            if (key.startsWith(`${stationCode}_`)) {
                return data.alerts.received || [];
            }
        }
        
        return [];
    }

    // Mark alerts as served for a specific station
    markAlertsAsServed(stationCode) {
        if (!window.eventManager) {
            // console.warn('🚩 Event manager not available for marking alerts as served');
            return;
        }
        
        
        // Get alert details before marking as served
        const alertDetails = this.getAlertDetailsForStation(stationCode);
        
        // Mark alerts as served in the event manager
        window.eventManager.markAlertsAsServed(stationCode);
        
        // Don't publish served events here - they will be published when train departs
        // This prevents duplicate served events
        
        // Make the flag blink instead of removing it immediately
        this.makeFlagBlink(stationCode);
        
        // Hide the tooltip when alert is marked as served
        this.hideAlertTooltip(stationCode);
        
    }

    // Make alert flag blink to indicate it's been marked as served
    makeFlagBlink(stationCode) {
        const flag = this.alertFlags.get(stationCode);
        if (flag) {
            flag.classList.add('served');
            // Hide the tooltip when flag starts blinking
            this.hideAlertTooltip(stationCode);
        }
    }
    
    // Hide alert tooltip for a specific station
    hideAlertTooltip(stationCode) {
        const flag = this.alertFlags.get(stationCode);
        if (flag) {
            const tooltip = flag.querySelector('.alert-flag-tooltip');
            if (tooltip) {
                tooltip.style.opacity = '0';
                tooltip.style.pointerEvents = 'none';
                tooltip.style.display = 'none'; // Also hide with display none for extra safety
            } else {
            }
        } else {
        }
    }

    
    disableAllTrainIcons() {
        const trainIconsGrid = document.getElementById('trainIconsGrid');
        if (!trainIconsGrid) return;
        
        // Disable all train icons
        Array.from(trainIconsGrid.children).forEach(iconBtn => {
            iconBtn.classList.remove('enabled');
            iconBtn.classList.add('disabled');
            
            const trainNumberEl = iconBtn.querySelector('.train-number');
            if (trainNumberEl) {
                const trainNumber = trainNumberEl.textContent;
                iconBtn.title = `Train ${trainNumber} - Not loaded`;
            }
        });
        
        // Update stats after state change
        this.updateTrainStatsFromIcons();
    }
    
    updateTrainStats(total, active, available) {
        const totalEl = document.getElementById('totalTrains');
        const activeEl = document.getElementById('activeTrains');
        const availableEl = document.getElementById('availableTrains');
        
        if (totalEl) totalEl.textContent = total;
        if (activeEl) activeEl.textContent = active;
        if (availableEl) availableEl.textContent = available;
    }
    
    updateTrainStatsFromIcons() {
        const trainIconsGrid = document.getElementById('trainIconsGrid');
        if (!trainIconsGrid) return;
        
        const totalTrains = trainIconsGrid.children.length;
        const activeTrains = Array.from(trainIconsGrid.children).filter(btn => 
            btn.classList.contains('enabled')
        ).length;
        const availableTrains = totalTrains - activeTrains;
        
        this.updateTrainStats(totalTrains, activeTrains, availableTrains);
    }
    
    onTrainIconClick(trainNumber) {
        const iconBtn = Array.from(document.getElementById('trainIconsGrid').children).find(btn => {
            const trainNumberEl = btn.querySelector('.train-number');
            return trainNumberEl && trainNumberEl.textContent === trainNumber.toString();
        });
        
        if (iconBtn && iconBtn.classList.contains('disabled')) {
            return;
        }
        
        // Show alert menu for enabled train
        this.showAlertMenu(iconBtn, trainNumber);
    }
    
    showAlertMenu(iconBtn, trainNumber) {
        // Remove any existing menu
        this.hideAlertMenu();
        
        // Create alert menu
        const menu = document.createElement('div');
        menu.className = 'alert-menu';
        menu.id = 'alertMenu';
        
        const alertOptions = [
            { type: 'water_tank_alert', icon: '💧', text: 'Water Tank Alert' },
            { type: 'cleaning_service_alert', icon: '🧹', text: 'Cleaning Service Alert' },
            { type: 'ac_malfunction_alert', icon: '❄️', text: 'AC Malfunction Alert' }
        ];
        
        alertOptions.forEach(option => {
            const menuItem = document.createElement('div');
            menuItem.className = 'alert-menu-item';
            menuItem.innerHTML = `
                <span class="icon">${option.icon}</span>
                <span class="text">${option.text}</span>
            `;
            menuItem.addEventListener('click', () => {
                this.raiseAlert(trainNumber, option.type);
                this.hideAlertMenu();
            });
            menu.appendChild(menuItem);
        });
        
        // Add menu to body to avoid overflow issues
        document.body.appendChild(menu);
        
        // Calculate position relative to the button
        const buttonRect = iconBtn.getBoundingClientRect();
        const menuWidth = 180; // min-width from CSS
        const menuHeight = 120; // approximate height
        
        // Position menu above the button, centered horizontally with left offset
        let left = buttonRect.left + (buttonRect.width / 2) - (menuWidth / 2) - 20; // 20px left offset
        const top = buttonRect.top - menuHeight - 8; // 8px gap
        
        // Ensure menu doesn't go off the left edge of screen
        const minLeft = 10; // 10px margin from left edge
        if (left < minLeft) {
            left = minLeft;
        }
        
        // Ensure menu doesn't go off the right edge of screen
        const maxLeft = window.innerWidth - menuWidth - 10; // 10px margin from right edge
        if (left > maxLeft) {
            left = maxLeft;
        }
        
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        
        // Add click outside listener to close menu
        setTimeout(() => {
            document.addEventListener('click', this.handleClickOutsideMenu.bind(this));
        }, 100);
    }
    
    hideAlertMenu() {
        const existingMenu = document.getElementById('alertMenu');
        if (existingMenu) {
            existingMenu.remove();
        }
        document.removeEventListener('click', this.handleClickOutsideMenu.bind(this));
    }
    
    handleClickOutsideMenu(event) {
        const menu = document.getElementById('alertMenu');
        if (menu && !menu.contains(event.target) && !event.target.closest('.train-icon-btn')) {
            this.hideAlertMenu();
        }
    }
    
    async raiseAlert(trainNumber, alertType, coachNumber = null) {
        try {
            // Check if simulation is running
            if (!this.isRunning) {
                // console.warn(`⚠️ Train simulation is not running. Alert data may show static position.`);
            }
            
            // Get current train details
            const trainData = this.getCurrentTrainData(trainNumber);
            if (!trainData) {
                console.error(`❌ No data found for train ${trainNumber}`);
                return;
            }
            
            // Create alert payload
            const raisedTime = new Date().toISOString();
            const alertPayload = {
                type: alertType,
                trainNumber: trainNumber.toString(),
                trainName: trainData.trainName,
                coachNumber: coachNumber || 'Unknown',
                previousStation: trainData.previousStation,
                previousStationName: trainData.previousStationName,
                nextStation: trainData.nextStation,
                nextStationName: trainData.nextStationName,
                distanceTraveled: trainData.distanceTraveled,
                lat: trainData.lat,
                lon: trainData.lon,
                timestamp: raisedTime,
                raisedTime: raisedTime // Add raisedTime field to preserve original raised time
            };
            
            // Publish alert raised event directly
            const topic = `tms/alert/v1/raised/${alertType}/${trainNumber}/${trainData.nextStation}`;
            await this.solaceIntegration.publishAlertEvent(topic, alertPayload);
            
            
        } catch (error) {
            console.error('❌ Failed to raise alert:', error);
        }
    }
    
    getCurrentTrainData(trainNumber) {
        // Check if this is the currently loaded train
        if (this.currentTrainNumber && this.currentTrainNumber.toString() === trainNumber.toString()) {
            const currentStationIndex = this.currentStationIndex || 0;
            const previousStationIndex = Math.max(0, currentStationIndex);
            const nextStationIndex = Math.min(this.stations.length - 1, currentStationIndex + 1);
            
            
            return {
                trainName: this.currentTrainName || 'UNKNOWN',
                previousStation: this.stations[previousStationIndex]?.code || '',
                previousStationName: this.stations[previousStationIndex]?.name || '',
                nextStation: this.stations[nextStationIndex]?.code || '',
                nextStationName: this.stations[nextStationIndex]?.name || '',
                distanceTraveled: this.distanceTraveled || 0,
                lat: this.currentPosition?.lat || 0,
                lon: this.currentPosition?.lng || 0
            };
        }
        
        
        // For other trains, return basic data (could be enhanced with stored data)
        return {
            trainName: `Train ${trainNumber}`,
            previousStation: '',
            previousStationName: 'UNKNOWN',
            nextStation: '',
            nextStationName: 'UNKNOWN',
            distanceTraveled: 0,
            lat: 0,
            lon: 0
        };
    }
    
    async publishAlertEvent(topic, payload) {
        if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
            return;
        }
        
        try {
            await window.solaceTrainMonitor.publish(topic, payload);
        } catch (error) {
            console.error('❌ Failed to publish alert event:', error);
            throw error;
        }
    }

        // Solace Event Publishing Methods
        async publishTrainDepartedOriginEvent() {
            // Check if event publishing is enabled
            if (!window.publishEvents) {
                console.log('📤 Event publishing disabled, skipping departed_origin event');
                return;
            }
            
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                return;
            }

            try {
                const trainData = {
                    trainNumber: this.currentTrainNumber || '',
                    trainName: this.currentTrainName || '',
                    origin: this.stations[0]?.code || '',
                    originName: this.stations[0]?.name || '',
                    destination: this.stations[this.stations.length - 1]?.code || '',
                    destinationName: this.stations[this.stations.length - 1]?.name || '',
                    distanceTraveled: 0
                };

                await window.solaceTrainMonitor.publishTrainDepartedOrigin(trainData);
            } catch (error) {
                console.error('Error publishing train departed origin event:', error);
            }
        }

        async publishTrainArrivedStationEvent() {
            // Check if event publishing is enabled
            if (!window.publishEvents) {
                console.log('📤 Event publishing disabled, skipping arrived_station event');
                return;
            }
            
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                return;
            }

            try {
                const currentStation = this.stations[this.currentStationIndex];
                const previousStation = this.stations[this.currentStationIndex - 1];
                const nextStation = this.stations[this.currentStationIndex + 1];

                const trainData = {
                    trainNumber: this.currentTrainNumber || '',
                    trainName: this.currentTrainName || '',
                    previousStation: previousStation?.code || '',
                    previousStationName: previousStation?.name || '',
                    currentStation: currentStation?.code || '',
                    currentStationName: currentStation?.name || '',
                    nextStation: nextStation?.code || '',
                    nextStationName: nextStation?.name || '',
                    distanceTraveled: this.calculateDistanceTraveled()
                };

                await window.solaceTrainMonitor.publishTrainArrivedStation(trainData);
            } catch (error) {
                console.error('Error publishing train arrived station event:', error);
            }
        }

        async publishTrainStoppedStationEvent() {
            // Check if event publishing is enabled
            if (!window.publishEvents) {
                console.log('📤 Event publishing disabled, skipping stopped_station event');
                return;
            }
            
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                return;
            }

            try {
                const currentStation = this.stations[this.currentStationIndex];
                const previousStation = this.stations[this.currentStationIndex - 1];
                const nextStation = this.stations[this.currentStationIndex + 1];

                const trainData = {
                    trainNumber: this.currentTrainNumber || '',
                    trainName: this.currentTrainName || '',
                    previousStation: previousStation?.code || '',
                    previousStationName: previousStation?.name || '',
                    currentStation: currentStation?.code || '',
                    currentStationName: currentStation?.name || '',
                    nextStation: nextStation?.code || '',
                    nextStationName: nextStation?.name || '',
                    distanceTraveled: this.calculateDistanceTraveled()
                };

                await window.solaceTrainMonitor.publishTrainStoppedStation(trainData);
            } catch (error) {
                console.error('Error publishing train stopped station event:', error);
            }
        }

        async publishTrainDepartedStationEvent() {
            // Check if event publishing is enabled
            if (!window.publishEvents) {
                console.log('📤 Event publishing disabled, skipping departed_station event');
                return;
            }
            
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                return;
            }

            try {
                const currentStation = this.stations[this.currentStationIndex];
                const previousStation = this.stations[this.currentStationIndex - 1];
                const nextStation = this.stations[this.currentStationIndex + 1];

                const trainData = {
                    trainNumber: this.currentTrainNumber || '',
                    trainName: this.currentTrainName || '',
                    previousStation: previousStation?.code || '',
                    previousStationName: previousStation?.name || '',
                    currentStation: currentStation?.code || '',
                    currentStationName: currentStation?.name || '',
                    nextStation: nextStation?.code || '',
                    nextStationName: nextStation?.name || '',
                    distanceTraveled: this.calculateDistanceTraveled()
                };

                await window.solaceTrainMonitor.publishTrainDepartedStation(trainData);

                // Also publish alert served events for any alerts marked as served at this station
                if (window.eventManager && currentStation) {
                    const currentKeyPrefix = `${currentStation.code}_`;
                    const tracker = window.eventManager.getAlertTracker();
                    for (const [key, data] of tracker.entries()) {
                        if (key.startsWith(currentKeyPrefix) && data.alerts && data.alerts.served && data.alerts.served.length > 0) {
                            data.alerts.served.forEach(alert => {
                                window.eventManager.publishAlertServedEvent(alert, currentStation.code, currentStation.name);
                            });
                            // Note: we keep served records for history; event stream is emitted above
                        }
                    }
                }
            } catch (error) {
                console.error('Error publishing train departed station event:', error);
            }
        }

        async publishTrainArrivedDestinationEvent() {
            try {
                const previousStation = this.stations[this.stations.length - 2]; // Second to last station
                const destinationStation = this.stations[this.stations.length - 1];
                // Always clear unserved alerts at destination, even if publishing is disabled.
                if (window.eventManager && destinationStation) {
                    window.eventManager.clearUnservedAlertsAtDestination(
                        this.currentTrainNumber, 
                        destinationStation.code, 
                        destinationStation.name
                    );
                }

                // Check if event publishing is enabled
                if (!window.publishEvents) {
                    console.log('📤 Event publishing disabled, skipping arrived_destination event');
                    return;
                }
                
                if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                    return;
                }

                const trainData = {
                    trainNumber: this.currentTrainNumber || '',
                    trainName: this.currentTrainName || '',
                    origin: this.stations[0]?.code || '',
                    originName: this.stations[0]?.name || '',
                    destination: destinationStation?.code || '',
                    destinationName: destinationStation?.name || '',
                    previousStation: previousStation?.code || '',
                    distanceTraveled: this.calculateDistanceTraveled()
                };

                await window.solaceTrainMonitor.publishTrainArrivedDestination(trainData);
            } catch (error) {
                console.error('Error publishing train arrived destination event:', error);
            }
        }

        // --- Compatibility wrappers used by Train class (single-train unified engine) ---
        // These methods mirror the old "publishAllTrain*" API expected by s-train.js
        async publishAllTrainArrivedStationEvent(trainNumber, trainData, state) {
            // Check if event publishing is enabled
            if (!window.publishEvents) {
                console.log('📤 Event publishing disabled, skipping arrived_station event');
                return;
            }
            
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) return;
            try {
                const idx = state?.currentStationIndex ?? this.currentStationIndex;
                const prev = this.stations[idx - 1];
                const curr = this.stations[idx];
                const next = this.stations[idx + 1];
                const payload = {
                    trainNumber: String(trainNumber || this.currentTrainNumber || ''),
                    trainName: trainData?.trainName || this.currentTrainName || '',
                    previousStation: prev?.code || '',
                    previousStationName: prev?.name || '',
                    currentStation: curr?.code || '',
                    currentStationName: curr?.name || '',
                    nextStation: next?.code || '',
                    nextStationName: next?.name || '',
                    distanceTraveled: this.calculateDistanceTraveled()
                };
                await window.solaceTrainMonitor.publishTrainArrivedStation(payload);
            } catch (e) { console.error('Error publishing arrived station event:', e); }
        }

        async publishAllTrainStoppedStationEvent(trainNumber, trainData, state) {
            // Check if event publishing is enabled
            if (!window.publishEvents) {
                console.log('📤 Event publishing disabled, skipping stopped_station event');
                return;
            }
            
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) return;
            try {
                const idx = state?.currentStationIndex ?? this.currentStationIndex;
                const prev = this.stations[idx - 1];
                const curr = this.stations[idx];
                const next = this.stations[idx + 1];
                const payload = {
                    trainNumber: String(trainNumber || this.currentTrainNumber || ''),
                    trainName: trainData?.trainName || this.currentTrainName || '',
                    previousStation: prev?.code || '',
                    previousStationName: prev?.name || '',
                    currentStation: curr?.code || '',
                    currentStationName: curr?.name || '',
                    nextStation: next?.code || '',
                    nextStationName: next?.name || '',
                    distanceTraveled: this.calculateDistanceTraveled()
                };
                await window.solaceTrainMonitor.publishTrainStoppedStation(payload);
            } catch (e) { console.error('Error publishing stopped station event:', e); }
        }

        async publishAllTrainDepartedStationEvent(trainNumber, trainData, state) {
            // Delegate to the existing implementation that uses current indices
            await this.publishTrainDepartedStationEvent();
        }

        async publishAllTrainArrivedDestinationEvent(trainNumber, trainData, state) {
            await this.publishTrainArrivedDestinationEvent();
        }





        // Helper methods for distance calculation
        calculateDistanceTraveled() {
            let totalDistance = 0;
            for (let i = 0; i < this.currentStationIndex; i++) {
                if (this.stations[i] && this.stations[i + 1]) {
                    totalDistance += this.calculateDistance(
                        this.stations[i].lat, this.stations[i].lng,
                        this.stations[i + 1].lat, this.stations[i + 1].lng
                    );
                }
            }
            return Math.round(totalDistance * 100) / 100; // Round to 2 decimal places
        }

    
    async searchTrain(trainNumber = null) {
        if (this.isDebugTrain(trainNumber)) {
            console.log(`🔧 searchTrain called with trainNumber: ${trainNumber}`);
        }
        
        // If no train number provided, this is legacy call - skip
        if (!trainNumber) {
            if (this.isDebugTrain(trainNumber)) {
                console.log(`🔧 searchTrain: No train number provided, skipping`);
            }
            return;
        }
        
        try {
            if (this.isDebugTrain(trainNumber)) {
                console.log(`🔧 searchTrain: Getting train data for ${trainNumber}`);
            }
            
            // Try to get train data from CSV
            const trainData = await this.getTrainData(trainNumber);
            
            if (trainData) {
                if (this.isDebugTrain(trainNumber)) {
                    console.log(`🔧 searchTrain: Train data found, calling displayTrainData and updateMapWithTrainRoute`);
                }
                this.displayTrainData(trainData);
                this.updateMapWithTrainRoute(trainData);
            } else {
                if (this.isDebugTrain(trainNumber)) {
                    console.log(`🔧 searchTrain: No train data found for ${trainNumber}`);
                }
            }
        } catch (error) {
            console.error('Error searching for train:', error);
        }
    }
    
    async getTrainData(trainNumber) {
        if (this.isDebugTrain(trainNumber)) {
            console.log(`🔧 getTrainData called for trainNumber: ${trainNumber}`);
        }
        
        // Load and search train data from CSV file
        try {
            const trainData = await this.getTrainDataFromCSV(trainNumber);
            
            if (this.isDebugTrain(trainNumber)) {
                if (trainData && trainData.route && trainData.route.length > 0) {
                    console.log(`🔧 getTrainData: Found train data for ${trainNumber}: ${trainData.trainName}, route length: ${trainData.route.length}`);
                } else {
                    console.log(`🔧 getTrainData: No valid train data found for ${trainNumber} - trainData: ${!!trainData}, route: ${trainData?.route ? trainData.route.length : 'undefined'}`);
                }
            }
            
            if (trainData && trainData.route && trainData.route.length > 0) {
                return trainData;
            }
        } catch (error) {
            if (this.isDebugTrain(trainNumber)) {
                console.log(`🔧 getTrainData: Error loading CSV data for ${trainNumber}:`, error);
            }
        }
        
        return null;
    }
    
    async getTrainDataFromCSV(trainNumber) {
        // Load CSV data and find train information
        try {
            // Load the CSV file
            // const response = await fetch('assets/data/trains.csv');
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.status}`);
            }
            
            const csvText = await response.text();
            const trainData = await this.parseCSVData(csvText, trainNumber);
            
            if (trainData) {
                return trainData;
            }
        } catch (error) {
            console.error('Error loading CSV data:', error);
        }
        
        return null;
    }
    
    async parseCSVData(csvText, trainNumber) {
        // Parse CSV data and extract train information
        const lines = csvText.split('\n');
        
        // Find all rows for the specified train number
        const trainRows = lines.slice(1).filter(line => {
            const columns = parseCSVLine(line);
            return columns[0] === trainNumber || columns[0] === trainNumber.toString();
        });
        
        
        
        if (trainRows.length === 0) {
            return null;
        }
        
        // Extract train information from first row
        const firstRow = parseCSVLine(trainRows[0]);
        const trainName = firstRow[1];
        const sourceStation = firstRow[13]; // Updated index for Source Station
        const sourceStationName = firstRow[14]; // Updated index for Source Station Name
        const destinationStation = firstRow[15]; // Updated index for Destination Station
        const destinationStationName = firstRow[16]; // Updated index for Destination Station Name
        
        
        // Parse route data with enhanced fields
        const route = trainRows.map((row, index) => {
            const columns = parseCSVLine(row);
            return {
                sequence: parseInt(columns[2]),
                code: columns[3],
                name: columns[4],
                arrival: columns[5],
                haltTime: parseInt(columns[6]) || 0, // New field: Halt Time
                departure: columns[7],
                distance: parseFloat(columns[8]) || 0,
                distanceTraveled: parseFloat(columns[9]) || 0, // New field: Distance Traveled
                distanceToNext: parseFloat(columns[10]) || 0, // New field: Distance to Next Station
                distanceToDestination: parseFloat(columns[11]) || 0, // New field: Distance to Destination
                platformNumber: columns[12] || 'TBD', // New field: Platform Number
                lat: 0, // Will be populated from station coordinates
                lng: 0  // Will be populated from station coordinates
            };
        });
        
        
        // Get station coordinates for plotting
        await this.addStationCoordinates(route);
        
        
        // Calculate total distance and duration
        const totalDistance = route[route.length - 1].distance;
        const duration = this.calculateDurationFromTimes(route[0].departure, route[route.length - 1].arrival);
        
        const result = {
            trainNumber: trainNumber,
            trainName: trainName,
            sourceStation: sourceStation,
            sourceStationName: sourceStationName,
            destinationStation: destinationStation,
            destinationStationName: destinationStationName,
            route: route,
            totalDistance: totalDistance,
            duration: duration,
            source: 'CSV Data'
        };
        
        route.forEach((station, index) => {
        });
        
        return result;
    }
    
    async getStationCoordinatesFromOSM(stationName, stationCode) {
        // Check cache first
        const cacheKey = `${stationCode}_${stationName}`;
        if (this.coordinateCache.has(cacheKey)) {
            return this.coordinateCache.get(cacheKey);
        }
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Simplified OSM query to avoid rate limits
        const overpassQuery = `
            [out:json][timeout:5];
            node["railway"="station"]["ref"="${stationCode}"];
            out center;
        `;
        
        try {
            const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`);
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                return null;
            }
            
            const data = await response.json();
            
            if (data.elements && data.elements.length > 0) {
                const station = data.elements[0];
                const coords = {
                    lat: station.lat || station.center.lat,
                    lng: station.lon || station.center.lon
                };
                // Cache the coordinates for future use
                this.coordinateCache.set(cacheKey, coords);
                return coords;
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }
    
    async addStationCoordinates(route) {
        
        // Apply coordinates from CSV
        route.forEach(station => {
            const coords = stationCoordinatesFromCSV[station.code];
            if (coords) {
                station.lat = coords.lat;
                station.lng = coords.lng;
                // Update station name if available in coordinates database
                if (coords.name) {
                    station.name = coords.name;
                }
            } else {
            }
        });
        
        // Only try OSM for stations not in our CSV data (to avoid rate limits)
        for (let station of route) {
            if (station.lat === 0 && station.lng === 0) {
                try {
                    const coords = await this.getStationCoordinatesFromOSM(station.name, station.code);
                    if (coords) {
                        station.lat = coords.lat;
                        station.lng = coords.lng;
                    } else {
                        // Use default coordinates if OSM fails
                        station.lat = 20.0000;
                        station.lng = 77.0000;
                    }
                } catch (error) {
                    station.lat = 20.0000;
                    station.lng = 77.0000;
                }
            }
        }
    }
    
    displayTrainData(trainData) {
        // Reset all trains mode when individual train is selected
        
        console.log(`🔧 displayTrainData called for train ${trainData ? trainData.trainNumber : 'null'}`);
        console.log(`🔧 displayTrainData: Station markers before clearAllTrainMarkers: ${this.stationMarkers.length}`);
        console.log(`🔧 displayTrainData: Train marker exists before clearAllTrainMarkers: ${!!this.trainMarker}`);
        if (this.trainMarker) {
            const isInMap = this.map.hasLayer(this.trainMarker);
            console.log(`🔧 displayTrainData: Train marker inMap before clearAllTrainMarkers: ${isInMap}`);
        }
        
        
        console.log(`🔧 displayTrainData: Station markers after clearAllTrainMarkers: ${this.stationMarkers.length}`);
        console.log(`🔧 displayTrainData: Train marker exists after clearAllTrainMarkers: ${!!this.trainMarker}`);
        if (this.trainMarker) {
            const isInMap = this.map.hasLayer(this.trainMarker);
            console.log(`🔧 displayTrainData: Train marker inMap after clearAllTrainMarkers: ${isInMap}`);
        }
        
        // All train states removed - single train mode only
        
        // Clear all existing alert flags when loading a new train
        this.clearAllAlertFlags();
        
        // Disable all train icons first
        this.disableAllTrainIcons();
        
        // Update current train information
        if (trainData) {
            this.currentTrainNumber = trainData.trainNumber;
            this.currentTrainName = trainData.trainName;
            this.currentTrainData = trainData; // Store complete train data for coach information
            
            // Update sidebar train information
            document.getElementById('train-number').textContent = trainData.trainNumber || '-';
            document.getElementById('train-name').textContent = trainData.trainName || 'Unknown Train';
            
            // Update train icon state in bottom panel - enable only the selected train
            this.updateTrainIconState(trainData.trainNumber, true);
            
            // Enable Show Train button when a train is selected
            this.updateShowTrainButtonState(true);
            
            // Initialize progress bar to 0% when train is first selected
            this.uiControls.updateProgressBar();
        } else {
            // Disable Show Train button when no train is selected
            this.updateShowTrainButtonState(false);
        }
        
        // Display train information in the right panel
        const trainInfo = document.getElementById('trainInfo');
        if (trainData && trainInfo) {
            trainInfo.innerHTML = `
                <h3>${trainData.trainName || 'Unknown Train'}</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Train Number:</span>
                        <span class="info-value">${trainData.trainNumber}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Route:</span>
                        <span class="info-value">${trainData.sourceStationName} → ${trainData.destinationStationName}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Total Distance:</span>
                        <span class="info-value">${trainData.totalDistance} km</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Duration:</span>
                        <span class="info-value">${trainData.duration || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Stations:</span>
                        <span class="info-value">${trainData.route.length}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Data Source:</span>
                        <span class="info-value">${trainData.source || 'CSV'}</span>
                    </div>
                </div>
            `;
        }
        
        // Update the sidebar train information using the proper function
        this.uiControls.updateTrainInfo();
    }
    
    updateMapWithTrainRoute(trainData) {
        if (this.isDebugTrain(trainData.trainNumber)) {
            console.log(`🔧 updateMapWithTrainRoute called for train ${trainData.trainNumber} with ${trainData.route.length} stations`);
            console.log(`🔧 Clearing ${this.stationMarkers.length} existing station markers`);
        }
        
        // Clear existing station markers
        this.stationMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.stationMarkers = [];
        
        // Add new station markers for the train route
        if (this.isDebugTrain(trainData.trainNumber)) {
            console.log(`🔧 Starting to create ${trainData.route.length} station markers`);
        }
        
        trainData.route.forEach((station, index) => {
            // Make first and last stations same size as regular but blue, intermediate stations smaller and green
            const isFirstOrLast = index === 0 || index === trainData.route.length - 1;
            const iconSize = isFirstOrLast ? [20, 20] : [12, 12];
            const iconAnchor = isFirstOrLast ? [10, 10] : [6, 6];
            const className = isFirstOrLast ? 'station-marker origin-destination' : 'station-marker';
            
            if (this.isDebugTrain(trainData.trainNumber)) {
                console.log(`🔧 Processing station ${index + 1}/${trainData.route.length}: ${station.name} (${station.code}) - isFirstOrLast: ${isFirstOrLast}, className: ${className}, iconSize: [${iconSize[0]}, ${iconSize[1]}]`);
            }
            
            // Log first/last station
            if (isFirstOrLast && this.isDebugTrain(trainData.trainNumber)) {
                console.log(`🔵 Origin/Destination marker: ${station.name} (${station.code}) - Class: ${className}, Size: ${iconSize[0]}x${iconSize[1]}`);
            }

            if (this.isDebugTrain(trainData.trainNumber)) {
                console.log(`🔧 Creating marker for ${station.name} at coordinates: lat=${station.lat}, lng=${station.lng}`);
            }
            
            const marker = L.marker([station.lat, station.lng], {
                icon: L.divIcon({
                    className: className,
                    html: '', // Ensure empty HTML
                    iconSize: iconSize,
                    iconAnchor: iconAnchor
                }),
                zIndexOffset: 100 // Ensure station markers are visible
            }).addTo(this.map);
            
            if (this.isDebugTrain(trainData.trainNumber)) {
                console.log(`🔧 ✅ Marker created and added to map for ${station.name}: className=${className}, iconSize=[${iconSize[0]}, ${iconSize[1]}], zIndexOffset=100`);
            }
            
            // Store station data on marker for tooltip access
            marker._stationData = station;
            marker._markerType = 'station';
            
            
            // Add unified tooltip system (click to show, like train markers)
            this.tooltipSystem.setupClickTooltip(marker);
            
            if (this.isDebugTrain(trainData.trainNumber)) {
                console.log(`🔧 Tooltip setup completed for ${station.name}`);
            }
            
            this.stationMarkers.push(marker);
        });
        
        if (this.isDebugTrain(trainData.trainNumber)) {
            console.log(`🔧 ✅ COMPLETED: Created ${this.stationMarkers.length} station markers for single train mode`);
            
            // Debug: Check if markers are within map bounds
            if (this.stationMarkers.length > 0) {
                const mapBounds = this.map.getBounds();
                console.log(`🔧 Map bounds: ${mapBounds.getSouth()}, ${mapBounds.getWest()} to ${mapBounds.getNorth()}, ${mapBounds.getEast()}`);
                this.stationMarkers.forEach((marker, index) => {
                    const latLng = marker.getLatLng();
                    console.log(`🔧 Marker ${index}: lat=${latLng.lat}, lng=${latLng.lng}, inBounds=${mapBounds.contains(latLng)}`);
                });
            }
        }
        
        // Create route line connecting all stations
        if (this.isDebugTrain(trainData.trainNumber)) {
            console.log(`🔧 Creating route line connecting ${trainData.route.length} stations`);
        }
        
        const routeCoordinates = trainData.route.map(station => [station.lat, station.lng]);
        const routeLine = L.polyline(routeCoordinates, {
            color: '#dc3545', // Red color for single train route
            weight: 3,
            opacity: 0.7
        }).addTo(this.map);
        
        if (this.isDebugTrain(trainData.trainNumber)) {
            console.log(`🔧 ✅ Route line created and added to map with ${routeCoordinates.length} coordinate points`);
        }
        
        // Store route line for cleanup
        if (!this.routeLine) {
            this.routeLine = null;
        }
        // Remove existing route line if any
        if (this.routeLine) {
            this.map.removeLayer(this.routeLine);
        }
        this.routeLine = routeLine;
                
        // Update the stations data for train movement
        this.stations = trainData.route.map((station, idx) => ({
            name: station.name,
            lat: station.lat,
            lng: station.lng,
            code: station.code,
            distance: station.distance, // Use actual distance from CSV
            platformNumber: station.platformNumber // Include platform number
        }));

        // Temporary debug: classify stations on load (not suppressed by log override)
        try {
            if (window.SHOW_STATION_STATUS_DEBUG) {
                const total = this.stations.length;
                console.info(`[SINGLE][${trainData.trainNumber}] Loaded ${total} stations`);
                this.stations.forEach((s, i) => {
                    let cls = 'Intermediate';
                    if (i === 0) cls = 'Origin';
                    else if (i === total - 1) cls = 'Destination';
                    console.info(`[SINGLE][${trainData.trainNumber}] ${cls} #${i+1}/${total} ${s.code} ${s.name} @ (${s.lat.toFixed(6)}, ${s.lng.toFixed(6)})`);
                });
            }
        } catch (_e) {}
        
        // Reset simulation state for new train
        this.currentStationIndex = 0;
        this.currentPosition = { lat: this.stations[0].lat, lng: this.stations[0].lng };
        this.currentSpeed = 0;
        this.trainSpeed = 0;
        this.isRunning = false;
        this.isPaused = false;
        // Start in "At Origin" state on load
        this.isAtStation = true;
        this.stationStopStartTime = Date.now();
        
        // Recreate train marker with proper train icon at starting station
        if (this.trainMarker) {
            this.tooltipSystem.removeTrainNumberHint(this.trainMarker);
            this.map.removeLayer(this.trainMarker);
        }
        this.trainMarker = L.marker([this.stations[0].lat, this.stations[0].lng], {
            icon: L.divIcon({
                className: 'train-marker',
                html: this.createTrainIcon(24),
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            })
        }).addTo(this.map);
        
        
        // Add simple click tooltip
        this.tooltipSystem.setupClickTooltip(this.trainMarker);
        
        // Add train number hint
        this.tooltipSystem.addTrainNumberHint(this.trainMarker, this.currentTrainNumber);
        
        // Generate waypoints for the loaded train route to follow exact track
        this.waypoints = this.trainDataManager.generateWaypoints();
        this.totalDistance = this.trainDataManager.calculateTotalDistance();
        
        // Update train marker popup with new train data
        if (this.trainMarker) {
            const popup = this.trainMarker.getPopup();
            if (popup) {
                popup.setContent(`
                    <div style="text-align: center; font-family: 'Segoe UI', sans-serif; min-width: 200px;">
                        <h4 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 16px;">🚂 ${trainData.trainName || 'Train'}</h4>
                        <div style="background: #f8f9fa; border-radius: 6px; padding: 8px; margin: 6px 0;">
                            <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
                                <span style="color: #6c757d;">Status:</span>
                                <span id="popupStatus" style="color: #495057; font-weight: 600;">Stopped</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
                                <span style="color: #6c757d;">Speed:</span>
                                <span id="popupSpeed" style="color: #495057; font-weight: 600;">0 km/h</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
                                <span style="color: #6c757d;">Latitude:</span>
                                <span id="popupLat" style="color: #495057; font-weight: 600; font-family: monospace;">${this.currentPosition.lat.toFixed(6)}°</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
                                <span style="color: #6c757d;">Longitude:</span>
                                <span id="popupLng" style="color: #495057; font-weight: 600; font-family: monospace;">${this.currentPosition.lng.toFixed(6)}°</span>
                            </div>
                        </div>
                    </div>
                `);
            }
        }
        
        // Center map on the new route
        if (this.stationMarkers.length > 0) {
            const group = new L.featureGroup(this.stationMarkers);
            this.map.fitBounds(group.getBounds().pad(0.1));
        }
        
        // Update the sidebar display with train information
        this.trainSimulation.updateDisplay();
        this.uiControls.updateTrainInfo();
    }
    
    // Cleaned up - removed duplicate code
    
    // Simulation methods moved to train-simulation.js and multi-train-manager.js
    
    calculateDistance(lat1, lng1, lat2, lng2) {
        // Calculate distance between two points using Haversine formula
        const R = 6371; // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    calculateDurationFromTimes(departureTime, arrivalTime) {
        // Calculate duration between departure and arrival times
        // Expected format: "HH:MM" (24-hour format)
        try {
            if (!departureTime || !arrivalTime) {
                return 'N/A';
            }
            
            // Parse time strings (assuming HH:MM format)
            const parseTime = (timeStr) => {
                const [hours, minutes] = timeStr.split(':').map(Number);
                return hours * 60 + minutes; // Convert to minutes
            };
            
            const departureMinutes = parseTime(departureTime);
            const arrivalMinutes = parseTime(arrivalTime);
            
            // Handle case where arrival is next day
            let durationMinutes = arrivalMinutes - departureMinutes;
            if (durationMinutes < 0) {
                durationMinutes += 24 * 60; // Add 24 hours
            }
            
            const hours = Math.floor(durationMinutes / 60);
            const minutes = durationMinutes % 60;
            
            return `${hours}h ${minutes}m`;
        } catch (error) {
            console.log('Error calculating duration:', error);
            return 'N/A';
        }
    }
    
    async loadAvailableTrains() {
        try {
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.status}`);
            }
            
            const csvText = await response.text();
            const trains = this.parseAvailableTrains(csvText);
            
            // Store train options for searchable select
            this.allTrainOptions = [];
                
            // Add "All Trains" option as first option
            this.allTrainOptions.push({
                value: 'all',
                label: 'All Trains - Multi-Train Simulation',
                text: 'All Trains - Multi-Train Simulation'
            });
                
                // Add individual train options
                trains.forEach(train => {
                this.allTrainOptions.push({
                    value: train.number,
                    label: `${train.number} - ${train.name} (${train.source} → ${train.destination})`,
                    text: `${train.number} - ${train.name} (${train.source} → ${train.destination})`
                });
            });
            
        } catch (error) {
            console.error('Error loading available trains:', error);
        }
    }
    
    /**
     * Initialize searchable select functionality
     */
    initializeSearchableSelect() {
        const input = document.getElementById('trainSearchSelect');
        const dropdown = document.getElementById('trainDropdown');
        const dropdownToggle = document.getElementById('dropdownToggle');
        const optionsContainer = dropdown.querySelector('.dropdown-options');
        
        if (!input || !dropdown || !optionsContainer) return;
        
        // Store all train options for filtering
        this.allTrainOptions = [];
        this.filteredTrainOptions = null; // Will be set when filtering is needed
        this.selectedTrainValue = '';
        this.highlightedIndex = -1;
        this.isDropdownOpen = false;
        
        // Input event listeners
        input.addEventListener('input', (e) => {
            this.uiControls.filterAndShowOptions(e.target.value);
        });
        
        input.addEventListener('focus', () => {
            // When focusing on input, show filtered results based on current text
            this.uiControls.filterAndShowOptions(input.value);
        });
        
        input.addEventListener('keydown', (e) => {
            this.uiControls.handleKeydown(e);
        });
        
        // Dropdown arrow click - show all trains
        if (dropdownToggle) {
            dropdownToggle.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.isDropdownOpen) {
                    this.uiControls.hideDropdown();
            } else {
                    this.uiControls.showAllTrains();
                }
            });
        }
        
        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target) && 
                (!dropdownToggle || !dropdownToggle.contains(e.target))) {
                this.uiControls.hideDropdown();
            }
        });
        
        // Prevent dropdown from closing when clicking inside
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    /**
     * Filter and show options based on search term
     */
    filterAndShowOptions(searchTerm) {
        const input = document.getElementById('trainSearchSelect');
        const dropdown = document.getElementById('trainDropdown');
        const optionsContainer = dropdown.querySelector('.dropdown-options');
        
        if (!input || !dropdown || !optionsContainer) return;
        
        const searchLower = searchTerm.toLowerCase().trim();
        
        // Use filtered options in real-time mode, otherwise use all options
        const availableOptions = this.isRealtimeMode && this.filteredTrainOptions ? 
            this.filteredTrainOptions : this.allTrainOptions;
        
        const filteredOptions = availableOptions.filter(option => {
            if (!searchLower) return true;
            const optionText = option.text.toLowerCase();
            return optionText.includes(searchLower) || option.value.includes(searchLower);
        });
        
        // Clear existing options
        optionsContainer.innerHTML = '';
        
        // Add filtered options
        filteredOptions.forEach((option, index) => {
            const optionElement = document.createElement('div');
            optionElement.className = 'dropdown-option';
            optionElement.textContent = option.text;
            optionElement.dataset.value = option.value;
            optionElement.dataset.index = index;
            
            optionElement.addEventListener('click', () => {
                this.uiControls.selectOption({ value: option.value, text: option.text });
            });
            
            optionsContainer.appendChild(optionElement);
        });
        
        this.highlightedIndex = -1;
        this.uiControls.showDropdown();
    }
    
    /**
     * Show all trains (when dropdown arrow is clicked)
     */
    showAllTrains() {
        const dropdown = document.getElementById('trainDropdown');
        const optionsContainer = dropdown.querySelector('.dropdown-options');
        const dropdownToggle = document.getElementById('dropdownToggle');
        
        if (!dropdown || !optionsContainer) return;
        
        // Clear existing options
        optionsContainer.innerHTML = '';
        
        // Add all train options (filtered in real-time mode)
        const availableOptions = this.isRealtimeMode && this.filteredTrainOptions ? 
            this.filteredTrainOptions : this.allTrainOptions;
        
        availableOptions.forEach((option, index) => {
            const optionElement = document.createElement('div');
            optionElement.className = 'dropdown-option';
            optionElement.textContent = option.text;
            optionElement.dataset.value = option.value;
            optionElement.dataset.index = index;
            
            optionElement.addEventListener('click', () => {
                this.uiControls.selectOption({ value: option.value, text: option.text });
            });
            
            optionsContainer.appendChild(optionElement);
        });
        
        this.uiControls.showDropdown();
    }
    
    /**
     * Show dropdown
     */
    showDropdown() {
        const dropdown = document.getElementById('trainDropdown');
        const dropdownToggle = document.getElementById('dropdownToggle');
        
        if (dropdown) {
            dropdown.style.display = 'block';
            this.isDropdownOpen = true;
        }
        
        if (dropdownToggle) {
            dropdownToggle.classList.add('active');
        }
    }
    
    /**
     * Hide dropdown
     */
    hideDropdown() {
        const dropdown = document.getElementById('trainDropdown');
        const dropdownToggle = document.getElementById('dropdownToggle');
        
        if (dropdown) {
            dropdown.style.display = 'none';
            this.isDropdownOpen = false;
        }
        
        if (dropdownToggle) {
            dropdownToggle.classList.remove('active');
        }
        
        this.highlightedIndex = -1;
    }
    
    /**
     * Handle keyboard navigation
     */
    handleKeydown(e) {
        const options = document.querySelectorAll('.dropdown-option');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.highlightedIndex = Math.min(this.highlightedIndex + 1, options.length - 1);
                this.updateHighlight();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.highlightedIndex = Math.max(this.highlightedIndex - 1, -1);
                this.updateHighlight();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.highlightedIndex >= 0 && options[this.highlightedIndex]) {
                    const option = options[this.highlightedIndex];
                    const value = option.dataset.value;
                    const text = option.textContent;
                    this.uiControls.selectOption({ value, text });
                }
                break;
            case 'Escape':
                this.uiControls.hideDropdown();
                break;
        }
    }
    
    /**
     * Update highlighted option
     */
    updateHighlight() {
        const options = document.querySelectorAll('.dropdown-option');
        options.forEach((option, index) => {
            option.classList.toggle('highlighted', index === this.highlightedIndex);
        });
    }
    
    /**
     * Select an option
     */
    selectOption(option) {
        const input = document.getElementById('trainSearchSelect');
        if (input) {
            input.value = option.text;
            this.selectedTrainValue = option.value;
        }
        this.uiControls.hideDropdown();
    }
    
    /**
     * Get selected train from searchable select
     */
    async selectTrainFromSearchableSelect() {
        if (!this.selectedTrainValue) {
            return;
        }
        
        const selectedValue = this.selectedTrainValue;
        
        // Prevent duplicate processing if the same train is already selected
        if (this.isProcessingTrain && this.currentProcessingTrain === selectedValue) {
            return;
        }
        
        this.isProcessingTrain = true;
        this.currentProcessingTrain = selectedValue;
        
        try {
            
            if (selectedValue === 'all') {
                // Launch independent multi-train system
                if (typeof launchMultiTrainSystem === 'function') {
                    await launchMultiTrainSystem();
            } else {
                    console.error('❌ Multi-train system not available');
                }
            } else {
                // Stop multi-train system if running
                if (typeof stopMultiTrainSystem === 'function') {
                    stopMultiTrainSystem();
                }
                await this.trainDataManager.searchTrain(selectedValue);
            }
        } finally {
            this.isProcessingTrain = false;
            this.currentProcessingTrain = null;
        }
    }
    
    parseAvailableTrains(csvText) {
        const lines = csvText.split('\n');
        const trainMap = new Map();
        
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const columns = parseCSVLine(line);
            if (columns.length >= 17) {
                const trainNumber = columns[0];
                const trainName = columns[1];
                const sourceStation = columns[13];
                const destinationStation = columns[15];
                
                if (!trainMap.has(trainNumber)) {
                    trainMap.set(trainNumber, {
                        number: trainNumber,
                        name: trainName,
                        source: sourceStation,
                        destination: destinationStation
                    });
                }
            }
        }
        
        // Convert map to array and sort by train number
        return Array.from(trainMap.values()).sort((a, b) => a.number.localeCompare(b.number));
    }
    
    async selectTrainFromDropdown() {
        // This method is kept for backward compatibility but now redirects to the new method
        return this.uiControls.selectTrainFromSearchableSelect();
    }
    
    async selectTrainFromDropdownOld() {
        const dropdown = document.getElementById('trainDropdown');
        if (!dropdown || !dropdown.value) {
            return;
        }
        
        const selectedValue = dropdown.value;
        
        // Prevent duplicate processing if the same train is already selected
        if (this.isProcessingTrain && this.currentProcessingTrain === selectedValue) {
            return;
        }
        
        this.isProcessingTrain = true;
        this.currentProcessingTrain = selectedValue;
        
        try {
            
            // Handle individual train selection
            await this.trainDataManager.searchTrain(selectedValue);
        } finally {
            this.isProcessingTrain = false;
            this.currentProcessingTrain = null;
        }
    }
    
    
    
    
    
    // Train color methods moved to multi-train-manager.js
    
    
    createSingleTrainTooltip() {
        const status = this.isRunning ? (this.isPaused ? 'Paused' : 'Running') : 'Stopped';
        const speed = this.isRunning ? `${Math.round(this.currentSpeed || 0)} km/h` : '0 km/h';
        const currentStation = this.stations[this.currentStationIndex]?.name || 'Unknown';
        const progress = this.stations.length > 0 ? `${this.currentStationIndex + 1}/${this.stations.length}` : '0/0';
        
        return `🚂 ${this.currentTrainName || 'Train'} - ${status} (${speed}) - Station ${progress}: ${currentStation}`;
    }
    
    // Simple click-to-show tooltip system
    setupClickTooltip(marker) {
        if (!marker) return;
        
        // Clean up any existing tooltip
        if (marker._tooltipElement) {
            marker._tooltipElement.remove();
            marker._tooltipElement = null;
        }
        
        // Create simple tooltip element
        const tooltipElement = document.createElement('div');
        tooltipElement.className = 'simple-tooltip';
        tooltipElement.style.cssText = `
            position: fixed;
            background: white;
            color: #2c3e50;
            padding: 12px;
            border-radius: 8px;
            font-size: 12px;
            font-family: 'Segoe UI', sans-serif;
            z-index: 2147483647; /* ensure above everything */
            pointer-events: auto;
            cursor: default;
            opacity: 0;
            transition: opacity 0.2s ease;
            min-width: 200px;
            max-width: 280px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border: 1px solid #dee2e6;
            text-align: center;
            display: none;
        `;
        
        document.body.appendChild(tooltipElement);
        marker._tooltipElement = tooltipElement;
        
        // Click to show tooltip
        marker.on('click', () => {
            this.showClickTooltip(marker, tooltipElement);
        });
        
        // ESC key to close
        const escapeHandler = (e) => {
            if (e.key === 'Escape' && tooltipElement.style.display !== 'none') {
                this.hideClickTooltip(tooltipElement);
            }
        };
        document.addEventListener('keydown', escapeHandler);
        marker._escapeHandler = escapeHandler;
    }
    
    showClickTooltip(marker, tooltipElement) {
        // Hide any other open tooltips
        document.querySelectorAll('.simple-tooltip').forEach(tooltip => {
            if (tooltip !== tooltipElement) {
                this.hideClickTooltip(tooltip);
            }
        });
        
        // Update content
        this.tooltipSystem.updateClickTooltipContent(marker, tooltipElement);
        
        // Position tooltip
        this.tooltipSystem.positionClickTooltip(marker, tooltipElement);
        
        // Show tooltip
        tooltipElement.style.display = 'block';
        tooltipElement.style.opacity = '1';
    }
    
    hideClickTooltip(tooltipElement) {
            tooltipElement.style.opacity = '0';
        setTimeout(() => {
            tooltipElement.style.display = 'none';
        }, 200);
    }
    
    updateClickTooltipContent(marker, tooltipElement) {
        let content = '';
        
        if (marker._markerType === 'station') {
            // Station marker (minimal multi-train format)
            const s = marker._stationData;
            if (s) {
                const trains = Array.isArray(s.trainsPassing) && s.trainsPassing.length > 0 
                    ? s.trainsPassing.join(', ') 
                    : '—';
                content = `
                    <div style="position: relative;">
                        <button onclick="this.parentElement.parentElement.style.opacity='0'; setTimeout(() => this.parentElement.parentElement.style.display='none', 200);" 
                                style="position: absolute; top: 4px; right: 8px; background: none; border: none; font-size: 16px; cursor: pointer; color: #666; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">×</button>
                        <div style="margin: 0 0 8px 0; color: #2c3e50; font-size: 14px; font-weight: 600;">${s.code} — ${s.name}</div>
                        <div style="background: #f8f9fa; border-radius: 6px; padding: 10px; margin: 6px 0;">
                            <div style="margin: 4px 0; font-size: 12px;"><strong>Trains:</strong> ${trains}</div>
                            <div style="margin: 4px 0; font-size: 12px;"><strong>Lat/Lng:</strong> <span style="font-family: monospace;">${s.lat?.toFixed(6) || 'N/A'}, ${s.lng?.toFixed(6) || 'N/A'}</span></div>
                        </div>
                    </div>
                `;
            }
        } else 
        {
            // Train marker
            const trainData = this.tooltipSystem.getClickTooltipTrainData(marker);
            if (trainData) {
                content = `
                    <div style="position: relative;">
                        <button onclick="this.parentElement.parentElement.style.opacity='0'; setTimeout(() => this.parentElement.parentElement.style.display='none', 200);" 
                                style="position: absolute; top: 4px; right: 8px; background: none; border: none; font-size: 16px; cursor: pointer; color: #666; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">×</button>
                        <h4 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 16px;">🚂 Train ${trainData.trainNumber}</h4>
                        <div style="background: #f8f9fa; border-radius: 6px; padding: 10px; margin: 6px 0;">
                            <div style="margin: 4px 0;"><strong>Name:</strong> ${trainData.trainName}</div>
                            <div style="margin: 4px 0;"><strong>Route:</strong> ${trainData.source} → ${trainData.destination}</div>
                            <div style="margin: 4px 0;"><strong>Current Station:</strong> ${trainData.currentStation}</div>
                            <div style="margin: 4px 0;"><strong>Next Station:</strong> ${trainData.nextStation}</div>
                            <div style="margin: 4px 0;"><strong>Progress:</strong> ${this.tooltipSystem.getProgressDisplay(trainData)}</div>
                            <div style="margin: 4px 0;"><strong>Status:</strong> ${this.isRunning ? 'Running' : 'Stopped'}</div>
                            <div style="margin: 4px 0;"><strong>Speed:</strong> ${this.tooltipSystem.getClickTooltipCurrentSpeed(marker)} km/h</div>
                        </div>
                    </div>
                `;
            }
        }
        
        if (!content) {
            content = '<div style="padding: 10px; text-align: center;">No data available</div>';
        }
        
        tooltipElement.innerHTML = content;
    }
    
    positionClickTooltip(marker, tooltipElement) {
        try {
            if (!marker || !tooltipElement || !this.map) return;
            
            // Get marker position in container coordinates
            const markerPoint = this.map.latLngToContainerPoint(marker.getLatLng());
            const mapContainer = this.map.getContainer();
            const mapRect = mapContainer.getBoundingClientRect();
            
            // Calculate absolute position on page
            const absoluteX = mapRect.left + markerPoint.x;
            const absoluteY = mapRect.top + markerPoint.y;
            
            // Get tooltip dimensions for boundary checking
            const tooltipRect = tooltipElement.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Position tooltip above marker
            let finalX = absoluteX;
            let finalY = absoluteY - tooltipRect.height - 10;
            
            // Adjust if tooltip goes off screen
            if (finalX + tooltipRect.width > viewportWidth) {
                finalX = viewportWidth - tooltipRect.width - 10;
            }
            if (finalX < 10) {
                finalX = 10;
            }
            if (finalY < 10) {
                finalY = absoluteY + 30; // Show below marker if no space above
            }
            
            // Apply position
            tooltipElement.style.left = finalX + 'px';
            tooltipElement.style.top = finalY + 'px';
        } catch (error) {
            console.error('Error positioning tooltip:', error);
        }
    }
    
    getClickTooltipTrainData(marker) {
        // Get train data based on marker type
        if (marker === this.trainMarker) {
            // Single train mode
            const sourceStation = this.stations && this.stations[0] ? this.stations[0].name : 'Unknown';
            const destinationStation = this.stations && this.stations.length > 0 ? 
                this.stations[this.stations.length - 1].name : 'Unknown';
            
            // Get current and next station information
            const currentStationIndex = this.currentStationIndex || 0;
            const currentStation = this.stations && this.stations[currentStationIndex] ? 
                this.stations[currentStationIndex].name : 'Unknown';
            const nextStation = this.stations && this.stations[currentStationIndex + 1] ? 
                this.stations[currentStationIndex + 1].name : 'Destination';
            
            return {
                trainNumber: this.currentTrainNumber || 'Unknown',
                trainName: this.currentTrainName || 'Unknown Train',
                source: sourceStation,
                destination: destinationStation,
                currentStation: currentStation,
                nextStation: nextStation,
                currentStationIndex: currentStationIndex,
                totalStations: this.stations ? this.stations.length : 0
            };
        }
        return null;
    }
    
    getClickTooltipCurrentSpeed(marker) {
        // Get current speed for train marker
        if (marker === this.trainMarker) {
            return this.currentSpeed || 0;
        } else {
            const trainNumber = marker._trainNumber;
            // All train states removed - single train mode only
        }
        return 0;
    }
    
    // Train marker methods moved to multi-train-manager.js
    
    clearTrainInfo() {
        // Clear train information during reset
        document.getElementById('train-number').textContent = '-';
        document.getElementById('train-name').textContent = '-';
        document.getElementById('current-station').textContent = '-';
        document.getElementById('current-platform').textContent = '-';
        document.getElementById('next-station').textContent = '-';
        document.getElementById('train-speed').textContent = '0 km/h';
        document.getElementById('distance').textContent = '0 km';
        document.getElementById('distance-covered').textContent = '0 km';
        document.getElementById('eta').textContent = '--:--';
        document.getElementById('station-progress').textContent = '-';
    }
    
    getStationCoordinatesFromCSV(stationCode, stationName) {
        // Use the global stationCoordinatesFromCSV object
        if (typeof stationCoordinatesFromCSV !== 'undefined' && stationCoordinatesFromCSV) {
            // Try to find by station code first
            if (stationCoordinatesFromCSV[stationCode]) {
                return stationCoordinatesFromCSV[stationCode];
            }
            
            // Try to find by station name
            for (const [code, coords] of Object.entries(stationCoordinatesFromCSV)) {
                if (coords.name && coords.name.toLowerCase().includes(stationName.toLowerCase())) {
                    return coords;
                }
            }
        }
        
        // Return null if not found
        return null;
    }

    /**
     * Show popup when publish events is disabled
     */
    showPublishEventsDisabledPopup() {
        // Create popup element
        const popup = document.createElement('div');
        popup.className = 'publish-events-disabled-popup';
        
        // Create escape key handler
        const handleEscape = (event) => {
            if (event.key === 'Escape' && popup.parentElement) {
                closePopup();
            }
        };
        
        // Create close function that also removes event listener
        const closePopup = () => {
            if (popup.parentElement) {
                popup.remove();
                document.removeEventListener('keydown', handleEscape);
                // Clean up global reference
                delete window.closePopup;
            }
        };
        
        // Make closePopup globally accessible for onclick handlers
        window.closePopup = closePopup;
        
        popup.innerHTML = `
            <div class="popup-content">
                <div class="popup-header">
                    <h3>📤 Publish Events Disabled</h3>
                    <button class="popup-close" onclick="closePopup()">×</button>
                </div>
                <div class="popup-body">
                    <p>Event publishing is currently disabled. To enable event monitoring:</p>
                    <ol>
                        <li>Open the <strong>Simulation Controls</strong> panel</li>
                        <li>Check the <strong>"Publish Events"</strong> checkbox</li>
                        <li>Then click the Events button again</li>
                    </ol>
                    <div class="popup-hint">
                        💡 <strong>Tip:</strong> The "Publish Events" checkbox is located in the Simulation Controls section of the right sidebar.
                    </div>
                </div>
                <div class="popup-footer">
                    <button class="btn btn-primary" onclick="closePopup()">Got it!</button>
                </div>
            </div>
        `;
        
        // Add to page
        document.body.appendChild(popup);
        
        // Add escape key listener
        document.addEventListener('keydown', handleEscape);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            closePopup();
        }, 10000);
    }

    async autoStartFirstLoad() {
        try {
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.status}`);
            }
            const csvText = await response.text();
            const trains = this.parseAvailableTrains(csvText);
            if (!trains || trains.length === 0) {
                return;
            }

            const chosenTrain = trains[Math.floor(Math.random() * trains.length)];
            const optionText = `${chosenTrain.number} - ${chosenTrain.name} (${chosenTrain.source} -> ${chosenTrain.destination})`;
            if (this.uiControls && this.uiControls.selectOption) {
                await this.uiControls.selectOption({
                    value: chosenTrain.number,
                    text: optionText
                });
            } else {
                this.selectedTrainValue = chosenTrain.number;
            }

            await this.trainDataManager.searchTrain(chosenTrain.number);
            this.showAutoStartPopup(chosenTrain);
        } catch (error) {
            console.error('❌ Auto-start failed:', error);
        }
    }

    showAutoStartPopup(trainInfo) {
        const popup = document.createElement('div');
        popup.className = 'auto-sim-popup';

        const brokerMode = window.brokerMode || (window.solaceTrainMonitor && window.solaceTrainMonitor.brokerType) || 'unknown';
        const brokerConnected = typeof window.brokerConnected === 'boolean' ? window.brokerConnected :
            (window.solaceTrainMonitor && !!window.solaceTrainMonitor.isConnected);
        let brokerStatusText = `${brokerMode} (Connecting...)`;
        if (brokerMode === 'inmemory') {
            brokerStatusText = 'No broker available, using local in-memory broker';
        } else if (brokerConnected) {
            brokerStatusText = `${brokerMode} broker connected`;
        }

        let countdownTimer = null;
        const closePopup = () => {
            if (popup.parentElement) {
                popup.remove();
            }
            if (countdownTimer) {
                clearInterval(countdownTimer);
                countdownTimer = null;
            }
        };

        popup.innerHTML = `
            <div class="popup-content">
                <div class="popup-header">
                    <h3>Auto-Starting Simulation</h3>
                    <button class="popup-close" aria-label="Close" type="button">×</button>
                </div>
                <div class="popup-body">
                    <p>Selected train for this session:</p>
                    <div class="popup-hint">
                        <strong>${trainInfo.number} - ${trainInfo.name}</strong><br/>
                        Route: ${trainInfo.source} -> ${trainInfo.destination}
                    </div>
                    <p style="margin-top: 16px;">Broker status: <strong>${brokerStatusText}</strong></p>
                    <p>Starting simulation with default settings in <strong><span id="autoStartCountdown">5</span></strong> seconds.</p>
                </div>
                <div class="popup-footer">
                    <button class="btn btn-primary" type="button">Start Now</button>
                </div>
            </div>
        `;

        const closeBtn = popup.querySelector('.popup-close');
        const startBtn = popup.querySelector('.btn-primary');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => closePopup());
        }
        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                closePopup();
                await this.play();
            });
        }

        document.body.appendChild(popup);

        const countdownEl = popup.querySelector('#autoStartCountdown');
        let remainingSeconds = 5;
        countdownTimer = setInterval(() => {
            remainingSeconds -= 1;
            if (countdownEl) {
                countdownEl.textContent = String(Math.max(remainingSeconds, 0));
            }
            if (remainingSeconds <= 0) {
                clearInterval(countdownTimer);
                countdownTimer = null;
            }
        }, 1000);

        setTimeout(async () => {
            closePopup();
            await this.play();
        }, 5000);
    }
    
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Prevent multiple instances
    if (window.trainMonitorInstance) {
        return;
    }
    
    window.trainMonitorInstance = new TrainMonitor();
    window.trainMonitorInstance.init();
    
    
    // Add global debugging functions for visible bounds
    // Keep only the essential auto-pan function for debugging
    window.autoPanTrain = (trainLatLng, marginPercent = 15) => {
        if (window.trainMonitorInstance) {
            return window.trainMonitorInstance.autoPanToKeepTrainVisible(trainLatLng, marginPercent);
        } else {
        }
    };
    
    // Manual centering function
    window.centerMapOnTrain = () => {
        if (window.trainMonitorInstance && window.trainMonitorInstance.currentPosition) {
            window.trainMonitorInstance.map.panTo(window.trainMonitorInstance.currentPosition, { 
                animate: true, 
                duration: 1.0 
            });
        } else {
        }
    };
    
    // Global function for raising alerts from tooltip
    window.raiseTrainAlert = (trainNumber, alertType, coachNumber) => {
        if (window.trainMonitorInstance && window.trainMonitorInstance.alertSystem) {
            window.trainMonitorInstance.alertSystem.raiseAlert(trainNumber, alertType, coachNumber);
        } else {
            // console.warn('Train monitor or alert system not available');
        }
    };
    
});

// Station coordinates are now loaded from CSV file only

// Load station coordinates from CSV file
async function loadStationCoordinates() {
    try {
        console.log(`🔧 DEBUG: Loading station coordinates from vandebharath-coordinates.csv`);
        // const response = await fetch('assets/data/station-coordinates.csv');
        const response = await fetch('assets/data/vandebharath-coordinates.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const csvText = await response.text();
        const lines = csvText.split('\n').filter(line => line.trim().length > 0);
        console.log(`🔧 DEBUG: Loaded ${lines.length} lines from coordinates CSV`);
        
        // Skip header row
        const dataLines = lines.slice(1);
        console.log(`🔧 DEBUG: Processing ${dataLines.length} data lines`);
        
        const coordinates = {};
        let validCoordinates = 0;
        let invalidCoordinates = 0;
        
        for (const line of dataLines) {
            const parts = parseCSVLine(line);
            if (parts.length >= 4) {
                const code = parts[0].trim();
                const name = parts[1].trim();
                const lat = parseFloat(parts[2].trim());
                const lng = parseFloat(parts[3].trim());
                
                if (code && name && !isNaN(lat) && !isNaN(lng)) {
                    coordinates[code] = { lat, lng, name };
                    validCoordinates++;
                    
                    // Log specific stations we're interested in
                    if (code === 'JU' || code === 'SBIB') {
                        console.log(`🔧 DEBUG: Found coordinates for ${code} (${name}): lat=${lat}, lng=${lng}`);
                    }
                } else {
                    invalidCoordinates++;
                    console.warn(`⚠️ DEBUG: Invalid coordinates for line: ${line}`);
                }
            } else {
                invalidCoordinates++;
                console.warn(`⚠️ DEBUG: Insufficient parts in line: ${line}`);
            }
        }
        
        console.log(`🔧 DEBUG: Coordinate loading complete - Valid: ${validCoordinates}, Invalid: ${invalidCoordinates}`);
        console.log(`🔧 DEBUG: Total coordinates loaded: ${Object.keys(coordinates).length}`);
        
        // Add detailed logging for specific stations used by trains 12461 and 12462
        const debugStations = ['JU', 'SBIB', 'PMY', 'FA', 'ABR', 'PNU', 'MSH'];
        console.log(`🔍 COORDINATE DEBUG: Checking coordinates for trains 12461 & 12462 stations:`);
        debugStations.forEach(stationCode => {
            if (coordinates[stationCode]) {
                console.log(`🔍 COORDINATE DEBUG: ${stationCode} (${coordinates[stationCode].name}): lat=${coordinates[stationCode].lat}, lng=${coordinates[stationCode].lng}`);
            } else {
                console.log(`🔍 COORDINATE DEBUG: ${stationCode}: NOT FOUND`);
            }
        });
        
        return coordinates;
    } catch (error) {
        console.error('❌ Error loading station coordinates:', error);
        // Return empty object if CSV loading fails
        return {};
    }
}

/**
  * Parse a CSV line handling quoted values
  * @param {string} line - CSV line to parse
  * @returns {string[]} - Array of parsed values
  */
// parseCSVLine function moved to train-monitoring-utils.js

// Initialize station coordinates from CSV
let stationCoordinatesFromCSV = {};
loadStationCoordinates().then(coordinates => {
    stationCoordinatesFromCSV = coordinates;
}).catch(error => {
    console.error('❌ Failed to load station coordinates from CSV:', error);
    stationCoordinatesFromCSV = {}; // Use empty object if CSV loading fails
});



// Initialize the TrainMonitor when the page loads
document.addEventListener('DOMContentLoaded', function() {
    window.trainMonitorInstance = new TrainMonitor();
});
