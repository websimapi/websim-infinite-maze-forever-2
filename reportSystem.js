/**
 * reportSystem.js - Handles user reporting and ban voting functionality
 * 
 * -- REPORTING IS DISABLED --
 * 
 * All code here is still present for reference, but the feature is fully disabled.
 */

export function initReportSystem(_room) {
    // Reporting system is disabled. Hide the report button if it exists.
    const reportButton = document.getElementById('report-button');
    if (reportButton) {
        reportButton.style.display = 'none';
        reportButton.disabled = true;
        reportButton.title = "Player reporting is currently disabled.";
    }
}

// All other code removed/disabled: player reporting functionality is not available.

export function handleBanPresenceUpdateRequest(updateRequest) {
    // Reporting is disabled: do nothing
}