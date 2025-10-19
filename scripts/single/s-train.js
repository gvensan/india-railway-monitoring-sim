/**
 * Individual Train Class - Handles all logic for a single train
 * Maintains independence while allowing global coordination
 */
class Train {
    constructor(trainNumber, trainData, trainMonitor) {
        this.trainNumber = trainNumber;
        this.trainData = trainData;
        this.trainMonitor = trainMonitor;
        
        // Train state
        this.currentStationIndex = 0;
        this.currentPosition = {
            lat: trainData.route[0].lat,
            lng: trainData.route[0].lng
        };
        this.currentSpeed = 15; // Start with higher initial speed to ensure movement
        this.isAtStation = false;
        this.stationStopStartTime = null;
        this.journeyCompleted = false; // Track if train has reached final destination
        
        // Physics constants
        this.maxSpeed = trainMonitor.maxSpeed;
        this.decelerationDistance = 2; // Start decelerating 2km before station
        
        // Debug flag for specific train (12462 only)
        this.isDebugTrain = parseInt(trainNumber) === 12462;
    }

    /**
     * Update train physics (speed, acceleration, deceleration)
     */
    updatePhysics() {
        if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} physics START: isAtStation=${this.isAtStation}, currentSpeed=${this.currentSpeed}, stationIndex=${this.currentStationIndex}`);
        }

        // Don't update physics if train is stopped at a station
        if (this.isAtStation) {
            this.currentSpeed = 0;
            if (this.isDebugTrain) {
                console.log(`🔧 Train ${this.trainNumber} physics: stopped at station, speed=0`);
            }
            return;
        }

        const nextStation = this.getNextStation();
        if (!nextStation) {
            // At destination
            this.currentSpeed = 0;
            return;
        }

        // Calculate distance to next station
        const distanceToNext = this.calculateDistance(
            this.currentPosition.lat,
            this.currentPosition.lng,
            nextStation.lat,
            nextStation.lng
        );

        if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} physics CALC: distanceToNext=${distanceToNext.toFixed(3)}km, targetSpeed=${this.maxSpeed}km/h, decelerationDistance=${this.decelerationDistance}km, currentSpeed=${this.currentSpeed}km/h`);
        }

        // Special case: If train is very close to starting station and has zero speed, start accelerating
        // BUT only if we're not already at the station (isAtStation should be false)
        if (distanceToNext <= 0.5 && this.currentSpeed === 0 && this.currentStationIndex === 0 && !this.isAtStation) {
            // Initial acceleration from starting station
            const oldSpeed = this.currentSpeed;
            this.currentSpeed = Math.min(this.currentSpeed + 10, this.maxSpeed);
            if (this.isDebugTrain) {
                console.log(`🔧 Train ${this.trainNumber} physics INITIAL_ACCEL: ${oldSpeed}km/h → ${this.currentSpeed}km/h (+10km/h) - starting from station`);
            }
        } else if (distanceToNext > this.decelerationDistance) {
            // More than 2km from station - maintain or accelerate to max speed
            const oldSpeed = this.currentSpeed;
            if (this.currentSpeed < this.maxSpeed) {
                // Accelerate to max speed - increased acceleration rate
                this.currentSpeed = Math.min(this.currentSpeed + 10, this.maxSpeed);
                if (this.isDebugTrain) {
                    console.log(`🔧 Train ${this.trainNumber} physics ACCEL: ${oldSpeed}km/h → ${this.currentSpeed}km/h (+10km/h)`);
                }
            } else {
                // Maintain max speed
                this.currentSpeed = this.maxSpeed;
                if (this.isDebugTrain) {
                    console.log(`🔧 Train ${this.trainNumber} physics MAINTAIN: ${oldSpeed}km/h → ${this.currentSpeed}km/h (at max)`);
                }
            }
        } else if (distanceToNext > 0.1) {
            // Within 2km of station - gradual deceleration to 0
            const decelerationFactor = (this.decelerationDistance - distanceToNext) / this.decelerationDistance;
            const targetSpeedForDeceleration = this.maxSpeed * (1 - decelerationFactor);
            
            const speedDifference = this.currentSpeed - targetSpeedForDeceleration;
            const oldSpeed = this.currentSpeed;
            
            if (speedDifference > 0) {
                // Decelerate more aggressively as we get closer
                const decelerationRate = Math.max(2, speedDifference * 0.3);
                this.currentSpeed = Math.max(this.currentSpeed - decelerationRate, targetSpeedForDeceleration);
                if (this.isDebugTrain) {
                    console.log(`🔧 Train ${this.trainNumber} physics DECEL: ${oldSpeed}km/h → ${this.currentSpeed}km/h (rate=${decelerationRate.toFixed(1)}, factor=${decelerationFactor.toFixed(3)})`);
                }
            } else {
                // Don't accelerate beyond target speed
                this.currentSpeed = Math.min(this.currentSpeed + 1, targetSpeedForDeceleration);
                if (this.isDebugTrain) {
                    console.log(`🔧 Train ${this.trainNumber} physics ADJUST: ${oldSpeed}km/h → ${this.currentSpeed}km/h (towards target=${targetSpeedForDeceleration.toFixed(1)})`);
                }
            }
        } else {
            // Very close to station (within 100m) - stop completely
            const oldSpeed = this.currentSpeed;
            this.currentSpeed = 0;
            if (this.isDebugTrain) {
                console.log(`🔧 Train ${this.trainNumber} physics STOP: ${oldSpeed}km/h → 0km/h (within 100m of station)`);
            }
            
            // If we're very close to the next station, we should arrive at it
            if (distanceToNext <= 0.1) {
                if (this.isDebugTrain) {
                    console.log(`🔧 Train ${this.trainNumber} physics: Very close to station, should arrive at it`);
                }
                // The position update will handle arriving at the station
            }
        }

        // Ensure speed doesn't go below 0
        this.currentSpeed = Math.max(0, this.currentSpeed);
    }

    /**
     * Update train position based on current speed
     */
    async updatePosition() {
        if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} position START: isAtStation=${this.isAtStation}, currentSpeed=${this.currentSpeed}km/h, stationIndex=${this.currentStationIndex}`);
        }

        // Don't move if train is stopped at a station
        if (this.isAtStation) {
            if (this.isDebugTrain) {
                console.log(`🔧 Train ${this.trainNumber} position: stopped at station, not moving`);
            }
            return;
        }

        const nextStation = this.getNextStation();
        if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} position: nextStation=${nextStation ? nextStation.name : 'null'}, journeyCompleted=${this.journeyCompleted}`);
        }
        if (!nextStation) {
            // At destination - mark journey as completed
            if (!this.journeyCompleted) {
                this.journeyCompleted = true;
                if (this.isDebugTrain) {
                    console.log(`🏁 Train ${this.trainNumber} reached final destination - no next station available, marking journey as completed!`);
                }
            }
            return;
        }

        // Calculate distance to next station
        const distanceToNext = this.calculateDistance(
            this.currentPosition.lat,
            this.currentPosition.lng,
            nextStation.lat,
            nextStation.lng
        );

        // Calculate movement distance using factor-based approach (same as single-train mode)
        // Increased base factor for better movement - was too small before
        const baseMovementFactor = (this.currentSpeed / 100) * 0.25; // reduce 1x speed in single-train
        const movementFactor = baseMovementFactor * this.trainMonitor.speed;
        let scaledMovementDistance = distanceToNext * movementFactor;
        
        // If we're very close to a station and speed is 0, allow a tiny movement to reach it
        if (this.currentSpeed === 0 && distanceToNext <= 0.1) {
            scaledMovementDistance = distanceToNext; // Move exactly the remaining distance
            if (this.isDebugTrain) {
                console.log(`🔧 Train ${this.trainNumber} movement: Allowing tiny movement to reach station, distance=${distanceToNext.toFixed(6)}km`);
            }
        }

        if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} movement CALC: speed=${this.currentSpeed}km/h, simSpeed=${this.trainMonitor.speed}x, baseFactor=${baseMovementFactor.toFixed(6)}, finalFactor=${movementFactor.toFixed(6)}, distanceToNext=${distanceToNext.toFixed(2)}km, scaledDistance=${scaledMovementDistance.toFixed(6)}km`);
            console.log(`🔧 Train ${this.trainNumber} speed debug: currentSpeed=${this.currentSpeed}, maxSpeed=${this.maxSpeed}, speedRatio=${(this.currentSpeed/this.maxSpeed).toFixed(3)}`);
        }

        // Validate movement distance
        if (isNaN(scaledMovementDistance) || scaledMovementDistance < 0 || scaledMovementDistance > 1000) {
            return;
        }

        if (scaledMovementDistance >= distanceToNext || distanceToNext <= 0.1) {
            // Reached next station (either by movement or by being very close)
            if (this.isDebugTrain) {
                console.log(`🔧 Train ${this.trainNumber} position: reached next station ${nextStation.name}, distanceToNext=${distanceToNext.toFixed(3)}km, scaledMovementDistance=${scaledMovementDistance.toFixed(6)}km`);
                console.log(`🔧 Train ${this.trainNumber} position: stationIndex will be ${this.currentStationIndex + 1}, route length: ${this.trainData.route.length}`);
            }
            await this.arriveAtStation(nextStation);
        } else {
            // Move towards next station using linear interpolation
            const latDiff = nextStation.lat - this.currentPosition.lat;
            const lngDiff = nextStation.lng - this.currentPosition.lng;
            
            const newPosition = {
                lat: this.currentPosition.lat + (latDiff * movementFactor),
                lng: this.currentPosition.lng + (lngDiff * movementFactor)
            };

            // Check for NaN values in the calculated position
            if (isNaN(newPosition.lat) || isNaN(newPosition.lng)) {
                return;
            }

            this.currentPosition = newPosition;

            if (this.isDebugTrain) {
                console.log(`🔧 Train ${this.trainNumber} position: moved to lat=${newPosition.lat.toFixed(6)}, lng=${newPosition.lng.toFixed(6)}`);
            }
        }
    }

    /**
     * Update station stop timing
     */
    async updateStationStop() {
        if (this.isAtStation && this.stationStopStartTime) {
            const elapsedTime = Date.now() - this.stationStopStartTime;
            
            // Adjust station stop duration based on simulation speed
            const adjustedStationStopDuration = this.trainMonitor.stationStopDuration / this.trainMonitor.speed;
            
            if (this.isDebugTrain) {
                console.log(`🔧 Train ${this.trainNumber} station stop: elapsed=${elapsedTime}ms, baseDuration=${this.trainMonitor.stationStopDuration}ms, adjustedDuration=${adjustedStationStopDuration.toFixed(0)}ms, speed=${this.trainMonitor.speed}x, shouldDepart=${elapsedTime >= adjustedStationStopDuration}`);
            }
            
            if (elapsedTime >= adjustedStationStopDuration) {
                // Station stop time has elapsed, continue journey
                this.isAtStation = false;
                this.stationStopStartTime = null;
                              
                // Publish departure event
                await this.trainMonitor.publishAllTrainDepartedStationEvent(this.trainNumber, this.trainData, this.getState());
            }
        } else if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} station stop: isAtStation=${this.isAtStation}, stationStopStartTime=${this.stationStopStartTime}, stationIndex=${this.currentStationIndex}`);
        }
    }

    /**
     * Handle train arriving at a station
     */
    async arriveAtStation(station) {
        this.currentStationIndex++;
        this.currentPosition = {
            lat: station.lat,
            lng: station.lng
        };
        this.isAtStation = true;
        this.stationStopStartTime = Date.now();
        this.currentSpeed = 0;
        
        // Debug logging for train 12461
        if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} arrived at: ${station.name} (${station.code}), position: lat=${station.lat.toFixed(6)}, lng=${station.lng.toFixed(6)}`);
        }
        
        // Publish arrival events
        await this.trainMonitor.publishAllTrainArrivedStationEvent(this.trainNumber, this.trainData, this.getState());
        await this.trainMonitor.publishAllTrainStoppedStationEvent(this.trainNumber, this.trainData, this.getState());
        
        // Check if this is the final destination
        if (this.currentStationIndex >= this.trainData.route.length - 1) {
            this.journeyCompleted = true;
            if (this.isDebugTrain) {
                console.log(`🏁 Train ${this.trainNumber} reached final destination: ${station.name} - Journey completed!`);
                console.log(`🏁 Train ${this.trainNumber} route length: ${this.trainData.route.length}, current index: ${this.currentStationIndex}`);
            }
            await this.trainMonitor.publishAllTrainArrivedDestinationEvent(this.trainNumber, this.trainData, this.getState());
        } else if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} at station ${this.currentStationIndex}, route length: ${this.trainData.route.length}, not final destination yet`);
        }
    }

    /**
     * Get the next station in the route
     */
    getNextStation() {
        const nextStation = this.trainData.route[this.currentStationIndex + 1];
        
        // Debug logging for train 12461
        if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} getNextStation: currentIndex=${this.currentStationIndex}, routeLength=${this.trainData.route.length}, nextStation=${nextStation ? nextStation.name : 'null'}`);
        }
        
        return nextStation;
    }

    /**
     * Get current train state (for event publishing)
     */
    getState() {
        return {
            currentStationIndex: this.currentStationIndex,
            currentPosition: this.currentPosition,
            currentSpeed: this.currentSpeed,
            isAtStation: this.isAtStation,
            stationStopStartTime: this.stationStopStartTime,
            journeyCompleted: this.journeyCompleted
        };
    }

    /**
     * Calculate distance between two points (reuse existing logic)
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const distance = this.trainMonitor.calculateDistance(lat1, lng1, lat2, lng2);
        
        // Debug logging for train 12461
        if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} calculateDistance: from (${lat1.toFixed(6)}, ${lng1.toFixed(6)}) to (${lat2.toFixed(6)}, ${lng2.toFixed(6)}) = ${distance.toFixed(3)}km`);
        }
        
        return distance;
    }

    /**
     * Update marker position on map
     */
    updateMarker() {
        let marker = null;
        
        // Check if we're in single-train mode (marker in trainMarker)
        if (this.trainMonitor.trainMarker && this.trainMonitor.currentTrainNumber === this.trainNumber) {
            marker = this.trainMonitor.trainMarker;
        } else {
            // All train markers removed - single train mode only
        }
        
        if (marker) {
            // Special coordinate correction for train 12462 to ensure exact alignment
            let markerLat = this.currentPosition.lat;
            let markerLng = this.currentPosition.lng;
            
            if (this.trainNumber === '12462') {
                // Check if we're at a station and use exact station coordinates
                const currentStation = this.trainData.route[this.currentStationIndex];
                if (currentStation && this.isAtStation) {
                    const stationCoords = this.trainMonitor.stationCoordinatesFromCSV ? 
                        this.trainMonitor.stationCoordinatesFromCSV[currentStation.code] : null;
                    if (stationCoords) {
                        markerLat = stationCoords.lat;
                        markerLng = stationCoords.lng;
                    }
                }
            }
            
            marker.setLatLng([markerLat, markerLng]);
            
            // Debug logging for train 12461 and 12462
            if (this.isDebugTrain || this.trainNumber === '12462') {
                console.log(`🔧 Train ${this.trainNumber} marker updated to: lat=${markerLat.toFixed(6)}, lng=${markerLng.toFixed(6)}`);
                
                // Special debugging for train 12462 coordinate offset
                if (this.trainNumber === '12462') {
                    const actualLatLng = marker.getLatLng();
                    console.log(`🔧 DEBUG: Train 12462 movement - Expected: [${markerLat.toFixed(6)}, ${markerLng.toFixed(6)}], Actual: [${actualLatLng.lat.toFixed(6)}, ${actualLatLng.lng.toFixed(6)}]`);
                    console.log(`🔧 DEBUG: Train 12462 offset - Lat diff: ${Math.abs(markerLat - actualLatLng.lat)}, Lng diff: ${Math.abs(markerLng - actualLatLng.lng)}`);
                }
            }
        } else {
            // Debug: Marker not found
            if (this.isDebugTrain) {
                // All train markers removed - single train mode only
            }
        }
    }

    /**
     * Main update method - called by simulation engine
     */
    async update(deltaTime = 0) {
        // if (this.isDebugTrain) {
        //     console.log(`🔍 TRAIN UPDATE [${this.trainNumber}]: Starting update, deltaTime=${deltaTime}ms, currentPos=(${this.currentPosition?.lat?.toFixed(6)}, ${this.currentPosition?.lng?.toFixed(6)}), stationIdx=${this.currentStationIndex}, speed=${this.currentSpeed}km/h, atStation=${this.isAtStation}`);
        // }
        
        // DIRECT FIX: If train is at final station, mark as completed immediately
        if (this.currentStationIndex >= this.trainData.route.length - 1) {
            if (!this.journeyCompleted) {
                this.journeyCompleted = true;
                if (this.isDebugTrain) {
                    console.log(`🏁 Train ${this.trainNumber} DIRECT FIX: At final station (index ${this.currentStationIndex}) - marking journey as completed!`);
                }
            }
            return; // Stop updating
        }
        
        if (this.isDebugTrain) {
            console.log(`🔧 Train ${this.trainNumber} UPDATE START: speed=${this.currentSpeed}, isAtStation=${this.isAtStation}, stationIndex=${this.currentStationIndex}, pos=(${this.currentPosition.lat.toFixed(6)}, ${this.currentPosition.lng.toFixed(6)})`);
        }
        
        try {
            this.updatePhysics();
            await this.updatePosition();
            await this.updateStationStop();
            this.updateMarker();
            
            if (this.isDebugTrain) {
                console.log(`🔧 Train ${this.trainNumber} UPDATE END: speed=${this.currentSpeed}, isAtStation=${this.isAtStation}, stationIndex=${this.currentStationIndex}, pos=(${this.currentPosition.lat.toFixed(6)}, ${this.currentPosition.lng.toFixed(6)})`);
            }
        } catch (error) {
            throw error; // Re-throw to be caught by simulation engine
        }
    }

    /**
     * Reset train to starting position
     */
    resetToStart() {
        this.currentStationIndex = 0;
        this.currentPosition = {
            lat: this.trainData.route[0].lat,
            lng: this.trainData.route[0].lng
        };
        this.currentSpeed = 15; // Start with higher initial speed
        this.isAtStation = false;
        this.stationStopStartTime = null;
        this.journeyCompleted = false; // Reset journey completion status
        this._completionLogged = false; // Reset completion logging flag
        
        // Update marker position
        this.updateMarker();
    }
}

