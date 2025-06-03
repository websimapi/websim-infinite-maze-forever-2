// renderer.js
import {
    MAZE_CELL_SIZE, DRAWING_RESOLUTION, 
    PALETTE, DEFAULT_FLOOR_INDEX, DEFAULT_WALL_INDEX,
    DRAWING_AREA_BORDER_COLOR, HOLE_PULSE_SPEED, HOLE_MIN_OPACITY, HOLE_MAX_OPACITY
} from 'config';
import { updatePlayerAvatars } from 'players';
import { setupCameraTransform, getViewportWorldBounds, getCurrentTransform } from './camera.js';
// Import cache functions from the new module
import { getOrCreateSquareImage, pruneImageCacheIfNeeded, updateCacheMazeRef, getHoleAnimationState } from './squareRendererCache.js';
import { drawSquareCoordinates } from './squareCoordinates.js';
import { getProtectedMazeData, isStartSquare } from './startSquareProtection.js';
import { is3DModeActive, draw3DFrame } from './render3d.js';

let roomRef;
let canvasRef;
let ctxRef;
let mazeRef; // Reference to the maze data (updated by game.js)
let drawingInterface; // { getDrawingMode, getCurrentDrawingSquare, getDrawingData }

let unclaimedPattern = null;

export function initRenderer(_room, _canvas, _ctx, _maze, _drawingInterface) {
    roomRef = _room;
    canvasRef = _canvas;
    ctxRef = _ctx;
    mazeRef = _maze; // Store initial reference
    drawingInterface = _drawingInterface;

    // Initialize cache module with the initial maze state reference
    updateCacheMazeRef(_maze);

    createUnclaimedPattern();
    console.log("Renderer initialized.");
    
    // Initialize 3D renderer with the same references
    if (typeof window.init3DRenderer === 'function') {
        window.init3DRenderer(roomRef, canvasRef, ctxRef, mazeRef);
    }
}

// Called by game.js when the maze state updates
export function updateRendererMazeReference(_maze) {
    mazeRef = _maze;
    // Update the cache module's reference as well
    // Note: Cache pruning based on this reference happens inside drawFrame now
    // updateCacheMazeRef(_maze); // We'll let pruneImageCacheIfNeeded handle the update
    
    // Update 3D renderer maze reference
    if (typeof window.update3DMazeReference === 'function') {
        window.update3DMazeReference(_maze);
    }
}

function createUnclaimedPattern() {
    const patternCanvas = document.createElement('canvas');
    const patternCtx = patternCanvas.getContext('2d');
    const size = 10;
    patternCanvas.width = size;
    patternCanvas.height = size;

    // Base color (default wall color)
    patternCtx.fillStyle = PALETTE[DEFAULT_WALL_INDEX]?.color || '#000000';
    patternCtx.fillRect(0, 0, size, size);

    patternCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    patternCtx.lineWidth = 0.5;
    const step = 2;
    for (let i = -size; i < size * 2; i += step) {
        patternCtx.beginPath();
        patternCtx.moveTo(i, 0);
        patternCtx.lineTo(i + size, size);
        patternCtx.stroke();
    }

    unclaimedPattern = ctxRef.createPattern(patternCanvas, 'repeat');
    console.log("Renderer: Created finer diagonal line pattern for unclaimed squares.");
}

// The main drawing loop function, called by requestAnimationFrame in game.js
export function drawFrame() {
    if (!roomRef || !roomRef.presence || !roomRef.clientId || !ctxRef || !canvasRef || !drawingInterface) {
        return;
    }

    // Check if 3D mode is active
    if (is3DModeActive()) {
        // Use 3D rendering
        const cameraTransform = getCurrentTransform();
        draw3DFrame(cameraTransform);
        return;
    }

    // Standard 2D rendering from here on
    const drawingMode = drawingInterface.getDrawingMode();
    const currentDrawingSquare = drawingInterface.getCurrentDrawingSquare();
    const drawingData = drawingInterface.getDrawingData();
    const currentTime = performance.now();

    // --- Manage Cursor Style ---
    if (drawingMode) {
        canvasRef.style.cursor = 'crosshair';
    } else if (document.pointerLockElement === canvasRef) {
        canvasRef.style.cursor = 'none';
    } else {
        canvasRef.style.cursor = 'default';
    }

    // --- Clear Canvas ---
    ctxRef.save();
    ctxRef.setTransform(1, 0, 0, 1, 0, 0);
    // Use default floor color for the background, ensures consistency
    const defaultFloorColor = PALETTE[DEFAULT_FLOOR_INDEX]?.color || '#FFFFFF'; // Provide fallback white
    ctxRef.fillStyle = defaultFloorColor;
    ctxRef.fillRect(0, 0, canvasRef.width, canvasRef.height);
    ctxRef.restore();


    // --- Setup Camera ---
    ctxRef.save();
    const cameraTransform = setupCameraTransform(ctxRef);


    // --- Draw World Content (respecting camera transform) ---
    const { x: viewWorldX, y: viewWorldY, width: viewWorldWidth, height: viewWorldHeight } = getViewportWorldBounds();
    const cullMargin = MAZE_CELL_SIZE; // Extra margin for drawing squares just outside viewport
    const currentMazeState = mazeRef || {};
    // Apply start square protection to get the maze data to render
    const protectedMazeState = getProtectedMazeData(currentMazeState);
    const currentDrawingSquares = roomRef.roomState?.drawingSquares || {};
    const peers = roomRef.peers || {};

    // Check and prune the image cache if the global maze state object reference has changed
    // This function now also updates the cache's internal lastMazeStateRef
    pruneImageCacheIfNeeded(currentMazeState);

    // Get the current hole animation state for synchronized flashing
    const isHoleFlashState = getHoleAnimationState();

    // --- Draw Claimed Maze Squares (using cache) ---
    for (const key in protectedMazeState) {
        const [mazeX, mazeY] = key.split(',').map(Number);
        // Ensure key parsing worked
        if (isNaN(mazeX) || isNaN(mazeY)) {
             console.warn(`Renderer: Invalid maze key encountered: ${key}`);
             continue;
        }

        const squareInfo = protectedMazeState[key]; // { data: [...], ownerId: ... }
        const squareWorldX = mazeX * MAZE_CELL_SIZE;
        const squareWorldY = mazeY * MAZE_CELL_SIZE;
        const squareWorldSize = MAZE_CELL_SIZE;

        // Culling check: Draw if square is within viewport + margin
        if (squareWorldX + squareWorldSize >= viewWorldX - cullMargin &&
            squareWorldX <= viewWorldX + viewWorldWidth + cullMargin &&
            squareWorldY + squareWorldSize >= viewWorldY - cullMargin &&
            squareWorldY <= viewWorldY + viewWorldHeight + cullMargin)
        {
            // Skip drawing the cached image if it's the square being drawn LOCALLY
            // The local drawing logic below will handle rendering it pixel-by-pixel.
            if (drawingMode && currentDrawingSquare && currentDrawingSquare.x === mazeX && currentDrawingSquare.y === mazeY) {
                continue;
            }

            // Check if data exists for this square
            if (squareInfo && squareInfo.data) {
                // Attempt to get the cached image from the cache module
                // The getOrCreateSquareImage function will now return the appropriate frame
                // based on the current hole animation state
                const squareImage = getOrCreateSquareImage(key, squareInfo);

                if (squareImage) {
                    // --- Draw the pre-rendered image ---
                    ctxRef.imageSmoothingEnabled = false; // Draw crisp pixels
                    ctxRef.drawImage(
                        squareImage,        // The cached canvas
                        squareWorldX,       // Destination X
                        squareWorldY,       // Destination Y
                        squareWorldSize,    // Destination Width
                        squareWorldSize     // Destination Height
                    );
                    ctxRef.imageSmoothingEnabled = true; // Re-enable for other elements like text

                    // --- Draw Owner Username ---
                    const ownerId = squareInfo.ownerId;
                    const storedUsername = squareInfo.ownerUsername; 
                    let username = "Unknown";

                    if (storedUsername) {
                        username = storedUsername; 
                    } else if (ownerId === 'system') {
                        username = "Start"; 
                    } else if (ownerId && peers[ownerId]) {
                        username = peers[ownerId].username; 
                    } else if (ownerId) {
                        username = `User (${ownerId.substring(0, 4)})`; 
                    }
                    
                    const remoteDrawingClientId = currentDrawingSquares[key];
                    const isStartSquare = mazeX === 0 && mazeY === 0;
                    if (username && username !== "Unknown" && (isStartSquare || (!remoteDrawingClientId || remoteDrawingClientId === roomRef.clientId)) ) { 
                        ctxRef.save();
                        const textPaddingWorld = 0.3; 
                        const textWorldX = squareWorldX + squareWorldSize - textPaddingWorld;
                        const textWorldY = squareWorldY + squareWorldSize - textPaddingWorld;
                        const fontSizeWorld = 0.5; 
                        ctxRef.font = `${fontSizeWorld}px sans-serif`;
                        ctxRef.textAlign = 'right';
                        ctxRef.textBaseline = 'bottom';
                        ctxRef.lineWidth = 0.1; 
                        ctxRef.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                        ctxRef.strokeText(username, textWorldX, textWorldY);
                        ctxRef.fillStyle = 'rgba(255, 255, 255, 0.9)';
                        ctxRef.fillText(username, textWorldX, textWorldY);
                        ctxRef.restore();
                    }
                } else {
                     console.warn(`Renderer: Could not get/create image for claimed square ${key}.`);
                }
            }
            // If squareInfo or squareInfo.data doesn't exist, it's treated as unclaimed below.
        }
    }

    // --- Draw Unclaimed Squares Pattern ---
    if (unclaimedPattern) {
        const startMazeX = Math.floor((viewWorldX - cullMargin) / MAZE_CELL_SIZE);
        const endMazeX = Math.ceil((viewWorldX + viewWorldWidth + cullMargin) / MAZE_CELL_SIZE);
        const startMazeY = Math.floor((viewWorldY - cullMargin) / MAZE_CELL_SIZE);
        const endMazeY = Math.ceil((viewWorldY + viewWorldHeight + cullMargin) / MAZE_CELL_SIZE);

        ctxRef.fillStyle = unclaimedPattern;
        for (let mx = startMazeX; mx < endMazeX; mx++) {
            for (let my = startMazeY; my < endMazeY; my++) {
                const key = `${mx},${my}`;
                if (mx === 0 && my === 0) continue;

                const isLocallyDrawing = drawingMode && currentDrawingSquare && currentDrawingSquare.x === mx && currentDrawingSquare.y === my;
                const isRemotelyDrawing = currentDrawingSquares[key] && currentDrawingSquares[key] !== roomRef.clientId;

                if (!currentMazeState[key]?.data && !isLocallyDrawing && !isRemotelyDrawing) {
                     const squareWorldX = mx * MAZE_CELL_SIZE;
                     const squareWorldY = my * MAZE_CELL_SIZE;
                     ctxRef.fillRect(squareWorldX, squareWorldY, MAZE_CELL_SIZE, MAZE_CELL_SIZE);
                }
            }
        }
    }

    // --- Draw Overlay for Squares Being Drawn by OTHERS ---
    const startDrawCheckX = Math.floor((viewWorldX - cullMargin) / MAZE_CELL_SIZE);
    const endDrawCheckX = Math.ceil((viewWorldX + viewWorldWidth + cullMargin) / MAZE_CELL_SIZE);
    const startDrawCheckY = Math.floor((viewWorldY - cullMargin) / MAZE_CELL_SIZE);
    const endDrawCheckY = Math.ceil((viewWorldY + viewWorldHeight + cullMargin) / MAZE_CELL_SIZE);

    const hue = (currentTime * 0.05) % 360; 
    const rainbowColor = `hsla(${hue}, 100%, 70%, 0.35)`; 

    for (let mx = startDrawCheckX; mx < endDrawCheckX; mx++) {
        for (let my = startDrawCheckY; my < endDrawCheckY; my++) {
            const key = `${mx},${my}`;
            const drawingClientId = currentDrawingSquares[key];

            if (mx === 0 && my === 0) continue;

            if (drawingClientId && drawingClientId !== roomRef.clientId) {
                const squareWorldX = mx * MAZE_CELL_SIZE;
                const squareWorldY = my * MAZE_CELL_SIZE;

                ctxRef.fillStyle = rainbowColor;
                ctxRef.fillRect(squareWorldX, squareWorldY, MAZE_CELL_SIZE, MAZE_CELL_SIZE);

                const drawerUsername = peers[drawingClientId]?.username || `User (${drawingClientId.substring(0,4)})`;
                ctxRef.save();
                const textWorldX = squareWorldX + MAZE_CELL_SIZE / 2; 
                const textWorldY = squareWorldY + MAZE_CELL_SIZE / 2; 
                const fontSizeWorld = 0.7; 
                ctxRef.font = `bold ${fontSizeWorld}px sans-serif`;
                ctxRef.textAlign = 'center';
                ctxRef.textBaseline = 'middle';
                ctxRef.lineWidth = 0.12;
                ctxRef.strokeStyle = 'rgba(0, 0, 0, 0.9)';
                ctxRef.strokeText(`Drawing: ${drawerUsername}`, textWorldX, textWorldY);
                ctxRef.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctxRef.fillText(`Drawing: ${drawerUsername}`, textWorldX, textWorldY);
                ctxRef.restore();
            }
        }
    }

    // --- Draw Current LOCAL Drawing Square Pixels (if active) ---
    if (drawingMode && currentDrawingSquare && drawingData && !(currentDrawingSquare.x === 0 && currentDrawingSquare.y === 0)) {
        const mazeX = currentDrawingSquare.x;
        const mazeY = currentDrawingSquare.y;
        const squareWorldX = mazeX * MAZE_CELL_SIZE;
        const squareWorldY = mazeY * MAZE_CELL_SIZE;
        const internalPixelWorldSize = MAZE_CELL_SIZE / DRAWING_RESOLUTION;
        const overlapWorldUnits = internalPixelWorldSize * 0.5; // Overlap by half a pixel

        for (let y = 0; y < DRAWING_RESOLUTION; y++) {
            if (!drawingData[y] || !Array.isArray(drawingData[y])) continue; 
            for (let x = 0; x < DRAWING_RESOLUTION; x++) {
                if (drawingData[y][x] === undefined || drawingData[y][x] === null) continue; 

                const pixelWorldX = squareWorldX + x * internalPixelWorldSize;
                const pixelWorldY = squareWorldY + y * internalPixelWorldSize;

                let colorIndex = drawingData[y][x];
                if (colorIndex < 0 || colorIndex >= PALETTE.length || !PALETTE[colorIndex]) {
                    colorIndex = DEFAULT_WALL_INDEX; 
                }
                const paletteEntry = PALETTE[colorIndex];
                
                if (!paletteEntry) {
                     ctxRef.fillStyle = PALETTE[DEFAULT_WALL_INDEX]?.color || '#000000';
                } else if (paletteEntry.isHole && isHoleFlashState) {
                    // If hole and in flash state, use red
                    ctxRef.fillStyle = 'rgba(195, 51, 51, 1)';
                } else {
                     ctxRef.fillStyle = paletteEntry.color;
                }

                ctxRef.fillRect(
                    pixelWorldX - overlapWorldUnits / 2,
                    pixelWorldY - overlapWorldUnits / 2,
                    internalPixelWorldSize + overlapWorldUnits,
                    internalPixelWorldSize + overlapWorldUnits
                );
            }
        }

        ctxRef.strokeStyle = DRAWING_AREA_BORDER_COLOR;
        ctxRef.lineWidth = 0.15; 
        ctxRef.strokeRect(
            squareWorldX,
            squareWorldY,
            MAZE_CELL_SIZE,
            MAZE_CELL_SIZE
        );
    }

    // --- Draw coordinate labels if admin option is enabled ---
    const currentPlayer = roomRef.presence[roomRef.clientId] || {};
    const showCoordinates = currentPlayer.adminShowCoords === true;
    if (showCoordinates) {
        drawSquareCoordinates(ctxRef, currentMazeState, getViewportWorldBounds(), showCoordinates);
    }
    
    ctxRef.restore(); 

    updatePlayerAvatars(cameraTransform);
}