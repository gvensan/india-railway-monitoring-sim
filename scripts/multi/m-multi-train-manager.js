/**
 * Independent Multi-Train Manager
 * Completely separate from single-train system
 * Handles multiple train simulations with correct positioning
 */
class MultiTrainManager {
    constructor() {
        this.map = null;
        this.dataManager = null;
        this.trains = new Map();
        this.trainMarkers = new Map();
        this.stationMarkers = new Map();
        this.routeLines = new Map();
        this.trainStates = new Map();
        this.isInitialized = false;
        
        // Manual train plotting state
        this.currentTrainIndex = 0;
        this.trainNumbers = [];
        this.isManualMode = false;
        
        // Performance optimization
        this.updateBatchSize = 300; // update enough trains per tick so all move
        this.lastUpdateTime = 0;
        this.updateInterval = 50; // ms - more frequent updates
        
        
        // Canvas renderer for train markers (avoids DOM positioning issues)
        this.canvasRenderer = L.canvas({ padding: 0.5 });

        // Map of stationCode -> Set of trainNumbers that pass through
        this.stationToTrains = new Map();
        // Plotting state guards
        this.isPlotting = false;
        this._plotToken = 0;
    }

    /**
     * Patch the single-train tooltip system to understand multi-train markers
     */
    patchTooltipSystem() {
        const tm = window.trainMonitorInstance;
        if (!tm || !tm.tooltipSystem) return;
        const ts = tm.tooltipSystem;
        // Wrap getClickTooltipTrainData to support multi-train markers
        const originalGetTrainData = ts.getClickTooltipTrainData ? ts.getClickTooltipTrainData.bind(ts) : null;
        ts.getClickTooltipTrainData = (marker) => {
            if (marker && marker._markerType === 'train' && marker._trainData) {
                // Use multi-train metadata shape directly
                return marker._trainData;
            }
            return originalGetTrainData ? originalGetTrainData(marker) : null;
        };
        // Wrap getClickTooltipCurrentSpeed similarly
        const originalGetSpeed = ts.getClickTooltipCurrentSpeed ? ts.getClickTooltipCurrentSpeed.bind(ts) : null;
        ts.getClickTooltipCurrentSpeed = (marker) => {
            if (marker && marker._markerType === 'train') {
                const num = marker._trainNumber;
                const state = this.trainStates ? this.trainStates.get(num) : null;
                return state && state.currentSpeed ? Math.round(state.currentSpeed) : 0;
            }
            return originalGetSpeed ? originalGetSpeed(marker) : 0;
        };

        // Wrap getClickTooltipStatus so it doesn't rely on undefined trainState
        const originalGetStatus = ts.getClickTooltipStatus ? ts.getClickTooltipStatus.bind(ts) : null;
        ts.getClickTooltipStatus = (marker) => {
            if (marker && marker._markerType === 'train') {
                const num = marker._trainNumber;
                const state = this.trainStates ? this.trainStates.get(num) : null;
                const train = this.trains ? this.trains.get(num) : null;
                const totalStations = train && train.route ? train.route.length : 0;
                const engine = window.multiTrainSystem ? window.multiTrainSystem.simulationEngine : null;
                const isPaused = !!(engine && engine.isPaused);
                if (state && totalStations > 0) {
                    const atDestination = state.journeyCompleted || state.currentStationIndex >= (totalStations - 1);
                    const atOrigin = state.currentStationIndex === 0 && (state.isAtStation || (state.currentSpeed || 0) === 0);
                    if (atDestination) return 'At Destination';
                    if (atOrigin) return 'At Origin';
                    if (isPaused) return 'Paused';
                    return state.isAtStation ? 'Stopped' : 'Running';
                }
                return isPaused ? 'Paused' : 'Running';
            }
            return originalGetStatus ? originalGetStatus(marker) : 'Stopped';
        };

        // Multi-aware updateAllTrainHints: position hints for all multi-train markers
        const self = this;
        const originalUpdateAll = ts.updateAllTrainHints ? ts.updateAllTrainHints.bind(ts) : null;
        ts.updateAllTrainHints = () => {
            try {
                const map = self.map || (window.trainMonitorInstance && window.trainMonitorInstance.map);
                if (!map) return originalUpdateAll ? originalUpdateAll() : undefined;
                const mapBounds = map.getBounds();
                const mapRect = map.getContainer().getBoundingClientRect();
                self.trainMarkers.forEach((m) => {
                    const hint = m && m._trainNumberHint;
                    if (!hint || !m.getLatLng) return;
                    const latLng = m.getLatLng();
                    const visible = mapBounds.contains(latLng);
                    if (visible) {
                        const pt = map.latLngToContainerPoint(latLng);
                        hint.style.position = 'absolute';
                        hint.style.left = (mapRect.left + pt.x) + 'px';
                        hint.style.top = (mapRect.top + pt.y - 25) + 'px';
                        hint.style.display = 'block';
                        hint.style.transform = 'translateX(-50%)';
                        if (!hint.parentNode) {
                            document.body.appendChild(hint);
                        }
                    } else {
                        hint.style.display = 'none';
                    }
                });
            } catch (_e) {
                if (originalUpdateAll) return originalUpdateAll();
            }
        };
    }

    /**
     * Initialize the multi-train manager
     */
    async initialize(dataManager) {
        
        try {
        // Get the map from the existing single-train system
        if (window.trainMonitorInstance && window.trainMonitorInstance.map) {
            this.map = window.trainMonitorInstance.map;
            
            // Debug map state
            
            // Ensure a dedicated pane for canvas train markers above default markers
            if (!this.map.getPane('trainCanvasPane')) {
                this.map.createPane('trainCanvasPane');
                const pane = this.map.getPane('trainCanvasPane');
                if (pane) {
                    pane.style.zIndex = 650; // Above markerPane (600) and shadowPane (500)
                }
            }

            // Recreate canvas renderer to target the trainCanvasPane
            this.canvasRenderer = L.canvas({ padding: 0.5, pane: 'trainCanvasPane' });

            // Ensure tooltip system can render multi-train markers like single-train
            this.patchTooltipSystem();

            // Zoom level will be set in setInitialMapBounds() method
        } else {
            throw new Error('Map not available from single-train system');
        }
            
            // Store data manager reference
            this.dataManager = dataManager;
            
            // Use data from the data manager
            await this.loadTrainsFromDataManager(dataManager);
            
            // Set map bounds ONCE at the beginning
            this.setInitialMapBounds();
            
            // Initialize plotting behavior
            if (window.MULTI_ENABLE_MANUAL_PLOTTING === true) {
                // Manual mode with UI controls
                this.initializeManualMode();
            } else {
                // Auto-plot all trains by default (no dialog shown)
                // Prepare sequence
                this.trainNumbers = Array.from(this.trains.keys());
                this.currentTrainIndex = 0;
                this.isManualMode = false;
                // If nothing plotted yet, create markers for each train
                if (this.trainNumbers.length > 0) {
                    await this.plotAllTrains();
                } else {
                    console.warn('⚠️ MultiTrainManager: No trains available to plot');
                }
            }
            
        // Setup event handlers
        this.setupEventHandlers();
        
            // Setup mouse position overlay (disabled by default)
            if (window.MULTI_SHOW_MOUSE_POS_OVERLAY === true) {
                this.setupMousePositionOverlay();
            }
        
        this.isInitialized = true;
        } catch (error) {
            console.error('❌ MultiTrainManager: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Load trains from data manager
     */
    async loadTrainsFromDataManager(dataManager) {
        
        // Load train data directly from CSV like the single-train system does
        try {
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`Failed to load train data: ${response.status}`);
            }
            
            const csvText = await response.text();
            const trainsRaw = new Map(); // Temporarily store raw train data by number

            // Parse raw train data
            const lines = csvText.split('\n');
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const parts = this.parseCSVLine(line);
                if (parts.length >= 13) {
                    const trainNumber = parts[0].trim();
                    
                    
                    if (!trainsRaw.has(trainNumber)) {
                        trainsRaw.set(trainNumber, {
                            trainNumber: trainNumber,
                            trainName: parts[1].trim(),
                            source: parts[13].trim(), // Source Station (column 13)
                            destination: parts[15].trim(), // Destination Station (column 15)
                            coachCount: parts[17] || '',
                            coaches: parts[18] || '',
                            route: []
                        });
                    }
                const train = trainsRaw.get(trainNumber);
                const stationCode = parts[3].trim();
                const stationName = parts[4].trim();
                
                // Debug logging for train 20101
                if (trainNumber === '20101' && stationCode === 'NGP') {
                    console.log(`🔧 DEBUG: Train 20101 loading Nagpur station: ${stationName} (${stationCode})`);
                }
                    const sequence = parseInt(parts[2]) || 0;
                    const distance = parseFloat(parts[8]) || 0;
                    const arrival = parts[5];
                    const departure = parts[7];
                    const platformNumber = parts[12] || 'TBD';
                    const haltTime = parseInt(parts[6]) || 0;
                    
                    // Debug logging for 
                    // Use the same global station coordinates as single-train system
                    const stationCoords = typeof stationCoordinatesFromCSV !== 'undefined' ? stationCoordinatesFromCSV[stationCode] : null;
                    if (stationCoords) {
                        // Build station -> trains map
                        if (!this.stationToTrains.has(stationCode)) {
                            this.stationToTrains.set(stationCode, new Set());
                        }
                        this.stationToTrains.get(stationCode).add(trainNumber);
                        train.route.push({
                            code: stationCode,
                            name: stationName,
                            lat: stationCoords.lat,
                            lng: stationCoords.lng,
                            sequence: sequence,
                            distance: distance,
                            arrival: arrival,
                            departure: departure,
                            platformNumber: platformNumber,
                            haltTime: haltTime
                        });
                    } else {
                        console.warn(`⚠️ MultiTrainManager: Coordinates not found for station ${stationCode} in train ${trainNumber}`);
                    }
                }
            }

            // Filter trains to only include those with valid routes
            let loadedCount = 0;
            trainsRaw.forEach(train => {
                if (train.route.length > 0) {
                    train.hasRoute = true;
                    this.trains.set(train.trainNumber, train);
                    this.initializeTrainState(train.trainNumber, train);
                    loadedCount++;
                    
                    // Debug logging for spec
                }
            });

        } catch (error) {
            console.error('❌ MultiTrainManager: Failed to load train data:', error);
        }
    }

    /**
     * Parse a CSV line handling quoted fields and escaped quotes
     * @param {string} line - CSV line to parse
     * @returns {Array} Array of parsed fields
     */
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // End of field
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add the last field
        result.push(current);
        
        return result;
    }

    /**
     * Load train data from CSV
     */
    async loadTrainData() {
        
        try {
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.status}`);
            }
            
            const csvText = await response.text();
            const trains = this.parseTrainData(csvText);
            
            // Load trains into our map
            trains.forEach(train => {
                if (train.hasRoute && train.route.length > 0) {
                    this.trains.set(train.number, train);
                    this.initializeTrainState(train.number, train);
                }
            });
            
        } catch (error) {
            console.error('❌ MultiTrainManager: Failed to load train data:', error);
            throw error;
        }
    }


    /**
     * Parse train data from CSV
     */
    parseTrainData(csvText) {
        const lines = csvText.split('\n');
        const trains = [];
        
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = this.parseCSVLine(line);
            if (parts.length >= 4) {
                const train = {
                    number: parts[0].trim(),
                    name: parts[1].trim(),
                    source: parts[2].trim(),
                    destination: parts[3].trim(),
                    hasRoute: false,
                    route: []
                };
                
                // Load route data if available
                this.loadTrainRoute(train);
                
                trains.push(train);
            }
        }
        
        return trains;
    }


    /**
     * Load route data for a train
     */
    loadTrainRoute(train) {
        try {
            // Load coordinates
            const coordinates = this.loadStationCoordinates();
            
            // Load train-specific route data
            const routeData = this.loadTrainRouteData(train.number);
            
            if (routeData && routeData.length > 0) {
                train.route = routeData.map(station => {
                    const coord = coordinates[station.code];
                    return {
                        ...station,
                        lat: coord ? coord.lat : 0,
                        lng: coord ? coord.lng : 0
                    };
                }).filter(station => station.lat !== 0 && station.lng !== 0);
                
                train.hasRoute = train.route.length > 0;
            }
        } catch (error) {
            console.warn(`⚠️ MultiTrainManager: Failed to load route for train ${train.number}:`, error);
        }
    }

    /**
     * Load station coordinates
     */
    loadStationCoordinates() {
        // Use the same coordinate loading logic as single-train system
        if (window.trainMonitorInstance && window.trainMonitorInstance.stationCoordinatesFromCSV) {
            return window.trainMonitorInstance.stationCoordinatesFromCSV;
        }
        
        // Fallback: return empty object
        return {};
    }

    /**
     * Load train route data
     */
    loadTrainRouteData(trainNumber) {
        // Use the same route loading logic as single-train system
        if (window.trainMonitorInstance && window.trainMonitorInstance.trainDataManager) {
            const trainData = window.trainMonitorInstance.trainDataManager.allTrains?.get(trainNumber);
            return trainData?.route || [];
        }
        
        return [];
    }

    /**
     * Initialize train state for simulation
     */
    initializeTrainState(trainNumber, train) {
        const firstStation = train.route[0];
        
        // Debug train state initializa
        const state = {
            currentStationIndex: 0,
            currentPosition: {
                lat: firstStation.lat,
                lng: firstStation.lng
            },
            currentSpeed: 80, // km/h starting speed
            // Show "At Origin" on load; depart immediately on first tick
            isAtStation: true,
            stationStopStartTime: Date.now(),
            stationStopRemainingMs: 0,
            journeyCompleted: false,
            lastUpdateTime: Date.now()
        };
        
        this.trainStates.set(trainNumber, state);
        
    }

    /**
     * Set initial map bounds ONCE at the beginning
     */
    setInitialMapBounds() {
        
        // Calculate bounds from all train routes
        const bounds = L.latLngBounds();
        let hasValidBounds = false;
        
        this.trains.forEach((train) => {
            train.route.forEach((station) => {
                if (station.lat && station.lng && !isNaN(station.lat) && !isNaN(station.lng)) {
                    bounds.extend([station.lat, station.lng]);
                    hasValidBounds = true;
                }
            });
        });
        
        if (hasValidBounds) {
            
            // Set map view ONCE and keep it stable - ENFORCE zoom level 5
            this.map.fitBounds(bounds, { 
                padding: [50, 50],
                maxZoom: 5
            });
            
            // Force zoom level to 5 after fitBounds (in case it was overridden)
            setTimeout(() => {
                this.map.setZoom(5);
            }, 100);
            
        } else {
            // Fallback to India bounds - ENFORCE zoom level 5
            this.map.setView([20.5937, 78.9629], 5);
        }
        
        // Final enforcement of zoom level 5
        setTimeout(() => {
            this.map.setZoom(5);
        }, 200);
        
    }

    /**
     * Initialize manual plotting mode
     */
    initializeManualMode() {
        console.log('🎮 MultiTrainManager: Initializing manual plotting mode...');
        
        this.trainNumbers = Array.from(this.trains.keys());
        this.currentTrainIndex = 0;
        this.isManualMode = true;
        
        console.log(`🎮 MultiTrainManager: Ready to plot ${this.trainNumbers.length} trains manually`);
        console.log(`🎮 MultiTrainManager: First train to plot: ${this.trainNumbers[0] || 'None'}`);
        
        // Create the manual plotting button
        this.createManualPlottingButton();
    }

    /**
     * Create manual plotting button in the right sidebar
     */
    createManualPlottingButton() {
        // Remove any existing button first
        const existingContainer = document.getElementById('manual-plotting-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        // Create a new container
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'manual-plotting-container';
        buttonContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            background: white;
            border: 2px solid #007bff;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            font-family: Arial, sans-serif;
            min-width: 200px;
        `;
        document.body.appendChild(buttonContainer);

        // Create the button
        const button = document.createElement('button');
        button.id = 'plot-next-train-btn';
        button.textContent = `Plot Next Train (${this.currentTrainIndex + 1}/${this.trainNumbers.length})`;
        button.style.cssText = `
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 10px;
            width: 100%;
        `;

        // Create the Plot All button
        const plotAllButton = document.createElement('button');
        plotAllButton.id = 'plot-all-trains-btn';
        plotAllButton.textContent = `Plot All (${this.trainNumbers.length - this.currentTrainIndex} remaining)`;
        plotAllButton.style.cssText = `
            background: #28a745;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 10px;
            width: 100%;
        `;

        // Create status display
        const status = document.createElement('div');
        status.id = 'plotting-status';
        status.style.cssText = `
            font-size: 12px;
            color: #666;
            text-align: center;
        `;
        status.textContent = `Ready to plot train ${this.trainNumbers[0] || 'None'}`;

        // Add click handler
        button.addEventListener('click', () => {
            this.plotNextTrain();
        });

        // Add click handler for Plot All
        plotAllButton.addEventListener('click', async () => {
            plotAllButton.disabled = true;
            await this.plotAllTrains();
            plotAllButton.disabled = false;
        });

        // Clear container and add new elements
        buttonContainer.innerHTML = '';
        buttonContainer.appendChild(button);
        buttonContainer.appendChild(plotAllButton);
        buttonContainer.appendChild(status);

        console.log('🎮 MultiTrainManager: Manual plotting button created');
        console.log('🎮 MultiTrainManager: Button container position:', buttonContainer.style.position);
        console.log('🎮 MultiTrainManager: Button container z-index:', buttonContainer.style.zIndex);
        
        // Also try to add to the right sidebar as a fallback
        this.addButtonToRightSidebar(button, plotAllButton, status);
    }

    /**
     * Add button to right sidebar as fallback
     */
    addButtonToRightSidebar(button, plotAllButton, status) {
        // Try to find the right sidebar
        const rightSidebar = document.querySelector('.right-sidebar, #right-sidebar, .sidebar, .controls-panel');
        
        if (rightSidebar) {
            console.log('🎮 MultiTrainManager: Found right sidebar, adding button there too');
            
            // Create a section for manual plotting
            let manualSection = document.getElementById('manual-plotting-section');
            if (!manualSection) {
                manualSection = document.createElement('div');
                manualSection.id = 'manual-plotting-section';
                manualSection.style.cssText = `
                    margin-top: 20px;
                    padding: 15px;
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 5px;
                `;
                
                const title = document.createElement('h4');
                title.textContent = 'Manual Train Plotting';
                title.style.cssText = 'margin: 0 0 10px 0; color: #007bff;';
                
                manualSection.appendChild(title);
                rightSidebar.appendChild(manualSection);
            }
            
            // Clone the button and status for the sidebar
            const sidebarButton = button.cloneNode(true);
            const sidebarPlotAllButton = plotAllButton.cloneNode(true);
            const sidebarStatus = status.cloneNode(true);
            
            sidebarButton.style.cssText = `
                background: #007bff;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 10px;
                width: 100%;
            `;
            
            sidebarPlotAllButton.style.cssText = `
                background: #28a745;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 10px;
                width: 100%;
            `;

            sidebarStatus.style.cssText = `
                font-size: 12px;
                color: #666;
                text-align: center;
            `;
            
            manualSection.innerHTML = '';
            manualSection.appendChild(sidebarButton);
            manualSection.appendChild(sidebarPlotAllButton);
            manualSection.appendChild(sidebarStatus);
            
            // Add click handler to sidebar button
            sidebarButton.addEventListener('click', () => {
                this.plotNextTrain();
            });

            // Add click handler to sidebar Plot All button
            sidebarPlotAllButton.addEventListener('click', async () => {
                sidebarPlotAllButton.disabled = true;
                await this.plotAllTrains();
                sidebarPlotAllButton.disabled = false;
            });
            
            console.log('🎮 MultiTrainManager: Button added to right sidebar');
        } else {
            console.log('🎮 MultiTrainManager: No right sidebar found');
        }
    }

    /**
     * Plot the next train in sequence
     */
    async plotNextTrain(plotToken = null) {
        // Abort if a newer plotting session is active
        if (plotToken !== null && this._plotToken !== plotToken) {
            return;
        }
        if (this.currentTrainIndex >= this.trainNumbers.length) {
            this.updatePlottingButton('All Trains Plotted!', true);
            return;
        }

        const trainNumber = this.trainNumbers[this.currentTrainIndex];
        const train = this.trains.get(trainNumber);
        
        if (!train) {
            console.error(`🎮 MultiTrainManager: Train ${trainNumber} not found`);
            this.currentTrainIndex++;
            this.updatePlottingButton();
            return;
        }

        // Plotting train
        // Map state before plotting
        
        // Ensure zoom level remains at 5
        if (this.map.getZoom() !== 5) {
            console.log(`🗺️ MultiTrainManager: Correcting zoom level from ${this.map.getZoom()} to 5`);
            this.map.setZoom(5);
        }

        try {
            // CRITICAL FIX: Create station markers FIRST, then train marker
            // This ensures both use the same coordinate system state
            if (plotToken !== null && this._plotToken !== plotToken) {
                return;
            }
            await this.createStationMarkersForTrain(trainNumber, train);
            
            // Small delay to let station markers settle
            await new Promise(resolve => setTimeout(resolve, 10));
            
            // Draw route line first, then create train marker
            this.createRouteLineForTrain(trainNumber, train);
            this.createSingleTrainMarker(trainNumber, train);
            
            // Created markers for train
            
            // DO NOT invalidate size as it causes coordinate shifts!
            // this.map.invalidateSize(false);
            
            // Update button and status
            this.currentTrainIndex++;
            this.updatePlottingButton();
            
            // Map state after plotting train
            // Successfully plotted train
            
        } catch (error) {
            console.error(`❌ MultiTrainManager: Error plotting train ${trainNumber}:`, error);
            this.currentTrainIndex++;
            this.updatePlottingButton();
        }
    }

    /**
     * Plot all remaining trains
     */
    async plotAllTrains() {
        if (this.isPlotting) {
            return;
        }
        this.isPlotting = true;
        this._plotToken++;
        const token = this._plotToken;
        // Plotting all remaining trains
        try {
            while (this.currentTrainIndex < this.trainNumbers.length && this._plotToken === token) {
                // Plot train index
                await this.plotNextTrain(token);
                // tiny delay to keep UI responsive and allow rendering
                await new Promise(resolve => setTimeout(resolve, 5));
            }
            if (this._plotToken === token) {
                this.updatePlottingButton('All Trains Plotted!', true);
                // Finished plotting all trains
            } else {
                // Plotting cancelled by a newer session
            }
        } finally {
            if (this._plotToken === token) this.isPlotting = false;
        }
    }

    /**
     * Plot only the selected list of train numbers
     * @param {string[]} selectedTrainNumbers
     */
    async plotSelectedTrains(selectedTrainNumbers) {
        if (!Array.isArray(selectedTrainNumbers) || selectedTrainNumbers.length === 0) return;
        // Prepare a fresh plotting session over the provided list only
        this.trainNumbers = selectedTrainNumbers.filter(tn => this.trains.has(tn));
        this.currentTrainIndex = 0;
        this.isPlotting = false; // allow plotAllTrains to start
        this._plotToken++;
        await this.plotAllTrains();
    }

    /**
     * Update the plotting button text and status
     */
    updatePlottingButton(customText = null, isComplete = false) {
        // Update both the fixed position button and sidebar button
        const buttons = document.querySelectorAll('#plot-next-train-btn');
        const plotAllButtons = document.querySelectorAll('#plot-all-trains-btn');
        const statusElements = document.querySelectorAll('#plotting-status');
        
        if (buttons.length === 0 || statusElements.length === 0) {
            console.log('🎮 MultiTrainManager: Buttons not found for update');
            return;
        }

        // Update all buttons and status elements
        buttons.forEach(button => {
            if (isComplete) {
                button.textContent = 'All Trains Plotted!';
                button.style.background = '#28a745';
                button.disabled = true;
            } else if (this.currentTrainIndex < this.trainNumbers.length) {
                const nextTrain = this.trainNumbers[this.currentTrainIndex];
                button.textContent = `Plot Next Train (${this.currentTrainIndex + 1}/${this.trainNumbers.length})`;
                button.style.background = '#007bff';
                button.disabled = false;
            } else {
                button.textContent = 'All Trains Plotted!';
                button.style.background = '#28a745';
                button.disabled = true;
            }
        });

        // Update plot-all buttons
        plotAllButtons.forEach(btn => {
            const remaining = Math.max(0, this.trainNumbers.length - this.currentTrainIndex);
            btn.textContent = remaining === 0 ? 'All Trains Plotted!' : `Plot All (${remaining} remaining)`;
            btn.style.background = remaining === 0 ? '#6c757d' : '#28a745';
            btn.disabled = remaining === 0;
        });

        statusElements.forEach(status => {
            if (isComplete) {
                status.textContent = `Completed: ${this.trainNumbers.length} trains plotted`;
            } else if (this.currentTrainIndex < this.trainNumbers.length) {
                const nextTrain = this.trainNumbers[this.currentTrainIndex];
                status.textContent = `Next: Train ${nextTrain}`;
            } else {
                status.textContent = `Completed: ${this.trainNumbers.length} trains plotted`;
            }
        });
    }

    /**
     * Create markers sequentially - one train at a time
     */
    async createMarkersSequentially() {
        console.log('🚂 MultiTrainManager: Creating markers sequentially...');
        console.log(`🗺️ MultiTrainManager: Starting marker creation at zoom level: ${this.map.getZoom()}`);
        
        const trainNumbers = Array.from(this.trains.keys());
        console.log(`🚂 MultiTrainManager: Processing ${trainNumbers.length} trains sequentially`);
        
        for (let i = 0; i < trainNumbers.length; i++) {
            const trainNumber = trainNumbers[i];
            const train = this.trains.get(trainNumber);
            
            console.log(`🚂 MultiTrainManager: Processing train ${trainNumber} (${i + 1}/${trainNumbers.length})`);
            console.log(`🗺️ MultiTrainManager: Map state before train ${trainNumber}: zoom=${this.map.getZoom()}, center=${this.map.getCenter()}`);
            
            // Ensure zoom level remains at 5 before processing each train
            if (this.map.getZoom() !== 5) {
                console.log(`🗺️ MultiTrainManager: Correcting zoom level from ${this.map.getZoom()} to 5`);
                this.map.setZoom(5);
            }
            
            // Create station markers for this train's route
            await this.createStationMarkersForTrain(trainNumber, train);
            
            // Create train marker for this train
            this.createSingleTrainMarker(trainNumber, train);
            
            // Small delay to ensure markers are properly rendered
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Debug map state after train processing
            console.log(`🗺️ MultiTrainManager: Map state after train ${trainNumber}: zoom=${this.map.getZoom()}, center=${this.map.getCenter()}`);
        }
        
        // Final zoom level check
        console.log(`🗺️ MultiTrainManager: Final zoom level after marker creation: ${this.map.getZoom()}`);
        console.log(`✅ MultiTrainManager: Completed sequential marker creation for ${trainNumbers.length} trains`);
    }

    /**
     * Create station markers for a specific train's route
     */
    async createStationMarkersForTrain(trainNumber, train) {
        console.log(`📍 MultiTrainManager: Creating station markers for train ${trainNumber}`);
        
        let markerCount = 0;
        
        for (const station of train.route) {
            // Check if station marker already exists
            if (this.stationMarkers.has(station.code)) {
                console.log(`📍 MultiTrainManager: Station ${station.code} already exists, skipping creation`);
                continue; // Skip to next station
            }
            
            // Station doesn't exist, create it
            {
                // Use the same global station coordinates as single-train system
                const stationCoords = typeof stationCoordinatesFromCSV !== 'undefined' ? stationCoordinatesFromCSV[station.code] : null;
                if (stationCoords) {
                    // Debug logging for specific stations
                    if (station.code === 'JU' || station.code === 'SBIB' || station.code === 'NGP') {
                        console.log(`🔧 DEBUG: MultiTrainManager creating station marker ${station.code}: lat=${stationCoords.lat}, lng=${stationCoords.lng}`);
                    }
                    
                    const stationData = {
                        code: station.code,
                        name: stationCoords.name,
                        lat: stationCoords.lat,
                        lng: stationCoords.lng,
                        sequence: station.sequence,
                        distance: station.distance,
                        arrival: station.arrival,
                        departure: station.departure,
                        platformNumber: station.platformNumber,
                        haltTime: station.haltTime
                    };
                    
                    this.createStationMarker(stationData);
                    markerCount++;
                }
            }
        }
        
        console.log(`📍 MultiTrainManager: Created ${markerCount} new station markers for train ${trainNumber}`);
    }

    /**
     * Create station markers (one per unique station) - DEPRECATED, use createMarkersSequentially
     */
    createStationMarkers() {
        console.log('📍 MultiTrainManager: Creating station markers...');
        
        // Only create markers for stations that are actually used by trains
        const usedStations = new Set();
        let markerCount = 0;
        
        // Collect all stations used by loaded trains
        this.trains.forEach((train, trainNumber) => {
            if (train.route && train.route.length > 0) {
                train.route.forEach(station => {
                    usedStations.add(station.code);
                });
            }
        });
        
        console.log(`📍 MultiTrainManager: Found ${usedStations.size} unique stations used by trains`);
        
        // Create markers only for used stations
        usedStations.forEach(stationCode => {
            // Use the same global station coordinates as single-train system
            const stationCoords = typeof stationCoordinatesFromCSV !== 'undefined' ? stationCoordinatesFromCSV[stationCode] : null;
            if (stationCoords) {
                const station = {
                    code: stationCode,
                    name: stationCoords.name,
                    lat: stationCoords.lat,
                    lng: stationCoords.lng
                };
                
                this.createStationMarker(station);
                markerCount++;
            }
        });

        console.log(`✅ MultiTrainManager: Created ${markerCount} station markers for used stations`);
        
        // Set initial zoom level to 5 and center map on all station markers
        this.map.setZoom(5);
        
        setTimeout(() => {
            this.centerMapOnMarkers();
        }, 100);
    }


    /**
     * Center map on all station markers
     */
    centerMapOnMarkers() {
        console.log('🗺️ MultiTrainManager: Centering map on station markers...');
        
        if (this.stationMarkers.size === 0) {
            console.warn('⚠️ MultiTrainManager: No station markers to center on');
            return;
        }
        
        // Calculate bounds for all station markers
        const bounds = L.latLngBounds();
        let markerCount = 0;
        this.stationMarkers.forEach(marker => {
            const latLng = marker.getLatLng();
            bounds.extend(latLng);
            markerCount++;
            
            // Debug first few markers
            if (markerCount <= 5) {
                console.log(`🔧 DEBUG: Marker ${markerCount} bounds: lat=${latLng.lat}, lng=${latLng.lng}`);
            }
        });
        
        // Bounds calculation successful
        
        if (bounds.isValid()) {
            console.log(`🗺️ MultiTrainManager: Fitting bounds for ${this.stationMarkers.size} markers`);
            console.log(`🗺️ MultiTrainManager: Bounds: SW(${bounds.getSouthWest().lat}, ${bounds.getSouthWest().lng}) to NE(${bounds.getNorthEast().lat}, ${bounds.getNorthEast().lng})`);
            this.map.fitBounds(bounds, { 
                padding: [50, 50],
                maxZoom: 6
            });
            
            // Force map to refresh and invalidate
            setTimeout(() => {
                this.map.invalidateSize();
                this.map.fitBounds(bounds, { 
                    padding: [20, 20],
                    maxZoom: 5
                });
            }, 50);
        } else {
            // Fallback to India bounds with zoom level 6
            console.log('🗺️ MultiTrainManager: Using fallback India bounds');
            this.map.setView([20.5937, 78.9629], 6); // Center of India with zoom level 6
            
            // Force map to refresh
            setTimeout(() => {
                this.map.invalidateSize();
                this.map.setView([20.5937, 78.9629], 6);
            }, 50);
        }
    }

    /**
     * Get station data by code
     */
    getStationData(stationCode) {
        for (const train of this.trains.values()) {
            const station = train.route.find(s => s.code === stationCode);
            if (station) {
                return station;
            }
        }
        return null;
    }

    /**
     * Create a single station marker
     */
    createStationMarker(station) {
        const isOriginOrDestination = this.isOriginOrDestinationStation(station.code);
        const className = isOriginOrDestination ? 'station-marker origin-destination' : 'station-marker';
        const iconSize = isOriginOrDestination ? [20, 20] : [12, 12];
        
        // Use same anchor logic as single-train system
        const iconAnchor = isOriginOrDestination ? [10, 10] : [4, 4];
        const stationMarker = isOriginOrDestination ?
          `<div style="
                width: 20px; 
                height: 20px; 
                background-color: #007bff; 
                border: 1px solid white; 
                border-radius: 50%; 
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 10px;
                font-weight: bold;
            ">●</div>` : 
            `<div style="
                width: ${iconSize[0]}px; 
                height: ${iconSize[1]}px; 
                background-color: #28a745;
                border: 1px solid white; 
                border-radius: 50%; 
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 10px;
                font-weight: bold;
            ">●</div>`;


        const marker = L.marker([station.lat, station.lng], {
            icon: L.divIcon({
                className: 'customstation-marker',
                // html: `<div style="
                //     background: ${isOriginOrDestination ? '#007bff' : '#28a745'};
                //     // border: 3px solid white;
                //     border-radius: 50%;
                //     width: ${iconSize[0]}px;
                //     height: ${iconSize[1]}px;
                //     display: flex;
                //     align-items: center;
                //     justify-content: center;
                //     color: white;
                //     font-size: 10px;
                //     font-weight: bold;
                // ">●</div>`,
                html: stationMarker,
                iconSize: iconSize,
                iconAnchor: iconAnchor  // Use same anchor logic as single-train system
            }),
            zIndexOffset: 100 // Ensure station markers are visible
        });

        // Align with single-train tooltip system, enriched for multi-train minimal view
        const trainsPassingSet = this.stationToTrains.get(station.code) || new Set();
        const trainsPassing = Array.from(trainsPassingSet).sort();
        marker._stationData = {
            code: station.code,
            name: station.name,
            lat: station.lat,
            lng: station.lng,
            trainsPassing
        };
        marker._markerType = 'station';

        marker.addTo(this.map);
        
                // Debug marker addition (commented out for cleaner logs)
                // if (station.code === 'JU' || station.code === 'SBIB') {
                //     console.log(`🔧 DEBUG: Marker added to map for ${station.code}`);
                //     console.log(`🔧 DEBUG: Marker position after adding: ${marker.getLatLng()}`);
                //     console.log(`🔧 DEBUG: Map center after adding: ${this.map.getCenter()}`);
                //     console.log(`🔧 DEBUG: Map zoom after adding: ${this.map.getZoom()}`);
                //     
                //     // Check if marker is actually visible
                //     setTimeout(() => {
                //         const markerElement = marker.getElement();
                //         if (markerElement) {
                //             const rect = markerElement.getBoundingClientRect();
                //             const mapRect = this.map.getContainer().getBoundingClientRect();
                //             console.log(`🔧 DEBUG: ${station.code} marker element found:`, markerElement);
                //             console.log(`🔧 DEBUG: ${station.code} marker rect:`, rect);
                //             console.log(`🔧 DEBUG: ${station.code} map rect:`, mapRect);
                //             console.log(`🔧 DEBUG: ${station.code} marker visible:`, rect.width > 0 && rect.height > 0);
                //             console.log(`🔧 DEBUG: ${station.code} marker z-index:`, window.getComputedStyle(markerElement).zIndex);
                //         } else {
                //             console.log(`🔧 DEBUG: ${station.code} marker element NOT found!`);
                //         }
                //     }, 100);
                // }
        
        this.stationMarkers.set(station.code, marker);

        // Use the single-train tooltip system for a unified UX if available
        if (window.trainMonitorInstance && window.trainMonitorInstance.tooltipSystem) {
            try {
                window.trainMonitorInstance.tooltipSystem.setupClickTooltip(marker);
            } catch (_e) {}
        }
        
        // Debug pixel positions for specific stations to compare with train markers
        if (['JU', 'SBIB', 'NGP'].includes(station.code)) {
            setTimeout(() => {
                const markerElement = marker.getElement();
                if (markerElement) {
                    const rect = markerElement.getBoundingClientRect();
                    const mapRect = this.map.getContainer().getBoundingClientRect();
                    const isOriginOrDestination = this.isOriginOrDestinationStation(station.code);
                    console.log(`🔧 DEBUG: STATION marker ${station.code} (${station.name}) pixel position:`);
                    console.log(`🔧 DEBUG: - Coordinates: lat=${station.lat}, lng=${station.lng}`);
                    console.log(`🔧 DEBUG: - Relative position: x=${(rect.left - mapRect.left).toFixed(1)}, y=${(rect.top - mapRect.top).toFixed(1)}`);
                    console.log(`🔧 DEBUG: - Icon size: ${isOriginOrDestination ? '20x20' : '12x12'}, anchor: ${isOriginOrDestination ? '[10, 10]' : '[4, 4]'}`);
                }
            }, 300); // Longer delay to ensure both station and train markers are rendered
        }
    }

    /**
     * Check if station is origin or destination for any train
     */
    isOriginOrDestinationStation(stationCode) {
        for (const train of this.trains.values()) {
            if (train.route.length > 0) {
                const firstStation = train.route[0];
                const lastStation = train.route[train.route.length - 1];
                if (firstStation.code === stationCode || lastStation.code === stationCode) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Create train markers for all trains
     */
    createTrainMarkers() {
        console.log('🚂 MultiTrainManager: Creating train markers...');
        
        this.trains.forEach((train, trainNumber) => {
            this.createSingleTrainMarker(trainNumber, train);
        });

        console.log(`✅ MultiTrainManager: Created ${this.trainMarkers.size} train markers`);
    }

    /**
     * Create a polyline (route line) for a train if not already present
     */
    createRouteLineForTrain(trainNumber, train) {
        if (!train || !train.route || train.route.length < 2) return;
        if (this.routeLines.has(trainNumber)) return;

        const latlngs = train.route.map(s => [s.lat, s.lng]);
        // Simple color palette based on train number hash
        const colors = ['#3498db', '#e67e22', '#9b59b6', '#16a085', '#e74c3c', '#2ecc71', '#1abc9c', '#f39c12'];
        const color = colors[parseInt(trainNumber, 10) % colors.length] || '#3498db';

        const polyline = L.polyline(latlngs, {
            color,
            weight: 3,
            opacity: 0.8,
            pane: 'overlayPane'
        }).addTo(this.map);

        this.routeLines.set(trainNumber, polyline);
        // console.log(`🔧 Route line for train ${trainNumber}: ${latlngs.length} points, color: ${color}`);
    }

    createTrainIcon(size = 24) {
      // Create train icon using the images/train.png image (no rotation)
      return `
          <img src="assets/images/train.png" 
                style="width: ${size}px; height: ${size}px;" 
                alt="Train" />
      `;
    }

    /**
     * Create a single train marker
     */
    createSingleTrainMarker(trainNumber, train) {
        const state = this.trainStates.get(trainNumber);
        if (!state) return;

        // Debug train marker creation
        // Use first station coordinates directly (same as single-train system)
        const startLat = train.route[0].lat;
        const startLng = train.route[0].lng;
        
        // Minimal debug only if needed (removed per request)
        
        // Train marker as pure image icon (no divIcon CSS interference), rendered in markerPane for exact alignment
        const marker = L.marker([startLat, startLng], {
            pane: 'markerPane',
            icon: L.icon({
                iconUrl: 'assets/images/train.png',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
                className: 'train-image-icon'
            }),
            zIndexOffset: 2000
        });

        // Add click handler for focus
        marker.on('click', (e) => {
            e.originalEvent.stopPropagation();
            this.focusOnTrain(trainNumber);
        });

        // Attach metadata for tooltip system (shape expected by single-train)
        marker._markerType = 'train';
        marker._trainNumber = trainNumber;
        marker._trainData = {
            trainNumber: trainNumber,
            trainName: train.trainName,
            source: train.source,
            destination: train.destination,
            currentStation: train.route[state.currentStationIndex]?.name || train.route[0]?.name || 'Unknown',
            nextStation: train.route[state.currentStationIndex + 1]?.name || 'Destination',
            currentStationIndex: state.currentStationIndex,
            totalStations: train.route.length
        };

        // Use the single-train tooltip system if available
        if (window.trainMonitorInstance && window.trainMonitorInstance.tooltipSystem) {
            try {
                window.trainMonitorInstance.tooltipSystem.setupClickTooltip(marker);
                // Show train number hints by default; allow opt-out via MULTI_SHOW_TRAIN_HINTS === false
                const shouldShowHints = (typeof window.MULTI_SHOW_TRAIN_HINTS === 'boolean') ? window.MULTI_SHOW_TRAIN_HINTS !== false : true;
                if (shouldShowHints && window.trainMonitorInstance.tooltipSystem.addTrainNumberHint) {
                    window.trainMonitorInstance.tooltipSystem.addTrainNumberHint(marker, trainNumber);
                    marker.on('move', () => {
                        if (window.trainMonitorInstance && window.trainMonitorInstance.tooltipSystem) {
                            window.trainMonitorInstance.tooltipSystem.updateAllTrainHints();
                        }
                    });
                    // Ensure initial positioning occurs
                    if (window.trainMonitorInstance.tooltipSystem.updateAllTrainHints) {
                        window.trainMonitorInstance.tooltipSystem.updateAllTrainHints();
                    }
                }
            } catch (_e) {}
        }

        // Add to map
        marker.addTo(this.map);
        
        // Debug logging after marker addition (reduced)
        
        // Metadata already set above
        
        
        this.trainMarkers.set(trainNumber, marker);

        // Minimal debug for first few trains
    }

    /**
     * Focus on a specific train
     */
    focusOnTrain(trainNumber) {
        console.log(`🎯 MultiTrainManager: Focusing on train ${trainNumber}`);
        
        const train = this.trains.get(trainNumber);
        const state = this.trainStates.get(trainNumber);
        
        if (!train || !state) {
            console.error(`❌ MultiTrainManager: Train ${trainNumber} not found`);
            return;
        }

        // Multi-train: avoid altering user zoom; optionally pan without zoom if needed
        // this.map.panTo([state.currentPosition.lat, state.currentPosition.lng], { animate: true });
        
        // Highlight the train marker
        const marker = this.trainMarkers.get(trainNumber);
        if (marker) {
            marker.openTooltip();
        }
    }

    /**
     * Update all train positions
     */
    updateAllTrains(deltaTime) {
        const currentTime = Date.now();
        if (currentTime - this.lastUpdateTime < this.updateInterval) {
            return; // Throttle updates for performance
        }

        this.lastUpdateTime = currentTime;
        // Guard: if engine is paused, skip updates
        if (window.multiTrainSystem && window.multiTrainSystem.simulationEngine && window.multiTrainSystem.simulationEngine.isPaused) {
            if (!this._lastPausedLog || currentTime - this._lastPausedLog > 1000) {
                console.log('⏸️ MultiTrainManager: Engine paused - not updating trains');
                this._lastPausedLog = currentTime;
            }
            return;
        }
        
        // Batch update trains for performance with round-robin fairness
        // Original straightforward per-train iteration (no round-robin batching)
        let updateCount = 0;
        this.trains.forEach((train, trainNumber) => {
            if (updateCount >= this.updateBatchSize) {
                return; // Limit updates per frame
            }
            this.updateSingleTrain(trainNumber, train, deltaTime);
            updateCount++;
        });
    }

    /**
     * Update a single train's position
     */
    updateSingleTrain(trainNumber, train, deltaTime) {
        const state = this.trainStates.get(trainNumber);
        if (!state || state.journeyCompleted) return;

        // Simple movement logic - move between stations
        const currentStation = train.route[state.currentStationIndex];
        const nextStation = train.route[state.currentStationIndex + 1];
        
        if (!nextStation) {
            // Reached destination
            state.journeyCompleted = true;
            console.log(`🏁 MultiTrainManager: Train ${trainNumber} reached destination`);
            
            // Update marker's _trainData to reflect destination reached
            const marker = this.trainMarkers.get(trainNumber);
            if (marker && marker._trainData) {
                marker._trainData.currentStation = train.route[state.currentStationIndex]?.name || 'Unknown';
                marker._trainData.nextStation = 'Destination';
                marker._trainData.currentStationIndex = state.currentStationIndex;
            }
            
            // Publish arrived destination via broker
            this.publishMultiEvent('arrived_destination', trainNumber, train, state);
            return;
        }

        // Debug train movement for 
        // Move towards next station using same logic as single-train simulation
        const latDiff = nextStation.lat - state.currentPosition.lat;
        const lngDiff = nextStation.lng - state.currentPosition.lng;
        
        // Calculate distance using same method as single-train
        const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
        
        if (distance > 0.001) { // Restore original threshold
            // Station stop handling similar to single-train
            if (state.isAtStation) {
                // countdown stop time
                state.stationStopRemainingMs = Math.max(0, state.stationStopRemainingMs - deltaTime);
                if (state.stationStopRemainingMs <= 0) {
                    state.isAtStation = false; // depart
                    
                    // Update marker's _trainData to reflect departure
                    const marker = this.trainMarkers.get(trainNumber);
                    if (marker && marker._trainData) {
                        marker._trainData.currentStation = train.route[state.currentStationIndex]?.name || 'Unknown';
                        marker._trainData.nextStation = train.route[state.currentStationIndex + 1]?.name || 'Destination';
                        marker._trainData.currentStationIndex = state.currentStationIndex;
                    }
                    
                    // Publish depart event when leaving station
                    this.publishMultiEvent('departed_station', trainNumber, train, state);
                } else {
                    // stay stopped
                    return;
                }
            }

            // Time-scaled movement with gentle base
            // Match single-train feel: per-second rate equivalent to per-tick fraction (~50ms) of (speed/100)*0.25
            // 0.25 per 50ms -> 0.25 / 0.05 = 5 per second
            const baseRatePerSecond = (state.currentSpeed / 100) * 5;
            let movementFactor = baseRatePerSecond * (deltaTime / 1000);
            if (movementFactor > 0.5) movementFactor = 0.5;

            const newPosition = {
                lat: state.currentPosition.lat + (latDiff * movementFactor),
                lng: state.currentPosition.lng + (lngDiff * movementFactor)
            };
            state.currentPosition = newPosition;
            const marker = this.trainMarkers.get(trainNumber);
            if (marker) marker.setLatLng([newPosition.lat, newPosition.lng]);
        } else {
            // Reached next station
            state.currentStationIndex = Math.min(state.currentStationIndex + 1, train.route.length - 1);
            state.currentPosition.lat = nextStation.lat;
            state.currentPosition.lng = nextStation.lng;
            
            // Update marker's _trainData to reflect current station progress
            const marker = this.trainMarkers.get(trainNumber);
            if (marker && marker._trainData) {
                marker._trainData.currentStation = train.route[state.currentStationIndex]?.name || 'Unknown';
                marker._trainData.nextStation = train.route[state.currentStationIndex + 1]?.name || 'Destination';
                marker._trainData.currentStationIndex = state.currentStationIndex;
            }
            
            // start station stop timer (match single-train = haltTime seconds or default 15s)
            state.isAtStation = true;
            state.stationStopStartTime = Date.now();
            const rawHalt = nextStation.haltTime ? Number(nextStation.haltTime) * 1000 : 15000;
            state.stationStopRemainingMs = isFinite(rawHalt) ? rawHalt : 15000;

            // Publish arrived + stopped (depart will be published when timer elapses)
            this.publishMultiEvent('arrived_station', trainNumber, train, state);
            this.publishMultiEvent('stopped_station', trainNumber, train, state);
        }
    }

    /**
     * Publish multi-train lifecycle events to broker (Solace or In-Memory)
     */
    publishMultiEvent(type, trainNumber, train, state) {
        // Check if event publishing is enabled
        if (!window.publishEvents) {
            console.log(`📤 Event publishing disabled, skipping ${type} for train ${trainNumber}`);
            return;
        }
        
        const broker = window.solaceTrainMonitor;
        if (!broker || !broker.isConnected) {
            console.log(`⚠️ Broker not connected, skipping publish for ${type} (${trainNumber})`);
            return;
        }
        const idx = state.currentStationIndex;
        const origin = train.route[0];
        const dest = train.route[train.route.length - 1];
        const prev = train.route[idx - 1] || null;
        const curr = train.route[idx] || origin;
        const next = train.route[idx + 1] || null;
        const payload = {
            trainNumber: trainNumber,
            trainName: train.trainName,
            origin: origin?.code,
            originName: origin?.name,
            destination: dest?.code,
            destinationName: dest?.name,
            previousStation: prev?.code,
            previousStationName: prev?.name,
            currentStation: curr?.code,
            currentStationName: curr?.name,
            nextStation: next?.code,
            nextStationName: next?.name,
            distanceTraveled: this.calculateDistanceTraveledForState(train, state)
        };
        try {
            if (type === 'arrived_station') {
                broker.publishTrainArrivedStation(payload);
            } else if (type === 'stopped_station') {
                broker.publishTrainStoppedStation(payload);
            } else if (type === 'departed_station') {
                broker.publishTrainDepartedStation(payload);
                // Publish alert served events for alerts marked served at this station (parity with single-train)
                try {
                    if (window.eventManager && curr) {
                        const currentKeyPrefix = `${curr.code}_`;
                        const tracker = window.eventManager.getAlertTracker && window.eventManager.getAlertTracker();
                        if (tracker && tracker.entries) {
                            for (const [key, data] of tracker.entries()) {
                                if (key.startsWith(currentKeyPrefix) && data.alerts && data.alerts.served && data.alerts.served.length > 0) {
                                    data.alerts.served.forEach(alert => {
                                        window.eventManager.publishAlertServedEvent(alert, curr.code, curr.name);
                                    });
                                }
                            }
                        }
                    }
                } catch (_e) {}
            } else if (type === 'arrived_destination') {
                broker.publishTrainArrivedDestination(payload);
                // Clear any unserved alerts at destination (parity with single-train)
                try {
                    if (window.eventManager && dest) {
                        window.eventManager.clearUnservedAlertsAtDestination(trainNumber, dest.code, dest.name);
                    }
                } catch (_e) {}
            }
            if (window && window.MULTI_EVENT_AUDIT) {
                const code = payload.currentStation || payload.nextStation || payload.destination || '-';
                const name = payload.currentStationName || payload.nextStationName || payload.destinationName || '';
                // Multi event audit (kept minimal)
            }
        } catch (e) {
            console.error(`❌ Failed to publish ${type} for ${trainNumber}:`, e.message);
        }
    }

    /**
     * Calculate distance traveled up to current station index (km) - parity with single-train
     */
    calculateDistanceTraveledForState(train, state) {
        try {
            let totalKm = 0;
            const upto = Math.max(0, Math.min(state.currentStationIndex, train.route.length - 1));
            for (let i = 0; i < upto; i++) {
                const a = train.route[i];
                const b = train.route[i + 1];
                if (!a || !b) continue;
                // Use Leaflet distance (meters) → convert to km
                const dMeters = L.latLng(a.lat, a.lng).distanceTo(L.latLng(b.lat, b.lng));
                if (!isNaN(dMeters)) {
                    totalKm += (dMeters / 1000);
                }
            }
            return Math.round(totalKm * 100) / 100; // 2 decimals
        } catch (_e) {
            return 0;
        }
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Remove click-to-overview behavior to avoid unintended zoom changes
        // If needed, bind double-click for overview instead:
        // this.map.on('dblclick', () => this.returnToOverview());
    }

    /**
     * Setup mouse position overlay
     */
    setupMousePositionOverlay() {
        // Guard for repeated setup
        if (document.getElementById('mouse-position-overlay')) return;
        // Create mouse position overlay element
        const overlay = document.createElement('div');
        overlay.id = 'mouse-position-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            z-index: 1000;
            pointer-events: none;
            border: 1px solid #333;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        `;
        overlay.innerHTML = 'Lat: --, Lng: --';
        
        // Add to map container
        const mapContainer = this.map.getContainer();
        mapContainer.appendChild(overlay);
        
        // Add mouse move event listener
        this.map.on('mousemove', (e) => {
            const lat = e.latlng.lat.toFixed(6);
            const lng = e.latlng.lng.toFixed(6);
            overlay.innerHTML = `Lat: ${lat}, Lng: ${lng}`;
        });
        
        // Hide overlay when mouse leaves map
        this.map.on('mouseout', () => {
            overlay.innerHTML = 'Lat: --, Lng: --';
        });
        
        console.log('📍 MultiTrainManager: Mouse position overlay setup complete');
    }

    /**
     * Return to overview mode
     */
    returnToOverview() {
        console.log('🗺️ MultiTrainManager: Returning to overview mode');
        
        // Calculate bounds for all trains
        const bounds = L.latLngBounds();
        this.trains.forEach((train, trainNumber) => {
            const state = this.trainStates.get(trainNumber);
            if (state) {
                bounds.extend([state.currentPosition.lat, state.currentPosition.lng]);
            }
        });
        
        if (!bounds.isValid()) {
            // Fallback to India bounds
            bounds.extend([6.0, 68.0]);
            bounds.extend([37.0, 97.0]);
        }
        
        this.map.fitBounds(bounds, { maxZoom: 5 });
    }

    /**
     * Clear all markers
     */
    clearAllMarkers() {
		// Clear train markers and their number hints
		this.trainMarkers.forEach(marker => {
			// Remove attached train number hint if present
			try {
				if (window.trainMonitorInstance && window.trainMonitorInstance.tooltipSystem &&
					window.trainMonitorInstance.tooltipSystem.removeTrainNumberHint && marker && marker._trainNumberHint) {
					window.trainMonitorInstance.tooltipSystem.removeTrainNumberHint(marker);
				}
			} catch (err) {
				// ignore cleanup errors
			}
			this.map.removeLayer(marker);
		});
        this.trainMarkers.clear();

        // Clear station markers
        this.stationMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.stationMarkers.clear();

        // Clear route lines
        this.routeLines.forEach(line => {
            this.map.removeLayer(line);
        });
        this.routeLines.clear();

		// As a safety net, remove any stray hint DOM nodes that may remain
		try {
			const strayHints = document.querySelectorAll('.train-number-hint');
			strayHints.forEach(el => el.remove());
		} catch (err) {
			// ignore
		}
    }

    /**
     * Cleanup and destroy the multi-train manager
     */
    destroy() {
        console.log('🧹 MultiTrainManager: Destroying...');
        
        // Remove mouse position overlay
        const overlay = document.getElementById('mouse-position-overlay');
        if (overlay) {
            overlay.remove();
        }
        
        this.clearAllMarkers();
        this.trains.clear();
        this.trainStates.clear();
        this.isInitialized = false;
        
        console.log('✅ MultiTrainManager: Destroyed');
    }
}
