/**
 * reportFormUI.js - Handles UI creation and rendering for the report system
 */

/**
 * Creates and returns the HTML structure for the report modal
 * @returns {string} - HTML content for the report modal
 */
export function createReportModalHTML() {
    return `
        <div class="modal-content">
            <button id="close-report-modal" class="modal-close">&times;</button>
            <h2>Report a Player</h2>
            <div id="report-selection-container">
                <p>Select a player to report for inappropriate content or behavior:</p>
                <div id="report-player-list" class="report-player-list">
                    <p>Loading players...</p>
                </div>
                <div id="report-reason-container" style="display: none; margin-top: 15px;">
                    <h3>Report: <span id="selected-player-name"></span></h3>
                    <label for="report-reason">Reason for report:</label>
                    <textarea id="report-reason" rows="3" placeholder="Please explain why you are reporting this player" style="width: 100%; margin-top: 5px; padding: 5px;"></textarea>
                    <div style="margin-top: 10px; display: flex; justify-content: space-between;">
                        <button id="back-to-player-selection" class="report-button" style="background-color: #6c757d;">Back</button>
                        <button id="submit-report-button" class="report-button" style="background-color: #dc3545;">Submit Report</button>
                    </div>
                </div>
            </div>
            <div id="active-vote-container" style="display: none;">
                <h3>Active Ban Vote</h3>
                <p id="active-vote-info">Vote in progress for: <span id="vote-target-name"></span></p>
                <p id="vote-reason" style="font-style: italic; background-color: #f8f9fa; padding: 8px; border-radius: 4px; margin: 10px 0;"></p>
                <div class="vote-buttons">
                    <button id="vote-yes-button" class="vote-button vote-yes">Vote YES</button>
                    <button id="vote-no-button" class="vote-button vote-no">Vote NO</button>
                </div>
                <p id="vote-count">Votes: <span id="vote-yes-count">0</span> YES / <span id="vote-no-count">0</span> NO</p>
                <div id="vote-timer" class="vote-timer">
                    <div id="vote-timer-bar" class="vote-timer-bar"></div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Creates a player item element for the report list
 * @param {string} username - The username to display
 * @param {string} clientId - The client ID of the player
 * @returns {HTMLElement} - The player item element
 */
export function createPlayerListItem(username, clientId) {
    const playerItem = document.createElement('div');
    playerItem.className = 'report-player-item';
    
    // Create report button for this player
    const reportPlayerButton = document.createElement('button');
    reportPlayerButton.className = 'report-player-button';
    reportPlayerButton.textContent = `Report ${username}`;
    reportPlayerButton.dataset.username = username;
    reportPlayerButton.dataset.clientId = clientId;
    
    playerItem.appendChild(reportPlayerButton);
    return playerItem;
}

/**
 * Shows the reason input form for a selected player
 * @param {string} username - The username of the selected player
 */
export function showReasonInput(username) {
    const selectionContainer = document.getElementById('report-selection-container');
    const playerList = document.getElementById('report-player-list');
    const reasonContainer = document.getElementById('report-reason-container');
    const selectedPlayerName = document.getElementById('selected-player-name');
    const reasonTextarea = document.getElementById('report-reason');
    
    if (!selectionContainer || !playerList || !reasonContainer || !selectedPlayerName) return;
    
    // Show the reason input and hide the player list
    playerList.style.display = 'none';
    reasonContainer.style.display = 'block';
    selectedPlayerName.textContent = username;
    reasonTextarea.value = ''; // Clear previous input
    
    // Focus the textarea
    setTimeout(() => reasonTextarea.focus(), 100);
}

/**
 * Returns to the player selection view
 */
export function showPlayerSelection() {
    const playerList = document.getElementById('report-player-list');
    const reasonContainer = document.getElementById('report-reason-container');
    
    if (!playerList || !reasonContainer) return;
    
    // Show the player list and hide the reason input
    playerList.style.display = 'block';
    reasonContainer.style.display = 'none';
}

/**
 * Updates the active vote UI to show the vote reason
 * @param {string} reason - The reason for the vote
 */
export function updateVoteReason(reason) {
    const voteReasonElement = document.getElementById('vote-reason');
    if (voteReasonElement) {
        voteReasonElement.textContent = reason || 'No reason provided';
    }
}
