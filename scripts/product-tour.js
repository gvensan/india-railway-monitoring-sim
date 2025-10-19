/**
 * Product Tour System for Train Monitoring Application
 * Provides an interactive walkthrough of key features
 */
class ProductTour {
    constructor() {
        this.currentStep = 0;
        this.steps = [];
        this.isActive = false;
        this.overlay = null;
        this.highlight = null;
        this.tooltip = null;
        this.completionDialog = null;
        this.triggerButton = null;
        
        // Tour configuration
        this.config = {
            showProgress: true,
            allowSkip: true,
            autoAdvance: false,
            highlightPadding: 10,
            animationDuration: 300
        };
        
        this.init();
    }
    
    init() {
        this.createTourElements();
        this.defineTourSteps();
        this.setupEventListeners();
        this.createTriggerButton();
        this.loadTourState();
    }
    
    createTourElements() {
        // Don't create elements here - they will be created dynamically when tour starts
        // This prevents any interference with marker interactions when tour is not active
        // console.log('🔧 Tour elements will be created dynamically when tour starts');
    }
    
    createDynamicTourElements() {
        // console.log('🔧 Creating tour elements dynamically...');
        
        // Create overlay only when tour starts
        this.overlay = document.createElement('div');
        this.overlay.className = 'tour-overlay';
        this.overlay.style.pointerEvents = 'none'; // Allow pointer events to pass through to highlight
        document.body.appendChild(this.overlay);
        
        // Create highlight element - append to body for better visibility
        this.highlight = document.createElement('div');
        this.highlight.className = 'tour-highlight';
        document.body.appendChild(this.highlight);
        
        // Create tooltip - append directly to body to avoid overlay interference
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'tour-tooltip';
        document.body.appendChild(this.tooltip);
        
        // Create completion dialog
        this.completionDialog = document.createElement('div');
        this.completionDialog.className = 'tour-complete';
        this.completionDialog.innerHTML = `
            <div class="tour-complete-icon">🎉</div>
            <div class="tour-complete-title">Tour Complete!</div>
            <div class="tour-complete-message">
                You've learned about all the key features of the Train Monitoring System. 
                You're now ready to start monitoring trains!
            </div>
            <button class="tour-complete-button" data-action="complete">
                Start Monitoring
            </button>
            <div class="tour-complete-countdown">
                Auto-closing in <span id="countdown">5</span> seconds
            </div>
        `;
        document.body.appendChild(this.completionDialog);
        
        // Add click handler for completion button
        this.completionDialog.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.target.classList.contains('tour-complete-button')) {
                this.completeTour();
            }
        });
        
        // Also add direct button event listener as backup
        const completeButton = this.completionDialog.querySelector('.tour-complete-button');
        if (completeButton) {
            completeButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.completeTour();
            });
        }
        
        // Set up event listeners for the dynamically created elements
        this.setupDynamicEventListeners();
        
        // console.log('✅ Tour elements created dynamically');
    }
    
    removeDynamicTourElements() {
        // console.log('🔧 Removing tour elements dynamically...');
        
        // Remove overlay
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
            this.overlay = null;
        }
        
        // Remove highlight
        if (this.highlight && this.highlight.parentNode) {
            this.highlight.parentNode.removeChild(this.highlight);
            this.highlight = null;
        }
        
        // Remove tooltip
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
            this.tooltip = null;
        }
        
        // Remove completion dialog
        if (this.completionDialog && this.completionDialog.parentNode) {
            this.completionDialog.parentNode.removeChild(this.completionDialog);
            this.completionDialog = null;
        }
        
        // console.log('✅ Tour elements removed dynamically');
    }
    
    createTriggerButton() {
        // Create tour button for map zoom controls
        this.createMapTourButton();
        
        // Keep the floating button as backup (but hidden by default)
        this.triggerButton = document.createElement('button');
        this.triggerButton.className = 'tour-trigger';
        this.triggerButton.innerHTML = '<img src="assets/images/tour.png" alt="Tour" style="width: 16px; height: 16px; margin-right: 8px;"> Take Tour';
        this.triggerButton.title = 'Take a guided tour of the application';
        this.triggerButton.style.display = 'none'; // Hidden by default
        document.body.appendChild(this.triggerButton);
        
        this.triggerButton.addEventListener('click', () => {
            this.start();
        });
    }
    
    createMapTourButton() {
        // Wait for map to be initialized
        const checkMap = () => {
            const mapElement = document.getElementById('map');
            if (mapElement && window.trainMonitorInstance && window.trainMonitorInstance.map) {
                this.addTourButtonToMap();
            } else {
                setTimeout(checkMap, 100);
            }
        };
        checkMap();
    }
    
    addTourButtonToMap() {
        const map = window.trainMonitorInstance.map;
        if (!map) return;
        
        // Find the existing zoom control
        const zoomControl = map.zoomControl;
        if (!zoomControl) return;
        
        // Get the zoom control container
        const zoomContainer = zoomControl.getContainer();
        if (!zoomContainer) return;
        
        // Create tour button element
        const tourButton = L.DomUtil.create('a', 'leaflet-bar-part leaflet-bar-part-single tour-zoom-btn', zoomContainer);
        tourButton.href = '#';
        tourButton.title = 'Guided Tour';
        tourButton.innerHTML = '<img src="assets/images/tour.png" alt="Tour" style="width: 16px; height: 16px;">';
        
        // Position it between zoom in and zoom out buttons
        const zoomInBtn = zoomContainer.querySelector('.leaflet-control-zoom-in');
        if (zoomInBtn) {
            // Insert after zoom in button
            zoomInBtn.parentNode.insertBefore(tourButton, zoomInBtn.nextSibling);
        }
        
        // Prevent map events when clicking the button
        L.DomEvent.disableClickPropagation(tourButton);
        L.DomEvent.disableScrollPropagation(tourButton);
        
        // Add click handler
        L.DomEvent.on(tourButton, 'click', (e) => {
            L.DomEvent.preventDefault(e);
            this.start();
        });
        
        this.mapTourButton = tourButton;
    }
    
    defineTourSteps() {
        this.steps = [
            {
                id: 'welcome',
                target: null,
                title: '🚂 Welcome to Train Monitoring System',
                description: 'Welcome to the Train Monitoring System! This interactive tour will guide you through all the key features.',
                features: [
                    'Real-time train tracking and simulation',
                    'Interactive map with railway infrastructure',
                    'Event monitoring and alert management',
                    'Multi-train support and broker integration'
                ],
                position: 'center',
                arrow: null
            },
            {
                id: 'map-overview',
                target: null,
                title: '🗺️ Interactive Map Overview',
                description: 'This is the main map view where you can see trains moving in real-time. The map shows railway infrastructure, station markers, and train positions.',
                features: [
                    'Real-time train positions and movement trails',
                    'Station markers with detailed information',
                    'Railway infrastructure overlay',
                    'Interactive train and station tooltips'
                ],
                position: 'center'
            },
            {
                id: 'floating-toggle',
                target: '#floatingRightToggleBtn',
                title: '🚂 Main Control Panel',
                description: 'Click this button to open the main control panel where you can manage train simulation and view detailed information.',
                features: [
                    'Simulation controls (Play, Pause, Stop)',
                    'Speed adjustment (1x to 10x)',
                    'Train selection and information display',
                    'Quick action buttons'
                ],
                position: 'center'
            },
            {
                id: 'simulation-controls',
                target: '.control-section:first-of-type',
                title: '🎮 Simulation Controls',
                description: 'Control the train simulation with these essential buttons. Click Play to start, Pause to stop temporarily, or Stop to reset completely.',
                features: [
                    '▶️ Play: Start the train simulation',
                    '⏸️ Pause: Temporarily stop simulation',
                    '⏹️ Stop: Reset to starting position',
                    '🎚️ Speed slider: Adjust from 1x to 10x speed',
                    '📤 Publish Events: Toggle event publishing to broker'
                ],
                position: 'center',
                waitFor: () => this.waitForSidebarOpen()
            },
            {
                id: 'train-info',
                target: '.control-section:nth-of-type(2)',
                title: '📊 Train Information Display',
                description: 'Monitor real-time train data here. Shows current speed, location, next station, and progress as the train moves.',
                features: [
                    '🚂 Train number and name display',
                    '📍 Current and next station info',
                    '⚡ Real-time speed in km/h',
                    '📏 Distance metrics and ETA calculations'
                ],
                position: 'center',
                waitFor: () => this.waitForSidebarOpen()
            },
            {
                id: 'train-selection',
                target: '.control-section:nth-of-type(3)',
                title: '🚂 Train Selection',
                description: 'Choose from 300+ real Indian Railways trains. Select a train from the dropdown and click Load to start monitoring its journey.',
                features: [
                    '📋 Dropdown with 300+ real trains',
                    '🚂 Load button to initialize selected train',
                    '🗺️ Real route data and station coordinates',
                    '🔄 Multi-train monitoring support'
                ],
                position: 'center',
                waitFor: () => this.waitForSidebarOpen()
            },
            {
                id: 'multi-train-mode',
                target: null,
                title: '🚂 Multi-Train Mode',
                description: 'The system supports monitoring multiple trains simultaneously. Switch to multi-train mode to see hundreds of trains moving across the railway network.',
                features: [
                    '🚂 Monitor 300+ trains simultaneously',
                    '📍 Real-time position tracking for all trains',
                    '🎮 Centralized simulation controls',
                    '📊 Aggregate statistics and progress tracking',
                    '📤 Bulk event publishing to broker',
                    '🔄 Independent train lifecycle management'
                ],
                position: 'center'
            },
            {
                id: 'quick-actions',
                target: '.control-section:nth-of-type(4)',
                title: '⚡ Quick Actions',
                description: 'Essential shortcuts for map control. Toggle railway overlay, center the map, or reset the entire simulation.',
                features: [
                    '🚂 Hide/Show railway map overlay',
                    '🎯 Center map on current train position',
                    '🔄 Reset simulation to initial state',
                    '👁️ Show/hide train markers on map'
                ],
                position: 'center',
                waitFor: () => this.waitForSidebarOpen()
            },
            {
                id: 'events-button',
                target: '#eventsFloatingBtn',
                title: '📋 Event Monitoring',
                description: 'Click this button to open the event panel. Monitor all system activities including train movements, station events, and alerts in real-time.',
                features: [
                    '📡 Real-time event streaming',
                    '🔍 Filter events by type (Train, Station, Alert)',
                    '📝 Detailed event information with timestamps',
                    '🧹 Auto-clean feature to limit events to 100'
                ],
                position: 'center'
            },
            {
                id: 'events-panel',
                target: '#leftSidebar',
                title: '📋 Event Panel',
                description: 'View all system events here. Use the filter buttons to show only specific event types, or view all events together.',
                features: [
                    '🚂 Train events: Departures, arrivals, speed changes',
                    '🚉 Station events: Platform assignments, delays',
                    '⚠️ Alert events: Raised, served, missed alerts',
                    '🔍 Filter buttons: All, Train, Station, Alert'
                ],
                position: 'center',
                waitFor: () => this.waitForEventsPanelOpen()
            },
            {
                id: 'alert-system',
                target: null,
                title: '⚠️ Alert System',
                description: 'The system includes an integrated alert management system. Alerts can be raised for trains and are automatically managed through the event system.',
                features: [
                    '🚂 Train-based alert generation',
                    '💧 Water tank alerts for service needs',
                    '🔧 Breakdown alerts for mechanical issues',
                    '❄️ AC malfunction alerts for comfort issues',
                    '🚨 Emergency alerts for critical situations',
                    '📍 Alert flags appear on map at stations',
                    '📤 Alert events published to broker when enabled'
                ],
                position: 'center'
            },
            {
                id: 'about-button',
                target: '#aboutBtn',
                title: 'ℹ️ About & Help',
                description: 'Click the info button to access system information, view recent updates, and check the status of all components.',
                features: [
                    '📋 System overview and capabilities',
                    '🆕 Recent updates and improvements',
                    '🛠️ Technical stack information',
                    '📊 System status indicators (Broker, Events, Train Monitor)'
                ],
                position: 'center'
            }
        ];
    }
    
    setupEventListeners() {
        // Event listeners will be set up when tour elements are created dynamically
        // This prevents errors when elements don't exist initially
        
        // Keyboard navigation (global)
        document.addEventListener('keydown', (e) => {
            if (!this.isActive) return;
            
            switch(e.key) {
                case 'Escape':
                    this.close();
                    break;
                case 'ArrowRight':
                case ' ':
                    e.preventDefault();
                    this.next();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.previous();
                    break;
            }
        });
        
        // Header tour button
        const tourBtn = document.getElementById('tourBtn');
        if (tourBtn) {
            tourBtn.addEventListener('click', () => {
                this.start();
            });
        }
    }
    
    setupDynamicEventListeners() {
        // Set up event listeners for dynamically created elements
        if (this.overlay) {
            // Close tour on overlay click (but not on tooltip clicks)
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.close();
                }
            });
        }
        
        if (this.tooltip) {
            // Handle tooltip clicks (buttons and prevent bubbling)
            this.tooltip.addEventListener('click', (e) => {
                // Check if clicked element is a button or inside a button
                const button = e.target.closest('.tour-btn');
                if (button) {
                    const action = button.getAttribute('data-action');
                    
                    e.preventDefault();
                    e.stopPropagation();
                    
                    switch(action) {
                        case 'next':
                            this.next();
                            break;
                        case 'previous':
                            this.previous();
                            break;
                        case 'skip':
                            this.close();
                            break;
                    }
                } else {
                    // If not a button, just prevent bubbling to overlay
                    e.stopPropagation();
                }
            });
        }
    }
    
    start() {
        if (this.isActive) return;
        
        // console.log('🔧 Starting tour - creating elements dynamically...');
        
        this.isActive = true;
        this.currentStep = 0;
        
        // Create tour elements dynamically
        this.createDynamicTourElements();
        
        // Activate overlay
        this.overlay.classList.add('active');
        this.triggerButton.classList.add('hidden');
        
        
        // Hide any open panels initially
        this.closeAllPanels();
        
        this.showStep(0);
        this.saveTourState('started');
        
        // console.log('✅ Tour started with dynamic elements');
    }
    
    close() {
        if (!this.isActive) return;
        
        // console.log('🔧 Closing tour - removing elements dynamically...');
        
        this.isActive = false;
        
        // Clean up any waiting states
        this.clearWaitingStates();
        
        // Close all panels to return to default app state
        this.closeAllPanels();
        
        // Remove tour elements completely from DOM
        this.removeDynamicTourElements();
        
        // Show trigger button again
        this.triggerButton.classList.remove('hidden');
        
        this.saveTourState('completed');
        
        // console.log('✅ Tour closed and elements removed from DOM');
    }
    
    completeTour() {
        // Clear any timers
        if (this.autoCloseTimer) {
            clearTimeout(this.autoCloseTimer);
            this.autoCloseTimer = null;
        }
        if (this.countdownTimer) {
            clearTimeout(this.countdownTimer);
            this.countdownTimer = null;
        }
        
        // Close all panels first
        this.closeAllPanels();
        
        // Then close the tour
        this.close();
    }
    
    next() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep(this.currentStep);
        } else {
            this.showCompletion();
        }
    }
    
    previous() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep(this.currentStep);
        }
    }
    
    showStep(stepIndex) {
        const step = this.steps[stepIndex];
        if (!step) return;
        
        // Clear previous waiting states
        this.clearWaitingStates();
        
        // Wait for any required conditions
        if (step.waitFor) {
            this.waitForCondition(step.waitFor, () => {
                this.displayStep(step, stepIndex);
            });
        } else {
            this.displayStep(step, stepIndex);
        }
    }
    
    displayStep(step, stepIndex) {
        // Position highlight
        if (step.target) {
            const targetElement = document.querySelector(step.target);
            if (targetElement) {
                // Wait longer for DOM to settle, especially for panel transitions
                setTimeout(() => {
                    this.highlightElement(targetElement);
                }, 300);
            } else {
                this.highlight.style.display = 'none';
            }
        } else {
            this.highlight.style.display = 'none';
        }
        
        // Create and position tooltip
        this.createTooltip(step, stepIndex);
    }
    
    highlightElement(element) {
        const rect = element.getBoundingClientRect();
        const padding = this.config.highlightPadding;
        
        console.log(`🎯 Tour: Highlighting element:`, element, 'Rect:', rect);
        
        // For sidebar panels, ensure we cover the entire visible area
        let highlightRect = {
            top: rect.top - padding,
            left: rect.left - padding,
            width: rect.width + (padding * 2),
            height: rect.height + (padding * 2)
        };
        
        // Special handling for sidebar panels to ensure full coverage
        if (element.id === 'leftSidebar' || element.id === 'rightSidebar' || element.id === 'alertBottomPanel') {
            // Use the full viewport dimensions for sidebars
            if (element.id === 'leftSidebar') {
                highlightRect = {
                    top: 0,
                    left: 0,
                    width: rect.right + padding,
                    height: window.innerHeight
                };
            } else if (element.id === 'rightSidebar') {
                highlightRect = {
                    top: 0,
                    left: rect.left - padding,
                    width: window.innerWidth - rect.left + padding,
                    height: window.innerHeight
                };
            } else if (element.id === 'alertBottomPanel') {
                highlightRect = {
                    top: rect.top - padding,
                    left: 0,
                    width: window.innerWidth,
                    height: rect.height + (padding * 2)
                };
            }
        }
        
        this.highlight.style.display = 'block';
        this.highlight.style.left = highlightRect.left + 'px';
        this.highlight.style.top = highlightRect.top + 'px';
        this.highlight.style.width = highlightRect.width + 'px';
        this.highlight.style.height = highlightRect.height + 'px';
        
    }
    
    createTooltip(step, stepIndex) {
        const progress = this.config.showProgress ? 
            `<div class="tour-progress">
                <div class="tour-progress-bar">
                    <div class="tour-progress-fill" style="width: ${((stepIndex + 1) / this.steps.length) * 100}%"></div>
                </div>
                <span>${stepIndex + 1} of ${this.steps.length}</span>
            </div>` : '';
        
        const features = step.features ? 
            `<ul class="tour-tooltip-features">
                ${step.features.map(feature => `<li>${feature}</li>`).join('')}
            </ul>` : '';
        
        const skipButton = this.config.allowSkip ? 
            `<button class="tour-btn tour-btn-skip" data-action="skip">Skip Tour</button>` : '';
        
        this.tooltip.innerHTML = `
            <div class="tour-tooltip-header">
                <h3 class="tour-tooltip-title">${step.title}</h3>
                <span class="tour-tooltip-step">Step ${stepIndex + 1}</span>
            </div>
            <div class="tour-tooltip-content">
                <p class="tour-tooltip-description">${step.description}</p>
                ${features}
                <div class="tour-tooltip-actions">
                    <div class="tour-tooltip-buttons">
                        ${stepIndex > 0 ? '<button class="tour-btn tour-btn-secondary" data-action="previous">← Previous</button>' : ''}
                        <button class="tour-btn tour-btn-primary" data-action="next">
                            ${stepIndex === this.steps.length - 1 ? 'Finish' : 'Next →'}
                        </button>
                    </div>
                    ${skipButton}
                </div>
                ${progress}
            </div>
        `;
        
        // Position tooltip
        this.positionTooltip(step);
        
        // Show tooltip with animation
        setTimeout(() => {
            this.tooltip.classList.add('active');
            // Ensure tooltip is properly positioned after animation
            this.positionTooltip(step);
            
            // Add direct event listeners as fallback
            const buttons = this.tooltip.querySelectorAll('.tour-btn');
            buttons.forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const action = btn.getAttribute('data-action');
                    switch(action) {
                        case 'next':
                            this.next();
                            break;
                        case 'previous':
                            this.previous();
                            break;
                        case 'skip':
                            this.close();
                            break;
                    }
                });
            });
        }, 50);
    }
    
    positionTooltip(step) {
        if (!step.target || step.position === 'center') {
            // Center tooltip for welcome step or center positioning
            this.tooltip.style.position = 'fixed';
            this.tooltip.style.top = '50%';
            this.tooltip.style.left = '50%';
            this.tooltip.style.transform = 'translate(-50%, -50%)';
            return;
        }
        
        const targetElement = document.querySelector(step.target);
        if (!targetElement) return;
        
        const rect = targetElement.getBoundingClientRect();
        const tooltipRect = this.tooltip.getBoundingClientRect();
        const margin = 30;
        
        let top, left;
        
        switch(step.position) {
            case 'top':
                top = rect.top - tooltipRect.height - margin;
                left = rect.left + (rect.width - tooltipRect.width) / 2;
                break;
            case 'bottom':
                top = rect.bottom + margin;
                left = rect.left + (rect.width - tooltipRect.width) / 2;
                break;
            case 'left':
                top = rect.top + (rect.height - tooltipRect.height) / 2;
                left = rect.left - tooltipRect.width - margin;
                break;
            case 'right':
                top = rect.top + (rect.height - tooltipRect.height) / 2;
                left = rect.right + margin;
                break;
            default:
                // Default to center positioning
                this.tooltip.style.position = 'fixed';
                this.tooltip.style.top = '50%';
                this.tooltip.style.left = '50%';
                this.tooltip.style.transform = 'translate(-50%, -50%)';
                return;
        }
        
        // Ensure tooltip stays within viewport bounds
        const viewport = {
            width: window.innerWidth,
            height: window.innerHeight
        };
        
        if (left < margin) left = margin;
        if (left + tooltipRect.width > viewport.width - margin) {
            left = viewport.width - tooltipRect.width - margin;
        }
        if (top < margin) top = margin;
        if (top + tooltipRect.height > viewport.height - margin) {
            top = viewport.height - tooltipRect.height - margin;
        }
        
        this.tooltip.style.position = 'fixed';
        this.tooltip.style.top = top + 'px';
        this.tooltip.style.left = left + 'px';
        this.tooltip.style.transform = 'none';
    }
    
    showCompletion() {
        this.tooltip.classList.remove('active');
        this.highlight.style.display = 'none';
        this.completionDialog.classList.add('active');
        
        // Start countdown timer
        this.startCountdown();
    }
    
    startCountdown() {
        let countdown = 5;
        const countdownElement = document.getElementById('countdown');
        
        // Update countdown display
        const updateCountdown = () => {
            if (countdownElement) {
                countdownElement.textContent = countdown;
            }
            countdown--;
            
            if (countdown >= 0) {
                this.countdownTimer = setTimeout(updateCountdown, 1000);
            } else {
                this.completeTour();
            }
        };
        
        updateCountdown();
    }
    
    // Helper methods for waiting for UI elements
    waitForSidebarOpen() {
        return new Promise((resolve) => {
            const sidebar = document.getElementById('rightSidebar');
            if (sidebar && sidebar.classList.contains('open')) {
                // Sidebar is already open, wait a bit for DOM to settle
                setTimeout(resolve, 200);
                return;
            }
            
            // Open sidebar if not already open
            const toggleBtn = document.getElementById('floatingRightToggleBtn');
            if (toggleBtn) {
                toggleBtn.click();
            }
            
            // Wait for sidebar to open and DOM to settle
            const checkSidebar = () => {
                if (sidebar && sidebar.classList.contains('open')) {
                    // Wait a bit more for the control sections to be properly rendered
                    setTimeout(resolve, 300);
                } else {
                    setTimeout(checkSidebar, 100);
                }
            };
            checkSidebar();
        });
    }
    
    waitForEventsPanelOpen() {
        return new Promise((resolve) => {
            const panel = document.getElementById('leftSidebar');
            if (panel && panel.classList.contains('open')) {
                resolve();
                return;
            }
            
            // Open events panel if not already open
            const eventsBtn = document.getElementById('eventsFloatingBtn');
            if (eventsBtn) {
                eventsBtn.click();
            }
            
            // Wait for panel to open
            const checkPanel = () => {
                if (panel && panel.classList.contains('open')) {
                    resolve();
                } else {
                    setTimeout(checkPanel, 100);
                }
            };
            checkPanel();
        });
    }
    
    // Alert panel functionality removed - no longer needed
    
    waitForCondition(condition, callback) {
        if (typeof condition === 'function') {
            condition().then(callback);
        } else {
            callback();
        }
    }
    
    clearWaitingStates() {
        // Don't close panels during tour - let them stay open for better UX
        // this.closeAllPanels();
    }
    
    closeAllPanels() {
        // Close right sidebar
        const rightSidebar = document.getElementById('rightSidebar');
        if (rightSidebar && rightSidebar.classList.contains('open')) {
            const toggleBtn = document.getElementById('floatingRightToggleBtn');
            if (toggleBtn) {
                toggleBtn.click();
            }
        }
        
        // Close left sidebar
        const leftSidebar = document.getElementById('leftSidebar');
        if (leftSidebar && leftSidebar.classList.contains('open')) {
            const closeBtn = document.getElementById('closeLeftSidebarBtn');
            if (closeBtn) {
                closeBtn.click();
            }
        }
        
        // Close alert panel
        const alertPanel = document.getElementById('alertBottomPanel');
        if (alertPanel && alertPanel.classList.contains('open')) {
            const closeBtn = document.getElementById('closeAlertPanelBtn');
            if (closeBtn) {
                closeBtn.click();
            }
        }
        
        // Force close any remaining open panels by removing classes directly
        setTimeout(() => {
            if (rightSidebar) rightSidebar.classList.remove('open');
            if (leftSidebar) leftSidebar.classList.remove('open');
            if (alertPanel) alertPanel.classList.remove('open');
        }, 100);
    }
    
    // Local storage for tour state
    saveTourState(state) {
        try {
            localStorage.setItem('train-monitoring-tour-state', state);
        } catch (e) {
            // console.warn('Could not save tour state:', e);
        }
    }
    
    loadTourState() {
        try {
            const state = localStorage.getItem('train-monitoring-tour-state');
            // Map tour button is always visible, floating button is hidden by default
            // No need to show/hide based on tour completion state
        } catch (e) {
            // console.warn('Could not load tour state:', e);
        }
    }
    
    // Public method to reset tour state
    resetTourState() {
        try {
            localStorage.removeItem('train-monitoring-tour-state');
            this.triggerButton.style.display = 'block';
            // Also show the header tour button
            const tourBtn = document.getElementById('tourBtn');
            if (tourBtn) {
                tourBtn.style.display = 'block';
            }
        } catch (e) {
            // console.warn('Could not reset tour state:', e);
        }
    }
    
    // Public method to check if tour was completed
    isTourCompleted() {
        try {
            const state = localStorage.getItem('train-monitoring-tour-state');
            return state === 'completed';
        } catch (e) {
            return false;
        }
    }
    
    // Public method to show trigger button
    showTriggerButton() {
        this.triggerButton.style.display = 'block';
        this.triggerButton.style.visibility = 'visible';
        this.triggerButton.style.opacity = '1';
    }
    
    // Public method to reset tour state and show button
    resetAndShow() {
        this.resetTourState();
        this.showTriggerButton();
    }
}

// Initialize tour when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.productTour = new ProductTour();
});

// Export for global access
window.ProductTour = ProductTour;
