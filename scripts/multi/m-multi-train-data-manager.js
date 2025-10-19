/**
 * Independent Multi-Train Data Manager
 * Completely separate from single-train system
 * Handles data loading and management for multi-train mode
 */
class MultiTrainDataManager {
    constructor() {
        this.trains = new Map();
        this.stationCoordinates = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize the multi-train data manager
     */
    async initialize() {
        console.log('📊 MultiTrainDataManager: Initializing...');
        
        try {
            // Load station coordinates
            await this.loadStationCoordinates();
            
            // Load train data
            await this.loadTrainData();
            
            this.isInitialized = true;
            console.log('✅ MultiTrainDataManager: Initialized successfully');
        } catch (error) {
            console.error('❌ MultiTrainDataManager: Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Load station coordinates from CSV
     */
    async loadStationCoordinates() {
        console.log('📍 MultiTrainDataManager: Loading station coordinates...');
        
        try {
            const response = await fetch('assets/data/vandebharath-coordinates.csv');
            if (!response.ok) {
                throw new Error(`Failed to load station coordinates: ${response.status}`);
            }
            
            const csvText = await response.text();
            const coordinates = this.parseStationCoordinates(csvText);
            
            // Store coordinates in our map
            Object.entries(coordinates).forEach(([code, data]) => {
                this.stationCoordinates.set(code, data);
            });
            
            console.log(`✅ MultiTrainDataManager: Loaded ${this.stationCoordinates.size} station coordinates`);
        } catch (error) {
            console.error('❌ MultiTrainDataManager: Failed to load station coordinates:', error);
            throw error;
        }
    }

    /**
     * Parse station coordinates from CSV
     */
    parseStationCoordinates(csvText) {
        const lines = csvText.split('\n');
        const coordinates = {};
        let validCoordinates = 0;
        let invalidCoordinates = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = this.parseCSVLine(line);
            if (parts.length >= 4) {
                const code = parts[0].trim();
                const name = parts[1].trim();
                const latStr = (parts[2] || '').trim();
                const lngStr = (parts[3] || '').trim();
                // Skip header-like rows anywhere in the file
                if ((code.toLowerCase() === 'code' && name.toLowerCase() === 'name') ||
                    latStr.toLowerCase() === 'latitude' || lngStr.toLowerCase() === 'longitude') {
                    continue;
                }
                const lat = parseFloat(latStr);
                const lng = parseFloat(lngStr);
                
                if (code && name && !isNaN(lat) && !isNaN(lng)) {
                    coordinates[code] = { lat, lng, name };
                    validCoordinates++;
                    
                    // Log specific stations we're interested in
                    if (code === 'JU' || code === 'SBIB') {
                        console.log(`🔧 DEBUG: Found coordinates for ${code} (${name}): lat=${lat}, lng=${lng}`);
                    }
                } else {
                    invalidCoordinates++;
                    console.warn(`⚠️ MultiTrainDataManager: Invalid coordinates for line: ${line}`);
                }
            } else {
                invalidCoordinates++;
                console.warn(`⚠️ MultiTrainDataManager: Insufficient parts in line: ${line}`);
            }
        }
        
        console.log(`📊 MultiTrainDataManager: Parsed ${validCoordinates} valid coordinates, ${invalidCoordinates} invalid`);
        return coordinates;
    }

    /**
     * Load train data from CSV
     */
    async loadTrainData() {
        console.log('🚂 MultiTrainDataManager: Loading train data...');
        
        try {
            const response = await fetch('assets/data/vandebharath.csv');
            if (!response.ok) {
                throw new Error(`Failed to load train data: ${response.status}`);
            }
            
            const csvText = await response.text();
            const trains = this.parseTrainData(csvText);
            
            // Load trains into our map
            trains.forEach(train => {
                this.trains.set(train.number, train);
            });
            
            console.log(`✅ MultiTrainDataManager: Loaded ${this.trains.size} trains`);
        } catch (error) {
            console.error('❌ MultiTrainDataManager: Failed to load train data:', error);
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
            // Load train-specific route data
            const routeData = this.loadTrainRouteData(train.number);
            
            if (routeData && routeData.length > 0) {
                train.route = routeData.map(station => {
                    const coord = this.stationCoordinates.get(station.code);
                    return {
                        ...station,
                        lat: coord ? coord.lat : 0,
                        lng: coord ? coord.lng : 0
                    };
                }).filter(station => station.lat !== 0 && station.lng !== 0);
                
                train.hasRoute = train.route.length > 0;
            }
        } catch (error) {
            console.warn(`⚠️ MultiTrainDataManager: Failed to load route for train ${train.number}:`, error);
        }
    }

    /**
     * Load train route data
     */
    loadTrainRouteData(trainNumber) {
        // Load route data from CSV like the single-train system does
        try {
            // We need to parse the CSV again to get route data for this specific train
            // This is a simplified approach - in a real implementation, we'd cache the parsed data
            return this.parseTrainRouteFromCSV(trainNumber);
        } catch (error) {
            console.warn(`⚠️ MultiTrainDataManager: Failed to load route data for train ${trainNumber}:`, error);
            return [];
        }
    }

    /**
     * Parse train route from CSV for a specific train
     */
    parseTrainRouteFromCSV(trainNumber) {
        // This is a placeholder - we need to implement proper CSV parsing
        // For now, return empty array to avoid errors
        console.log(`📊 MultiTrainDataManager: Parsing route for train ${trainNumber} (placeholder)`);
        return [];
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
     * Get train data by number
     */
    getTrain(trainNumber) {
        return this.trains.get(trainNumber);
    }

    /**
     * Get all trains
     */
    getAllTrains() {
        return this.trains;
    }

    /**
     * Get station coordinates by code
     */
    getStationCoordinates(stationCode) {
        return this.stationCoordinates.get(stationCode);
    }

    /**
     * Get all station coordinates
     */
    getAllStationCoordinates() {
        return this.stationCoordinates;
    }

    /**
     * Check if data manager is initialized
     */
    isReady() {
        return this.isInitialized;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            trainCount: this.trains.size,
            stationCount: this.stationCoordinates.size,
            trainsWithRoutes: Array.from(this.trains.values()).filter(t => t.hasRoute).length
        };
    }
}
