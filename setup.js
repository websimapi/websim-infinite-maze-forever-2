// setup.js - Handles initialization of modules and game setup

import {
    MAZE_CELL_SIZE, DRAWING_RESOLUTION,
} from 'config';
import { initDrawing, getDrawingMode, getCurrentDrawingSquare, getDrawingData, updateMazeReference as updateDrawingMazeRef, finishDrawing, startDrawing as startDrawingFunc } from 'drawing'; 
import { initPlayers, updatePlayerAvatars, clearPlayers } from 'players';
import { setupInputHandling, updateMazeReference as updateInputMazeRef, updatePlayerMovementFromContinuousInput, updateInputDrawingSquaresRef } from 'input';
import { getPlayerMazeSquare } from './mazeUtils.js';
import { initCamera } from './camera.js';
// Import renderer functions
import { initRenderer, drawFrame, updateRendererMazeReference } from './renderer.js';
// Import cache update function explicitly if needed outside renderer (currently not needed)
// import { updateCacheMazeRef } from './squareRendererCache.js';
import { initChat, handleRoomStateUpdate as handleChatUpdate, sendSystemMessage } from './chat.js';
import { initUI, updateResetButtonVisual } from './ui.js';
// --- Map Manager Import Updated ---
import { initMapManager, createInitialMazeSquare, getInitialStartSquareData } from './mapManager.js';
// --- Admin Module Import Added ---
import { initAdmin, updateAdminButtonVisibility } from './admin.js'; 
// --- Settings Module Import Added ---
import { initSettings, getKeyboardSpeed, getMouseSensitivity, getMouseMovementEnabled } from './settings.js'; 
// Import report system
import { initReportSystem, handleBanPresenceUpdateRequest } from './reportSystem.js';
// Import button handlers
import { initButtonHandlers, setRoomReference } from './buttonHandlers.js';
// Import 3D renderer
import { init3DRenderer, update3DMazeReference } from './render3d.js';
import { SYSTEM_MESSAGE } from './systemMessages.js';
// Import notification system
import { showInfoPopup } from './popupSystem.js';

// NOTE: imageImport is initialized within drawing.js/setupDrawingControlsInternal

// --- DOM Element References ---
const canvas = document.getElementById('maze-canvas');
const ctx = canvas.getContext('2d');
const gameContainer = document.getElementById('game-container');
const playerInfoDiv = document.getElementById('player-info');
const playerListDiv = document.getElementById('player-list'); 
const controlsContainer = document.getElementById('controls');
const drawingControls = document.getElementById('drawing-controls');
const paletteContainer = document.getElementById('palette-container');
const brushContainer = document.getElementById('brush-container');
const finishDrawingButton = document.getElementById('finish-drawing-button');
const undoDrawingButton = document.getElementById('undo-drawing-button');
const importImageButton = document.getElementById('import-image-button');
const importImageInput = document.getElementById('import-image-input');
const chatMessagesDiv = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const cancelDrawingButton = document.getElementById('cancel-drawing-button');

// --- Module State ---
let room;
let tileSubscription = null; // Database subscription for tiles
let drawingInterface = null;
let lastTimestamp = 0;
let drawingSquares = {}; 
let chatState = {}; 
let lastPlayerPosition = { x: null, y: null }; 

// --- Utility Functions ---
function resizeCanvas() {
    if (!canvas || !gameContainer) return;
    const width = gameContainer.clientWidth;
    const height = gameContainer.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        console.log(`Canvas resized to ${width}x${height}`);
    }
}

// --- Game Loop ---
function gameLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp; 
    const deltaTime = Math.max(0, Math.min(0.1, (timestamp - lastTimestamp) / 1000)); 
    lastTimestamp = timestamp;

    resizeCanvas(); 
    updatePlayerMovementFromContinuousInput(deltaTime);
    drawFrame();

    requestAnimationFrame(gameLoop);
}

// --- Subscriptions and Handlers ---
function subscribeToUpdates() {
    // Subscribe to tile database changes
    tileSubscription = room.collection('tile_v1').subscribe((tiles) => {
        // Convert tiles array to maze format for compatibility
        const maze = {};
        tiles.forEach(tile => {
            if (tile.mazeX !== undefined && tile.mazeY !== undefined && tile.data) {
                const key = `${tile.mazeX},${tile.mazeY}`;
                maze[key] = {
                    data: tile.data,
                    ownerId: tile.ownerId || tile.username, // Use username as fallback
                    ownerUsername: tile.username,
                    lastEditTimestamp: new Date(tile.created_at).getTime()
                };
            }
        });
        
        // Always ensure start square is present with hardcoded data
        const startSquareData = getInitialStartSquareData();
        if (startSquareData) {
            maze['0,0'] = startSquareData;
        }
        
        // Update all modules with new maze data
        updateDrawingMazeRef(maze);
        updateInputMazeRef(maze);
        updateRendererMazeReference(maze);
        update3DMazeReference(maze);
        
        // Update admin button visibility based on current user/peers
        updateAdminButtonVisibility();
    });

    // Presence Subscription (Player movements, joins, leaves)
    room.subscribePresence((currentPresence) => {
        const currentPeers = room.peers || {};
        const currentDrawingSquaresState = room.roomState?.drawingSquares || {}; 
        const drawingSquareUpdates = {}; 
        let needsDrawingUpdate = false; 

        // --- Player List Table Generation -----
        let playerTableHtml = '<table id="player-list-table"><thead><tr><th>Username</th><th>Position</th></tr></thead><tbody>';

        let activePlayerCount = 0;

        const presentPlayerIds = new Set(Object.keys(currentPresence || {}));
        const allKnownPeerIds = new Set(Object.keys(currentPeers || {}));

        allKnownPeerIds.forEach(clientId => {
            const playerState = currentPresence[clientId];
            const peerInfo = currentPeers[clientId];

            if (peerInfo) {
                let usernameCell = '';
                let positionCell = '';  

                if (presentPlayerIds.has(clientId)) {
                    const isActive = playerState && playerState.x !== undefined && playerState.y !== undefined;

                    if (isActive) {
                        const { mazeX, mazeY } = getPlayerMazeSquare(playerState);
                        const isAdmin = peerInfo.username === "BookwormKevin" || peerInfo.username === "MapleLeavess" || peerInfo.username == "areyouaperson";
                        usernameCell = `<span class="${isAdmin ? 'admin-username' : ''}">${peerInfo.username}</span>`;
                        positionCell = `(${mazeX}, ${mazeY})`;
                        activePlayerCount++;

                    } else {
                        // Player is connecting or has no position data
                        usernameCell = `${peerInfo.username}`;
                        positionCell = '(...)';
                        // Clean up any drawing claims held by connecting players
                        for (const mazeKey in currentDrawingSquaresState) {
                            if (currentDrawingSquaresState[mazeKey] === clientId) {
                                console.warn(`Connecting player ${clientId} holds claim for square ${mazeKey}. Releasing.`);
                                drawingSquareUpdates[mazeKey] = null;
                                needsDrawingUpdate = true;
                            }
                        }
                    }
                    
                    playerTableHtml += `<tr data-client-id="${clientId}"><td>${usernameCell}</td><td>${positionCell}</td></tr>`;
                } else {
                     // Player is known but not in current presence (disconnected)
                     console.log(`Player ${peerInfo.username} (${clientId}) disconnected.`);
                     // Clean up any drawing claims held by disconnected players
                     for (const mazeKey in currentDrawingSquaresState) {
                         if (currentDrawingSquaresState[mazeKey] === clientId) {
                             console.log(`Disconnected player ${clientId} was drawing square ${mazeKey}. Releasing claim.`);
                             drawingSquareUpdates[mazeKey] = null; 
                             needsDrawingUpdate = true;
                         }
                     }
                }
            }
        });
        // --- End Peer Iteration ---

        if (allKnownPeerIds.size === 0) {
            playerTableHtml += '<tr><td colspan="2">No players online</td></tr>';
        } else if (presentPlayerIds.size === 0) { 
            playerTableHtml += '<tr><td colspan="2">Connecting...</td></tr>';
        } else if (activePlayerCount === 0 && presentPlayerIds.size > 0) {
            // This case might mean players are present but have no position data yet
             // Player rows are already added above with '(...)', so no extra message needed here
        }

        playerTableHtml += '</tbody></table>';
        if (playerListDiv) playerListDiv.innerHTML = playerTableHtml;

        // Update self info
        const selfState = currentPresence[room.clientId];
        if (selfState && selfState.x !== undefined && selfState.y !== undefined) {
            const { mazeX, mazeY } = getPlayerMazeSquare(selfState);
            if (playerInfoDiv) playerInfoDiv.textContent = `(${mazeX}, ${mazeY})`;
        } else if (playerInfoDiv) {
            playerInfoDiv.textContent = '(?, ?)';
        }

        // Send drawing square claim releases if needed
        if (needsDrawingUpdate) {
            console.log("Sending drawing square claim release update:", drawingSquareUpdates);
            room.updateRoomState({ drawingSquares: drawingSquareUpdates });
        }

        // Update admin button visibility based on current user/peers
        updateAdminButtonVisibility();
    });

    room.subscribeRoomState((currentRoomState) => {
        const newDrawingSquares = currentRoomState.drawingSquares || {};
        if (drawingSquares !== newDrawingSquares) {
            drawingSquares = newDrawingSquares;
            updateInputDrawingSquaresRef(drawingSquares);

            if (getDrawingMode() && getCurrentDrawingSquare()) {
                const currentKey = `${getCurrentDrawingSquare().x},${getCurrentDrawingSquare().y}`;
                if (drawingSquares[currentKey] !== room.clientId) {
                    console.warn(`Drawing claim for ${currentKey} removed unexpectedly (Server claim is now: ${drawingSquares[currentKey]}). Exiting drawing mode locally.`);
                    finishDrawing(true);
                }
            }
        }

        const newChatState = currentRoomState.chat || {};
        if (chatState !== newChatState) {
            chatState = newChatState;
            handleChatUpdate(currentRoomState);
        }

        // Update admin button visibility (e.g., if self username changes, unlikely but safe)
        updateAdminButtonVisibility();
    });

    room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
        const currentPresence = room.presence[room.clientId] || {};
        let needsUpdate = false;
        let updatePayload = {};

        if (updateRequest.type === 'forceTeleport' && updateRequest.targetX !== undefined && updateRequest.targetY !== undefined) {
            console.log(`Received force teleport request from ${fromClientId} to (${updateRequest.targetX}, ${updateRequest.targetY}).`);
            updatePayload.x = updateRequest.targetX;
            updatePayload.y = updateRequest.targetY;
            needsUpdate = true;
        }
        
        // Handle ban-related presence updates
        if (updateRequest.type === 'setBanned') {
            handleBanPresenceUpdateRequest(updateRequest);
            // Don't set needsUpdate here as the report system handles its own updates
        }

        if (needsUpdate) {
            room.updatePresence(updatePayload);
        }
    });
}

export async function initGame(_room) {
    room = _room;
    console.log("Initializing game...");

    // Set the room reference in button handlers first, in case UI handlers get triggered early
    setRoomReference(room);

    initUI(room);
    initSettings(room); 

    // Explicitly initialize button handlers to ensure they're set up early
    initButtonHandlers();

    initPlayers(room, canvas, gameContainer);
    initCamera(room, canvas);

    initMapManager(room, sendSystemMessage);

    initAdmin(room);

    drawingInterface = initDrawing(
        room, canvas, {},
        drawingControls, paletteContainer, brushContainer,
        finishDrawingButton, undoDrawingButton,
        importImageButton, importImageInput,
        cancelDrawingButton
    );

    initRenderer(room, canvas, ctx, {}, drawingInterface);
    
    // Initialize 3D renderer
    init3DRenderer(room, canvas, ctx, {});

    // Pass startDrawingFunc from drawing.js to input handling
    setupInputHandling(room, {}, canvas, drawingSquares, chatInput, startDrawingFunc);

    initChat(room, chatMessagesDiv, chatInput);

    // Initialize report system
    initReportSystem(room);

    try {
        await room.initialize();
        console.log(`Websim room initialized. Client ID: ${room.clientId}`);
    } catch (error) {
        console.error("FATAL: Failed to initialize Websim room:", error);
        document.body.innerHTML = `<div style="color: red; text-align: center; padding: 20px; font-size: 1.2em;">
            Error connecting to the multiplayer service. Please check your connection and try refreshing the page.
            <br><br>Details: ${error.message || 'Unknown error'}</div>`;
        return;
    }

    console.log("Performing post-initialization state sync...");
    const initialPresenceUpdate = {};
    let needsInitialPresenceUpdate = false;
    const currentPlayerPresence = room.presence[room.clientId];

    if (!currentPlayerPresence?.x || !currentPlayerPresence?.y) {
        const startSquareCenterX = MAZE_CELL_SIZE * 0.5;
        const startSquareCenterY = MAZE_CELL_SIZE * 0.5;
        const startYOffset = -MAZE_CELL_SIZE * 0.1; 
        initialPresenceUpdate.x = startSquareCenterX;
        initialPresenceUpdate.y = startSquareCenterY + startYOffset;
        needsInitialPresenceUpdate = true;
        console.log("Post-init: Setting initial player position.");
        lastPlayerPosition = { x: initialPresenceUpdate.x, y: initialPresenceUpdate.y }; 
    } else {
         lastPlayerPosition = { x: currentPlayerPresence.x, y: currentPlayerPresence.y }; 
    }

    if (needsInitialPresenceUpdate) {
        room.updatePresence(initialPresenceUpdate);
    }

    const initialRoomStateUpdates = {}; 
    let needsInitialStateUpdate = false;
    const currentRoomState = room.roomState || {};

    const currentPeers = room.peers || {}; 
    const currentPeerIds = new Set(Object.keys(currentPeers));
    let currentDrawingClaims = currentRoomState.drawingSquares || {};
    let claimsCleaned = false;
    for (const key in currentDrawingClaims) {
        const claimantId = currentDrawingClaims[key];
        if (claimantId && !currentPeerIds.has(claimantId)) {
            console.warn(`Post-init: Removing stale drawing claim for ${key} by non-existent player ${claimantId}`);
            if (!initialRoomStateUpdates.drawingSquares) initialRoomStateUpdates.drawingSquares = {};
            initialRoomStateUpdates.drawingSquares[key] = null; 
            needsInitialStateUpdate = true;
            claimsCleaned = true;
            if (currentDrawingClaims) delete currentDrawingClaims[key]; 
        }
    }
    if (claimsCleaned) {
        console.log("Post-init: Cleaned stale drawing claims.");
    }
    drawingSquares = currentDrawingClaims || {}; 
    updateInputDrawingSquaresRef(drawingSquares); 

    const currentChatState = currentRoomState.chat || {};
    if (!currentRoomState.chat || Object.keys(currentChatState).length === 0) {
        console.log("Post-init: No chat found, initializing with welcome message.");
        const timestamp = Date.now();
        const initialChat = {
            [`${timestamp}-system`]: {
                templateId: SYSTEM_MESSAGE.WELCOME,
                params: {},
                timestamp: timestamp,
                clientId: 'system'
            }
        };
        initialRoomStateUpdates.chat = initialChat;
        needsInitialStateUpdate = true;
        chatState = initialChat; 
        handleChatUpdate({ chat: chatState }); 
    } else {
        console.log("Post-init: Chat history found.");
        chatState = currentChatState; 
        handleChatUpdate({ chat: chatState }); 
    }

    if (needsInitialStateUpdate) {
        console.log("Sending initial room state updates:", initialRoomStateUpdates);
        room.updateRoomState(initialRoomStateUpdates);
    }

    subscribeToUpdates();

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); 

    lastTimestamp = performance.now(); 
    requestAnimationFrame(gameLoop);
    
    // Show welcome notification for new players
    setTimeout(() => {
        showInfoPopup(
            "Welcome to Infinite Maze FOREVER!",
            "Welcome! Due to the current maze structure, editing functionality has been disabled. Please note that AI moderation may not work correctly in this mode. Enjoy exploring and creating!",
            10000 // Show for 10 seconds
        );
    }, 1500); // Wait 1.5 seconds after game initialization
    
    console.log("Game initialization complete. Starting game loop.");
}