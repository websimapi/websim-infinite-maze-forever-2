// ui.js - Handles UI elements like modals and buttons

import { MAZE_CELL_SIZE } from 'config';
import { getPlayerMazeSquare } from './mazeUtils.js';
import { getDrawingMode, getCurrentDrawingSquare, getDrawingData } from 'drawing';
import { exportCurrentSquareImage, exportWholeMapImage } from './imageExporter.js';
import { initButtonHandlers, setRoomReference } from './buttonHandlers.js';

let roomRef; // Store the room reference
let isChatVisible = true; // Track chat visibility state
let resetButtonRef; // Reference to the reset button
let chatContainerRef; // Reference to the chat container element
let toggleChatButtonRef; // Reference to the chat toggle button
let saveImageButtonRef; // Reference to the save image button
let homeButtonListenerAdded = false; // Flag to prevent duplicate listeners

// --- Utility: Teleport Player ---
function teleportToStart() {
    if (!roomRef) {
        console.error("UI: Cannot teleport, room reference not available.");
        return;
    }

    // Calculate the initial start position, same logic as in setup.js initGame
    const startSquareCenterX = MAZE_CELL_SIZE * 0.5;
    const startSquareCenterY = MAZE_CELL_SIZE * 0.5;
    const startYOffset = -MAZE_CELL_SIZE * 0.1; // Move slightly up from the center
    const targetX = startSquareCenterX;
    const targetY = startSquareCenterY + startYOffset;

    const currentPresence = roomRef.presence[roomRef.clientId] || {};
    // Clear vote flag when teleporting home
    const newPresence = { ...currentPresence, x: targetX, y: targetY, voteToReset: null };

    console.log(`UI: Teleporting player ${roomRef.clientId} to start position (${targetX.toFixed(2)}, ${targetY.toFixed(2)}), clearing vote.`);
    roomRef.updatePresence(newPresence);

    // Update button visual immediately (subscription might lag)
    updateResetButtonVisual(false);
}

// Function to update reset button appearance based on vote status
export function updateResetButtonVisual(hasVoted) {
    if (resetButtonRef) {
        if (hasVoted) {
            resetButtonRef.classList.add('voted');
            resetButtonRef.title = "Click to revoke reset vote";
        } else {
            resetButtonRef.classList.remove('voted');
            resetButtonRef.title = "Vote to reset the map";
        }
    }
}

// --- Initialization ---
export function initUI(_room) {
    roomRef = _room; // Store the passed room reference
    setRoomReference(_room); // Pass room reference to button handlers
    
    // Initialize all button handlers via the dedicated module
    initButtonHandlers();

    console.log("UI initialized");
}