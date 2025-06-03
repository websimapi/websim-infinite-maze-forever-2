// admin.js - Handles the moderation panel for designated admins

import { teleportPlayersInSquare } from './teleportUtils.js'; 
import { isAuthorizedAdmin, showUnauthorizedError } from './adminAuth.js'; 
import { getPlayerMazeSquare } from './mazeUtils.js'; 
import { clearChatHistory, emergencyChatReset } from './chatAdmin.js';

let roomRef;
let adminPanel = null;
let adminButton = null; // Reference to the toggle button
let isPanelVisible = false;
const ADMIN_USERNAMES = ["BookwormKevin", "MapleLeavess", "areyouaperson"]; // The usernames allowed to access the panel

/**
 * Creates the HTML structure for the admin panel.
 */
function createAdminPanel() {
    if (adminPanel) return; // Already created

    adminPanel = document.createElement('div');
    adminPanel.id = 'admin-panel';
    adminPanel.style.display = 'none'; // Initially hidden
    adminPanel.style.overflowY = 'auto'; // Make panel scrollable

    adminPanel.innerHTML = `
        <h3>Administrator Controls</h3>
        <div class="admin-section">
            <h4>Delete Square</h4>
            <div class="admin-field-group">
                <input type="number" id="admin-delete-x" name="admin-delete-x" step="1" placeholder="X">
                <input type="number" id="admin-delete-y" name="admin-delete-y" step="1" placeholder="Y">
            </div>
            <div class="admin-control-group">
                <button id="admin-delete-button">Delete Square</button>
                <button id="admin-delete-here-button">Delete Current Square</button>
            </div>
        </div>
        <div class="admin-section">
            <h4>Delete By Username</h4>
            <input type="text" id="admin-delete-username" name="admin-delete-username" placeholder="Enter username">
            <div class="admin-control-group">
                <button id="admin-delete-by-username-button">Delete All Squares</button>
            </div>
            <div id="delete-by-username-result"></div>
        </div>
        <div class="admin-section">
            <h4>Movement & Display Options</h4>
            <label>
                <input type="checkbox" id="admin-noclip-checkbox"> NoClip Mode (Walk through walls)
            </label>
            <label>
                <input type="checkbox" id="admin-show-coords-checkbox"> Show Coordinates on Squares
            </label>
        </div>
        <div class="admin-section">
            <h4>Chat Management</h4>
            <div class="admin-control-group">
                <button id="admin-clear-chat-button">Clear Chat History</button>
                <button id="admin-emergency-chat-reset-button">Emergency Chat Reset</button>
            </div>
        </div>
        <hr>
        <div class="admin-section">
            <h4>Map Reset</h4>
            <button id="admin-reset-map-button">Reset Entire Map</button>
        </div>
        <button id="admin-close-button" class="modal-close">&times;</button>
    `;

    document.body.appendChild(adminPanel);

    // Add event listeners for panel content
    document.getElementById('admin-delete-button')?.addEventListener('click', handleDeleteSquare);
    document.getElementById('admin-delete-here-button')?.addEventListener('click', handleDeleteSquareHere);
    document.getElementById('admin-delete-by-username-button')?.addEventListener('click', handleDeleteByUsername);
    document.getElementById('admin-reset-map-button')?.addEventListener('click', handleResetMap);
    document.getElementById('admin-close-button')?.addEventListener('click', toggleAdminPanel);
    document.getElementById('admin-noclip-checkbox')?.addEventListener('change', handleNoClipToggle);
    document.getElementById('admin-show-coords-checkbox')?.addEventListener('change', handleShowCoordsToggle);
    document.getElementById('admin-clear-chat-button')?.addEventListener('click', handleClearChat);
    document.getElementById('admin-emergency-chat-reset-button')?.addEventListener('click', handleEmergencyChatReset);

    // Prevent key events from propagating in input fields
    const inputs = adminPanel.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('keydown', (event) => {
            // Prevent key events like WASD from controlling player movement
            event.stopPropagation();
        });
    });
}

/**
 * Updates the visibility of the admin toggle button based on the user.
 */
function showAdminButtonIfAdmin() {
    if (!adminButton) {
        adminButton = document.getElementById('admin-panel-button');
        if (!adminButton) return; // Button not found in DOM yet
    }
    const currentUser = roomRef?.peers?.[roomRef.clientId];
    const isAdmin = currentUser && ADMIN_USERNAMES.includes(currentUser.username);
    adminButton.style.display = isAdmin ? 'flex' : 'none'; // Use flex to match other buttons
}

/**
 * Toggles the visibility of the admin panel itself.
 */
function toggleAdminPanel() {
    if (!adminPanel) createAdminPanel(); // Ensure panel exists

    const currentUser = roomRef?.peers?.[roomRef.clientId];
    if (!currentUser || !ADMIN_USERNAMES.includes(currentUser.username)) {
         // If somehow triggered by non-admin, ensure it's hidden
         if (adminPanel) adminPanel.style.display = 'none';
         isPanelVisible = false;
         return;
    }

    isPanelVisible = !isPanelVisible;
    if (adminPanel) {
        adminPanel.style.display = isPanelVisible ? 'block' : 'none';
    }
}

/**
 * Handles the keydown event to listen for the admin panel toggle key.
 * @param {KeyboardEvent} event
 */
function handleKeyDown(event) {
    // Check if the user is the designated admin
    const currentUser = roomRef?.peers?.[roomRef.clientId];
    if (!currentUser || !ADMIN_USERNAMES.includes(currentUser.username)) {
        // If panel exists and is visible, allow non-admin to hide it with the key
        if (adminPanel && isPanelVisible && event.key === '`') {
            event.preventDefault(); // Prevent typing ` if an input is focused
            toggleAdminPanel();
        }
        return;
    }

    // Toggle panel on backtick key (`) for admin
    if (event.key === '`') {
        event.preventDefault(); // Prevent typing the character if an input is focused
        toggleAdminPanel();
    }
}

/**
 * Handles the "Delete Square" button click.
 */
async function handleDeleteSquare() {
    // Add authorization check before proceeding
    if (!isAuthorizedAdmin(roomRef)) {
        showUnauthorizedError("square deletion");
        return;
    }
    
    const inputX = document.getElementById('admin-delete-x');
    const inputY = document.getElementById('admin-delete-y');

    if (!inputX || !inputY) return;

    const mazeX = parseInt(inputX.value, 10);
    const mazeY = parseInt(inputY.value, 10);

    if (isNaN(mazeX) || isNaN(mazeY)) {
        alert("Admin Error: Please enter valid integer coordinates for X and Y.");
        return;
    }

    // Prevent deleting the start square
    if (mazeX === 0 && mazeY === 0) {
        alert("Admin Error: Cannot delete the Start Square (0, 0).");
        return;
    }

    console.log(`ADMIN ACTION: Deleting square ${mazeX},${mazeY}`);
    
    try {
        // First, teleport any players who might be within this square, EXCEPT the admin
        teleportPlayersInSquare(roomRef, mazeX, mazeY, roomRef.clientId);
        
        // Delete the tile from database
        const tiles = roomRef.collection('tile_v1').getList();
        const tileToDelete = tiles.find(tile => tile.mazeX === mazeX && tile.mazeY === mazeY);
        
        if (tileToDelete) {
            await roomRef.collection('tile_v1').delete(tileToDelete.id);
            alert(`Success: Square (${mazeX}, ${mazeY}) has been deleted.`);
            console.log(`Successfully deleted tile ${tileToDelete.id} for square ${mazeX},${mazeY}`);
        } else {
            alert(`Info: No tile found at coordinates (${mazeX}, ${mazeY}). Square was already empty.`);
            console.log(`No tile found to delete at ${mazeX},${mazeY}`);
        }
        
        // Also ensure any drawing claim is removed
        roomRef.updateRoomState({
            drawingSquares: {
                [`${mazeX},${mazeY}`]: null
            }
        });
        
        // Clear the input fields after successful operation
        inputX.value = '';
        inputY.value = '';
        
    } catch (error) {
        console.error('Failed to delete tile:', error);
        alert(`Error: Failed to delete square (${mazeX}, ${mazeY}). Error: ${error.message}`);
    }
}

/**
 * Handles the "Delete Square Here" button click.
 */
async function handleDeleteSquareHere() {
    // Add authorization check before proceeding
    if (!isAuthorizedAdmin(roomRef)) {
        showUnauthorizedError("square deletion");
        return;
    }
    
    const player = roomRef.presence[roomRef.clientId];
    if (!player || player.x === undefined || player.y === undefined) {
        alert("Admin Error: Cannot determine your position.");
        return;
    }
    
    const { mazeX, mazeY } = getPlayerMazeSquare(player);
    
    // Prevent deleting the start square
    if (mazeX === 0 && mazeY === 0) {
        alert("Admin Error: Cannot delete the Start Square (0, 0).");
        return;
    }

    console.log(`ADMIN ACTION: Deleting square ${mazeX},${mazeY} at current position`);
    
    try {
        // First, teleport any players who might be within this square, EXCEPT the admin
        teleportPlayersInSquare(roomRef, mazeX, mazeY, roomRef.clientId);
        
        // Delete the tile from database
        const tiles = roomRef.collection('tile_v1').getList();
        const tileToDelete = tiles.find(tile => tile.mazeX === mazeX && tile.mazeY === mazeY);
        
        if (tileToDelete) {
            await roomRef.collection('tile_v1').delete(tileToDelete.id);
            alert(`Success: Square (${mazeX}, ${mazeY}) at your current position has been deleted.`);
            console.log(`Successfully deleted tile ${tileToDelete.id} for square ${mazeX},${mazeY}`);
        } else {
            alert(`Info: No tile found at your current position (${mazeX}, ${mazeY}). Square was already empty.`);
            console.log(`No tile found to delete at current position ${mazeX},${mazeY}`);
        }
        
        // Also ensure any drawing claim is removed
        roomRef.updateRoomState({
            drawingSquares: {
                [`${mazeX},${mazeY}`]: null
            }
        });
        
    } catch (error) {
        console.error('Failed to delete tile:', error);
        alert(`Error: Failed to delete square at your position (${mazeX}, ${mazeY}). Error: ${error.message}`);
    }
}

/**
 * Handles the "Delete All Squares By Username" button click.
 */
async function handleDeleteByUsername() {
    // Add authorization check before proceeding
    if (!isAuthorizedAdmin(roomRef)) {
        showUnauthorizedError("square deletion by username");
        return;
    }
    
    const usernameInput = document.getElementById('admin-delete-username');
    const resultDiv = document.getElementById('delete-by-username-result');
    
    if (!usernameInput || !resultDiv) return;
    
    const targetUsername = usernameInput.value.trim();
    
    if (!targetUsername) {
        resultDiv.textContent = "Please enter a username";
        resultDiv.style.color = "red";
        return;
    }
    
    // Prevent accidental deletion of system squares
    if (targetUsername.toLowerCase() === 'system') {
        resultDiv.textContent = "Cannot delete system squares";
        resultDiv.style.color = "red";
        return;
    }
    
    try {
        // Get all tiles from database
        const tiles = roomRef.collection('tile_v1').getList();
        const tilesToDelete = tiles.filter(tile => tile.username === targetUsername);
        
        if (tilesToDelete.length === 0) {
            resultDiv.textContent = `No squares found owned by "${targetUsername}"`;
            resultDiv.style.color = "black";
            return;
        }
        
        // Confirm deletion
        const confirmMessage = `Delete ${tilesToDelete.length} squares owned by "${targetUsername}"?`;
        if (!window.confirm(confirmMessage)) {
            resultDiv.textContent = "Deletion cancelled";
            resultDiv.style.color = "black";
            return;
        }
        
        console.log(`ADMIN ACTION: Deleting ${tilesToDelete.length} squares owned by "${targetUsername}"`);
        
        let successCount = 0;
        let errorCount = 0;
        
        // Process each tile
        for (const tile of tilesToDelete) {
            try {
                // Teleport any players on this square, except admin
                teleportPlayersInSquare(roomRef, tile.mazeX, tile.mazeY, roomRef.clientId);
                
                // Delete from database
                await roomRef.collection('tile_v1').delete(tile.id);
                successCount++;
            } catch (error) {
                console.error('Failed to delete tile:', tile.id, error);
                errorCount++;
            }
        }
        
        // Clear any drawing claims for these squares
        const drawingSquaresUpdates = {};
        tilesToDelete.forEach(tile => {
            drawingSquaresUpdates[`${tile.mazeX},${tile.mazeY}`] = null;
        });
        roomRef.updateRoomState({ drawingSquares: drawingSquaresUpdates });
        
        // Show result
        if (errorCount === 0) {
            resultDiv.textContent = `Successfully deleted all ${successCount} squares owned by "${targetUsername}"`;
            resultDiv.style.color = "green";
        } else {
            resultDiv.textContent = `Deleted ${successCount} squares, failed to delete ${errorCount} squares owned by "${targetUsername}"`;
            resultDiv.style.color = "orange";
        }
        
        // Clear the input field
        usernameInput.value = "";
        
    } catch (error) {
        console.error('Error during bulk deletion:', error);
        resultDiv.textContent = `Error occurred during deletion: ${error.message}`;
        resultDiv.style.color = "red";
    }
}

/**
 * Handles the "Reset Map" button click.
 */
function handleResetMap() {
    // Add authorization check before proceeding
    if (!isAuthorizedAdmin(roomRef)) {
        showUnauthorizedError("map reset");
        return;
    }
    
    if (window.confirm("ADMIN ACTION: Are you sure you want to reset the ENTIRE map? This will delete all squares (except Start) and teleport all players.")) {
        console.log("ADMIN ACTION: Triggering full map reset.");
        // Not implemented in the plan, assuming it should be removed
        // Call the reset function passed from mapManager, indicating admin initiator
        // resetMapFuncRef("Admin");
        alert("Not implemented in the plan.");
        toggleAdminPanel(); // Close panel after reset
    }
}

/**
 * Handles the NoClip checkbox state change
 */
function handleNoClipToggle(event) {
    // Add authorization check before proceeding
    if (!isAuthorizedAdmin(roomRef)) {
        // Reset checkbox to original state
        event.target.checked = !event.target.checked;
        showUnauthorizedError("NoClip toggle");
        return;
    }
    
    const isNoClipEnabled = event.target.checked;
    
    if (!roomRef) return;
    
    console.log(`ADMIN ACTION: NoClip mode ${isNoClipEnabled ? 'enabled' : 'disabled'}`);
    
    // Store the noclip setting in the admin's presence
    roomRef.updatePresence({
        adminNoClip: isNoClipEnabled
    });
}

/**
 * Handles the Show Coordinates checkbox state change
 */
function handleShowCoordsToggle(event) {
    // Add authorization check before proceeding
    if (!isAuthorizedAdmin(roomRef)) {
        // Reset checkbox to original state
        event.target.checked = !event.target.checked;
        showUnauthorizedError("coordinate display toggle");
        return;
    }
    
    const isShowCoordsEnabled = event.target.checked;
    
    if (!roomRef) return;
    
    console.log(`ADMIN ACTION: Show coordinates ${isShowCoordsEnabled ? 'enabled' : 'disabled'}`);
    
    // Store the show coordinates setting in the admin's presence
    roomRef.updatePresence({
        adminShowCoords: isShowCoordsEnabled
    });
}

/**
 * Handles the "Clear Chat History" button click.
 */
function handleClearChat() {
    if (!isAuthorizedAdmin(roomRef)) {
        showUnauthorizedError("chat clearing");
        return;
    }
    
    if (window.confirm("ADMIN ACTION: Are you sure you want to clear all chat history? This cannot be undone.")) {
        console.log("ADMIN ACTION: Clearing chat history.");
        clearChatHistory(roomRef)
            .then(success => {
                if (success) {
                    alert("Chat history has been cleared.");
                } else {
                    alert("Failed to clear chat history.");
                }
            })
            .catch(error => {
                console.error("Error clearing chat:", error);
                alert("Error clearing chat history. See console for details.");
            });
    }
}

/**
 * Handles the "Emergency Chat Reset" button click.
 * This is different from clearing - it resets the chat system itself
 */
function handleEmergencyChatReset() {
    if (!isAuthorizedAdmin(roomRef)) {
        showUnauthorizedError("emergency chat reset");
        return;
    }
    
    if (window.confirm("ADMIN ACTION: This will perform an emergency reset of the chat system. Use this if chat appears to be stuck or broken. Continue?")) {
        console.log("ADMIN ACTION: Performing emergency chat reset.");
        emergencyChatReset(roomRef)
            .then(success => {
                if (success) {
                    alert("Emergency chat reset completed.");
                } else {
                    alert("Failed to perform emergency chat reset.");
                }
            })
            .catch(error => {
                console.error("Error during emergency chat reset:", error);
                alert("Error during emergency chat reset. See console for details.");
            });
    }
}

/**
 * Initializes the admin functionality.
 * @param {object} _room - The Websim room object.
 */
export function initAdmin(_room) {
    roomRef = _room;

    // Create panel structure, get button reference, add listener for button
    createAdminPanel();
    adminButton = document.getElementById('admin-panel-button');
    if (adminButton) {
        adminButton.addEventListener('click', toggleAdminPanel); // Add listener to button
    } else {
        console.error("Admin Init: Could not find admin panel button element.");
    }

    // Add keydown listener to the document for the backtick toggle
    document.addEventListener('keydown', handleKeyDown);

    // Perform initial check for button visibility (peers might not be ready yet)
    showAdminButtonIfAdmin();

    console.log("Admin module initialized. Press ` key or use button as admin to toggle panel.");
}

/**
 * Exposed function to update button visibility, called from setup.js presence subscription.
 */
export function updateAdminButtonVisibility() {
    showAdminButtonIfAdmin();
}