/**
 * userIdentity.js - Handles username verification and duplicate prevention
 */

let roomRef;
let infoModalRef;
let rejectionScreen = null;
let lastSignalTimestamp = 0;
const SIGNAL_INTERVAL_MS = 5000; // Ping other tabs every 5 seconds

/**
 * Initializes the user identity verification system
 * @param {object} _room - The Websim room object
 * @returns {Promise<boolean>} - True if the user can proceed, false if blocked
 */
export async function initUserIdentity(_room) {
    roomRef = _room;
    
    // Exit early if window.BroadcastChannel is not supported
    if (!window.BroadcastChannel) {
        console.log("BroadcastChannel not supported, skipping duplicate prevention");
        return true;
    }
    
    // Create a channel to communicate between tabs with the same origin
    const channel = new BroadcastChannel('infinite-maze-paint-identity');
    
    // Setup listeners for identity verification
    channel.onmessage = handleChannelMessage;
    
    // Get the current user's info (may not be available immediately)
    // Wait a bit to allow room.peers to be populated
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const currentClientId = roomRef.clientId;
    const currentUser = roomRef.peers[currentClientId];
    
    if (!currentUser || !currentUser.username) {
        console.warn("User identity check: Username not available yet");
        return true; // Allow to proceed if we can't verify
    }
    
    // Send a presence signal to other tabs
    const currentUsername = currentUser.username;
    const timestamp = Date.now();
    lastSignalTimestamp = timestamp;
    
    // Broadcast our presence
    channel.postMessage({
        type: 'presence',
        username: currentUsername, 
        clientId: currentClientId,
        timestamp: timestamp
    });
    
    // Wait a short time to see if any responses come back
    let hasConflict = false;
    await new Promise(resolve => {
        // Set a timeout to resolve the promise after 300ms
        setTimeout(() => resolve(), 300);
        
        // Update the handler to detect conflicts
        channel.onmessage = (event) => {
            if (event.data.type === 'presence-response' && 
                event.data.username === currentUsername) {
                // Another tab already has this username
                hasConflict = true;
                resolve(); // Resolve early if conflict detected
            }
        };
    });
    
    // Setup periodic pinging of our presence
    setInterval(() => {
        if (roomRef && roomRef.clientId && roomRef.peers) {
            const currentUser = roomRef.peers[roomRef.clientId];
            if (currentUser && currentUser.username) {
                lastSignalTimestamp = Date.now();
                channel.postMessage({
                    type: 'presence',
                    username: currentUser.username,
                    clientId: roomRef.clientId,
                    timestamp: lastSignalTimestamp
                });
            }
        }
    }, SIGNAL_INTERVAL_MS);
    
    // Continue listening for other tabs
    channel.onmessage = handleChannelMessage;
    
    // If we have a conflict, block this instance
    if (hasConflict) {
        showDuplicateUserScreen(currentUsername);
        return false; // Block the user from proceeding
    }
    
    return true; // Allow to proceed
}

/**
 * Handles messages from other tabs
 * @param {MessageEvent} event - The message event
 */
function handleChannelMessage(event) {
    if (!roomRef || !roomRef.clientId || !roomRef.peers) return;
    
    const currentClientId = roomRef.clientId;
    const currentUser = roomRef.peers[currentClientId];
    if (!currentUser || !currentUser.username) return;
    
    const currentUsername = currentUser.username;
    
    if (event.data.type === 'presence' && event.data.username === currentUsername) {
        // Another tab is announcing with our username
        const channel = new BroadcastChannel('infinite-maze-paint-identity');
        
        // If we've been active longer, respond to block the new tab
        if (lastSignalTimestamp < event.data.timestamp) {
            // The other tab is newer, so we respond to block it
            channel.postMessage({
                type: 'presence-response',
                username: currentUsername,
                timestamp: lastSignalTimestamp
            });
        } else {
            // We are newer - block ourselves instead
            showDuplicateUserScreen(currentUsername);
        }
    }
}

/**
 * Shows a screen blocking the user when a duplicate is detected
 * @param {string} username - The username that has a duplicate
 */
function showDuplicateUserScreen(username) {
    if (rejectionScreen) return; // Don't create multiple screens
    
    // Create the rejection overlay
    rejectionScreen = document.createElement('div');
    rejectionScreen.style.position = 'fixed';
    rejectionScreen.style.top = '0';
    rejectionScreen.style.left = '0';
    rejectionScreen.style.width = '100%';
    rejectionScreen.style.height = '100%';
    rejectionScreen.style.backgroundColor = 'rgba(0,0,0,0.9)';
    rejectionScreen.style.color = 'white';
    rejectionScreen.style.display = 'flex';
    rejectionScreen.style.flexDirection = 'column';
    rejectionScreen.style.justifyContent = 'center';
    rejectionScreen.style.alignItems = 'center';
    rejectionScreen.style.zIndex = '10000';
    rejectionScreen.style.padding = '20px';
    rejectionScreen.style.textAlign = 'center';

    rejectionScreen.innerHTML = `
        <h1 style="color: red;">Duplicate User Detected</h1>
        <p>You are already playing Infinite Maze Paint as "${username}" in another tab.</p>
        <p>Please close this tab and continue in your existing game.</p>
        <button id="refresh-page-button" style="margin-top: 20px; padding: 10px; background-color: #4287f5; color: white; border: none; border-radius: 5px; cursor: pointer;">Refresh Page</button>
    `;

    document.body.appendChild(rejectionScreen);
    
    // Add refresh button handler
    document.getElementById('refresh-page-button').addEventListener('click', () => {
        window.location.reload();
    });
}