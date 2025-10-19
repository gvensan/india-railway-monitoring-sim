/**
 * Train Monitoring System - Utility Functions
 * Contains common utility functions and CSV parsing
 */

/**
 * Parse a CSV line handling quoted fields and escaped quotes
 * @param {string} line - CSV line to parse
 * @returns {Array} Array of parsed fields
 */
function parseCSVLine(line) {
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

// Removed duplicate calculateDistance function - using train-monitoring.js version

/**
 * Parse time string to minutes since midnight
 * @param {string} timeString - Time in "HH:MM:SS" format
 * @returns {number|null} Minutes since midnight or null if invalid
 */
function parseTimeToMinutes(timeString) {
    if (!timeString || timeString === '--:--:--') return null;
    
    const parts = timeString.split(':');
    if (parts.length >= 2) {
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        return hours * 60 + minutes;
    }
    return null;
}

/**
 * Calculate duration between two times
 * @param {string} departureTime - Departure time in "HH:MM:SS" format
 * @param {string} arrivalTime - Arrival time in "HH:MM:SS" format
 * @returns {number} Duration in minutes
 */
function calculateDurationFromTimes(departureTime, arrivalTime) {
    const depMinutes = parseTimeToMinutes(departureTime);
    const arrMinutes = parseTimeToMinutes(arrivalTime);
    
    if (depMinutes === null || arrMinutes === null) return 0;
    
    // Handle overnight trains
    if (arrMinutes < depMinutes) {
        return (24 * 60) - depMinutes + arrMinutes;
    }
    
    return arrMinutes - depMinutes;
}

/**
 * Format time from minutes to HH:MM string
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Formatted time string
 */
function formatMinutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Get train color based on train number
 * @param {string} trainNumber - Train number
 * @returns {string} CSS color value
 */
function getTrainColor(trainNumber) {
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
    const hash = trainNumber.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    return colors[hash % colors.length];
}

/**
 * Debounce function to limit function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function to limit function calls
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        parseCSVLine,
        calculateDistance,
        parseTimeToMinutes,
        calculateDurationFromTimes,
        formatMinutesToTime,
        getTrainColor,
        debounce,
        throttle
    };
}
