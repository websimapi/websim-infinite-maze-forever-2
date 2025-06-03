// teleportUtils.js - Centralized functions for teleporting players

/**
 * Teleports a player to the start position (0,0).
 * @param {object} room - The Websim room object.
 * @param {string} clientId - The client ID to teleport. If not specified, teleports the current player.
 * @returns {boolean} - Whether the teleport was requested/performed.
 */
export function teleportToStart(room, clientId = null) {
    if (!room) {
        console.error("TeleportUtils: Room reference not available.");
        return false;
    }

    // Calculate the start position (same logic used elsewhere in the codebase)
    const startSquareCenterX = 0.5 * 20; // MAZE_CELL_SIZE is 20
    const startSquareCenterY = 0.5 * 20;
    const startYOffset = -20 * 0.1; // Move slightly up from center
    const targetX = startSquareCenterX;
    const targetY = startSquareCenterY + startYOffset;

    if (clientId === null || clientId === room.clientId) {
        // Teleport self
        const currentPresence = room.presence[room.clientId] || {};
        const newPresence = { 
            ...currentPresence, 
            x: targetX, 
            y: targetY, 
            voteToReset: null // Clear vote flag when teleporting
        };
        console.log(`TeleportUtils: Teleporting self to start (${targetX.toFixed(2)}, ${targetY.toFixed(2)})`);
        room.updatePresence(newPresence);
        return true;
    } else {
        // Request teleport for another player
        console.log(`TeleportUtils: Requesting teleport for ${clientId} to start`);
        room.requestPresenceUpdate(clientId, {
            type: 'forceTeleport',
            targetX: targetX,
            targetY: targetY,
            voteToReset: null // Also clear their vote
        });
        return true;
    }
}

/**
 * Checks if a player is inside a specific maze square and teleports them to start if they are.
 * @param {object} room - The Websim room object.
 * @param {number} mazeX - Maze X coordinate of the square.
 * @param {number} mazeY - Maze Y coordinate of the square.
 * @param {string} [excludeClientId=null] - Optional client ID to exclude from teleportation (e.g. admin)
 * @returns {Array<string>} - Array of client IDs that were teleported.
 */
export function teleportPlayersInSquare(room, mazeX, mazeY, excludeClientId = null) {
    if (!room || !room.presence) {
        console.error("TeleportUtils: Room or presence not available.");
        return [];
    }

    const MAZE_CELL_SIZE = 20; // Using direct value to avoid circular imports
    const teleportedPlayers = [];

    // Calculate square bounds in world coordinates
    const minX = mazeX * MAZE_CELL_SIZE;
    const maxX = (mazeX + 1) * MAZE_CELL_SIZE;
    const minY = mazeY * MAZE_CELL_SIZE;
    const maxY = (mazeY + 1) * MAZE_CELL_SIZE;

    for (const clientId in room.presence) {
        // Skip the excluded client ID (typically the admin)
        if (excludeClientId && clientId === excludeClientId) {
            console.log(`TeleportUtils: Excluding ${clientId} from teleportation`);
            continue;
        }
        
        const playerState = room.presence[clientId];
        
        // Check if player has position and is within the deleted square
        if (playerState && playerState.x !== undefined && playerState.y !== undefined) {
            if (playerState.x >= minX && playerState.x < maxX && 
                playerState.y >= minY && playerState.y < maxY) {
                
                // Teleport this player to start
                if (clientId === room.clientId) {
                    teleportToStart(room); // Teleport self
                } else {
                    teleportToStart(room, clientId); // Request teleport for other
                }
                
                teleportedPlayers.push(clientId);
                const username = room.peers[clientId]?.username || `User (${clientId.substring(0, 4)})`;
                console.log(`TeleportUtils: ${username} was in deleted square (${mazeX},${mazeY}), teleporting to start.`);
            }
        }
    }

    return teleportedPlayers;
}