// adminAuth.js - Utility functions for admin authorization

/**
 * Checks if the current user is authorized to perform admin actions
 * @param {object} room - The Websim room object
 * @returns {boolean} True if the user is authorized, false otherwise
 */
export function isAuthorizedAdmin(room) {
    if (!room || !room.clientId || !room.peers) return false;
    
    const currentUser = room.peers[room.clientId];
    if (!currentUser) return false;
    
    // First condition: username must be exactly "BookwormKevin" or "MapleLeavess" or "areyouaperson"
    return currentUser.username === "BookwormKevin" || currentUser.username === "MapleLeavess" || currentUser.username === "areyouaperson";
}

/**
 * Shows an error message when an unauthorized admin action is attempted
 * @param {string} action - The action that was attempted
 */
export function showUnauthorizedError(action = "admin action") {
    console.error(`Unauthorized ${action} attempted. Only BookwormKevin or MapleLeavess or areyouaperson can perform this action.`);
    alert(`Unauthorized: Only BookwormKevin or MapleLeavess or areyouaperson can perform this ${action}.`);
}