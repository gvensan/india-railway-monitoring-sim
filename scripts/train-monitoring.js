// Train Monitoring POC - Updated to fix updateDisplay method calls
class TrainMonitor {
    constructor() {
        // Prevent multiple instances
        if (window.trainMonitorInstance) {
            console.log('TrainMonitor instance already exists');
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
        
        // Multi-train support
        this.allTrains = new Map(); // Map<trainNumber, trainData>
        this.allTrainMarkers = new Map(); // Map<trainNumber, marker>
        this.allTrainStates = new Map(); // Map<trainNumber, {currentStationIndex, currentPosition, currentSpeed, isAtStation, stationStopStartTime}>
        this.isAllTrainsMode = false;
        
        // Solace integration
        this.solaceEnabled = false;
        this.solaceConnected = false;
        this.solaceIntegration = new SolaceIntegration(this);
        
        // Tooltip system
        this.tooltipSystem = new TooltipSystem(this);
        
        // Multi-train manager
        this.multiTrainManager = new MultiTrainManager(this);
        
        // Real-time monitor
        this.realtimeMonitor = new RealtimeMonitor(this);
        
        // Alert system
        this.alertSystem = new AlertSystem(this);
        
        // Train simulation engine
        this.trainSimulation = new TrainSimulation(this);
        
        // UI controls
        this.uiControls = new UIControls(this);
        
        // Train data manager
        this.trainDataManager = new TrainDataManager(this);
        
        this.init();
    }
    
    init() {
        // Prevent multiple initializations
        if (this.initialized) {
            console.log('TrainMonitor already initialized');
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
        
        this.initialized = true;
    }
    
    initializeMap() {
        // Check if map is already initialized
        if (this.map) {
            console.log('Map already initialized, skipping...');
            return;
        }
        
        // Initialize map centered on India
        this.map = L.map('map', {
            center: [20.5937, 78.9629], // Center of India
            zoom: 6,
            zoomControl: true
        });
        
        // Create base layer (OpenStreetMap)
        this.baseLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18
        });
        
        // Create transport layer (shows railways prominently)
        this.transportLayer = L.tileLayer('https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=6170aad10dfd42a38d4d8c709a536f38', {
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
        
        // Add event listeners for map movement to update alert flag positions and tooltips
        this.map.on('move', () => {
            this.updateAlertFlagPositions();
            this.updateTooltipPositions();
        });
        
        this.map.on('zoom', () => {
            this.updateAlertFlagPositions();
            this.updateTooltipPositions();
        });
        
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
        
        console.log('✅ Default Mumbai-Pune route initialized with', this.stations.length, 'stations');
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
    
    createTrainIcon() {
        // Create train icon using the images/train.png image (no rotation)
        return `
            <img src="assets/images/train.png" 
                  style="width: 24px; height: 24px;" 
                  alt="Train" />
        `;
    }
    
    
    
    initializeTrain() {
        // Create train marker at starting position with proper train icon
        const startStation = this.stations[0];
        
        this.trainMarker = L.marker([startStation.lat, startStation.lng], {
            icon: L.divIcon({
                className: 'train-marker',
                html: this.createTrainIcon(),
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            })
        }).addTo(this.map);
        
        
        // Store marker type
        this.trainMarker._markerType = 'train';
        this.trainMarker._trainNumber = this.currentTrainNumber;
        
        // Add train number hint
        this.tooltipSystem.addTrainNumberHint(this.trainMarker, this.currentTrainNumber);
        
        
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
        
        // Real-time toggle
        const realtimeCheckbox = document.getElementById('realtimeCheckbox');
        if (realtimeCheckbox) {
            realtimeCheckbox.addEventListener('change', async (e) => {
                await this.realtimeMonitor.toggleRealtime(e.target.checked);
            });
        }
        
        // Time controls
        const timeChooserBtn = document.getElementById('timeChooserBtn');
        if (timeChooserBtn) {
            timeChooserBtn.addEventListener('click', async () => {
                await this.realtimeMonitor.showTimeChooser();
            });
        }
        
        const timeIncrementInput = document.getElementById('timeIncrement');
        if (timeIncrementInput) {
            timeIncrementInput.addEventListener('change', (e) => {
                this.timeIncrementMinutes = parseInt(e.target.value) || 0;
                this.realtimeMonitor.updateTimeIncrement();
            });
        }
        
        // Right sidebar toggle
        const toggleRightSidebarBtn = document.getElementById('toggleRightSidebarBtn');
        const floatingRightToggleBtn = document.getElementById('floatingRightToggleBtn');
        
        console.log('🚂 Setting up right sidebar event listeners');
        console.log('🚂 toggleRightSidebarBtn element:', toggleRightSidebarBtn);
        console.log('🚂 floatingRightToggleBtn element:', floatingRightToggleBtn);
        
        if (toggleRightSidebarBtn) {
            toggleRightSidebarBtn.addEventListener('click', () => {
                console.log('🚂 Toggle right sidebar button clicked!');
                this.uiControls.toggleRightSidebar();
            });
            console.log('🚂 Toggle right sidebar button event listener added');
        } else {
            console.error('❌ toggleRightSidebarBtn not found');
        }
        
        if (floatingRightToggleBtn) {
            floatingRightToggleBtn.addEventListener('click', () => {
                console.log('🚂 Floating right toggle button clicked!');
                this.uiControls.toggleRightSidebar();
            });
            console.log('🚂 Floating right toggle button event listener added');
        } else {
            console.error('❌ floatingRightToggleBtn not found');
        }
        
        // Events sidebar toggle
        const eventsFloatingBtn = document.getElementById('eventsFloatingBtn');
        const closeLeftSidebarBtn = document.getElementById('closeLeftSidebarBtn');
        
        console.log('📋 Setting up left sidebar event listeners');
        console.log('📋 eventsFloatingBtn element:', eventsFloatingBtn);
        console.log('📋 closeLeftSidebarBtn element:', closeLeftSidebarBtn);
        
        if (eventsFloatingBtn) {
            eventsFloatingBtn.addEventListener('click', () => {
                console.log('📋 Events floating button clicked!');
                this.uiControls.toggleLeftSidebar();
            });
            console.log('📋 Events floating button event listener added');
        } else {
            console.error('❌ eventsFloatingBtn not found');
        }
        
        if (closeLeftSidebarBtn) {
            closeLeftSidebarBtn.addEventListener('click', () => {
                console.log('📋 Close left sidebar button clicked!');
                this.uiControls.closeLeftSidebar();
            });
            console.log('📋 Close left sidebar button event listener added');
        } else {
            console.error('❌ closeLeftSidebarBtn not found');
        }
        
        // Alert panel toggle
        const alertFloatingBtn = document.getElementById('alertFloatingBtn');
        const closeAlertPanelBtn = document.getElementById('closeAlertPanelBtn');
        if (alertFloatingBtn) alertFloatingBtn.addEventListener('click', () => this.alertSystem.toggleAlertPanel());
        if (closeAlertPanelBtn) closeAlertPanelBtn.addEventListener('click', () => this.closeAlertPanel());
        
        // Train selection with searchable select
        const selectTrainBtn = document.getElementById('selectTrainBtn');
        const trainSearchSelect = document.getElementById('trainSearchSelect');
        const trainDropdown = document.getElementById('trainDropdown');
        
        if (selectTrainBtn) selectTrainBtn.addEventListener('click', async () => {
            await this.uiControls.selectTrainFromSearchableSelect();
            // Only call showTrain for single train mode (not for "All Trains")
            if (!this.isAllTrainsMode && this.currentTrainNumber) {
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
        console.log('🚂 Play button clicked');
        // Prevent multiple calls if already running
        if (this.isRunning) {
            console.log('🚂 Simulation is already running');
            return;
        }
        
        if (this.isAllTrainsMode) {
            // Start simulation for all trains
            this.isRunning = true;
            this.isPaused = false;
            this.uiControls.updateStatus('All Trains Running');
            
            // Publish departed origin events for all trains
            await this.publishAllTrainDepartedOriginEvents();
            
            this.trainSimulation.simulationLoop();
        } else {
            // Ensure we have stations and train marker before starting simulation
            if (this.stations.length === 0) {
                console.log('No train selected. Please select a train first.');
                return; // Don't start simulation without a selected train
            }
            
            // Publish train departed origin event
            await this.publishTrainDepartedOriginEvent();
            
        console.log('🚂 Starting single train simulation');
        this.isRunning = true;
        this.isPaused = false;
        this.uiControls.updateStatus('Running');
        console.log('🚂 Calling trainSimulation.simulationLoop()');
        this.trainSimulation.simulationLoop();
            }
        } catch (error) {
            console.error('❌ Error starting simulation:', error);
            this.isRunning = false;
            this.uiControls.updateStatus('Error');
        }
    }
    
    pause() {
        this.isPaused = true;
        this.isRunning = false;
        if (this.isAllTrainsMode) {
            this.uiControls.updateStatus('All Trains Paused');
        } else {
        this.uiControls.updateStatus('Paused');
        }
    }
    
    stop() {
        this.isRunning = false;
        this.isPaused = false;
        this.trainSpeed = 0;
        this.currentSpeed = 0;
        
        // Reset station stop state
        this.isAtStation = false;
        this.stationStopStartTime = null;
        
        if (this.isAllTrainsMode) {
            // Stop all trains
            this.allTrainStates.forEach((trainState, trainNumber) => {
                trainState.currentSpeed = 0;
                trainState.isAtStation = false;
                trainState.stationStopStartTime = null;
            });
            this.uiControls.updateStatus('All Trains Stopped');
        } else {
        this.uiControls.updateStatus('Stopped');
        }
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
            console.log('ℹ️ Switched to standard map view');
        } else {
            this.map.addLayer(this.transportLayer);
            this.currentLayer = 'transport';
            if (toggleBtn) toggleBtn.textContent = '🚂 Hide Railway Map';
            console.log('ℹ️ Switched to transport map view (better railway visibility)');
        }
    }
    
    centerMap() {
        // Center map on India with appropriate zoom level
        this.map.setView([20.5937, 78.9629], 6); // Center of India with zoom level 6
    }
    
    showTrain() {
        // Only work if a single train is selected
        if (!this.currentTrainNumber) {
            console.warn('🚂 Show Train: No train selected');
            return;
        }
        
        // Get the actual train marker position from the map
        if (!this.trainMarker) {
            console.warn('🚂 Show Train: No train marker found on map');
            return;
        }
        
        // Get the current lat/lng of the train marker
        const trainPosition = this.trainMarker.getLatLng();
        if (!trainPosition) {
            console.warn('🚂 Show Train: No valid train marker position available');
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
            console.log(`🚂 Train point: x=${trainPoint.x}, y=${trainPoint.y}`);
            
            // Apply the offset to center in the visible area
            const offsetPoint = [trainPoint.x + offsetX, trainPoint.y];
            console.log(`🚂 Offset point: x=${offsetPoint[0]}, y=${offsetPoint[1]}`);
            
            // Convert back to lat/lng
            const finalCenter = this.map.containerPointToLatLng(offsetPoint);
            console.log(`🚂 Final center: lat=${finalCenter.lat}, lng=${finalCenter.lng}`);
            
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
        
        console.log(`🚂 Panned to train ${this.currentTrainNumber} marker position`);
        console.log(`🚂 Train marker coordinates: lat=${trainPosition.lat}, lon=${trainPosition.lng}`);
        
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
            console.log(`🧹 Auto-clean ${enabled ? 'enabled' : 'disabled'}`);
        }
    }
    
    // Real-time monitoring methods moved to realtime-monitor.js
    
    clearAllTrains() {
        // Clear train markers
        if (this.allTrainMarkers) {
            this.allTrainMarkers.forEach(marker => {
                if (marker && this.map.hasLayer(marker)) {
                    this.tooltipSystem.removeTrainNumberHint(marker);
                    this.map.removeLayer(marker);
                }
            });
            this.allTrainMarkers.clear();
        }
        
        // Clear station markers
        if (this.allStationMarkers) {
            this.allStationMarkers.forEach(marker => {
                if (marker && this.map.hasLayer(marker)) {
                    this.map.removeLayer(marker);
                }
            });
            this.allStationMarkers = [];
        }
        
        // Clear route lines
        if (this.allRouteLines) {
            this.allRouteLines.forEach(line => {
                if (line && this.map.hasLayer(line)) {
                    this.map.removeLayer(line);
                }
            });
            this.allRouteLines = [];
        }
        
        // Clear train states
        if (this.allTrainStates) {
            this.allTrainStates.clear();
        }
        
        console.log('🧹 Cleared all trains data');
    }
    
    updateTrainsToCurrentTime() {
        if (!this.allTrains || !this.allTrainStates) return;
        
        // Use display time if in real-time mode, otherwise use actual current time
        const currentTime = this.isRealtimeMode && this.currentDisplayTime ? this.currentDisplayTime : new Date();
        const currentTimeMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
        
        this.allTrains.forEach((train, trainNumber) => {
            const trainState = this.allTrainStates.get(trainNumber);
            if (trainState && train.route) {
                // Calculate current position based on time
                const currentPosition = this.calculateTrainPositionAtTime(train, currentTimeMinutes);
                
                if (currentPosition) {
                    // Update train state
                    trainState.currentPosition = currentPosition;
                    trainState.currentStationIndex = currentPosition.stationIndex;
                    
                    // Update marker position
                    const marker = this.allTrainMarkers.get(trainNumber);
                    if (marker) {
                        marker.setLatLng([currentPosition.lat, currentPosition.lng]);
                    }
                }
            }
        });
        
        console.log('📍 Updated all train positions to current time');
    }
    
    calculateTrainPositionAtTime(train, currentTimeMinutes) {
        if (!train.route || train.route.length < 2) return null;
        
        // Find the current station based on time
        for (let i = 0; i < train.route.length - 1; i++) {
            const currentStation = train.route[i];
            const nextStation = train.route[i + 1];
            
            const departureTime = this.parseTimeToMinutes(currentStation.departure);
            const nextArrivalTime = this.parseTimeToMinutes(nextStation.arrival);
            
            if (departureTime === null || nextArrivalTime === null) continue;
            
            // Check if train is currently between these stations
            if (currentTimeMinutes >= departureTime && currentTimeMinutes <= nextArrivalTime) {
                // Calculate position between stations
                const totalTime = nextArrivalTime - departureTime;
                const elapsedTime = currentTimeMinutes - departureTime;
                const progress = Math.min(elapsedTime / totalTime, 1);
                
                // Interpolate position
                const lat = currentStation.lat + (nextStation.lat - currentStation.lat) * progress;
                const lng = currentStation.lng + (nextStation.lng - currentStation.lng) * progress;
                
                return {
                    lat: lat,
                    lng: lng,
                    stationIndex: i,
                    progress: progress
                };
            }
        }
        
        // If not between stations, return the closest station
        const firstStation = train.route[0];
        return {
            lat: firstStation.lat,
            lng: firstStation.lng,
            stationIndex: 0,
            progress: 0
        };
    }
    
    restoreFullTrainList() {
        // Restore the full train list
        this.filteredTrainOptions = this.allTrainOptions;
        
        // Clear the search input
        const input = document.getElementById('trainSearchSelect');
        if (input) {
            input.value = '';
        }
        this.selectedTrainValue = '';
        
        console.log('📋 Restored full train list');
    }
    
    clearRealtimeTrains() {
        // Clear any real-time specific data
        if (this.isAllTrainsMode) {
            // If currently in all trains mode, clear the map instead of showing all trains
            // since we're no longer in real-time mode
            this.multiTrainManager.clearAllTrains();
        }
        
        console.log('🧹 Cleared real-time train data');
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
            
            console.log(`🕐 Time manually set to ${newTime}`);
        }
    }
    
    updateTimeIncrement() {
        console.log(`⏰ Time increment set to ${this.timeIncrementMinutes} minutes`);
        // The actual increment logic is handled in updateTime()
    }
    
    async filterAndShowTrainsForTime() {
        if (!this.isRealtimeMode || !this.currentDisplayTime) return;
        
        const currentTimeMinutes = this.currentDisplayTime.getHours() * 60 + this.currentDisplayTime.getMinutes();
        
        // Clear existing trains
        this.multiTrainManager.clearAllTrains();
        
        // Load all trains data first (if not already loaded)
        if (!this.allTrains || this.allTrains.size === 0) {
            await this.loadAllTrainsData();
        }
        
        // Filter to only trains running at the current display time
        const runningTrains = new Map();
        const allTrainsBackup = new Map(this.allTrains); // Keep backup of all trains
        
        allTrainsBackup.forEach((train, trainNumber) => {
            if (this.isTrainCurrentlyRunning(train, currentTimeMinutes)) {
                runningTrains.set(trainNumber, train);
            }
        });
        
        // Set only running trains
        this.allTrains = runningTrains;
        this.isAllTrainsMode = true;
        
        // Create markers only for running trains
        this.multiTrainManager.createAllTrainMarkers();
        
        // Update positions to current display time
        this.updateTrainsToCurrentTime();
        
        // Update train hints visibility
        this.tooltipSystem.updateAllTrainHints();
        
        console.log(`🕐 Filtered to ${runningTrains.size} trains running at ${this.currentDisplayTime.toTimeString()}`);
        
        // Show user-friendly message when no trains are running
        if (runningTrains.size === 0) {
            console.log(`ℹ️ No trains are currently running at ${this.currentDisplayTime.toTimeString()}. Try setting a different time using the clock icon (🕐) to see trains in operation.`);
            
            // Show a temporary message on the map
            this.showNoTrainsMessage();
        } else {
            this.hideNoTrainsMessage();
        }
    }
    
    showNoTrainsMessage() {
        // Remove any existing message
        this.hideNoTrainsMessage();
        
        // Create a message overlay
        const messageDiv = document.createElement('div');
        messageDiv.id = 'noTrainsMessage';
        messageDiv.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            text-align: center;
            z-index: 1000;
            font-family: 'Segoe UI', sans-serif;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            max-width: 400px;
        `;
        
        messageDiv.innerHTML = `
            <div style="font-size: 18px; margin-bottom: 10px;">🚂</div>
            <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px;">No Trains Running</div>
            <div style="font-size: 14px; margin-bottom: 12px;">No trains are currently operating at ${this.currentDisplayTime.toTimeString()}</div>
            <div style="font-size: 12px; color: #ccc;">Click the clock icon (🕐) to set a different time and see trains in operation</div>
        `;
        
        // Add to map container
        const mapContainer = document.querySelector('.map-container');
        if (mapContainer) {
            mapContainer.appendChild(messageDiv);
        }
    }
    
    hideNoTrainsMessage() {
        const messageDiv = document.getElementById('noTrainsMessage');
        if (messageDiv) {
            messageDiv.remove();
        }
    }
    
    async loadAllTrainsData() {
        // This method loads all train data without creating markers
        // It's used to get the full dataset for filtering
        if (this.allTrains && this.allTrains.size > 0) {
            return; // Already loaded
        }
        
        // Load train data without creating markers
        try {
            console.log('Loading all trains data for filtering...');
            
            // Wait for station coordinates to be loaded
            if (typeof stationCoordinatesFromCSV === 'undefined' || Object.keys(stationCoordinatesFromCSV).length === 0) {
                console.log('Waiting for station coordinates to load...');
                await new Promise(resolve => {
                    const checkCoordinates = () => {
                        if (typeof stationCoordinatesFromCSV !== 'undefined' && Object.keys(stationCoordinatesFromCSV).length > 0) {
                            resolve();
                        } else {
                            setTimeout(checkCoordinates, 100);
                        }
                    };
                    checkCoordinates();
                });
            }
            
            // Load all train data
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.status}`);
            }
            
            const csvText = await response.text();
            const allTrainData = this.trainDataManager.parseAllTrainData(csvText);
            
            // Store all train data without creating markers
            this.allTrains.clear();
            allTrainData.forEach(trainData => {
                this.allTrains.set(trainData.trainNumber, trainData);
            });
            
            console.log('📊 Loaded all trains data for filtering...');
        } catch (error) {
            console.error('Error loading all trains data:', error);
        }
    }
    
    updateTrainsForCurrentTime() {
        if (!this.isRealtimeMode || !this.currentDisplayTime) return;
        
        const currentTimeMinutes = this.currentDisplayTime.getHours() * 60 + this.currentDisplayTime.getMinutes();
        
        // Filter trains based on the current display time
        const runningTrains = new Map();
        
        // We need to get the original train data to filter from
        // For now, we'll work with the current allTrains data
        if (this.allTrains) {
            // This is a simplified approach - in a real implementation,
            // we'd need to maintain the original full dataset
            console.log(`🕐 Updating trains for time: ${this.currentDisplayTime.toTimeString()}`);
            
            // Update train positions based on current display time
            this.updateTrainsToCurrentTime();
        }
    }
    
    // Tooltip methods moved to tooltip-system.js
    
    // Solace Integration Methods
    async connectToSolace() {
        try {
            if (!window.solaceTrainMonitor) {
                console.warn('⚠️ Solace integration not available');
                return false;
            }
            
            // Check broker type before attempting connection
            const brokerType = window.solaceTrainMonitor.brokerType || 'solace';
            console.log(`🔄 Connecting to ${brokerType} broker...`);
            
            await window.solaceTrainMonitor.connect();
            this.solaceConnected = true;
            this.solaceEnabled = true;
            
            // Subscribe to train events for real-time updates
            await this.setupSolaceSubscriptions();
            
            console.log(`✅ Connected to ${brokerType} broker successfully`);
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
            console.log('⚠️ Solace integration not ready, skipping subscriptions');
            return;
        }
        
        try {
            // Note: Legacy train/status/* and train/position/* subscriptions removed
            // All train events are now handled through TMS topics (tms/train/*, tms/station/*, tms/alert/*)
            console.log('✅ Solace subscriptions set up successfully (using TMS topics only)');
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
                console.log('✅ Disconnected from Solace broker');
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
                console.log(`🔄 Attempting to connect to ${brokerType} broker...`);
                
            const connected = await this.solaceIntegration.connectToSolace();
            if (connected) {
                    console.log(`✅ ${brokerType} broker integration enabled - train events will be published to broker`);
            } else {
                    console.log(`⚠️ ${brokerType} broker not available - continuing without real-time messaging`);
                }
            } else {
                console.log('⚠️ Solace integration not available - continuing without real-time messaging');
            }
        } catch (error) {
            console.log('⚠️ Broker connection failed - continuing without real-time messaging');
        }
    }
    
    initializeRightSidebar() {
        // Set right sidebar to collapsed state by default
        const rightSidebar = document.getElementById('rightSidebar');
        const container = document.querySelector('.container');
        
        console.log('🚂 initializeRightSidebar called');
        console.log('🚂 rightSidebar element:', rightSidebar);
        console.log('🚂 container element:', container);
        
        if (rightSidebar && container) {
            // Force initial collapsed state (panel starts off-screen)
            rightSidebar.classList.remove('open');
            container.classList.remove('right-sidebar-open');
            
            // Ensure the sidebar is positioned off-screen
            rightSidebar.style.right = '-400px';
            
            console.log('🚂 Right sidebar initialized - classes:', rightSidebar.className);
            console.log('🚂 Container initialized - classes:', container.className);
            console.log('🚂 Right sidebar style.right:', rightSidebar.style.right);
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
                        console.log('🗺️ Adjusted map bounds for sidebar visibility');
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
        
        console.log('🚂 toggleRightSidebar called');
        console.log('🚂 rightSidebar element:', rightSidebar);
        console.log('🚂 container element:', container);
        console.log('🚂 mapContainer element:', mapContainer);
        
        // Check if elements exist
        if (!rightSidebar) {
            console.error('❌ rightSidebar element not found!');
            return;
        }
        if (!container) {
            console.error('❌ container element not found!');
            return;
        }
        if (!mapContainer) {
            console.error('❌ mapContainer element not found!');
            return;
        }
        
        if (rightSidebar && container && mapContainer) {
            const isOpen = rightSidebar.classList.contains('open');
            console.log('🚂 Current state - isOpen:', isOpen);
            
            // Log current map container state
            const mapRect = mapContainer.getBoundingClientRect();
            const mapStyles = window.getComputedStyle(mapContainer);
            console.log('🚂 BEFORE - Map container position:', {
                left: mapRect.left,
                width: mapRect.width,
                marginLeft: mapStyles.marginLeft,
                marginRight: mapStyles.marginRight,
                containerClasses: container.className
            });
            
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
                console.log('🚂 Opening right sidebar - both sidebars open, centering map');
                // Adjust map bounds for both sidebars
                this.adjustMapBoundsForSidebars();
            } else {
                // Only right sidebar open - move map left
                mapContainer.style.setProperty('transform', 'translateX(-400px)', 'important');
                console.log('🚂 Opening right sidebar - setting transform translateX(-400px)');
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
                console.log('🚂 Closing right sidebar - left sidebar still open, moving map right');
            } else {
                // No sidebars open - reset to center
                mapContainer.style.setProperty('transform', 'translateX(0px)', 'important');
                console.log('🚂 Closing right sidebar - no sidebars open, centering map');
            }
        }
            
            // Log after state
            setTimeout(() => {
                const newMapRect = mapContainer.getBoundingClientRect();
                const newMapStyles = window.getComputedStyle(mapContainer);
                console.log('🚂 AFTER - Map container position:', {
                    left: newMapRect.left,
                    width: newMapRect.width,
                    marginLeft: newMapStyles.marginLeft,
                    marginRight: newMapStyles.marginRight,
                    containerClasses: container.className
                });
                console.log('🚂 MAP MOVEMENT:', {
                    leftChange: newMapRect.left - mapRect.left,
                    widthChange: newMapRect.width - mapRect.width
                });
            }, 100);
            
            console.log('🚂 After toggle - rightSidebar classes:', rightSidebar.className);
            console.log('🚂 After toggle - container classes:', container.className);
            console.log('🚂 After toggle - rightSidebar style.right:', rightSidebar.style.right);
            console.log(`🚂 Right sidebar ${isOpen ? 'closed' : 'opened'}`);
        } else {
            console.error('❌ Right sidebar, container, or mapContainer element not found');
        }
    }
    
    toggleLeftSidebar() {
        const leftSidebar = document.getElementById('leftSidebar');
        const container = document.querySelector('.container');
        const mapContainer = document.querySelector('.map-container');
        
        if (leftSidebar && container && mapContainer) {
            const isOpen = leftSidebar.classList.contains('open');
            console.log('📋 Current state - isOpen:', isOpen);
            
            // Log current map container state
            const mapRect = mapContainer.getBoundingClientRect();
            const mapStyles = window.getComputedStyle(mapContainer);
            console.log('📋 BEFORE - Map container position:', {
                left: mapRect.left,
                width: mapRect.width,
                marginLeft: mapStyles.marginLeft,
                marginRight: mapStyles.marginRight,
                containerClasses: container.className
            });
            
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
                console.log('📋 Opening left sidebar - both sidebars open, centering map');
                // Adjust map bounds for both sidebars
                this.adjustMapBoundsForSidebars();
        } else {
                // Only left sidebar open - move map right
                mapContainer.style.setProperty('transform', 'translateX(400px)', 'important');
                console.log('📋 Opening left sidebar - setting transform translateX(400px)');
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
                console.log('📋 Closing left sidebar - right sidebar still open, moving map left');
            } else {
                // No sidebars open - reset to center
                mapContainer.style.setProperty('transform', 'translateX(0px)', 'important');
                console.log('📋 Closing left sidebar - no sidebars open, centering map');
            }
        }
            
            // Log after state
            setTimeout(() => {
                const newMapRect = mapContainer.getBoundingClientRect();
                const newMapStyles = window.getComputedStyle(mapContainer);
                console.log('📋 AFTER - Map container position:', {
                    left: newMapRect.left,
                    width: newMapRect.width,
                    marginLeft: newMapStyles.marginLeft,
                    marginRight: newMapStyles.marginRight,
                    containerClasses: container.className
                });
                console.log('📋 MAP MOVEMENT:', {
                    leftChange: newMapRect.left - mapRect.left,
                    widthChange: newMapRect.width - mapRect.width
                });
            }, 100);
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
            const mapRect = mapContainer.getBoundingClientRect();
            const mapStyles = window.getComputedStyle(mapContainer);
            console.log('📋 BEFORE CLOSE - Map container position:', {
                left: mapRect.left,
                width: mapRect.width,
                marginLeft: mapStyles.marginLeft,
                marginRight: mapStyles.marginRight,
                containerClasses: container.className
            });
            
            leftSidebar.classList.remove('open');
            container.classList.remove('left-sidebar-open');
            leftSidebar.style.left = '-400px';
            
            // Reset map container transform
            mapContainer.style.setProperty('transform', 'translateX(0px)', 'important');
            
            // Log after state
            setTimeout(() => {
                const newMapRect = mapContainer.getBoundingClientRect();
                const newMapStyles = window.getComputedStyle(mapContainer);
                console.log('📋 AFTER CLOSE - Map container position:', {
                    left: newMapRect.left,
                    width: newMapRect.width,
                    marginLeft: newMapStyles.marginLeft,
                    marginRight: newMapStyles.marginRight,
                    containerClasses: container.className
                });
                console.log('📋 MAP RESET MOVEMENT:', {
                    leftChange: newMapRect.left - mapRect.left,
                    widthChange: newMapRect.width - mapRect.width
                });
            }, 100);            
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
            console.log('🚨 Alert panel closed');
            
            // Map size will be automatically adjusted by CSS
        } else {
            console.error('❌ Alert panel or container element not found');
        }
    }
    
    // Train icons management
    async generateTrainIcons() {
        const trainIconsGrid = document.getElementById('trainIconsGrid');
        if (!trainIconsGrid) {
            console.error('❌ Train icons grid not found');
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
        
        console.log(`🚂 Generated ${availableTrains.length} train icons`);
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
            // Fallback to demo train numbers
            return ['1011', '11301', '12009', '12010', '12011', '12012', '12013', '12014', '12015', '12016'];
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
        console.log(`🚩 addAlertFlag called for ${stationCode} with ${alertCount} alerts`);
        // console.log(`🚩 Current alert flags:`, Array.from(this.alertFlags.keys()));
        
        if (!this.map) {
            console.warn('🚩 Map not available for flag creation');
            return;
        }
        
        // Check if station coordinates are loaded
        if (typeof stationCoordinatesFromCSV === 'undefined' || Object.keys(stationCoordinatesFromCSV).length === 0) {
            console.warn(`🚩 Station coordinates not loaded yet, deferring flag creation for ${stationCode}`);
            // Retry after a short delay
            setTimeout(() => this.addAlertFlag(stationCode, alertCount), 500);
            return;
        }

        // Remove existing flag if any
        this.alertSystem.removeAlertFlag(stationCode);

        // Don't create flag if alert count is 0
        if (alertCount === 0) {
            console.log(`🚩 No flag created for ${stationCode} - alert count is 0`);
            return;
        }

        // Find station coordinates from global CSV data
        let station = null;
        if (typeof stationCoordinatesFromCSV !== 'undefined' && stationCoordinatesFromCSV[stationCode]) {
            station = stationCoordinatesFromCSV[stationCode];
        }
        
        if (!station || !station.lat || !station.lng) {
            console.warn(`🚩 Station ${stationCode} not found or missing coordinates`, {
                station: station,
                stationsCount: this.stations?.length || 0,
                csvStationsCount: typeof stationCoordinatesFromCSV !== 'undefined' ? Object.keys(stationCoordinatesFromCSV).length : 0
            });
            return;
        }

        console.log(`🚩 Found station:`, station);

        // Convert lat/lng to pixel coordinates on the map
        const point = this.map.latLngToContainerPoint([station.lat, station.lng]);
        console.log(`🚩 Map point coordinates:`, point);
        
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
        
        // Get alert details from event manager
        const alertDetails = this.getAlertDetailsForStation(stationCode);
        
        // Use actual alert count from details instead of parameter
        const actualAlertCount = alertDetails ? alertDetails.length : 0;
        // console.log(`🚩 Alert count mismatch - parameter: ${alertCount}, actual: ${actualAlertCount}`);
        
        // Create tooltip content matching station tooltip format
        const tooltipContent = document.createElement('div');
        tooltipContent.className = 'alert-tooltip-content';
        
        // Header with train icon - use actual count
        const header = document.createElement('div');
        header.className = 'alert-tooltip-header';
        header.innerHTML = `🚨 ${actualAlertCount} Alert${actualAlertCount > 1 ? 's' : ''} at ${station.name}`;
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
            
            // Display each alert type
            Object.entries(alertsByType).forEach(([alertType, alerts]) => {
                const alertTypeRow = document.createElement('div');
                alertTypeRow.className = 'alert-tooltip-detail';
                
                const label = document.createElement('span');
                label.className = 'alert-tooltip-detail-label';
                label.textContent = `${alertType.replace(/_/g, ' ')}:`;
                
                const value = document.createElement('span');
                value.className = 'alert-tooltip-detail-value';
                
                if (alerts.length === 1) {
                    value.textContent = `${alerts[0].trainNumber} - ${alerts[0].trainName}`;
                } else {
                    // Show count for multiple alerts of same type
                    const uniqueTrains = [...new Set(alerts.map(a => `${a.trainNumber} - ${a.trainName}`))];
                    if (uniqueTrains.length === 1) {
                        value.textContent = `${uniqueTrains[0]} (${alerts.length}x)`;
                    } else {
                        value.textContent = `${alerts.length} alerts`;
                    }
                }
                
                alertTypeRow.appendChild(label);
                alertTypeRow.appendChild(value);
                detailsContainer.appendChild(alertTypeRow);
            });
            
            tooltipContent.appendChild(detailsContainer);
        }
        
        // Mark as Served button
        const serveButton = document.createElement('button');
        serveButton.className = 'alert-serve-button';
        serveButton.textContent = 'Mark as Served';
        serveButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.markAlertsAsServed(stationCode);
        });
        tooltipContent.appendChild(serveButton);
        
        tooltip.appendChild(tooltipContent);
        flag.appendChild(tooltip);

        // Add to map container
        const mapContainer = this.map.getContainer();
        console.log(`🚩 Adding flag to map container:`, mapContainer);
        mapContainer.appendChild(flag);
        
        // Store reference
        this.alertFlags.set(stationCode, flag);
        
        console.log(`🚩 Added alert flag for station ${stationCode} (${station.name}) with ${alertCount} alerts`);
    }

    // Test methods removed - no longer needed

    updateAlertFlag(stationCode, alertCount) {
        if (this.alertFlags.has(stationCode)) {
            const existingFlag = this.alertFlags.get(stationCode);
            const isServed = existingFlag.classList.contains('served');
            
            // If alert count is 0, just remove the flag
            if (alertCount === 0) {
                this.alertSystem.removeAlertFlag(stationCode);
                console.log(`🚩 Removed alert flag for station ${stationCode} - no alerts remaining`);
                return;
            }
            
            // Remove existing flag and recreate with updated content
            this.alertSystem.removeAlertFlag(stationCode);
            this.addAlertFlag(stationCode, alertCount);
            
            // Restore served state if it was served
            if (isServed) {
                this.makeFlagBlink(stationCode);
            }
            
            console.log(`🚩 Updated alert flag for station ${stationCode} to ${alertCount} alerts${isServed ? ' (restored served state)' : ''}`);
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
            console.log(`🚩 Removed alert flag for station ${stationCode}`);
        }
    }

    clearAllAlertFlags() {
        for (const [stationCode, flag] of this.alertFlags.entries()) {
            if (flag && flag.parentNode) {
                flag.parentNode.removeChild(flag);
            }
        }
        this.alertFlags.clear();
        console.log('🚩 Cleared all alert flags');
    }

    // Reset all train monitoring data
    resetAll() {
        console.log('🔄 Resetting all train monitoring data...');
        
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
        this.allTrainStates.clear();
        this.isAllTrainsMode = false;
        
        // Clear all alert flags
        this.clearAllAlertFlags();
        
        // Clear train markers and trails
        this.multiTrainManager.clearAllTrainMarkers();
        if (this.clearTrainTrail) {
            this.clearTrainTrail();
        }
        
        // Remove train marker from map
        if (this.trainMarker) {
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
        
        console.log('✅ Complete reset completed');
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
            
            // Update all train markers tooltips
            if (this.allTrainMarkers) {
                this.allTrainMarkers.forEach(marker => {
                    if (marker._tooltipElement && marker._tooltipElement.style.opacity === '1') {
                        this.tooltipSystem.positionClickTooltip(marker, marker._tooltipElement);
                    }
                });
            }
        } catch (error) {
            console.error('❌ Error updating tooltip positions:', error);
        }
    }

    // Get alert details for a specific station
    getAlertDetailsForStation(stationCode) {
        if (!window.eventManager || !window.eventManager.alertTracker) {
            console.log(`🚩 getAlertDetailsForStation: No event manager or alert tracker for ${stationCode}`);
            return [];
        }
        
        // console.log(`🚩 getAlertDetailsForStation: Looking for station ${stationCode}`);
        // console.log(`🚩 Available alert tracker keys:`, Array.from(window.eventManager.alertTracker.keys()));
        
        // Find the station key that matches the station code
        for (const [key, data] of window.eventManager.alertTracker.entries()) {
            if (key.startsWith(`${stationCode}_`)) {
                // console.log(`🚩 Found station data for ${stationCode}:`, {
                //     key: key,
                //     received: data.alerts.received?.length || 0,
                //     served: data.alerts.served?.length || 0,
                //     missed: data.alerts.missed?.length || 0
                // });
                return data.alerts.received || [];
            }
        }
        
        console.log(`🚩 No station data found for ${stationCode}`);
        return [];
    }

    // Mark alerts as served for a specific station
    markAlertsAsServed(stationCode) {
        if (!window.eventManager) {
            console.warn('🚩 Event manager not available for marking alerts as served');
            return;
        }
        
        console.log(`🚩 Marking alerts as served for station ${stationCode}`);
        
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
        
        console.log(`✅ Marked ${alertDetails.length} alerts as served for station ${stationCode} - flag will be removed when train departs`);
    }

    // Make alert flag blink to indicate it's been marked as served
    makeFlagBlink(stationCode) {
        const flag = this.alertFlags.get(stationCode);
        if (flag) {
            flag.classList.add('served');
            // Hide the tooltip when flag starts blinking
            this.hideAlertTooltip(stationCode);
            console.log(`🚩 Flag at station ${stationCode} is now blinking (marked as served) and tooltip is hidden`);
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
                console.log(`🚩 Tooltip hidden for station ${stationCode} (opacity: 0, pointer-events: none, display: none)`);
            } else {
                console.log(`🚩 No tooltip found to hide for station ${stationCode}`);
            }
        } else {
            console.log(`🚩 No flag found for station ${stationCode} to hide tooltip`);
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
            console.log(`🚂 Train ${trainNumber} is not loaded yet`);
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
                console.warn(`⚠️ Train simulation is not running. Alert data may show static position.`);
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
            const topic = `tms/alert/raised/${alertType}/${trainNumber}/${trainData.nextStation}`;
            await this.solaceIntegration.publishAlertEvent(topic, alertPayload);
            
            console.log(`⚠️ Alert raised: ${alertType} for train ${trainNumber}`);
            console.log(`📊 Alert payload:`, alertPayload);
            
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
        
        // Check if this train is in the allTrains Map (All Trains mode)
        if (this.isAllTrainsMode && this.allTrains.has(trainNumber)) {
            const trainData = this.allTrains.get(trainNumber);
            const trainState = this.allTrainStates.get(trainNumber);
            
            
            if (trainState && trainData.route) {
                // Use the actual train state for accurate position data
                const route = trainData.route;
                const currentStationIndex = trainState.currentStationIndex || 0;
                const previousStationIndex = Math.max(0, currentStationIndex);
                const nextStationIndex = Math.min(route.length - 1, currentStationIndex + 1);
                
                return {
                    trainName: trainData.trainName || `Train ${trainNumber}`,
                    previousStation: route[previousStationIndex]?.code || '',
                    previousStationName: route[previousStationIndex]?.name || 'UNKNOWN',
                    nextStation: route[nextStationIndex]?.code || '',
                    nextStationName: route[nextStationIndex]?.name || 'UNKNOWN',
                    distanceTraveled: trainState.distanceTraveled || 0,
                    lat: trainState.currentPosition?.lat || 0,
                    lon: trainState.currentPosition?.lng || 0
                };
            } else if (trainData.route && trainData.route.length > 0) {
                // Fallback to route data if no state available
                const currentStation = trainData.route[0];
                const nextStation = trainData.route.length > 1 ? trainData.route[1] : trainData.route[0];
                
                return {
                    trainName: trainData.trainName || `Train ${trainNumber}`,
                    previousStation: currentStation?.code || '',
                    previousStationName: currentStation?.name || 'UNKNOWN',
                    nextStation: nextStation?.code || '',
                    nextStationName: nextStation?.name || 'UNKNOWN',
                    distanceTraveled: 0,
                    lat: currentStation?.lat || 0,
                    lon: currentStation?.lng || 0
                };
            }
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
            console.log('⚠️ Solace not connected, alert event not published');
            return;
        }
        
        try {
            await window.solaceTrainMonitor.publish(topic, payload);
            console.log(`📤 Published alert event to topic: ${topic}`);
        } catch (error) {
            console.error('❌ Failed to publish alert event:', error);
            throw error;
        }
    }

        // Solace Event Publishing Methods
        async publishTrainDepartedOriginEvent() {
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                console.log('Solace not connected, skipping event publishing');
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
            } catch (error) {
                console.error('Error publishing train departed station event:', error);
            }
        }

        async publishTrainArrivedDestinationEvent() {
            console.log(`🏁 SINGLE TRAIN DESTINATION ARRIVAL EVENT TRIGGERED for train ${this.currentTrainNumber}`);
            
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                console.log(`❌ Solace not connected, skipping destination arrival event`);
                return;
            }

            try {
                const previousStation = this.stations[this.stations.length - 2]; // Second to last station
                const destinationStation = this.stations[this.stations.length - 1];
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
                
                // Clear any unserved alerts at the destination station
                console.log(`🏁 Train ${this.currentTrainNumber} reached destination ${destinationStation.name}`);
                
                if (window.eventManager && destinationStation) {
                    window.eventManager.clearUnservedAlertsAtDestination(
                        this.currentTrainNumber, 
                        destinationStation.code, 
                        destinationStation.name
                    );
                } else {
                    console.log(`❌ Cannot clear unserved alerts - EventManager: ${!!window.eventManager}, DestinationStation: ${!!destinationStation}`);
                }
            } catch (error) {
                console.error('Error publishing train arrived destination event:', error);
            }
        }

        // Multi-train event publishing methods
        async publishAllTrainArrivedStationEvent(trainNumber, trainData, trainState) {
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                return;
            }

            try {
                const currentStation = trainData.route[trainState.currentStationIndex];
                const previousStation = trainData.route[trainState.currentStationIndex - 1];
                const nextStation = trainData.route[trainState.currentStationIndex + 1];
                
                // Check if this is the destination station
                const isDestination = trainState.currentStationIndex >= trainData.route.length - 1;

                const eventData = {
                    trainNumber: trainNumber,
                    trainName: trainData.trainName,
                    previousStation: previousStation?.code || '',
                    previousStationName: previousStation?.name || '',
                    currentStation: currentStation?.code || '',
                    currentStationName: currentStation?.name || '',
                    nextStation: isDestination ? null : (nextStation?.code || ''),
                    nextStationName: isDestination ? null : (nextStation?.name || ''),
                    distanceTraveled: this.calculateAllTrainDistanceTraveled(trainData, trainState)
                };

                await window.solaceTrainMonitor.publishTrainArrivedStation(eventData);
            } catch (error) {
                console.error('Error publishing all train arrived station event:', error);
            }
        }

        async publishAllTrainStoppedStationEvent(trainNumber, trainData, trainState) {
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                return;
            }

            try {
                const currentStation = trainData.route[trainState.currentStationIndex];
                const previousStation = trainData.route[trainState.currentStationIndex - 1];
                const nextStation = trainData.route[trainState.currentStationIndex + 1];
                
                // Check if this is the destination station
                const isDestination = trainState.currentStationIndex >= trainData.route.length - 1;

                const eventData = {
                    trainNumber: trainNumber,
                    trainName: trainData.trainName,
                    previousStation: previousStation?.code || '',
                    previousStationName: previousStation?.name || '',
                    currentStation: currentStation?.code || '',
                    currentStationName: currentStation?.name || '',
                    nextStation: isDestination ? null : (nextStation?.code || ''),
                    nextStationName: isDestination ? null : (nextStation?.name || ''),
                    distanceTraveled: this.calculateAllTrainDistanceTraveled(trainData, trainState)
                };

                await window.solaceTrainMonitor.publishTrainStoppedStation(eventData);
            } catch (error) {
                console.error('Error publishing all train stopped station event:', error);
            }
        }

        async publishAllTrainDepartedStationEvent(trainNumber, trainData, trainState) {
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                return;
            }

            try {
                const currentStation = trainData.route[trainState.currentStationIndex];
                const previousStation = trainData.route[trainState.currentStationIndex - 1];
                const nextStation = trainData.route[trainState.currentStationIndex + 1];
                
                // Check if this is the destination station
                const isDestination = trainState.currentStationIndex >= trainData.route.length - 1;

                const eventData = {
                    trainNumber: trainNumber,
                    trainName: trainData.trainName,
                    previousStation: previousStation?.code || '',
                    previousStationName: previousStation?.name || '',
                    currentStation: currentStation?.code || '',
                    currentStationName: currentStation?.name || '',
                    nextStation: isDestination ? null : (nextStation?.code || ''),
                    nextStationName: isDestination ? null : (nextStation?.name || ''),
                    distanceTraveled: this.calculateAllTrainDistanceTraveled(trainData, trainState)
                };

                await window.solaceTrainMonitor.publishTrainDepartedStation(eventData);
            } catch (error) {
                console.error('Error publishing all train departed station event:', error);
            }
        }

        async publishAllTrainArrivedDestinationEvent(trainNumber, trainData, trainState) {
            console.log(`🏁 DESTINATION ARRIVAL EVENT TRIGGERED for train ${trainNumber}`);
            
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                console.log(`❌ Solace not connected, skipping destination arrival event`);
                return;
            }

            try {
                const previousStation = trainData.route[trainData.route.length - 2]; // Second to last station
                const destinationStation = trainData.route[trainData.route.length - 1];
                const eventData = {
                    trainNumber: trainNumber,
                    trainName: trainData.trainName,
                    origin: trainData.route[0]?.code || '',
                    originName: trainData.route[0]?.name || '',
                    destination: destinationStation?.code || '',
                    destinationName: destinationStation?.name || '',
                    previousStation: previousStation?.code || '',
                    distanceTraveled: this.calculateAllTrainDistanceTraveled(trainData, trainState)
                };

                await window.solaceTrainMonitor.publishTrainArrivedDestination(eventData);
                
                // Clear any unserved alerts at the destination station
                console.log(`🏁 Train ${trainNumber} reached destination ${destinationStation.name}`);
                
                if (window.eventManager && destinationStation) {
                    window.eventManager.clearUnservedAlertsAtDestination(
                        trainNumber, 
                        destinationStation.code, 
                        destinationStation.name
                    );
                } else {
                    console.log(`❌ Cannot clear unserved alerts - EventManager: ${!!window.eventManager}, DestinationStation: ${!!destinationStation}`);
                }
            } catch (error) {
                console.error('Error publishing all train arrived destination event:', error);
            }
        }

        async publishAllTrainDepartedOriginEvents() {
            if (!window.solaceTrainMonitor || !window.solaceTrainMonitor.isConnected) {
                return;
            }

            try {
                // Publish departed origin event for each train
                for (const [trainNumber, trainData] of this.allTrains) {
                    const trainState = this.allTrainStates.get(trainNumber);
                    if (trainState) {
                        const eventData = {
                            trainNumber: trainNumber,
                            trainName: trainData.trainName,
                            origin: trainData.route[0]?.code || '',
                            originName: trainData.route[0]?.name || '',
                            destination: trainData.route[trainData.route.length - 1]?.code || '',
                            destinationName: trainData.route[trainData.route.length - 1]?.name || '',
                            nextStation: trainData.route[1]?.code || '',
                            distanceTraveled: 0 // At origin, distance traveled is 0
                        };

                        await window.solaceTrainMonitor.publishTrainDepartedOrigin(eventData);
                    }
                }
            } catch (error) {
                console.error('Error publishing all train departed origin events:', error);
            }
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

        calculateAllTrainDistanceTraveled(trainData, trainState) {
            let totalDistance = 0;
            for (let i = 0; i < trainState.currentStationIndex; i++) {
                if (trainData.route[i] && trainData.route[i + 1]) {
                    totalDistance += this.calculateDistance(
                        trainData.route[i].lat, trainData.route[i].lng,
                        trainData.route[i + 1].lat, trainData.route[i + 1].lng
                    );
                }
            }
            return Math.round(totalDistance * 100) / 100; // Round to 2 decimal places
        }
    
    async searchTrain(trainNumber = null) {
        // If no train number provided, this is legacy call - skip
        if (!trainNumber) {
            console.log('No train number provided');
            return;
        }
        
        try {
            // Try to get train data from CSV
            const trainData = await this.getTrainData(trainNumber);
            
            if (trainData) {
                this.displayTrainData(trainData);
                this.updateMapWithTrainRoute(trainData);
                console.log(`Found: ${trainData.trainName || trainNumber} (${trainData.source || 'CSV'})`);
            } else {
                console.log(`Train ${trainNumber} not found in CSV data.`);
            }
        } catch (error) {
            console.error('Error searching for train:', error);
        }
    }
    
    async getTrainData(trainNumber) {
        // Load and search train data from CSV file
        try {
            const trainData = await this.getTrainDataFromCSV(trainNumber);
            if (trainData && trainData.route && trainData.route.length > 0) {
                return trainData;
            }
        } catch (error) {
            console.log('CSV data lookup failed:', error);
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
        console.log(`Looking for train ${trainNumber} in CSV data`);
        
        // Find all rows for the specified train number
        const trainRows = lines.slice(1).filter(line => {
            const columns = parseCSVLine(line);
            return columns[0] === trainNumber || columns[0] === trainNumber.toString();
        });
        
        console.log(`Found ${trainRows.length} rows for train ${trainNumber}`);
        
        
        if (trainRows.length === 0) {
            console.log('No train data found');
            return null;
        }
        
        // Extract train information from first row
        const firstRow = parseCSVLine(trainRows[0]);
        const trainName = firstRow[1];
        const sourceStation = firstRow[13]; // Updated index for Source Station
        const sourceStationName = firstRow[14]; // Updated index for Source Station Name
        const destinationStation = firstRow[15]; // Updated index for Destination Station
        const destinationStationName = firstRow[16]; // Updated index for Destination Station Name
        
        console.log(`Train: ${trainName}, Route: ${sourceStationName} to ${destinationStationName}`);
        
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
        
        console.log(`Parsed route with ${route.length} stations`);
        console.log('Route details:', route);
        
        // Get station coordinates for plotting
        await this.addStationCoordinates(route);
        
        console.log('Route after adding coordinates:', route);
        
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
        
        console.log('Final train data result:', result);
        console.log('Route summary:');
        route.forEach((station, index) => {
            console.log(`${index + 1}. ${station.name} (${station.code}) - ${station.lat}, ${station.lng} - ${station.distance}km`);
        });
        
        return result;
    }
    
    async getStationCoordinatesFromOSM(stationName, stationCode) {
        // Check cache first
        const cacheKey = `${stationCode}_${stationName}`;
        if (this.coordinateCache.has(cacheKey)) {
            console.log(`📋 Using cached coordinates for ${stationName}`);
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
                console.log(`⚠️ OSM returned non-JSON response for ${stationName}, using fallback`);
                return null;
            }
            
            const data = await response.json();
            
            if (data.elements && data.elements.length > 0) {
                const station = data.elements[0];
                const coords = {
                    lat: station.lat || station.center.lat,
                    lng: station.lon || station.center.lon
                };
                console.log(`✅ Found OSM coordinates for ${stationName}: ${coords.lat}, ${coords.lng}`);
                // Cache the coordinates for future use
                this.coordinateCache.set(cacheKey, coords);
                return coords;
            } else {
                console.log(`❌ No OSM data found for ${stationName}`);
                return null;
            }
        } catch (error) {
            console.log(`⚠️ OSM query failed for ${stationName}:`, error.message);
            return null;
        }
    }
    
    async addStationCoordinates(route) {
        console.log('🗺️ Adding coordinates to route stations...');
        
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
                console.log(`📍 Using coordinates from CSV for ${station.name}: ${coords.lat}, ${coords.lng}`);
            } else {
                console.log(`⚠️ No CSV coordinates found for ${station.name} (${station.code})`);
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
                        console.log(`✅ Updated ${station.name} with OSM coordinates: ${coords.lat}, ${coords.lng}`);
                    } else {
                        // Use default coordinates if OSM fails
                        station.lat = 20.0000;
                        station.lng = 77.0000;
                        console.log(`⚠️ Using default coordinates for ${station.name}`);
                    }
                } catch (error) {
                    console.log(`⚠️ OSM lookup failed for ${station.name}, using default`);
                    station.lat = 20.0000;
                    station.lng = 77.0000;
                }
            }
        }
    }
    
    displayTrainData(trainData) {
        // Reset all trains mode when individual train is selected
        this.isAllTrainsMode = false;
        this.multiTrainManager.clearAllTrainMarkers();
        
        // Clear all train states
        this.allTrainStates.clear();
        
        // Clear all existing alert flags when loading a new train
        this.clearAllAlertFlags();
        
        // Disable all train icons first
        this.disableAllTrainIcons();
        
        // Update current train information
        if (trainData) {
            this.currentTrainNumber = trainData.trainNumber;
            this.currentTrainName = trainData.trainName;
            this.currentTrainData = trainData; // Store complete train data for coach information
            console.log('🔧 displayTrainData - stored trainData:', trainData);
            console.log('🔧 displayTrainData - coachCount:', trainData.coachCount, 'coaches:', trainData.coaches);
            
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
        // Clear existing station markers
        this.stationMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.stationMarkers = [];
        
        // Add new station markers for the train route
        trainData.route.forEach((station, index) => {
            // Make first and last stations same size as regular but blue, intermediate stations smaller and green
            const isFirstOrLast = index === 0 || index === trainData.route.length - 1;
            const iconSize = isFirstOrLast ? [20, 20] : [12, 12];
            const iconAnchor = isFirstOrLast ? [10, 10] : [6, 6];
            const className = isFirstOrLast ? 'station-marker origin-destination' : 'station-marker';
            
            // Log first/last station
            if (isFirstOrLast) {
                console.log(`🔵 Origin/Destination marker: ${station.name} (${station.code}) - Class: ${className}, Size: ${iconSize[0]}x${iconSize[1]}`);
            }

            const marker = L.marker([station.lat, station.lng], {
                icon: L.divIcon({
                    className: className,
                    // html: isFirstOrLast ? '🚉' : '●',
                    iconSize: iconSize,
                    iconAnchor: iconAnchor
                })
            }).addTo(this.map);
            
            // Store station data on marker for tooltip access
            marker._stationData = station;
            marker._markerType = 'station';
            
            
            // Add unified tooltip system (click to show, like train markers)
            this.tooltipSystem.setupClickTooltip(marker);
            
            this.stationMarkers.push(marker);
        });
        
        // Create route line connecting all stations (similar to All Trains mode)
        const routeCoordinates = trainData.route.map(station => [station.lat, station.lng]);
        const routeLine = L.polyline(routeCoordinates, {
            color: '#dc3545', // Red color for single train route
            weight: 3,
            opacity: 0.7
        }).addTo(this.map);
        
        // Store route line for cleanup
        if (!this.routeLine) {
            this.routeLine = null;
        }
        // Remove existing route line if any
        if (this.routeLine) {
            this.map.removeLayer(this.routeLine);
        }
        this.routeLine = routeLine;
        
        console.log(`🛤️ Created route line connecting ${trainData.route.length} stations`);
        
        // Update the stations data for train movement
        this.stations = trainData.route.map(station => ({
            name: station.name,
            lat: station.lat,
            lng: station.lng,
            code: station.code,
            distance: station.distance, // Use actual distance from CSV
            platformNumber: station.platformNumber // Include platform number
        }));
        
        // Reset simulation state for new train
        this.currentStationIndex = 0;
        this.currentPosition = { lat: this.stations[0].lat, lng: this.stations[0].lng };
        this.currentSpeed = 0;
        this.trainSpeed = 0;
        this.isRunning = false;
        this.isPaused = false;
        
        // Recreate train marker with proper train icon at starting station
        if (this.trainMarker) {
            this.tooltipSystem.removeTrainNumberHint(this.trainMarker);
            this.map.removeLayer(this.trainMarker);
        }
        this.trainMarker = L.marker([this.stations[0].lat, this.stations[0].lng], {
            icon: L.divIcon({
                className: 'train-marker',
                html: this.createTrainIcon(),
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
        console.log('🔄 Calling updateDisplay from train-simulation module');
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
            console.log('Loading available trains...');
            // const response = await fetch('assets/data/trains.csv');
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.status}`);
            }
            
            const csvText = await response.text();
            const trains = this.parseAvailableTrains(csvText);
            
            // Store train options for searchable select
            this.allTrainOptions = [];
                
                // Add "All Trains" option
            this.allTrainOptions.push({
                value: 'all',
                label: '🚂 All Trains',
                text: '🚂 All Trains'
            });
                
                // Add individual train options
                trains.forEach(train => {
                this.allTrainOptions.push({
                    value: train.number,
                    label: `${train.number} - ${train.name} (${train.source} → ${train.destination})`,
                    text: `${train.number} - ${train.name} (${train.source} → ${train.destination})`
                });
            });
            
            console.log(`Loaded ${trains.length} trains + All Trains option into searchable select`);
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
                this.uiControls.selectOption(option);
            });
            
            optionsContainer.appendChild(optionElement);
        });
        
        this.highlightedIndex = -1;
        this.uiControls.showDropdown();
        
        console.log(`🔍 Filtered trains: ${filteredOptions.length} matches for "${searchTerm}"`);
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
                this.uiControls.selectOption(option);
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
            console.log('No train selected');
            return;
        }
        
        const selectedValue = this.selectedTrainValue;
        
        // Prevent duplicate processing if the same train is already selected
        if (this.isProcessingTrain && this.currentProcessingTrain === selectedValue) {
            console.log(`Already processing train ${selectedValue}, skipping duplicate request`);
            return;
        }
        
        this.isProcessingTrain = true;
        this.currentProcessingTrain = selectedValue;
        
        try {
            console.log(`Selected: ${selectedValue}`);
            
            if (selectedValue === 'all') {
                await this.trainDataManager.loadAllTrains();
            } else {
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
            console.log('No train selected');
            return;
        }
        
        const selectedValue = dropdown.value;
        
        // Prevent duplicate processing if the same train is already selected
        if (this.isProcessingTrain && this.currentProcessingTrain === selectedValue) {
            console.log(`Already processing train ${selectedValue}, skipping duplicate request`);
            return;
        }
        
        this.isProcessingTrain = true;
        this.currentProcessingTrain = selectedValue;
        
        try {
            console.log(`Selected: ${selectedValue}`);
            
            if (selectedValue === 'all') {
                // Handle "All Trains" selection
                await this.trainDataManager.loadAllTrains();
            } else {
                // Handle individual train selection
                await this.trainDataManager.searchTrain(selectedValue);
            }
        } finally {
            this.isProcessingTrain = false;
            this.currentProcessingTrain = null;
        }
    }
    
    async loadAllTrains() {
        try {
            console.log('Loading all trains...');
            
            // Wait for station coordinates to be loaded
            if (typeof stationCoordinatesFromCSV === 'undefined' || Object.keys(stationCoordinatesFromCSV).length === 0) {
                console.log('Waiting for station coordinates to load...');
                await new Promise(resolve => {
                    const checkCoordinates = () => {
                        if (typeof stationCoordinatesFromCSV !== 'undefined' && Object.keys(stationCoordinatesFromCSV).length > 0) {
                            resolve();
                        } else {
                            setTimeout(checkCoordinates, 100);
                        }
                    };
                    checkCoordinates();
                });
            }
            
            // Clear existing train markers
            this.multiTrainManager.clearAllTrainMarkers();
            
            // Load all train data
            // const response = await fetch('assets/data/trains.csv');
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.status}`);
            }
            
            const csvText = await response.text();
            const allTrainData = this.trainDataManager.parseAllTrainData(csvText);
            
            // Store all train data
            this.allTrains.clear();
            allTrainData.forEach(trainData => {
                this.allTrains.set(trainData.trainNumber, trainData);
            });
            
            // Set mode
            this.isAllTrainsMode = true;
            
            // Only create markers if in real-time mode
            if (this.isRealtimeMode) {
                // Create markers for all trains (will be filtered by time)
                this.multiTrainManager.createAllTrainMarkers();
            } else {
                // In non-real-time mode, don't create all markers
                // Just clear the map and show no trains unless one is specifically selected
                this.multiTrainManager.clearAllTrains();
            }
            
            // Clear train info since we're showing all trains (no need to refresh)
            this.uiControls.clearTrainInfo();
            
            // Enable all train icons in bottom panel
            this.allTrains.forEach((trainData, trainNumber) => {
                this.updateTrainIconState(trainNumber, true);
            });
            
            console.log(`Loaded ${this.allTrains.size} trains for multi-train mode`);
            
        } catch (error) {
            console.error('Error loading all trains:', error);
        }
    }
    
    parseAllTrainData(csvText) {
        const lines = csvText.split('\n');
        const trainMap = new Map();
        
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = parseCSVLine(line);
            if (parts.length < 17) continue;
            
            const trainNumber = parts[0];
            const trainName = parts[1];
            const stationCode = parts[3];
            const stationName = parts[4];
            const arrival = parts[5];
            const haltTime = parts[6];
            const departure = parts[7];
            const distance = parseFloat(parts[8]) || 0;
            const source = parts[13];
            const destination = parts[15];
            
            if (!trainMap.has(trainNumber)) {
                trainMap.set(trainNumber, {
                    trainNumber: trainNumber,
                    trainName: trainName,
                    source: source,
                    destination: destination,
                    route: []
                });
            }
            
            // Get coordinates for this station from CSV data
            const coordinates = this.getStationCoordinatesFromCSV(stationCode, stationName);
            if (coordinates) {
                trainMap.get(trainNumber).route.push({
                    code: stationCode,
                    name: stationName,
                    lat: coordinates.lat,
                    lng: coordinates.lng,
                    distance: distance,
                    arrival: arrival,
                    departure: departure,
                    haltTime: haltTime
                });
            }
        }
        
        return Array.from(trainMap.values());
    }
    
    createAllTrainMarkers() {
        this.allTrains.forEach((trainData, trainNumber) => {
            if (trainData.route.length > 0) {
                // Create train marker at starting position with proper train icon
                const startStation = trainData.route[0];
                const marker = L.marker([startStation.lat, startStation.lng], {
                    icon: L.divIcon({
                        className: 'train-marker',
                        html: this.createTrainIcon(), // Use the same train icon as single train mode
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                }).addTo(this.map);
                
                // Add detailed click tooltip
                    marker._trainNumber = trainNumber; // Store train number for tooltip
                this.tooltipSystem.setupClickTooltip(marker);
                
                // Add train number hint
                this.tooltipSystem.addTrainNumberHint(marker, trainNumber);
                
                this.allTrainMarkers.set(trainNumber, marker);
                
                // Initialize train state
                this.allTrainStates.set(trainNumber, {
                    currentStationIndex: 0,
                    currentPosition: { lat: startStation.lat, lng: startStation.lng },
                    currentSpeed: 0,
                    isAtStation: false,
                    stationStopStartTime: null
                });
                
                // Plot route stations for this train
                this.plotTrainRoute(trainData, trainNumber);
            }
        });
    }
    
    plotTrainRoute(trainData, trainNumber) {
        // Create station markers for this train's route
        trainData.route.forEach((station, index) => {
            const isFirstOrLast = index === 0 || index === trainData.route.length - 1;
            const iconSize = isFirstOrLast ? [20, 20] : [8, 8];
            const iconAnchor = isFirstOrLast ? [10, 10] : [4, 4];
            const className = isFirstOrLast ? 'station-marker origin-destination' : 'station-marker';
            
            // Log first/last station for All Trains mode
            if (isFirstOrLast) {
                console.log(`🔵 All Trains - Origin/Destination marker: ${station.name} (${station.code}) - Class: ${className}, Size: ${iconSize[0]}x${iconSize[1]}`);
            }
            
            // Create station marker
            const stationMarker = L.marker([station.lat, station.lng], {
                icon: L.divIcon({
                    className: className,
                    html: '',
                    iconSize: iconSize,
                    iconAnchor: iconAnchor
                })
            }).addTo(this.map);
            
            // Store station data on marker for tooltip access
            stationMarker._stationData = station;
            stationMarker._markerType = 'station';
            stationMarker._trainNumber = trainNumber; // Store train number for context
            
            
            // Add unified tooltip system (click to show, like train markers)
            this.tooltipSystem.setupClickTooltip(stationMarker);
            
            // Station popup removed - using click tooltips only
            
            // Store station markers for cleanup
            if (!this.allStationMarkers) {
                this.allStationMarkers = [];
            }
            this.allStationMarkers.push(stationMarker);
        });
        
        // Create route line connecting all stations
        const routeCoordinates = trainData.route.map(station => [station.lat, station.lng]);
        const routeLine = L.polyline(routeCoordinates, {
            color: this.multiTrainManager.getTrainColor(trainNumber),
            weight: 3,
            opacity: 0.7
        }).addTo(this.map);
        
        // Store route line for cleanup
        if (!this.allRouteLines) {
            this.allRouteLines = [];
        }
        this.allRouteLines.push(routeLine);
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
            z-index: 100000;
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
            // Station marker
            const stationData = marker._stationData;
            if (stationData) {
                content = `
                    <div style="position: relative;">
                        <button onclick="this.parentElement.parentElement.style.opacity='0'; setTimeout(() => this.parentElement.parentElement.style.display='none', 200);" 
                                style="position: absolute; top: 4px; right: 8px; background: none; border: none; font-size: 16px; cursor: pointer; color: #666; padding: 0; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">×</button>
                        <h4 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 16px;">🚉 ${stationData.name}</h4>
                        <div style="background: #f8f9fa; border-radius: 6px; padding: 10px; margin: 6px 0;">
                            <div style="margin: 4px 0;"><strong>Station Code:</strong> ${stationData.code}</div>
                            ${marker._trainNumber ? `<div style="margin: 4px 0;"><strong>Train:</strong> ${marker._trainNumber}</div>` : ''}
                            <div style="margin: 4px 0;"><strong>Sequence:</strong> ${stationData.sequence || 'N/A'}</div>
                            <div style="margin: 4px 0;"><strong>Platform:</strong> ${stationData.platformNumber || 'TBD'}</div>
                            <div style="margin: 4px 0;"><strong>Distance:</strong> ${stationData.distance || 0} km</div>
                            <div style="margin: 4px 0;"><strong>Arrival:</strong> ${stationData.arrival || '--:--:--'}</div>
                            <div style="margin: 4px 0;"><strong>Departure:</strong> ${stationData.departure || '--:--:--'}</div>
                            ${stationData.haltTime > 0 ? `<div style="margin: 4px 0;"><strong>Halt Time:</strong> ${stationData.haltTime} min</div>` : ''}
                        </div>
                        <div style="background: #e9ecef; border-radius: 4px; padding: 6px; margin: 6px 0; font-size: 11px;">
                            <div style="display: flex; justify-content: space-between; margin: 2px 0; font-size: 12px;">
                                <span style="color: #6c757d;">Coordinates:</span>
                                <span style="color: #495057; font-weight: 600; font-family: monospace;">${stationData.lat?.toFixed(6) || 'N/A'}°, ${stationData.lng?.toFixed(6) || 'N/A'}°</span>
                            </div>
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
                            <div style="margin: 4px 0;"><strong>Progress:</strong> ${trainData.currentStationIndex + 1}/${trainData.totalStations}</div>
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
        } else {
            // All trains mode
            const trainNumber = marker._trainNumber;
            if (trainNumber && this.allTrains && this.allTrains.has(trainNumber)) {
                const train = this.allTrains.get(trainNumber);
                const trainState = this.allTrainStates ? this.allTrainStates.get(trainNumber) : null;
                
                // Get current and next station information for all trains mode
                let currentStation = 'Unknown';
                let nextStation = 'Destination';
                let currentStationIndex = 0;
                let totalStations = 0;
                
                if (trainState && train.route) {
                    currentStationIndex = trainState.currentStationIndex || 0;
                    totalStations = train.route.length;
                    currentStation = train.route[currentStationIndex] ? 
                        train.route[currentStationIndex].name : 'Unknown';
                    nextStation = train.route[currentStationIndex + 1] ? 
                        train.route[currentStationIndex + 1].name : 'Destination';
                }
                
                return {
                    trainNumber: trainNumber,
                    trainName: train.trainName || 'Unknown Train',
                    source: train.source || 'Unknown',
                    destination: train.destination || 'Unknown',
                    currentStation: currentStation,
                    nextStation: nextStation,
                    currentStationIndex: currentStationIndex,
                    totalStations: totalStations
                };
            }
        }
        return null;
    }
    
    getClickTooltipCurrentSpeed(marker) {
        // Get current speed for train marker
        if (marker === this.trainMarker) {
            return this.currentSpeed || 0;
        } else {
            const trainNumber = marker._trainNumber;
            if (trainNumber && this.allTrainStates && this.allTrainStates.has(trainNumber)) {
                const trainState = this.allTrainStates.get(trainNumber);
                return trainState.currentSpeed ? Math.round(trainState.currentSpeed) : 0;
            }
        }
        return 0;
    }
    
    // Train marker methods moved to multi-train-manager.js
    
    clearTrainInfo() {
        // Clear train information when in "All Trains" mode or during reset
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
    
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Prevent multiple instances
    if (window.trainMonitorInstance) {
        console.log('TrainMonitor already initialized');
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
            console.log('TrainMonitor instance not available');
        }
    };
    
    // Manual centering function
    window.centerMapOnTrain = () => {
        if (window.trainMonitorInstance && window.trainMonitorInstance.currentPosition) {
            window.trainMonitorInstance.map.panTo(window.trainMonitorInstance.currentPosition, { 
                animate: true, 
                duration: 1.0 
            });
            console.log('🗺️ Manually centered map on train');
        } else {
            console.log('TrainMonitor instance or train position not available');
        }
    };
    
    // Global function for raising alerts from tooltip
    window.raiseTrainAlert = (trainNumber, alertType, coachNumber) => {
        if (window.trainMonitorInstance && window.trainMonitorInstance.alertSystem) {
            window.trainMonitorInstance.alertSystem.raiseAlert(trainNumber, alertType, coachNumber);
        } else {
            console.warn('Train monitor or alert system not available');
        }
    };
    
});

// Station coordinates are now loaded from CSV file only

// Load station coordinates from CSV file
async function loadStationCoordinates() {
    try {
        console.log('🔄 Loading station coordinates from CSV...');
        // const response = await fetch('assets/data/station-coordinates.csv');
        const response = await fetch('assets/data/vandebharath-coordinates.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const csvText = await response.text();
        const lines = csvText.split('\n').filter(line => line.trim().length > 0);
        
        // Skip header row
        const dataLines = lines.slice(1);
        
        const coordinates = {};
        for (const line of dataLines) {
            const parts = parseCSVLine(line);
            if (parts.length >= 4) {
                const code = parts[0].trim();
                const name = parts[1].trim();
                const lat = parseFloat(parts[2].trim());
                const lng = parseFloat(parts[3].trim());
                
                if (code && name && !isNaN(lat) && !isNaN(lng)) {
                    coordinates[code] = {
                        code: code,
                        name: name,
                        lat: lat,
                        lng: lng
                    };
                }
            }
        }
        
        console.log(`✅ Loaded ${Object.keys(coordinates).length} station coordinates from CSV`);
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
    console.log('🎉 Station coordinates loaded successfully from CSV');
}).catch(error => {
    console.error('❌ Failed to load station coordinates from CSV:', error);
    stationCoordinatesFromCSV = {}; // Use empty object if CSV loading fails
});



// Initialize the TrainMonitor when the page loads
document.addEventListener('DOMContentLoaded', function() {
    window.trainMonitorInstance = new TrainMonitor();
});
