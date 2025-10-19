/**
 * Train Monitoring System - Train Data Manager Module
 * Handles train data loading, parsing, and management
 */

class TrainDataManager {
    constructor(trainMonitor) {
        this.trainMonitor = trainMonitor;
    }


    /**
     * Load single train
     * @param {string} trainNumber - Train number to load
     */
    async loadSingleTrain(trainNumber) {
        try {
            // Stop any running simulation before loading new train
            if (this.trainMonitor.simulationEngine && this.trainMonitor.simulationEngine.isRunning) {
                this.trainMonitor.simulationEngine.stop();
            }
            
            // Stop single-train simulation if running
            if (this.trainMonitor.simulationEngine && this.trainMonitor.simulationEngine.isRunning) {
                this.trainMonitor.simulationEngine.stop();
            }
            
            // Reset running state
            this.trainMonitor.isRunning = false;
            this.trainMonitor.isPaused = false;
            
            // Clear existing map elements (but not train info panel)
            this.clearMapElements();
            
            // Load train data
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const csvText = await response.text();
            const trainData = this.parseTrainData(csvText, trainNumber);
            
            if (!trainData) {
                throw new Error(`Train ${trainNumber} not found`);
            }
            
            // Set current train data
            this.trainMonitor.currentTrainNumber = trainNumber;
            this.trainMonitor.currentTrainName = trainData.trainName;
            this.trainMonitor.stations = trainData.route;
            this.trainMonitor.currentStationIndex = 0;
            if (!trainData.route || trainData.route.length === 0 || !trainData.route[0] || !trainData.route[0].lat || !trainData.route[0].lng) {
                throw new Error(`Train ${trainNumber} has invalid route data: route length=${trainData.route?.length}, first station=${JSON.stringify(trainData.route?.[0])}`);
            }
            
            this.trainMonitor.currentPosition = {
                lat: trainData.route[0].lat,
                lng: trainData.route[0].lng
            };
            this.trainMonitor.currentSpeed = 0;
            this.trainMonitor.isAtStation = true;
            this.trainMonitor.stationStopStartTime = Date.now();
            
            // Generate waypoints and calculate total distance
            this.trainMonitor.waypoints = this.generateWaypoints();
            this.trainMonitor.totalDistance = this.calculateTotalDistance();
            
            // Display train data FIRST (this sets currentTrainData and clears multi-train markers)
            this.trainMonitor.displayTrainData(trainData);
            
            // NOW create visual elements AFTER displayTrainData has done its cleanup
            
            // Create train marker
            this.createTrainMarker();
            
            // Create station markers
            this.createStationMarkers();
            
            // Create route line
            this.createRouteLine();
            
            // Center map on the train route
            this.centerMapOnRoute();
            
            // console.log(`✅ Loaded train ${trainNumber} with ${trainData.route.length} stations`);
            
        } catch (error) {
            console.error(`❌ Error loading train ${trainNumber}:`, error);
            
            // Restore train info if there was an error
            if (this.trainMonitor.currentTrainNumber) {
                this.trainMonitor.displayTrainData(this.trainMonitor.currentTrainData);
            }
        }
    }

    /**
     * Search for a train
     * @param {string} trainNumber - Train number to search for
     */
    async searchTrain(trainNumber = null) {
        // If no train number provided, this is legacy call - skip
        if (!trainNumber) {
            return;
        }
        
        try {
            
            // Wait for station coordinates to be loaded
            if (typeof stationCoordinatesFromCSV === 'undefined' || Object.keys(stationCoordinatesFromCSV).length === 0) {
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
            
            // Stop any running simulation before loading new train
            if (this.trainMonitor.simulationEngine && this.trainMonitor.simulationEngine.isRunning) {
                this.trainMonitor.simulationEngine.stop();
            }
            
            // Stop single-train simulation if running
            if (this.trainMonitor.simulationEngine && this.trainMonitor.simulationEngine.isRunning) {
                this.trainMonitor.simulationEngine.stop();
            }
            
            // Reset running state
            this.trainMonitor.isRunning = false;
            this.trainMonitor.isPaused = false;
            
            // Clear existing map elements (but not train info panel)
            this.clearMapElements();
            
            // Load train data
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const csvText = await response.text();
            const trainData = this.parseTrainData(csvText, trainNumber);
            
            if (!trainData) {
                throw new Error(`Train ${trainNumber} not found`);
            }
            
            // Set current train data
            this.trainMonitor.currentTrainNumber = trainNumber;
            this.trainMonitor.currentTrainName = trainData.trainName;
            this.trainMonitor.stations = trainData.route;
            this.trainMonitor.currentStationIndex = 0;
            if (!trainData.route || trainData.route.length === 0 || !trainData.route[0] || !trainData.route[0].lat || !trainData.route[0].lng) {
                throw new Error(`Train ${trainNumber} has invalid route data: route length=${trainData.route?.length}, first station=${JSON.stringify(trainData.route?.[0])}`);
            }
            
            this.trainMonitor.currentPosition = {
                lat: trainData.route[0].lat,
                lng: trainData.route[0].lng
            };
            this.trainMonitor.currentSpeed = 0;
            this.trainMonitor.isAtStation = true;
            this.trainMonitor.stationStopStartTime = Date.now();
            
            // Generate waypoints and calculate total distance
            this.trainMonitor.waypoints = this.generateWaypoints();
            this.trainMonitor.totalDistance = this.calculateTotalDistance();
            
            // Display train data FIRST (this sets currentTrainData and clears multi-train markers)
            this.trainMonitor.displayTrainData(trainData);
            
            // Create visual elements
            this.createTrainMarker();
            this.createStationMarkers();
            this.createRouteLine();
            this.centerMapOnRoute();
            
            console.log(`✅ Found and loaded train ${trainNumber} with ${trainData.route.length} stations`);
            
        } catch (error) {
            console.error(`❌ Error searching for train ${trainNumber}:`, error);
            
            // Restore train info if there was an error
            if (this.trainMonitor.currentTrainNumber) {
                this.trainMonitor.displayTrainData(this.trainMonitor.currentTrainData);
            }
        }
    }

    /**
     * Parse all train data from CSV
     * @param {string} csvText - CSV text content
     * @returns {Array} Array of train data objects
     */
    parseAllTrainData(csvText) {
        const lines = csvText.split('\n');
        const trainMap = new Map();
        
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const parts = parseCSVLine(line);
                if (parts.length >= 13) {
                    const trainNumber = parts[0];        // Train No
                    const trainName = parts[1];          // Train Name
                    const stationCode = parts[3];        // Station Code
                    const stationName = parts[4];        // Station Name
                    const sequence = parseInt(parts[2]) || 0;  // SEQ
                    const distance = parseFloat(parts[8]) || 0;  // Distance
                    const arrival = parts[5];            // Arrival time
                    const departure = parts[7];          // Departure Time
                    const platformNumber = parts[12] || 'TBD';  // Platform Number
                    const haltTime = parseInt(parts[6]) || 0;   // Halt Time
                    
                    // Get station coordinates
                    const stationCoords = stationCoordinatesFromCSV[stationCode];
                    if (stationCoords) {
                        
                        const stationData = {
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
                        };
                        
                        if (!trainMap.has(trainNumber)) {
                            trainMap.set(trainNumber, {
                                trainNumber: trainNumber,
                                trainName: trainName,
                                route: [],
                                coachCount: '',
                                coaches: ''
                            });
                        }
                        
                        // Extract coach information from the first row of each train
                        const trainData = trainMap.get(trainNumber);
                        if (trainData.route.length === 0 && parts.length >= 19) {
                            trainData.coachCount = parts[17] || '';  // Coach Count
                            trainData.coaches = parts[18] || '';     // Coaches
                        }
                        
                        trainData.route.push(stationData);
                    } else {
                        // console.warn(`🔧 Station coordinates not found for ${stationCode} (${stationName})`);
                    }
                }
            }
        }
        
        // After parsing all routes, set source and destination for each train
        trainMap.forEach((trainData, trainNumber) => {
            if (trainData.route.length > 0) {
                trainData.source = trainData.route[0].name;
                trainData.destination = trainData.route[trainData.route.length - 1].name;
            }
        });
        
        return Array.from(trainMap.values());
    }

    /**
     * Parse train data for a specific train
     * @param {string} csvText - CSV text content
     * @param {string} trainNumber - Train number to parse
     * @returns {Object|null} Train data object or null if not found
     */
    parseTrainData(csvText, trainNumber) {
        const lines = csvText.split('\n');
        const trainData = {
            trainNumber: trainNumber,
            trainName: '',
            route: [],
            coachCount: '',
            coaches: ''
        };
        
        let found = false;
        
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const parts = parseCSVLine(line);
                if (parts.length >= 13 && parts[0] === trainNumber) {
                    found = true;
                    
                    if (!trainData.trainName) {
                        trainData.trainName = parts[1];
                        // Extract coach information from the first row
                        if (parts.length >= 19) {
                            trainData.coachCount = parts[17] || '';  // Coach Count
                            trainData.coaches = parts[18] || '';     // Coaches
                        }
                    }
                    
                    const stationCode = parts[3];        // Station Code
                    const stationName = parts[4];        // Station Name
                    const sequence = parseInt(parts[2]) || 0;  // SEQ
                    const distance = parseFloat(parts[8]) || 0;  // Distance
                    const arrival = parts[5];            // Arrival time
                    const departure = parts[7];          // Departure Time
                    const platformNumber = parts[12] || 'TBD';  // Platform Number
                    const haltTime = parseInt(parts[6]) || 0;   // Halt Time
                    
                    // Get station coordinates
                    const stationCoords = stationCoordinatesFromCSV[stationCode];
                    if (stationCoords) {
                        const stationData = {
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
                        };
                        
                        trainData.route.push(stationData);
                    }
                }
            }
        }
        
        return found ? trainData : null;
    }

    /**
     * Generate waypoints for smooth train movement
     * @returns {Array} Array of waypoint objects
     */
    generateWaypoints() {
        const waypoints = [];
        
        for (let i = 0; i < this.trainMonitor.stations.length - 1; i++) {
            const start = this.trainMonitor.stations[i];
            const end = this.trainMonitor.stations[i + 1];
            
            // Add start point
            waypoints.push({ lat: start.lat, lng: start.lng });
            
            // Add intermediate waypoints for smoother movement
            const numWaypoints = 5;
            for (let j = 1; j < numWaypoints; j++) {
                const ratio = j / numWaypoints;
                const lat = start.lat + (end.lat - start.lat) * ratio;
                const lng = start.lng + (end.lng - start.lng) * ratio;
                waypoints.push({ lat, lng });
            }
        }
        
        // Add final destination
        const lastStation = this.trainMonitor.stations[this.trainMonitor.stations.length - 1];
        waypoints.push({ lat: lastStation.lat, lng: lastStation.lng });
        
        return waypoints;
    }

    /**
     * Calculate total distance of the route
     * @returns {number} Total distance in kilometers
     */
    calculateTotalDistance() {
        let total = 0;
        for (let i = 0; i < this.trainMonitor.waypoints.length - 1; i++) {
            total += this.calculateDistance(this.trainMonitor.waypoints[i], this.trainMonitor.waypoints[i + 1]);
        }
        return total;
    }

    /**
     * Calculate distance between two points
     * @param {Object} point1 - First point {lat, lng}
     * @param {Object} point2 - Second point {lat, lng}
     * @returns {number} Distance in kilometers
     */
    calculateDistance(point1, point2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(point2.lat - point1.lat);
        const dLng = this.toRadians(point2.lng - point1.lng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRadians(point1.lat)) * Math.cos(this.toRadians(point2.lat)) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Convert degrees to radians
     * @param {number} degrees - Degrees to convert
     * @returns {number} Radians
     */
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Create train marker
     */
    createTrainMarker() {
        // Remove existing train marker
        if (this.trainMonitor.trainMarker) {
            this.trainMonitor.tooltipSystem.removeTrainNumberHint(this.trainMonitor.trainMarker);
            this.trainMonitor.map.removeLayer(this.trainMonitor.trainMarker);
        }
        
        // Create new train marker
        const startLat = this.trainMonitor.stations[0].lat;
        const startLng = this.trainMonitor.stations[0].lng;
        
        this.trainMonitor.trainMarker = L.marker([startLat, startLng], {
            icon: L.divIcon({
                className: 'train-marker',
                html: this.trainMonitor.createTrainIcon(24),
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            }),
            zIndexOffset: 2000
        });
        
        this.trainMonitor.trainMarker.addTo(this.trainMonitor.map);
        
        // Set marker properties for tooltip system compatibility
        this.trainMonitor.trainMarker._trainNumber = this.trainMonitor.currentTrainNumber;
        this.trainMonitor.trainMarker._markerType = 'train';
        this.trainMonitor.trainMarker._trainData = this.trainMonitor.currentTrainData;
        
        // Set up click tooltip
        this.trainMonitor.tooltipSystem.setupClickTooltip(this.trainMonitor.trainMarker);
        
        // Add train number hint
        this.trainMonitor.tooltipSystem.addTrainNumberHint(this.trainMonitor.trainMarker, this.trainMonitor.currentTrainNumber);
    }

    /**
     * Create station markers
     */
    createStationMarkers() {
        // Clear existing station markers
        this.trainMonitor.stationMarkers.forEach(marker => {
            this.trainMonitor.map.removeLayer(marker);
        });
        this.trainMonitor.stationMarkers = [];
        
        // Create new station markers
        this.trainMonitor.stations.forEach((station, index) => {
            const isFirstOrLast = index === 0 || index === this.trainMonitor.stations.length - 1;
            const iconSize = isFirstOrLast ? [20, 20] : [12, 12];
            const iconAnchor = isFirstOrLast ? [10, 10] : [4, 4];
            const className = isFirstOrLast ? 'station-marker origin-destination' : 'station-marker';
            
            // Create a simple colored div for the marker
            const markerColor = isFirstOrLast ? '#007bff' : '#28a745'; // Blue for origin/destination, green for intermediate
            const markerHtml = `<div style="
                width: ${iconSize[0]}px; 
                height: ${iconSize[1]}px; 
                background-color: ${markerColor}; 
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
                    html: markerHtml,
                    iconSize: iconSize,
                    iconAnchor: iconAnchor
                }),
                zIndexOffset: 100 // Ensure station markers are visible
            });
            
            
            // Store station data on marker
            marker._stationData = station;
            marker._markerType = 'station';
            marker._trainNumber = this.trainMonitor.currentTrainNumber;
            
            marker.addTo(this.trainMonitor.map);
            
            
            // Set up click tooltip
            this.trainMonitor.tooltipSystem.setupClickTooltip(marker);
            
            this.trainMonitor.stationMarkers.push(marker);
        });
    }

    /**
     * Create route line
     */
    createRouteLine() {
        // Clear existing route line
        if (this.trainMonitor.routeLine) {
            this.trainMonitor.map.removeLayer(this.trainMonitor.routeLine);
        }
        
        // Create new route line
        const routePoints = this.trainMonitor.stations.map(station => [station.lat, station.lng]);
        this.trainMonitor.routeLine = L.polyline(routePoints, {
            color: '#3498db',
            weight: 3,
            opacity: 0.7
        }).addTo(this.trainMonitor.map);
    }

    /**
     * Clear map elements only (not train info panel)
     */
    clearMapElements() {
        // Clear single train marker
        if (this.trainMonitor.trainMarker) {
            this.trainMonitor.tooltipSystem.removeTrainNumberHint(this.trainMonitor.trainMarker);
            this.trainMonitor.map.removeLayer(this.trainMonitor.trainMarker);
            this.trainMonitor.trainMarker = null;
        }
        
        // Clear station markers
        this.trainMonitor.stationMarkers.forEach(marker => {
            this.trainMonitor.map.removeLayer(marker);
        });
        this.trainMonitor.stationMarkers = [];
        
        // Clear route line
        if (this.trainMonitor.routeLine) {
            this.trainMonitor.map.removeLayer(this.trainMonitor.routeLine);
            this.trainMonitor.routeLine = null;
        }
        
        // Clear train trail
        if (this.trainMonitor.trainTrail) {
            this.trainMonitor.map.removeLayer(this.trainMonitor.trainTrail);
            this.trainMonitor.trainTrail = null;
        }
    }

    /**
     * Clear map
     */
    clearMap() {
        // Clear single train marker
        if (this.trainMonitor.trainMarker) {
            this.trainMonitor.tooltipSystem.removeTrainNumberHint(this.trainMonitor.trainMarker);
            this.trainMonitor.map.removeLayer(this.trainMonitor.trainMarker);
            this.trainMonitor.trainMarker = null;
        }
        
        // Clear station markers
        this.trainMonitor.stationMarkers.forEach(marker => {
            this.trainMonitor.map.removeLayer(marker);
        });
        this.trainMonitor.stationMarkers = [];
        
        // Clear route line
        if (this.trainMonitor.routeLine) {
            this.trainMonitor.map.removeLayer(this.trainMonitor.routeLine);
            this.trainMonitor.routeLine = null;
        }
        
        // Clear train trail
        if (this.trainMonitor.clearTrainTrail) {
            this.trainMonitor.clearTrainTrail();
        }
        
        // Clear search input
        const input = document.getElementById('trainSearchSelect');
        if (input) {
            input.value = '';
        }
        this.trainMonitor.selectedTrainValue = null;
        
        // Clear train info
        this.trainMonitor.uiControls.clearTrainInfo();
    }

    /**
     * Center map on the train route
     */
    centerMapOnRoute() {
        if (this.trainMonitor.stationMarkers.length > 0) {
            const group = new L.featureGroup(this.trainMonitor.stationMarkers);
            this.trainMonitor.map.fitBounds(group.getBounds().pad(0.1));
        }
    }

    /**
     * Show train
     */
    showTrain() {
        // Only work if a single train is selected
        if (!this.trainMonitor.currentTrainNumber) {
            return;
        }
        
        if (!this.trainMonitor.trainMarker) {
            return;
        }
        
        // Get train marker position and center map on train
        const trainPosition = this.trainMonitor.trainMarker.getLatLng();
        this.trainMonitor.map.setView(trainPosition, 8);
        
    }

    /**
     * Hide train
     */
    hideTrain() {
        // Clear map
        this.clearMap();
        
        // Reset train data
        this.trainMonitor.currentTrainNumber = null;
        this.trainMonitor.currentTrainName = null;
        this.trainMonitor.stations = [];
        this.trainMonitor.currentStationIndex = 0;
        this.trainMonitor.currentPosition = null;
        this.trainMonitor.currentSpeed = 0;
        this.trainMonitor.isAtStation = false;
        this.trainMonitor.stationStopStartTime = null;
        
        // Clear train info
        this.trainMonitor.uiControls.clearTrainInfo();
        
        // console.log('🚂 Train hidden and data cleared');
    }

    /**
     * Clear train trail
     */
    clearTrainTrail() {
        if (this.trainMonitor.trainTrail) {
            this.trainMonitor.map.removeLayer(this.trainMonitor.trainTrail);
            this.trainMonitor.trainTrail = null;
        }
    }

    /**
     * Update train trail
     */
    updateTrainTrail() {
        if (!this.trainMonitor.trainMarker) return;
        
        const currentPosition = this.trainMonitor.trainMarker.getLatLng();
        
        if (!this.trainMonitor.trainTrail) {
            this.trainMonitor.trainTrail = L.polyline([currentPosition], {
                color: '#dc3545',
                weight: 2,
                opacity: 0.7
            }).addTo(this.trainMonitor.map);
        } else {
            const trailPoints = this.trainMonitor.trainTrail.getLatLngs();
            trailPoints.push(currentPosition);
            this.trainMonitor.trainTrail.setLatLngs(trailPoints);
        }
    }









}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TrainDataManager;
}
