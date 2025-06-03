// players.js
import { PLAYER_COLOR, OTHER_PLAYER_COLOR, PLAYER_WORLD_SIZE } from 'config';
// getCurrentTransform is already imported/used in renderer.js and passed here
import { is3DModeActive } from './render3d.js';

let players = {};
let roomRef;
let gameContainerRef;

export function initPlayers(_room, _canvas, _gameContainer) {
    roomRef = _room;
    gameContainerRef = _gameContainer;
}

// Accept the full cameraTransform object { offsetX, offsetY, zoom }
export function updatePlayerAvatars(cameraTransform) {
    if (!roomRef || !gameContainerRef || !cameraTransform) return;
    
    // HIDE PLAYERS IN 3D MODE
    if (is3DModeActive()) {
        // Hide all existing players when in 3D mode
        for (const clientId in players) {
            if (players[clientId].element) {
                players[clientId].element.style.display = 'none';
            }
        }
        return;
    }

    const { offsetX, offsetY, zoom } = cameraTransform; // Destructure the values
    const currentPresence = roomRef.presence || {};
    const currentPeers = roomRef.peers || {};
    const activePlayerIds = new Set();

    // Add/Update players
    for (const clientId in currentPresence) {
        activePlayerIds.add(clientId);
        const playerState = currentPresence[clientId];
        const peerInfo = currentPeers[clientId];

        if (playerState && playerState.x !== undefined && playerState.y !== undefined && peerInfo) {
            let playerElements = players[clientId];

            // Calculate screen position using world coords, camera offset, and zoom
            // screenX = worldX * zoom + offsetX
            const screenX = playerState.x * zoom + offsetX;
            const screenY = playerState.y * zoom + offsetY;

            // Calculate avatar size in screen pixels based on world size and zoom
            const avatarScreenSize = PLAYER_WORLD_SIZE * zoom;
            // Minimum size to prevent avatar becoming too tiny or invisible
            const minAvatarScreenSize = 4;
            const clampedAvatarScreenSize = Math.max(minAvatarScreenSize, avatarScreenSize);

            if (!playerElements) {
                // Create new avatar element
                const avatarElement = document.createElement('div');
                avatarElement.classList.add('player-avatar');
                avatarElement.style.backgroundImage = `url(${peerInfo.avatarUrl})`;
                // Size will be set below
                avatarElement.style.backgroundColor = clientId === roomRef.clientId ? PLAYER_COLOR : OTHER_PLAYER_COLOR;
                avatarElement.style.backgroundSize = 'cover';

                const nameElement = document.createElement('div');
                nameElement.classList.add('player-name');
                nameElement.textContent = peerInfo.username;
                
                // Add admin class if username is an admin
                if (peerInfo.username === "BookwormKevin" || peerInfo.username === "MapleLeavess" || peerInfo.username === "areyouaperson") {
                    nameElement.classList.add('admin-username');
                }
                
                // Position will be set below
                avatarElement.appendChild(nameElement);
                gameContainerRef.appendChild(avatarElement);
                players[clientId] = { element: avatarElement, nameElement: nameElement };
                playerElements = players[clientId];
            }

            // Update size
            playerElements.element.style.width = `${clampedAvatarScreenSize}px`;
            playerElements.element.style.height = `${clampedAvatarScreenSize}px`;

            // Update position (center the scaled avatar visually)
            // The screenX/Y represent the world origin point on the screen. Center the pixel-sized avatar on it.
            const centeredX = screenX - clampedAvatarScreenSize / 2;
            const centeredY = screenY - clampedAvatarScreenSize / 2;
            playerElements.element.style.left = `${centeredX}px`;
            playerElements.element.style.top = `${centeredY}px`;

            // Update name position below the avatar
            // Adjust based on the avatar's *current* screen size
            // Calculate offset from the *top* of the avatar element for simpler positioning
            const nameTopOffset = clampedAvatarScreenSize + 2; // Place 2px below bottom edge
            playerElements.nameElement.style.top = `${nameTopOffset}px`; // Position relative to avatar's top
            // Reset bottom style if it was previously used
            playerElements.nameElement.style.bottom = 'auto';

            // Update username if it changed
            if (playerElements.nameElement.textContent !== peerInfo.username) {
                playerElements.nameElement.textContent = peerInfo.username;
            }

            // Hide/Show logic based on screen position remains the same
            const canvasWidth = gameContainerRef.clientWidth;
            const canvasHeight = gameContainerRef.clientHeight;
            // Adjust margin based on current avatar size
            const margin = clampedAvatarScreenSize * 1.5;
            if (centeredX < -margin || centeredX > canvasWidth + margin || centeredY < -margin || centeredY > canvasHeight + margin) {
                playerElements.element.style.display = 'none';
            } else {
                playerElements.element.style.display = 'block';
            }

        } else if (players[clientId]?.element) { // Check if element exists before hiding
            // Player state exists but missing position, or peer info missing, hide avatar
            players[clientId].element.style.display = 'none';
        }
    }

    // Remove players who disconnected
    for (const clientId in players) {
        if (!activePlayerIds.has(clientId)) {
            if (players[clientId].element) {
                players[clientId].element.remove();
            }
            delete players[clientId];
            console.log(`Removed avatar for disconnected player ${clientId}`);
        }
    }
}

export function clearPlayers() {
    for (const clientId in players) {
        if (players[clientId].element) {
            players[clientId].element.remove();
        }
    }
    players = {};
}