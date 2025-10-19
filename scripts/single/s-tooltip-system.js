/**
 * Train Monitoring System - Tooltip System Module
 * Handles tooltips, hints, and popup content for train and station markers
 */

class TooltipSystem {
    constructor(trainMonitor) {
        this.trainMonitor = trainMonitor;
    }

    /**
     * Add train number hint to a marker
     * @param {L.Marker} marker - Leaflet marker
     * @param {string} trainNumber - Train number to display
     */
    addTrainNumberHint(marker, trainNumber) {
        // Create a hint element for the train number
        const hintElement = document.createElement('div');
        hintElement.className = 'train-number-hint';
        hintElement.textContent = trainNumber;
        hintElement.style.display = 'none';
        
        // Add to marker for reference
        marker._trainNumberHint = hintElement;
        
        // Position the hint when marker or map moves (RAF throttled)
        let rafId = null;
        const doUpdate = () => {
            rafId = null;
            if (marker && this.trainMonitor.map.hasLayer(marker)) {
                const latLng = marker.getLatLng();
                const point = this.trainMonitor.map.latLngToContainerPoint(latLng);
                
                // Check if marker is visible in current map bounds
                const mapBounds = this.trainMonitor.map.getBounds();
                const isVisible = mapBounds.contains(latLng);
                
                if (isVisible) {
                    // Get map container position
                    const mapContainer = this.trainMonitor.map.getContainer();
                    const mapRect = mapContainer.getBoundingClientRect();
                    
                    // Position hint above the marker
                    hintElement.style.position = 'absolute';
                    hintElement.style.left = (mapRect.left + point.x) + 'px';
                    hintElement.style.top = (mapRect.top + point.y - 25) + 'px';
                    hintElement.style.display = 'block';
                    
                    // Center horizontally
                    hintElement.style.transform = 'translateX(-50%)';
                    
                    // Add to document body if not already added
                    if (!hintElement.parentNode) {
                        document.body.appendChild(hintElement);
                    }
                } else {
                    hintElement.style.display = 'none';
                }
            }
        };
        const updateHintPosition = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(doUpdate);
        };
        
        // Update position on marker and map events
        if (marker.on) {
            marker.on('move', updateHintPosition);
        }
        this.trainMonitor.map.on('move', updateHintPosition);
        this.trainMonitor.map.on('moveend', updateHintPosition);
        this.trainMonitor.map.on('zoomend', updateHintPosition);
        
        // Initial position
        doUpdate();
    }

    /**
     * Remove train number hint from a marker
     * @param {L.Marker} marker - Leaflet marker
     */
    removeTrainNumberHint(marker) {
        if (marker._trainNumberHint) {
            // Check if the element is actually a child before removing
            if (marker._trainNumberHint.parentNode) {
                marker._trainNumberHint.parentNode.removeChild(marker._trainNumberHint);
            }
            marker._trainNumberHint = null;
        }
    }

    /**
     * Update all train hints visibility and position
     */
    updateAllTrainHints() {
        // Update hints for single train mode
        if (this.trainMonitor.trainMarker && this.trainMonitor.trainMarker._trainNumberHint) {
            const updateHint = () => {
                if (this.trainMonitor.trainMarker && this.trainMonitor.map.hasLayer(this.trainMonitor.trainMarker)) {
                    const latLng = this.trainMonitor.trainMarker.getLatLng();
                    const point = this.trainMonitor.map.latLngToContainerPoint(latLng);
                    
                    // Check if marker is visible in current map bounds
                    const mapBounds = this.trainMonitor.map.getBounds();
                    const isVisible = mapBounds.contains(latLng);
                    
                    if (isVisible) {
                        // Get map container position
                        const mapContainer = this.trainMonitor.map.getContainer();
                        const mapRect = mapContainer.getBoundingClientRect();
                        
                        // Position hint above the marker
                        const hintElement = this.trainMonitor.trainMarker._trainNumberHint;
                        hintElement.style.position = 'absolute';
                        hintElement.style.left = (mapRect.left + point.x) + 'px';
                        hintElement.style.top = (mapRect.top + point.y - 25) + 'px';
                        hintElement.style.display = 'block';
                        hintElement.style.transform = 'translateX(-50%)';
                        
                        // Add to document body if not already added
                        if (!hintElement.parentNode) {
                            document.body.appendChild(hintElement);
                        }
                    } else {
                        this.trainMonitor.trainMarker._trainNumberHint.style.display = 'none';
                    }
                }
            };
            updateHint();
        }        
    }

    /**
     * Create a simple train tooltip content
     * @returns {string} HTML content for tooltip
     */
    createSingleTrainTooltip() {
        const status = this.trainMonitor.isRunning ? (this.trainMonitor.isPaused ? 'Paused' : 'Running') : 'Stopped';
        const speed = this.trainMonitor.isRunning ? `${Math.round(this.trainMonitor.currentSpeed || 0)} km/h` : '0 km/h';
        const currentStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex]?.name || 'Unknown';
        const progress = this.trainMonitor.stations.length > 0 ? `${this.trainMonitor.currentStationIndex + 1}/${this.trainMonitor.stations.length}` : '0/0';
        
        return `<div style="text-align: center; font-family: 'Segoe UI', sans-serif; min-width: 200px;">
            <h4 style="margin: 0 0 8px 0; color: #2c3e50; font-size: 16px;">🚂 Train ${this.trainMonitor.currentTrainNumber}</h4>
            <div style="background: #f8f9fa; border-radius: 6px; padding: 10px; margin: 6px 0;">
                <div style="margin: 4px 0;"><strong>Status:</strong> ${status}</div>
                <div style="margin: 4px 0;"><strong>Speed:</strong> ${speed}</div>
                <div style="margin: 4px 0;"><strong>Current Station:</strong> ${currentStation}</div>
                <div style="margin: 4px 0;"><strong>Progress:</strong> ${progress}</div>
            </div>
        </div>`;
    }

    /**
     * Set up click tooltip for a marker
     * @param {L.Marker} marker - Leaflet marker
     */
    setupClickTooltip(marker) {
        if (!marker) return;
        
        // Clean up any existing tooltip
        if (marker._tooltipElement) {
            marker._tooltipElement.remove();
        }
        
        // Create tooltip element
        const tooltipElement = document.createElement('div');
        tooltipElement.className = 'simple-tooltip';
        tooltipElement.style.display = 'none';
        tooltipElement.style.opacity = '0';
        
        document.body.appendChild(tooltipElement);
        marker._tooltipElement = tooltipElement;
        
        // Click handler
        marker.on('click', (e) => {
            console.log(`🔧 DEBUG: Train marker clicked - trainNumber: ${marker._trainNumber}, markerType: ${marker._markerType}`);
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

    /**
     * Show click tooltip
     * @param {L.Marker} marker - Leaflet marker
     * @param {HTMLElement} tooltipElement - Tooltip DOM element
     */
    showClickTooltip(marker, tooltipElement) {
        // Hide any other open tooltips
        document.querySelectorAll('.simple-tooltip').forEach(tooltip => {
            if (tooltip !== tooltipElement) {
                this.hideClickTooltip(tooltip);
            }
        });
        
        // Update content
        this.updateClickTooltipContent(marker, tooltipElement);
        
        // Position tooltip
        this.positionClickTooltip(marker, tooltipElement);
        
        // Show tooltip
        tooltipElement.style.display = 'block';
        tooltipElement.style.opacity = '1';
    }

    /**
     * Hide click tooltip
     * @param {HTMLElement} tooltipElement - Tooltip DOM element
     */
    hideClickTooltip(tooltipElement) {
        tooltipElement.style.opacity = '0';
        setTimeout(() => {
            tooltipElement.style.display = 'none';
        }, 200);
    }

    /**
     * Update tooltip content based on marker type
     * @param {L.Marker} marker - Leaflet marker
     * @param {HTMLElement} tooltipElement - Tooltip DOM element
     */
    updateClickTooltipContent(marker, tooltipElement) {
        console.log(`🔧 DEBUG: Updating tooltip content for marker:`, {
            markerType: marker._markerType,
            trainNumber: marker._trainNumber,
            hasTrainData: !!marker._trainData
        });
        
        let content = '';
        
        if (marker._markerType === 'station') {
            // Station marker
            console.log(`🔧 DEBUG: Processing station marker tooltip`);
            const s = marker._stationData;
            if (s) {
                console.log(`🔧 DEBUG: Station data found:`, s);
                // Minimal view for multi-train markers only (identified by trainsPassing array)
                if (Array.isArray(s.trainsPassing)) {
                    const trains = s.trainsPassing.length > 0 ? s.trainsPassing.join(', ') : '—';
                    content = `
                        <button class="tooltip-close" onclick="this.parentElement.style.opacity='0'; setTimeout(() => this.parentElement.style.display='none', 200);">×</button>
                        <div class="tooltip-section">
                            <div class="info-row"><strong>${s.code}</strong><span style="margin-left:8px;">${s.name}</span></div>
                            <div class="info-row"><strong>Trains:</strong><span>${trains}</span></div>
                            <div class="info-row"><strong>Lat/Lng:</strong><span style="font-family: monospace;">${s.lat?.toFixed(6) || 'N/A'}, ${s.lng?.toFixed(6) || 'N/A'}</span></div>
                        </div>
                    `;
                } else {
                    // Default detailed view (single-train station tooltip)
                    content = `
                        <button class="tooltip-close" onclick="this.parentElement.style.opacity='0'; setTimeout(() => this.parentElement.style.display='none', 200);">×</button>
                        <h4>🚉 ${s.name}</h4>
                        <div class="tooltip-section">
                            <div class="info-row"><strong>Station Code:</strong><span>${s.code}</span></div>
                            ${marker._trainNumber ? `<div class="info-row"><strong>Train:</strong><span>${marker._trainNumber}</span></div>` : ''}
                            <div class="info-row"><strong>Sequence:</strong><span>${s.sequence || 'N/A'}</span></div>
                            <div class="info-row"><strong>Platform:</strong><span>${s.platformNumber || 'TBD'}</span></div>
                            <div class="info-row"><strong>Distance:</strong><span>${s.distance || 0} km</span></div>
                            <div class="info-row"><strong>Arrival:</strong><span>${s.arrival || '--:--:--'}</span></div>
                            <div class="info-row"><strong>Departure:</strong><span>${s.departure || '--:--:--'}</span></div>
                            ${s.haltTime > 0 ? `<div class=\"info-row\"><strong>Halt Time:</strong><span>${s.haltTime} min</span></div>` : ''}
                        </div>
                        <div class="coordinates-section">
                            <div class="coordinates-row"><span class="coordinates-label">Coordinates:</span><span class="coordinates-value">${s.lat?.toFixed(6) || 'N/A'}°, ${s.lng?.toFixed(6) || 'N/A'}°</span></div>
                        </div>
                    `;
                }
            }
        } else {
            // Train marker
            console.log(`🔧 DEBUG: Getting train data for tooltip...`);
            const trainData = this.getClickTooltipTrainData(marker);
            console.log(`🔧 DEBUG: Train data result:`, trainData);
            
            if (trainData) {
                // Get marker coordinates for debugging
                const markerLatLng = marker.getLatLng();
                const coordinates = `lat=${markerLatLng.lat.toFixed(6)}, lng=${markerLatLng.lng.toFixed(6)}`;
                
                content = `
                    <button class="tooltip-close" onclick="this.parentElement.style.opacity='0'; setTimeout(() => this.parentElement.style.display='none', 200);">×</button>
                    <h4>🚂 Train ${trainData.trainNumber}</h4>
                    <div class="tooltip-section">
                        <div class="info-row">
                            <strong>Name:</strong>
                            <span>${trainData.trainName}</span>
                        </div>
                        <div class="info-row">
                            <strong>Route:</strong>
                            <span>${trainData.source} → ${trainData.destination}</span>
                        </div>
                        <div class="info-row">
                            <strong>Current Station:</strong>
                            <span>${trainData.currentStation}</span>
                        </div>
                        <div class="info-row">
                            <strong>Next Station:</strong>
                            <span>${trainData.nextStation}</span>
                        </div>
                        <div class="info-row">
                            <strong>Progress:</strong>
                            <span>${this.getProgressDisplay(trainData)}</span>
                        </div>
                        <div class="info-row">
                            <strong>Coordinates:</strong>
                            <span style="font-family: monospace; font-size: 11px;">${coordinates}</span>
                        </div>
                        <div class="info-row">
                            <strong>Status:</strong>
                            <span>${this.getClickTooltipStatus(marker, trainData)}</span>
                        </div>
                        <div class="info-row">
                            <strong>Speed:</strong>
                            <span>${this.getClickTooltipCurrentSpeed(marker)} km/h</span>
                        </div>
                    </div>
                    <div class="tooltip-actions" style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e9ecef;">
                        <div class="coach-selector" style="flex: 1; margin-right: 12px;">
                            <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Coach:</label>
                            <select style="width: 100%; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: white;">
                                <option value="A1">A1</option>
                                <option value="A2">A2</option>
                                <option value="A3">A3</option>
                                <option value="B1">B1</option>
                                <option value="B2">B2</option>
                                <option value="B3">B3</option>
                                <option value="C1">C1</option>
                                <option value="C2">C2</option>
                            </select>
                        </div>
                        <div class="alert-icons" style="margin-right: 12px;">
                            <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 4px;">Alerts:</label>
                            <button class="alert-icon-btn" title="Water tank alerts for service needs" style="background: #17a2b866; border: none; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 14px; color: white;" onclick="window.raiseTrainAlert('${trainData.trainNumber}', 'water_tank', this.parentElement.parentElement.querySelector('select').value)">💧</button>
                            <button class="alert-icon-btn" title="Breakdown alerts for mechanical issues" style="background: #ffc10766; border: none; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 14px; color: #212529;" onclick="window.raiseTrainAlert('${trainData.trainNumber}', 'breakdown', this.parentElement.parentElement.querySelector('select').value)">🔧</button>
                            <button class="alert-icon-btn" title="AC malfunction alerts for comfort issues" style="background: #6f42c166; border: none; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 14px; color: white;" onclick="window.raiseTrainAlert('${trainData.trainNumber}', 'ac_malfunction', this.parentElement.parentElement.querySelector('select').value)">❄️</button>
                            <button class="alert-icon-btn" title="Emergency alerts for critical situations" style="background: #dc354566; border: none; border-radius: 4px; padding: 6px; cursor: pointer; font-size: 14px; color: white;" onclick="window.raiseTrainAlert('${trainData.trainNumber}', 'emergency', this.parentElement.parentElement.querySelector('select').value)">🚨</button>
                        </div>
                    </div>
                `;
            }
        }
        
        if (!content) {
            console.warn(`⚠️ DEBUG: No content generated for tooltip! Marker type: ${marker._markerType}, Train number: ${marker._trainNumber}`);
            
            if (marker._markerType === 'station') {
                content = `
                    <div class="tooltip-section" style="text-align: center;">
                        <h4>🚉 Station Marker</h4>
                        <p>This is a station marker. Click on the train icon (🚂) to see train information.</p>
                        <p><small>Station markers show station details, train markers show train details.</small></p>
                    </div>
                `;
            } else {
                content = '<div class="tooltip-section" style="text-align: center;">No data available</div>';
            }
        }
        
        console.log(`🔧 DEBUG: Final tooltip content length: ${content.length} characters`);
        tooltipElement.innerHTML = content;
    }

    /**
     * Position tooltip relative to marker
     * @param {L.Marker} marker - Leaflet marker
     * @param {HTMLElement} tooltipElement - Tooltip DOM element
     */
    positionClickTooltip(marker, tooltipElement) {
        try {
            if (!marker || !tooltipElement || !this.trainMonitor.map) return;
            
            // Get marker position in container coordinates
            const markerPoint = this.trainMonitor.map.latLngToContainerPoint(marker.getLatLng());
            
            // Get map container position
            const mapContainer = this.trainMonitor.map.getContainer();
            const mapRect = mapContainer.getBoundingClientRect();
            
            // Calculate tooltip position
            const tooltipWidth = 300; // Max width from CSS
            const tooltipHeight = 200; // Estimated height
            const offset = 10;
            
            let left = mapRect.left + markerPoint.x + offset;
            let top = mapRect.top + markerPoint.y - tooltipHeight - offset;
            
            // Adjust if tooltip would go off screen
            if (left + tooltipWidth > window.innerWidth) {
                left = mapRect.left + markerPoint.x - tooltipWidth - offset;
            }
            
            if (top < 0) {
                top = mapRect.top + markerPoint.y + offset;
            }
            
            tooltipElement.style.left = left + 'px';
            tooltipElement.style.top = top + 'px';
        } catch (error) {
            // console.error('Error positioning tooltip:', error);
        }
    }

    /**
     * Get train data for tooltip
     * @param {L.Marker} marker - Leaflet marker
     * @returns {Object|null} Train data object
     */
    getClickTooltipTrainData(marker) {
        // Get train data based on marker type
        if (marker === this.trainMonitor.trainMarker) {
            // Single train mode
            const sourceStation = this.trainMonitor.stations && this.trainMonitor.stations[0] ? this.trainMonitor.stations[0].name : 'Unknown';
            const destinationStation = this.trainMonitor.stations && this.trainMonitor.stations.length > 0 ? 
                this.trainMonitor.stations[this.trainMonitor.stations.length - 1].name : 'Unknown';
            
            // Get current and next station information
            const currentStationIndex = this.trainMonitor.currentStationIndex || 0;
            const currentStation = this.trainMonitor.stations && this.trainMonitor.stations[currentStationIndex] ? 
                this.trainMonitor.stations[currentStationIndex].name : 'Unknown';
            
            // Check if train has reached final destination
            const isAtFinalStation = currentStationIndex >= (this.trainMonitor.stations ? this.trainMonitor.stations.length - 1 : 0);
            const nextStation = isAtFinalStation ? 'Journey Completed' : 
                (this.trainMonitor.stations && this.trainMonitor.stations[currentStationIndex + 1] ? 
                this.trainMonitor.stations[currentStationIndex + 1].name : 'Destination');
            
            return {
                trainNumber: this.trainMonitor.currentTrainNumber || 'Unknown',
                trainName: this.trainMonitor.currentTrainName || 'Unknown Train',
                source: sourceStation,
                destination: destinationStation,
                currentStation: currentStation,
                nextStation: nextStation,
                currentStationIndex: currentStationIndex,
                totalStations: this.trainMonitor.stations ? this.trainMonitor.stations.length : 0
            };
        }
        return null;
    }

    /**
     * Get current speed for tooltip
     * @param {L.Marker} marker - Leaflet marker
     * @returns {number} Current speed in km/h
     */
    getClickTooltipCurrentSpeed(marker) {
        // Get current speed for train marker
        if (marker === this.trainMonitor.trainMarker) {
            return this.trainMonitor.currentSpeed || 0;
        } else {
            // All train states removed - single train mode only
        }
        return 0;
    }

    /**
     * Get status for tooltip
     * @param {L.Marker} marker - Leaflet marker
     * @param {Object} trainData - Train data object
     * @returns {string} Status string
     */
    getClickTooltipStatus(marker, trainData) {
        // Check if train has reached final destination
        const isAtFinalStation = trainData.currentStationIndex >= trainData.totalStations - 1;
        
        if (isAtFinalStation) {
            return 'Completed';
        } else if (marker === this.trainMonitor.trainMarker) {
            return this.trainMonitor.isRunning ? 'Running' : 'Stopped';
        } else {
            const trainNumber = marker._trainNumber;
            // All train states removed - single train mode only
            return 'Running'; // Default for all trains mode
        }
    }

    /**
     * Get progress display string for tooltip
     * @param {Object} trainData - Train data object
     * @returns {string} Progress display string
     */
    getProgressDisplay(trainData) {
        if (!trainData || !trainData.totalStations) {
            return '0/0';
        }

        // Check if this is a multi-train marker with journeyCompleted flag
        const trainNumber = trainData.trainNumber;
        if (trainNumber && window.multiTrainSystem && window.multiTrainSystem.simulationEngine && 
            window.multiTrainSystem.simulationEngine.multiTrainManager) {
            const state = window.multiTrainSystem.simulationEngine.multiTrainManager.trainStates.get(trainNumber);
            if (state && state.journeyCompleted) {
                // Show n/n when journey is completed
                return `${trainData.totalStations}/${trainData.totalStations}`;
            }
        }

        // Default progress calculation
        return `${trainData.currentStationIndex + 1}/${trainData.totalStations}`;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TooltipSystem;
}
