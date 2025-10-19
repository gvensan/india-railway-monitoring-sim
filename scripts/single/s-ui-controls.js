/**
 * Train Monitoring System - UI Controls Module
 * Handles user interface controls, sidebars, and interactions
 */

class UIControls {
    constructor(trainMonitor) {
        this.trainMonitor = trainMonitor;
    }

    /**
     * Toggle right sidebar
     */
    toggleRightSidebar() {
        const rightSidebar = document.getElementById('rightSidebar');
        const container = document.querySelector('.container');
        const mapContainer = document.querySelector('.map-container');
        
        // console.log('🚂 toggleRightSidebar called');
        // console.log('🚂 rightSidebar element:', rightSidebar);
        // console.log('🚂 container element:', container);
        // console.log('🚂 mapContainer element:', mapContainer);
        
        // Check if elements exist
        if (!rightSidebar || !container || !mapContainer) {
            // console.error('❌ Required elements not found for right sidebar toggle');
            return;
        }
        
        const isOpen = rightSidebar.classList.contains('open');
        
        if (isOpen) {
            // Close sidebar
            rightSidebar.classList.remove('open');
            container.classList.remove('right-sidebar-open');
            mapContainer.classList.remove('right-sidebar-open');
            // console.log('🚂 Right sidebar closed');
        } else {
            // Open sidebar
            rightSidebar.classList.add('open');
            container.classList.add('right-sidebar-open');
            mapContainer.classList.add('right-sidebar-open');
            // console.log('🚂 Right sidebar opened');
        }
        
        // Update map size after sidebar toggle
        setTimeout(() => {
            this.trainMonitor.map.invalidateSize();
        }, 300);
    }

    /**
     * Toggle left sidebar
     */
    toggleLeftSidebar() {
        const leftSidebar = document.getElementById('leftSidebar');
        const container = document.querySelector('.container');
        const mapContainer = document.querySelector('.map-container');
        
        if (leftSidebar && container && mapContainer) {
            const isOpen = leftSidebar.classList.contains('open');
            
            if (isOpen) {
                // Close sidebar
                leftSidebar.classList.remove('open');
                container.classList.remove('left-sidebar-open');
                mapContainer.classList.remove('left-sidebar-open');
                // console.log('📋 Left sidebar closed');
            } else {
                // Open sidebar
                leftSidebar.classList.add('open');
                container.classList.add('left-sidebar-open');
                mapContainer.classList.add('left-sidebar-open');
                // console.log('📋 Left sidebar opened');
            }
            
            // Update map size after sidebar toggle
            setTimeout(() => {
                this.trainMonitor.map.invalidateSize();
            }, 300);
        } else {
            // console.error('❌ Left sidebar, container, or mapContainer element not found');
        }
    }

    /**
     * Close left sidebar
     */
    closeLeftSidebar() {
        const leftSidebar = document.getElementById('leftSidebar');
        const container = document.querySelector('.container');
        const mapContainer = document.querySelector('.map-container');
        
        if (leftSidebar && container && mapContainer) {
            leftSidebar.classList.remove('open');
            container.classList.remove('left-sidebar-open');
            mapContainer.classList.remove('left-sidebar-open');
            // console.log('📋 Left sidebar closed');
            
            // Update map size after sidebar close
            setTimeout(() => {
                this.trainMonitor.map.invalidateSize();
            }, 300);
        } else {
            // console.error('❌ Left sidebar, container, or mapContainer element not found');
        }
    }

    /**
     * Update train information display
     */
    updateTrainInfo() {
        // console.log(`🔄 updateTrainInfo called - isAllTrainsMode: ${this.trainMonitor.isAllTrainsMode}`);
        // Handle all trains mode
        if (this.trainMonitor.isAllTrainsMode) {
            // console.log('🔄 All trains mode - clearing train info');
            this.clearTrainInfo();
            return;
        }
        
        // Handle empty stations array
        if (this.trainMonitor.stations.length === 0) {
            // console.log('⚠️ No stations data available for train info update');
            return;
        }
        
        // Update train number and name
        const trainNumberElement = document.getElementById('train-number');
        const trainNameElement = document.getElementById('train-name');
        
        // console.log(`🔄 Updating train info: number=${this.trainMonitor.currentTrainNumber}, name=${this.trainMonitor.currentTrainName}`);
        
        if (trainNumberElement) {
            trainNumberElement.textContent = this.trainMonitor.currentTrainNumber || '-';
        }
        if (trainNameElement) {
            trainNameElement.textContent = this.trainMonitor.currentTrainName || '-';
        }
        
        // Update current station info
        const currentStationElement = document.getElementById('current-station');
        const nextStationElement = document.getElementById('next-station');
        const platformElement = document.getElementById('current-platform'); // Fixed: was 'platform'
        
        if (currentStationElement && this.trainMonitor.currentStationIndex < this.trainMonitor.stations.length) {
            const currentStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex];
            currentStationElement.textContent = currentStation.name || '-';
        }
        
        if (nextStationElement && this.trainMonitor.currentStationIndex + 1 < this.trainMonitor.stations.length) {
            const nextStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex + 1];
            nextStationElement.textContent = nextStation.name || '-';
        } else if (nextStationElement) {
            nextStationElement.textContent = 'Destination';
        }
        
        if (platformElement && this.trainMonitor.currentStationIndex < this.trainMonitor.stations.length) {
            const currentStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex];
            platformElement.textContent = currentStation.platformNumber || 'TBD';
        }
        
        // Update speed information
        const speedElement = document.getElementById('train-speed');
        if (speedElement) {
            const speed = this.trainMonitor.currentSpeed || this.trainMonitor.trainSpeed || 0;
            speedElement.textContent = `${speed.toFixed(1)} km/h`;
        }
        
        // Update distance to next station
        const distanceElement = document.getElementById('distance');
        if (distanceElement && this.trainMonitor.currentStationIndex + 1 < this.trainMonitor.stations.length) {
            const currentStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex];
            const nextStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex + 1];
            
            if (this.trainMonitor.currentPosition && nextStation) {
                const distance = this.trainMonitor.calculateDistance(
                    this.trainMonitor.currentPosition.lat,
                    this.trainMonitor.currentPosition.lng,
                    nextStation.lat,
                    nextStation.lng
                );
                distanceElement.textContent = `${distance.toFixed(1)} km`;
            } else {
                distanceElement.textContent = '-';
            }
        } else if (distanceElement) {
            distanceElement.textContent = '0 km';
        }
        
        // Update distance covered
        const distanceCoveredElement = document.getElementById('distance-covered');
        if (distanceCoveredElement) {
            const distanceTraveled = this.trainMonitor.calculateDistanceTraveled ? 
                this.trainMonitor.calculateDistanceTraveled() : 0;
            distanceCoveredElement.textContent = `${distanceTraveled.toFixed(1)} km`;
        }
        
        // Update ETA to next station
        const etaElement = document.getElementById('eta');
        if (etaElement && this.trainMonitor.currentStationIndex + 1 < this.trainMonitor.stations.length) {
            const currentStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex];
            const nextStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex + 1];
            
            if (this.trainMonitor.currentPosition && nextStation && this.trainMonitor.currentSpeed > 0) {
                const distance = this.trainMonitor.calculateDistance(
                    this.trainMonitor.currentPosition.lat,
                    this.trainMonitor.currentPosition.lng,
                    nextStation.lat,
                    nextStation.lng
                );
                const etaMinutes = (distance / this.trainMonitor.currentSpeed) * 60;
                const hours = Math.floor(etaMinutes / 60);
                const minutes = Math.floor(etaMinutes % 60);
                etaElement.textContent = hours > 0 ? `${hours}:${minutes.toString().padStart(2, '0')}` : `${minutes} min`;
            } else {
                etaElement.textContent = '--:--';
            }
        } else if (etaElement) {
            etaElement.textContent = '--:--';
        }
        
        // Update station progress
        const stationProgressElement = document.getElementById('station-progress');
        if (stationProgressElement) {
            const progress = this.trainMonitor.stations.length > 0 ? 
                `${this.trainMonitor.currentStationIndex + 1}/${this.trainMonitor.stations.length}` : '0/0';
            stationProgressElement.textContent = progress;
        }
        
        // Update coach information
        const coachCountElement = document.getElementById('coach-count');
        const coachListElement = document.getElementById('coach-list');
        
        if (coachCountElement && coachListElement) {
            // Get coach information from current train data
            const currentTrainData = this.trainMonitor.currentTrainData;
            // console.log('🔧 Coach info debug - currentTrainData:', currentTrainData);
            // console.log('🔧 Coach info debug - coachCount:', currentTrainData?.coachCount);
            // console.log('🔧 Coach info debug - coaches:', currentTrainData?.coaches);
            
            // Always try to display coach information if available
            if (currentTrainData) {
                coachCountElement.textContent = currentTrainData.coachCount || '-';
                
                if (currentTrainData.coaches && currentTrainData.coaches.trim()) {
                    // Display coaches in a compact format (first few + count if many)
                    const coaches = currentTrainData.coaches.split(',').map(c => c.trim());
                    if (coaches.length <= 8) {
                        coachListElement.textContent = coaches.join(', ');
                    } else {
                        coachListElement.textContent = `${coaches.slice(0, 4).join(', ')}... (+${coaches.length - 4} more)`;
                    }
                } else {
                    coachListElement.textContent = '-';
                }
            } else {
                // console.log('🔧 Coach info debug - no currentTrainData available');
                coachCountElement.textContent = '-';
                coachListElement.textContent = '-';
            }
        }
        
        // Update progress bar
        this.updateProgressBar();
    }

    /**
     * Clear train information display
     */
    clearTrainInfo() {
        // Clear train information during reset
        const trainNumber = document.getElementById('train-number');
        const trainName = document.getElementById('train-name');
        const currentStation = document.getElementById('current-station');
        const nextStation = document.getElementById('next-station');
        const platform = document.getElementById('current-platform'); // Fixed: was 'platform'
        const speed = document.getElementById('train-speed');
        const distance = document.getElementById('distance');
        const distanceCovered = document.getElementById('distance-covered');
        const eta = document.getElementById('eta');
        const stationProgress = document.getElementById('station-progress');
        const coachCount = document.getElementById('coach-count');
        const coachList = document.getElementById('coach-list');
        
        if (trainNumber) trainNumber.textContent = '-';
        if (trainName) trainName.textContent = '-';
        if (currentStation) currentStation.textContent = '-';
        if (nextStation) nextStation.textContent = '-';
        if (platform) platform.textContent = '-';
        if (speed) speed.textContent = '0 km/h';
        if (distance) distance.textContent = '0 km';
        if (distanceCovered) distanceCovered.textContent = '0 km';
        if (eta) eta.textContent = '--:--';
        if (stationProgress) stationProgress.textContent = '-';
        if (coachCount) coachCount.textContent = '-';
        if (coachList) coachList.textContent = '-';
    }

    /**
     * Update status display
     * @param {string} status - Status text to display
     */
    updateStatus(status) {
        const statusElement = document.getElementById('trainStatus');
        const statusIndicator = document.getElementById('statusIndicator');
        
        // Normalize status to include origin/destination semantics
        const totalStations = this.trainMonitor.stations ? this.trainMonitor.stations.length : 0;
        const idx = this.trainMonitor.currentStationIndex || 0;
        const atDestination = totalStations > 0 && idx >= totalStations - 1;
        const atOrigin = idx === 0 && this.trainMonitor.isAtStation;
        let finalStatus = status;
        if (atDestination) {
            finalStatus = 'At Destination';
        } else if (atOrigin) {
            finalStatus = 'At Origin';
        }
        
        if (statusElement) {
            statusElement.textContent = finalStatus;
        }
        
        if (statusIndicator) {
            // Update status indicator color based on status
            statusIndicator.className = 'status-indicator';
            if (finalStatus.includes('Running')) {
                statusIndicator.classList.add('running');
            } else if (finalStatus.includes('Paused')) {
                statusIndicator.classList.add('paused');
            } else if (finalStatus.includes('Stopped') || finalStatus.includes('Origin')) {
                statusIndicator.classList.add('stopped');
            } else if (finalStatus.includes('Destination') || finalStatus.includes('Arrived')) {
                statusIndicator.classList.add('arrived');
            }
        }
    }

    /**
     * Update speed display
     * @param {number} speed - Current speed in km/h
     */
    updateSpeedDisplay(speed) {
        const speedElement = document.getElementById('train-speed'); // Fixed: was 'currentSpeed'
        if (speedElement) {
            speedElement.textContent = `${Math.round(speed || 0)} km/h`;
        }
    }

    /**
     * Auto-pan the map to keep the train visible within the visible bounds
     * @param {Object} trainLatLng - Train position as {lat, lng}
     * @param {number} marginPercent - Margin percentage (default 15%)
     * @returns {boolean} True if panning occurred, false if train is already visible
     */
    autoPanToKeepTrainVisible(trainLatLng, marginPercent = 10) {
        if (!this.trainMonitor.map || !trainLatLng) {
            // Debug for train 12461
            if (this.trainMonitor.isDebugTrain(this.trainMonitor.currentTrainNumber) && Math.random() < 0.02) {
                console.log(`🗺️ autoPanToKeepTrainVisible: Early return - map=${!!this.trainMonitor.map}, trainLatLng=${!!trainLatLng}`);
            }
            return false;
        }
        
        // Throttle auto-panning to prevent excessive panning
        const now = Date.now();
        if (this.lastAutoPanTime && (now - this.lastAutoPanTime) < 2000) {
            // Debug for train 12461
            // if (this.trainMonitor.isDebugTrain(this.trainMonitor.currentTrainNumber) && Math.random() < 0.02) {
            //     const timeSinceLastPan = now - this.lastAutoPanTime;
            //     console.log(`🗺️ autoPanToKeepTrainVisible: Throttled - time since last pan: ${timeSinceLastPan}ms (need 2000ms)`);
            // }
            // Don't pan more than once every 2 seconds
            return false;
        }
        
        // If user manually interacted recently (pan/zoom), skip auto-pan for a grace period
        if (!this.userInteractionTimestamps) this.userInteractionTimestamps = {};
        const lastUserMove = this.userInteractionTimestamps.move || 0;
        const lastUserZoom = this.userInteractionTimestamps.zoom || 0;
        const sinceUserActionMs = now - Math.max(lastUserMove, lastUserZoom);
        if (sinceUserActionMs < 5000) {
            return false;
        }

        // Simple approach: just center the map on the train if it's getting close to edges
        const mapCenter = this.trainMonitor.map.getCenter();
        
        // Calculate distance from train to map center
        const distanceToCenter = this.trainMonitor.map.distance(mapCenter, trainLatLng);
        const mapSize = this.trainMonitor.map.getSize();
        
        // If train is more than 40% of map size away from center, pan to it
        const maxDistance = Math.min(mapSize.x, mapSize.y) * 0.2;
        
        // Debug for train 12461
        if (this.trainMonitor.isDebugTrain(this.trainMonitor.currentTrainNumber) && Math.random() < 0.02) {
            console.log(`🗺️ autoPanToKeepTrainVisible: distanceToCenter=${distanceToCenter.toFixed(2)}m, maxDistance=${maxDistance.toFixed(2)}px, shouldPan=${distanceToCenter > maxDistance}`);
        }
        
        if (distanceToCenter > maxDistance) {
            // Simply pan to the train position
            this.trainMonitor.map.panTo(trainLatLng, {
                animate: true,
                duration: 0.5
            });
            
            // Update the last pan time
            this.lastAutoPanTime = Date.now();
            
            // console.log('🗺️ Simple auto-panning to train:', {
            //     trainLatLng: trainLatLng,
            //     mapCenter: mapCenter,
            //     distanceToCenter: distanceToCenter,
            //     maxDistance: maxDistance,
            //     mapSize: mapSize
            // });
            
            return true;
        }
        
        return false;
    }

    // Hook to record user pan/zoom so we can avoid auto-panning afterwards
    attachUserPanZoomGuards() {
        if (!this.trainMonitor || !this.trainMonitor.map) return;
        if (!this.userInteractionTimestamps) this.userInteractionTimestamps = {};
        const updateMove = () => { this.userInteractionTimestamps.move = Date.now(); };
        const updateZoom = () => { this.userInteractionTimestamps.zoom = Date.now(); };
        this.trainMonitor.map.on('dragstart', updateMove);
        this.trainMonitor.map.on('move', updateMove);
        this.trainMonitor.map.on('zoomstart', updateZoom);
        this.trainMonitor.map.on('zoomend', updateZoom);
    }

    /**
     * Update progress bar
     */
    updateProgressBar() {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        if (!progressFill || !progressText) {
            return;
        }
        
        if (this.trainMonitor.stations.length === 0) {
            progressFill.style.width = '0%';
            progressText.textContent = '0%';
            return;
        }
        
        const progress = (this.trainMonitor.currentStationIndex / (this.trainMonitor.stations.length - 1)) * 100;
        const roundedProgress = Math.round(progress);
        
        progressFill.style.width = `${roundedProgress}%`;
        progressText.textContent = `${roundedProgress}%`;
    }

    /**
     * Show dropdown
     */
    showDropdown() {
        // console.log('🔧 showDropdown called');
        
        const dropdown = document.getElementById('trainDropdown');
        const dropdownToggle = document.getElementById('dropdownToggle');
        
        // console.log('🔧 Dropdown elements for show:', {
        //     dropdown: !!dropdown,
        //     dropdownToggle: !!dropdownToggle
        // });
        
        if (dropdown) {
            dropdown.style.display = 'block';
            this.trainMonitor.isDropdownOpen = true;
            // console.log('📋 Train dropdown shown, isDropdownOpen:', this.trainMonitor.isDropdownOpen);
        }
        
        if (dropdownToggle) {
            dropdownToggle.classList.add('active');
            // console.log('📋 Dropdown toggle marked as active');
        }
    }

    /**
     * Hide dropdown
     */
    hideDropdown() {
        // console.log('🔧 hideDropdown called');
        
        const dropdown = document.getElementById('trainDropdown');
        const dropdownToggle = document.getElementById('dropdownToggle');
        
        if (dropdown) {
            dropdown.style.display = 'none';
            this.trainMonitor.isDropdownOpen = false;
            // console.log('📋 Train dropdown hidden, isDropdownOpen:', this.trainMonitor.isDropdownOpen);
        }
        
        if (dropdownToggle) {
            dropdownToggle.classList.remove('active');
            // console.log('📋 Dropdown toggle marked as inactive');
        }
        
        this.trainMonitor.highlightedIndex = -1;
    }

    /**
     * Show all trains in dropdown list
     */
    showAllTrainsInDropdown() {
        // console.log('🔧 showAllTrainsInDropdown called');
        
        const dropdown = document.getElementById('trainDropdown');
        let optionsContainer = dropdown ? dropdown.querySelector('.dropdown-options') : null;
        
        // console.log('🔧 Dropdown elements:', {
        //     dropdown: !!dropdown,
        //     optionsContainer: !!optionsContainer
        // });
        
        if (!dropdown) {
            // console.error('❌ Dropdown not found');
            return;
        }
        
        // Create options container if it doesn't exist
        if (!optionsContainer) {
            // console.log('🔧 Creating missing dropdown-options container in showAllTrainsInDropdown');
            optionsContainer = document.createElement('div');
            optionsContainer.className = 'dropdown-options';
            dropdown.appendChild(optionsContainer);
        }
        
        // Clear existing options
        optionsContainer.innerHTML = '';
        
        // Get trains to show
        const trainsToShow = this.trainMonitor.filteredTrainOptions || this.trainMonitor.allTrainOptions;
        
        // console.log('🔧 Train options:', {
        //     filteredTrainOptions: this.trainMonitor.filteredTrainOptions,
        //     allTrainOptions: this.trainMonitor.allTrainOptions,
        //     trainsToShow: trainsToShow,
        //     isArray: Array.isArray(trainsToShow),
        //     length: trainsToShow ? trainsToShow.length : 0
        // });
        
        // Check if trains are loaded
        if (!trainsToShow || !Array.isArray(trainsToShow)) {
            // console.log('⚠️ Train options not loaded yet, skipping show all');
            return;
        }
        
        // console.log(`🔧 Adding ${trainsToShow.length} options to dropdown`);
        
        // Add all options to dropdown
        trainsToShow.forEach((option, index) => {
            // console.log(`🔧 Adding option ${index}:`, option);
            const optionElement = document.createElement('div');
            optionElement.className = 'dropdown-option';
            optionElement.textContent = option.label;
            optionElement.dataset.value = option.value;
            
            optionElement.addEventListener('click', async () => {
                // console.log('🔧 Option clicked:', option);
                await this.selectOption(option);
            });
            
            optionsContainer.appendChild(optionElement);
        });
        
        this.showDropdown();
    }

    /**
     * Show all trains on the map
     */

    /**
     * Select train from searchable select
     */
    async selectTrainFromSearchableSelect() {
        const searchableSelect = document.getElementById('trainSearchSelect');
        if (!searchableSelect) {
            console.error('❌ Searchable select element not found');
            return;
        }
        
        // Use the stored selected value instead of input value
        const selectedValue = this.trainMonitor.selectedTrainValue;
        if (!selectedValue) {
            console.log('📋 No train selected from searchable select');
            return;
        }
        
        console.log(`📋 Train selected from searchable select: ${selectedValue}`);
        
        // Use the integration point in train monitoring
        await this.trainMonitor.selectTrainFromSearchableSelect();
    }

    /**
     * Select train from dropdown
     */
    async selectTrainFromDropdown() {
        const dropdown = document.getElementById('trainDropdown');
        if (!dropdown) {
            // console.error('❌ Train dropdown element not found');
            return;
        }
        
        const selectedValue = dropdown.value;
        if (!selectedValue) {
            // console.log('📋 No train selected from dropdown');
            return;
        }
        
        // console.log(`📋 Train selected from dropdown: ${selectedValue}`);
        await this.trainMonitor.selectTrainFromDropdown();
    }


    /**
     * Initialize searchable select functionality
     */
    initializeSearchableSelect() {
        // console.log('🔧 Initializing searchable select...');
        
        const input = document.getElementById('trainSearchSelect');
        const dropdown = document.getElementById('trainDropdown');
        const dropdownToggle = document.getElementById('dropdownToggle');
        const optionsContainer = dropdown ? dropdown.querySelector('.dropdown-options') : null;
        
        // console.log('🔧 Elements found:', {
        //     input: !!input,
        //     dropdown: !!dropdown,
        //     dropdownToggle: !!dropdownToggle,
        //     optionsContainer: !!optionsContainer
        // });
        
        if (dropdown) {
            // console.log('🔧 Dropdown HTML:', dropdown.innerHTML);
            // console.log('🔧 Dropdown children:', dropdown.children);
            // console.log('🔧 Dropdown querySelector result:', dropdown.querySelector('.dropdown-options'));
        }
        
        if (!input || !dropdown) {
            // console.error('❌ Required elements not found for searchable select');
            return;
        }
        
        // Create options container if it doesn't exist
        if (!optionsContainer) {
            // console.log('🔧 Creating missing dropdown-options container');
            optionsContainer = document.createElement('div');
            optionsContainer.className = 'dropdown-options';
            dropdown.appendChild(optionsContainer);
        }
        
        // Initialize dropdown state
        this.trainMonitor.isDropdownOpen = false;
        this.trainMonitor.highlightedIndex = -1;
        
        // Input change handler
        input.addEventListener('input', (e) => {
            // console.log('🔧 Input changed:', e.target.value);
            // Clear selected value when user manually types
            this.trainMonitor.selectedTrainValue = '';
            this.filterAndShowOptions(e.target.value);
        });
        
        input.addEventListener('focus', () => {
            // console.log('🔧 Input focused');
            // When focusing on input, show filtered results based on current text
            this.filterAndShowOptions(input.value);
        });
        
        input.addEventListener('keydown', async (e) => {
            // console.log('🔧 Key pressed:', e.key);
            await this.handleKeydown(e);
        });
        
        // Dropdown arrow click - show dropdown list
        if (dropdownToggle) {
            dropdownToggle.addEventListener('click', (e) => {
                // console.log('🔧 Dropdown toggle clicked, current state:', this.trainMonitor.isDropdownOpen);
                e.preventDefault();
                e.stopPropagation();
                if (this.trainMonitor.isDropdownOpen) {
                    this.hideDropdown();
                } else {
                    this.showAllTrainsInDropdown();
                }
            });
        }
        
        // Click outside to close dropdown
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !input.contains(e.target) && 
                (!dropdownToggle || !dropdownToggle.contains(e.target))) {
                this.hideDropdown();
            }
        });
        
        // Prevent dropdown from closing when clicking inside
        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        // console.log('✅ Searchable select initialized');
    }

    /**
     * Filter and show options in dropdown
     * @param {string} searchTerm - Search term to filter by
     */
    filterAndShowOptions(searchTerm) {
        // console.log('🔧 filterAndShowOptions called with:', searchTerm);
        
        const input = document.getElementById('trainSearchSelect');
        const dropdown = document.getElementById('trainDropdown');
        let optionsContainer = dropdown ? dropdown.querySelector('.dropdown-options') : null;
        
        // console.log('🔧 Filter elements:', {
        //     input: !!input,
        //     dropdown: !!dropdown,
        //     optionsContainer: !!optionsContainer
        // });
        
        if (!input || !dropdown) {
            // console.error('❌ Missing input or dropdown for filterAndShowOptions');
            return;
        }
        
        // Create options container if it doesn't exist
        if (!optionsContainer) {
            // console.log('🔧 Creating missing dropdown-options container in filterAndShowOptions');
            optionsContainer = document.createElement('div');
            optionsContainer.className = 'dropdown-options';
            dropdown.appendChild(optionsContainer);
        }
        
        // Clear existing options
        optionsContainer.innerHTML = '';
        
        // Get trains to filter from
        const trainsToFilter = this.trainMonitor.filteredTrainOptions || this.trainMonitor.allTrainOptions;
        
        // console.log('🔧 Trains to filter:', {
        //     filteredTrainOptions: this.trainMonitor.filteredTrainOptions,
        //     allTrainOptions: this.trainMonitor.allTrainOptions,
        //     trainsToFilter: trainsToFilter,
        //     isArray: Array.isArray(trainsToFilter),
        //     length: trainsToFilter ? trainsToFilter.length : 0
        // });
        
        // Check if trains are loaded
        if (!trainsToFilter || !Array.isArray(trainsToFilter)) {
            // console.log('⚠️ Train options not loaded yet, skipping filter');
            return;
        }
        
        // Filter trains based on search term
        const filteredTrains = trainsToFilter.filter(option => {
            if (!searchTerm) return true;
            
            const searchLower = searchTerm.toLowerCase();
            return option.label.toLowerCase().includes(searchLower) || 
                   option.value.toLowerCase().includes(searchLower);
        });
        
        // console.log(`🔧 Filtered ${filteredTrains.length} trains from ${trainsToFilter.length} total`);
        
        // Add filtered options to dropdown
        filteredTrains.forEach((option, index) => {
            // console.log(`🔧 Adding filtered option ${index}:`, option);
            const optionElement = document.createElement('div');
            optionElement.className = 'dropdown-option';
            optionElement.textContent = option.label;
            optionElement.dataset.value = option.value;
            
            optionElement.addEventListener('click', async () => {
                // console.log('🔧 Filtered option clicked:', option);
                await this.selectOption(option);
            });
            
            optionsContainer.appendChild(optionElement);
        });
        
        // Show dropdown if there are options
        if (filteredTrains.length > 0) {
            // console.log('🔧 Showing dropdown with filtered results');
            this.showDropdown();
        } else {
            // console.log('🔧 Hiding dropdown - no filtered results');
            this.hideDropdown();
        }
    }

    /**
     * Handle keyboard navigation in dropdown
     * @param {KeyboardEvent} e - Keyboard event
     */
    async handleKeydown(e) {
        const dropdown = document.getElementById('trainDropdown');
        const options = dropdown.querySelectorAll('.dropdown-option');
        const activeOption = dropdown.querySelector('.dropdown-option.highlighted');
        
        let activeIndex = -1;
        if (activeOption) {
            activeIndex = Array.from(options).indexOf(activeOption);
        }
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                activeIndex = Math.min(activeIndex + 1, options.length - 1);
                this.highlightOption(options[activeIndex]);
                break;
            case 'ArrowUp':
                e.preventDefault();
                activeIndex = Math.max(activeIndex - 1, 0);
                this.highlightOption(options[activeIndex]);
                break;
            case 'Enter':
                e.preventDefault();
                if (activeOption) {
                    await this.selectOption({
                        value: activeOption.dataset.value,
                        text: activeOption.textContent
                    });
                }
                break;
            case 'Escape':
                this.hideDropdown();
                break;
        }
    }

    /**
     * Highlight option in dropdown
     * @param {HTMLElement} option - Option element to highlight
     */
    highlightOption(option) {
        // Remove existing highlights
        document.querySelectorAll('.dropdown-option.highlighted').forEach(el => {
            el.classList.remove('highlighted');
        });
        
        // Add highlight to selected option
        if (option) {
            option.classList.add('highlighted');
            option.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Select option from dropdown
     * @param {Object} option - Selected option object
     */
    async selectOption(option) {
        const input = document.getElementById('trainSearchSelect');
        if (input) {
            input.value = option.text;
        }
        
        this.trainMonitor.selectedTrainValue = option.value;
        this.hideDropdown();
        
        // console.log(`Selected: ${option.value}`);
        
        // Don't load immediately - let the Select Train button handle it
        // This prevents multiple calls when both selectOption and Select Train button are triggered
    }
}

// Make UIControls available globally
window.UIControls = UIControls;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIControls;
}
