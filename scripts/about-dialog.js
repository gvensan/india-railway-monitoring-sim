/**
 * About Dialog Management
 * 
 * This script handles the About dialog functionality including
 * opening/closing the dialog and updating system status information.
 */

// About dialog functions
function openAboutDialog() {
    const dialog = document.getElementById('about-dialog');
    if (dialog) {
        dialog.style.display = 'flex';
        updateAboutStatus();
    }
}

function closeAboutDialog() {
    const dialog = document.getElementById('about-dialog');
    if (dialog) {
        dialog.style.display = 'none';
    }
}

// Update system status in about dialog
function updateAboutStatus() {
    // Update broker status
    const brokerStatus = document.getElementById('about-broker-status');
    if (brokerStatus && window.solaceTrainMonitor) {
        if (window.solaceTrainMonitor.isConnected) {
            brokerStatus.textContent = 'Connected (Solace)';
            brokerStatus.className = 'status-value connected';
        } else if (window.solaceTrainMonitor.brokerType === 'inmemory') {
            brokerStatus.textContent = 'Connected (In-Memory)';
            brokerStatus.className = 'status-value connected';
        } else {
            brokerStatus.textContent = 'Disconnected';
            brokerStatus.className = 'status-value disconnected';
        }
    }
    
    // Update event manager status
    const eventStatus = document.getElementById('about-event-status');
    if (eventStatus && window.eventManager) {
        eventStatus.textContent = 'Active';
        eventStatus.className = 'status-value active';
    }
    
    // Update train monitor status
    const trainStatus = document.getElementById('about-train-status');
    if (trainStatus && window.trainMonitorInstance) {
        trainStatus.textContent = 'Ready';
        trainStatus.className = 'status-value ready';
    }
}

// Initialize about dialog when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add click handler for about button
    const aboutBtn = document.getElementById('aboutBtn');
    if (aboutBtn) {
        aboutBtn.addEventListener('click', openAboutDialog);
    }
    
    // Close dialog when clicking outside
    const aboutDialog = document.getElementById('about-dialog');
    if (aboutDialog) {
        aboutDialog.addEventListener('click', (e) => {
            if (e.target === aboutDialog) {
                closeAboutDialog();
            }
        });
    }
    
    // Close dialog with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAboutDialog();
        }
    });
    
    // Update status periodically
    setInterval(updateAboutStatus, 5000);
});

// Export functions for global access
window.openAboutDialog = openAboutDialog;
window.closeAboutDialog = closeAboutDialog;
