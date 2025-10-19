// scripts/train-simulation.js

class TrainSimulation {
    constructor(trainMonitorInstance) {
        this.trainMonitor = trainMonitorInstance;
    }

    async     simulationLoop() {
        if (!this.trainMonitor.isRunning || this.trainMonitor.isPaused) {
            return;
        }
        
        if (this.trainMonitor.isAllTrainsMode) {
            // In multi-train mode, the simulation-manager.js handles the loop
            // We don't need to run our own loop here to avoid conflicts
            // console.log('🔧 TrainSimulation: Multi-train mode - simulation-manager handles the loop');
            return;
        } else {
            // Add detailed logging for train 12462 only
            const trainNumber = this.trainMonitor.currentTrainNumber;
            if (trainNumber === 12462) {
                console.log(`🔍 SINGLE-TRAIN DEBUG [${trainNumber}]: Starting simulation loop`);
                console.log(`🔍 SINGLE-TRAIN DEBUG [${trainNumber}]: Current position: lat=${this.trainMonitor.currentPosition?.lat}, lng=${this.trainMonitor.currentPosition?.lng}`);
                console.log(`🔍 SINGLE-TRAIN DEBUG [${trainNumber}]: Current station index: ${this.trainMonitor.currentStationIndex}`);
                console.log(`🔍 SINGLE-TRAIN DEBUG [${trainNumber}]: Current speed: ${this.trainMonitor.currentSpeed} km/h`);
                console.log(`🔍 SINGLE-TRAIN DEBUG [${trainNumber}]: Is at station: ${this.trainMonitor.isAtStation}`);
            }
            
            // Update single train
            this.updateTrainPhysics();
            await this.updateStationStop();
            await this.updateTrainPosition();
            this.updateDisplay();
            this.trainMonitor.uiControls.updateTrainInfo(); // Add comprehensive train info update
            
            // Log current station progress
            if (this.trainMonitor.currentStationIndex < this.trainMonitor.stations.length) {
                const currentStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex];
                const nextStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex + 1];
                
                if (currentStation && nextStation) {
                    const distance = this.trainMonitor.calculateDistance(
                        this.trainMonitor.currentPosition.lat,
                        this.trainMonitor.currentPosition.lng,
                        nextStation.lat,
                        nextStation.lng
                    );
                    // console.log(`🚂 Train ${this.trainMonitor.currentTrainNumber}: ${currentStation.name} → ${nextStation.name} (${distance.toFixed(1)} km remaining)`);
                }
            }
            
            // Continue simulation loop only for single-train mode
            const loopInterval = 1000 / this.trainMonitor.speed;
            setTimeout(() => this.simulationLoop(), loopInterval);
        }
    }

    updateTrainPhysics() {
        // Update train physics (acceleration, deceleration, speed)
        // Don't update physics if train is stopped at a station
        if (this.trainMonitor.isAtStation) {
            this.trainMonitor.currentSpeed = 0;
            return;
        }
        
        if (this.trainMonitor.currentStationIndex < this.trainMonitor.stations.length - 1) {
            const currentStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex];
            const nextStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex + 1];
            
            // Calculate actual distance to next station in kilometers
            const distanceToNextStation = this.trainMonitor.calculateDistance(
                this.trainMonitor.currentPosition.lat, this.trainMonitor.currentPosition.lng,
                nextStation.lat, nextStation.lng
            );
            
            // console.log(`🔧 Physics: distanceToStation=${distanceToNextStation.toFixed(2)}km, currentSpeed=${this.trainMonitor.currentSpeed}km/h, maxSpeed=${this.trainMonitor.maxSpeed}km/h`);
            
            // Apply slowdown only in the last 2 kilometers
            if (distanceToNextStation > 2.0) {
                // More than 2km from station - maintain or accelerate to max speed
                if (this.trainMonitor.currentSpeed < this.trainMonitor.maxSpeed) {
                    // Accelerate to max speed
                    this.trainMonitor.currentSpeed = Math.min((this.trainMonitor.currentSpeed || 0) + 5, this.trainMonitor.maxSpeed);
                } else {
                    // Maintain max speed
                    this.trainMonitor.currentSpeed = this.trainMonitor.maxSpeed;
                }
            } else if (distanceToNextStation > 0.1) {
                // Within 2km of station - gradual deceleration to 0
                // Calculate deceleration factor based on distance (closer = more deceleration)
                const decelerationFactor = (2.0 - distanceToNextStation) / 2.0; // 0 to 1 as we get closer
                
                // Calculate target speed: starts at max speed at 2km, drops to 0 at station
                const targetSpeed = this.trainMonitor.maxSpeed * (1 - decelerationFactor);
                
                // Apply gradual deceleration
                const speedDifference = this.trainMonitor.currentSpeed - targetSpeed;
                if (speedDifference > 0) {
                    // Decelerate more aggressively as we get closer
                    const decelerationRate = Math.max(2, speedDifference * 0.3); // Minimum 2 km/h per second
                    this.trainMonitor.currentSpeed = Math.max(this.trainMonitor.currentSpeed - decelerationRate, targetSpeed);
                } else {
                    // Don't accelerate beyond target speed
                    this.trainMonitor.currentSpeed = Math.min(this.trainMonitor.currentSpeed + 1, targetSpeed);
                }
                
                // console.log(`🔧 Deceleration: distance=${distanceToNextStation.toFixed(2)}km, factor=${decelerationFactor.toFixed(3)}, targetSpeed=${targetSpeed.toFixed(1)}km/h`);
            } else {
                // Very close to station (within 100m) - stop completely
                this.trainMonitor.currentSpeed = 0;
            }
        } else {
            // At final station, stop the train
            this.trainMonitor.currentSpeed = 0;
        }
        
        
        // Safety mechanism: if train has been at 0 speed for too long, give it minimum speed
        if (this.trainMonitor.currentSpeed === 0 && this.trainMonitor.currentStationIndex < this.trainMonitor.stations.length - 1) {
            const nextStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex + 1];
            if (nextStation) {
                const distanceToNext = this.trainMonitor.calculateDistance(
                    this.trainMonitor.currentPosition.lat,
                    this.trainMonitor.currentPosition.lng,
                    nextStation.lat,
                    nextStation.lng
                );
                // If still far from station (> 1km), give minimum speed
                if (distanceToNext > 1.0) {
                    this.trainMonitor.currentSpeed = 5; // Minimum 5 km/h
                    // console.log(`🔧 Safety: Train stuck at 0 speed, setting minimum speed to 5 km/h (${distanceToNext.toFixed(2)}km from station)`);
                }
            }
        }
        
        // console.log(`🔧 Physics result: newSpeed=${this.trainMonitor.currentSpeed}km/h`);
        
        // Update train speed for display
        this.trainMonitor.trainSpeed = this.trainMonitor.currentSpeed;
    }

    async updateStationStop() {
        // Handle station stop duration
        if (this.trainMonitor.isAtStation && this.trainMonitor.stationStopStartTime) {
            const elapsedTime = Date.now() - this.trainMonitor.stationStopStartTime;
            
            if (elapsedTime >= this.trainMonitor.stationStopDuration) {
                // Publish train departed from station event
                await this.trainMonitor.publishTrainDepartedStationEvent();
                
                // Station stop time is over, resume movement
                this.trainMonitor.isAtStation = false;
                this.trainMonitor.stationStopStartTime = null;
                this.trainMonitor.uiControls.updateStatus('Running');
                
                // console.log(`🚂 Train departing from ${this.trainMonitor.stations[this.trainMonitor.currentStationIndex]?.name || 'station'}...`);
            }
        }
    }

    async updateTrainPosition() {
        // Update train position along the route
        // Don't move if train is stopped at a station
        if (this.trainMonitor.isAtStation) {
            return;
        }
        
        // Add detailed logging for train 12462 only
        const trainNumber = this.trainMonitor.currentTrainNumber;
        const isDebugTrain = trainNumber === 12462;
        
        // Check if we've reached the next station
        const nextStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex + 1];
        if (nextStation) {
            const distanceToNext = this.trainMonitor.calculateDistance(
                this.trainMonitor.currentPosition.lat,
                this.trainMonitor.currentPosition.lng,
                nextStation.lat,
                nextStation.lng
            );
            
            if (isDebugTrain) {
                console.log(`🔍 SINGLE-TRAIN POSITION [${trainNumber}]: Distance to next station (${nextStation.name}): ${distanceToNext.toFixed(3)} km`);
                console.log(`🔍 SINGLE-TRAIN POSITION [${trainNumber}]: Current pos: lat=${this.trainMonitor.currentPosition.lat}, lng=${this.trainMonitor.currentPosition.lng}`);
                console.log(`🔍 SINGLE-TRAIN POSITION [${trainNumber}]: Next station pos: lat=${nextStation.lat}, lng=${nextStation.lng}`);
            }
            
            // If we're very close to the next station, move to it
            if (distanceToNext < 1.0) {
                this.trainMonitor.currentStationIndex++;
                this.trainMonitor.currentPosition = { lat: nextStation.lat, lng: nextStation.lng };
                
                // Update train marker position
                if (this.trainMonitor.trainMarker) {
                    this.trainMonitor.trainMarker.setLatLng([nextStation.lat, nextStation.lng]);
                }
                
                // Update train info
                this.trainMonitor.uiControls.updateTrainInfo();
                
                   // Start station stop with actual halt time from data
                   this.trainMonitor.isAtStation = true;
                   this.trainMonitor.stationStopStartTime = Date.now();
                   
                
                // Fixed 3-second stop time at each station
                this.trainMonitor.stationStopDuration = 3000; // 3 seconds in milliseconds
                
                this.trainMonitor.uiControls.updateStatus('Stopped');
                
                // console.log(`🚉 Train arrived at ${nextStation.name}! Stopping for 3 seconds (fixed duration)`);
                
                // Publish station arrival event
                await this.trainMonitor.publishTrainArrivedStationEvent();
                
                // Publish train stopped at station event
                await this.trainMonitor.publishTrainStoppedStationEvent();
                
                // Check if this is the final destination
                if (this.trainMonitor.currentStationIndex >= this.trainMonitor.stations.length - 1) {
                    // Train has reached final destination
                    this.trainMonitor.isRunning = false;
                    this.trainMonitor.uiControls.updateStatus('Arrived at Destination');
                    
                    // Publish final destination event
                    await this.trainMonitor.publishTrainArrivedDestinationEvent();
                    
                    // console.log(`🚂 Train ${this.trainMonitor.currentTrainNumber} has arrived at final destination: ${nextStation.name}`);
                    return;
                }
                
                // console.log(`🚂 Train ${this.trainMonitor.currentTrainNumber} arrived at ${nextStation.name}`);
                return;
            }
            
            // Move towards next station using simple linear interpolation
            // Calculate movement step size based on speed (much simpler approach)
            // Convert km/h to a movement factor (higher speed = larger steps)
            const baseMovementFactor = (this.trainMonitor.currentSpeed / 100) * 0.1; // Base movement factor
            const movementFactor = baseMovementFactor * this.trainMonitor.speed; // Apply simulation speed multiplier
            
            if (isDebugTrain) {
                console.log(`🔍 SINGLE-TRAIN MOVEMENT [${trainNumber}]: speed=${this.trainMonitor.currentSpeed}km/h, simSpeed=${this.trainMonitor.speed}x, baseFactor=${baseMovementFactor.toFixed(6)}, finalFactor=${movementFactor.toFixed(6)}`);
            }
            
            // Simple linear interpolation towards target
            const latDiff = nextStation.lat - this.trainMonitor.currentPosition.lat;
            const lngDiff = nextStation.lng - this.trainMonitor.currentPosition.lng;
            
            const newPosition = {
                lat: this.trainMonitor.currentPosition.lat + (latDiff * movementFactor),
                lng: this.trainMonitor.currentPosition.lng + (lngDiff * movementFactor)
            };
            
            if (isDebugTrain) {
                console.log(`🔍 SINGLE-TRAIN MOVEMENT [${trainNumber}]: latDiff=${latDiff.toFixed(6)}, lngDiff=${lngDiff.toFixed(6)}`);
                console.log(`🔍 SINGLE-TRAIN MOVEMENT [${trainNumber}]: New position: lat=${newPosition.lat.toFixed(6)}, lng=${newPosition.lng.toFixed(6)}`);
            }
            
            // Calculate actual movement distance for comparison
            const actualMovementDistance = this.trainMonitor.calculateDistance(
                this.trainMonitor.currentPosition.lat,
                this.trainMonitor.currentPosition.lng,
                newPosition.lat,
                newPosition.lng
            );
            
            // Critical: Single-train movement details (disabled for performance)
            // // console.log(`🚂 Moving: speed=${this.trainMonitor.currentSpeed} km/h, simSpeed=${this.trainMonitor.speed}x, factor=${movementFactor.toFixed(4)}, distance=${distanceToNext.toFixed(2)} km, actualMovement=${actualMovementDistance.toFixed(6)} km`);
            
            this.trainMonitor.currentPosition = newPosition;
            
            // Update train marker position
            if (this.trainMonitor.trainMarker) {
                this.trainMonitor.trainMarker.setLatLng([newPosition.lat, newPosition.lng]);
            } else {
                // console.warn('🚂 No train marker found to update!');
            }
            
        // Simple auto-panning to keep train visible
        if (this.trainMonitor.uiControls.autoPanToKeepTrainVisible) {
            this.trainMonitor.uiControls.autoPanToKeepTrainVisible(newPosition, 20);
        }
        }
    }

    updateDisplay() {
        // Update any display elements that need real-time updates
        // This method can be expanded as needed
        
        // Update progress bar
        this.trainMonitor.uiControls.updateProgressBar();
        
        // Update speed display
        this.trainMonitor.uiControls.updateSpeedDisplay(this.trainMonitor.currentSpeed);
    }


    // Station stop management
    async checkStationStop() {
        if (!this.trainMonitor.isAtStation || !this.trainMonitor.stationStopStartTime) {
            return;
        }
        
        const stopDuration = Date.now() - this.trainMonitor.stationStopStartTime;
        if (stopDuration >= this.trainMonitor.stationStopDuration) {
            // Station stop completed
            this.trainMonitor.isAtStation = false;
            this.trainMonitor.stationStopStartTime = null;
            this.trainMonitor.uiControls.updateStatus('Running');
            
            // Publish station departure event
            const currentStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex];
            if (currentStation) {
                await this.trainMonitor.publishTrainDepartedStationEvent();
            }
            
            // console.log(`🚂 Train ${this.trainMonitor.currentTrainNumber} departed from ${currentStation?.name}`);
        }
    }

    // Speed and physics calculations
    calculateAcceleration(currentSpeed, targetSpeed, maxAcceleration = 2) {
        const speedDifference = targetSpeed - currentSpeed;
        if (Math.abs(speedDifference) <= maxAcceleration) {
            return targetSpeed;
        }
        return currentSpeed + (speedDifference > 0 ? maxAcceleration : -maxAcceleration);
    }

    calculateDeceleration(currentSpeed, distanceToTarget, maxDeceleration = 3) {
        // Calculate required deceleration based on distance
        const requiredDeceleration = (currentSpeed * currentSpeed) / (2 * distanceToTarget);
        return Math.min(requiredDeceleration, maxDeceleration);
    }

    // Route and waypoint management
    generateWaypoints() {
        // Generate intermediate waypoints for smooth train movement
        const waypoints = [];
        
        for (let i = 0; i < this.trainMonitor.stations.length - 1; i++) {
            const start = this.trainMonitor.stations[i];
            const end = this.trainMonitor.stations[i + 1];
            
            // Calculate number of intermediate points based on distance
            const distance = this.trainMonitor.calculateDistance(start.lat, start.lng, end.lat, end.lng);
            const steps = Math.max(2, Math.ceil(distance / 10)); // One point every 10km
            
            for (let j = 1; j < steps; j++) {
                const ratio = j / steps;
                const lat = start.lat + (end.lat - start.lat) * ratio;
                const lng = start.lng + (end.lng - start.lng) * ratio;
                waypoints.push({ lat, lng, stationIndex: i, segmentProgress: ratio });
            }
        }
        
        return waypoints;
    }

    // Progress calculation
    calculateJourneyProgress() {
        if (this.trainMonitor.stations.length === 0) return 0;
        
        const totalStations = this.trainMonitor.stations.length;
        const completedStations = this.trainMonitor.currentStationIndex;
        
        if (completedStations >= totalStations - 1) return 100;
        
        // Calculate progress within current segment
        const currentStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex];
        const nextStation = this.trainMonitor.stations[this.trainMonitor.currentStationIndex + 1];
        
        if (currentStation && nextStation) {
            const totalDistance = this.trainMonitor.calculateDistance(currentStation.lat, currentStation.lng, nextStation.lat, nextStation.lng);
            const remainingDistance = this.trainMonitor.calculateDistance(
                this.trainMonitor.currentPosition.lat,
                this.trainMonitor.currentPosition.lng,
                nextStation.lat,
                nextStation.lng
            );
            
            const segmentProgress = 1 - (remainingDistance / totalDistance);
            return ((completedStations + segmentProgress) / (totalStations - 1)) * 100;
        }
        
        return (completedStations / (totalStations - 1)) * 100;
    }
}
