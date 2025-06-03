// camera.js
import {
    MAZE_CELL_SIZE, 
    INITIAL_ZOOM, MIN_ZOOM, MAX_ZOOM, ZOOM_SENSITIVITY_BASE
} from 'config';

let roomRef;
let canvasRef;
let zoomInButtonRef;
let zoomOutButtonRef;

let isLocked = false;
let lockedMazeX = 0;
let lockedMazeY = 0;

let currentOffsetX = 0;
let currentOffsetY = 0;
let currentZoom = INITIAL_ZOOM;

// --- Initialization and State ---

export function initCamera(_room, _canvas) {
    roomRef = _room;
    canvasRef = _canvas;
    zoomInButtonRef = document.getElementById('zoom-in-button');
    zoomOutButtonRef = document.getElementById('zoom-out-button');

    // Attach wheel listener for zooming
    canvasRef.addEventListener('wheel', handleWheel, { passive: false });

    // Attach listeners for mobile zoom buttons
    if (zoomInButtonRef) {
        zoomInButtonRef.addEventListener('click', () => handleZoomButtonClick(true));
    }
    if (zoomOutButtonRef) {
        zoomOutButtonRef.addEventListener('click', () => handleZoomButtonClick(false));
    }

    console.log("Camera initialized.");
}

export function isCameraLocked() {
    return isLocked;
}

export function getZoomLevel() {
    return currentZoom;
}

// Get current offsets AND zoom (useful for player avatar positioning)
export function getCurrentTransform() {
    return { offsetX: currentOffsetX, offsetY: currentOffsetY, zoom: currentZoom };
}

// --- Locking / Unlocking ---

export function lockCameraToSquare(mazeX, mazeY) {
    isLocked = true;
    lockedMazeX = mazeX;
    lockedMazeY = mazeY;
    console.log(`Camera locked to square: ${mazeX}, ${mazeY}. Zoom remains ${currentZoom.toFixed(2)}`);
    calculateOffsets();
}

export function unlockCamera() {
    isLocked = false;
    console.log("Camera unlocked.");
    calculateOffsets();
}

// --- Zoom Handling ---

// New function to handle programmatic zoom changes (like from buttons)
function applyZoomChange(zoomDelta, pivotCanvasX = canvasRef.width / 2, pivotCanvasY = canvasRef.height / 2) {
    const newZoom = currentZoom + zoomDelta; // Use + because delta is directional
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

    if (clampedZoom !== currentZoom) {
        // Calculate mouse/pivot position in world space BEFORE zoom changes
        const rect = canvasRef.getBoundingClientRect();
        // For programmatic zoom, use the provided pivot point (defaults to center)
        // No need for rect offset if using canvas center directly for canvas coords
        // const mouseCanvasX = event.clientX - rect.left;
        // const mouseCanvasY = event.clientY - rect.top;

        // World coords under the pivot before zoom
        const pivotWorldXBefore = (pivotCanvasX - currentOffsetX) / currentZoom;
        const pivotWorldYBefore = (pivotCanvasY - currentOffsetY) / currentZoom;

        // Update zoom
        currentZoom = clampedZoom;

        // Calculate new offsets to keep the world point under the pivot stationary
        currentOffsetX = pivotCanvasX - pivotWorldXBefore * currentZoom;
        currentOffsetY = pivotCanvasY - pivotWorldYBefore * currentZoom;

        // If the camera is locked, recalculate offsets based on the locked square center and new zoom
        if (isLocked) {
            calculateOffsets();
        }
    }
}

function handleWheel(event) {
    event.preventDefault(); // Prevent page scrolling

    // Calculate zoom sensitivity dynamically
    const zoomSensitivity = ZOOM_SENSITIVITY_BASE * (currentZoom / 5);
    const delta = event.deltaY * zoomSensitivity;

    // Pivot around mouse cursor for wheel zoom
    const rect = canvasRef.getBoundingClientRect();
    const mouseCanvasX = event.clientX - rect.left;
    const mouseCanvasY = event.clientY - rect.top;

    // Apply zoom change (negative delta for standard wheel behavior)
    applyZoomChange(-delta, mouseCanvasX, mouseCanvasY);
}

// Handler for mobile zoom buttons
function handleZoomButtonClick(zoomIn) {
    // Define a fixed amount to zoom per click, scaled by current zoom
    // Adjust this value for desired button sensitivity
    const zoomAmountFactor = 0.15; // e.g., 15% zoom change per click
    let zoomDelta = currentZoom * zoomAmountFactor;

    if (!zoomIn) {
        zoomDelta = -zoomDelta; // Zoom out requires negative delta
    }
     // Apply zoom change, pivoting around the center of the screen
    applyZoomChange(zoomDelta, canvasRef.width / 2, canvasRef.height / 2);
}

// --- Offset Calculation ---

function calculateOffsets() {
    if (!canvasRef || !roomRef) return;

    const viewCenterX = canvasRef.width / 2;
    const viewCenterY = canvasRef.height / 2;

    let targetWorldX, targetWorldY;

    if (isLocked) {
        targetWorldX = (lockedMazeX + 0.5) * MAZE_CELL_SIZE;
        targetWorldY = (lockedMazeY + 0.5) * MAZE_CELL_SIZE;
        // Do not force zoom here - use currentZoom
        // currentZoom = 1.0;
    } else {
        const player = roomRef.presence?.[roomRef.clientId];
        if (player && player.x !== undefined && player.y !== undefined) {
            targetWorldX = player.x;
            targetWorldY = player.y;
        } else {
            targetWorldX = 0;
            targetWorldY = 0;
        }
    }

    currentOffsetX = viewCenterX - targetWorldX * currentZoom;
    currentOffsetY = viewCenterY - targetWorldY * currentZoom;
}

// --- Canvas Transformation ---

export function setupCameraTransform(ctx) {
    // Only calculate offsets if NOT locked, as locking handles its own offset calc.
    if (!isLocked) {
         calculateOffsets();
    }
    // Zooming while locked might have changed offsets via calculateOffsets, so no need to call it again here.

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(currentOffsetX, currentOffsetY);
    ctx.scale(currentZoom, currentZoom);

    return { offsetX: currentOffsetX, offsetY: currentOffsetY, zoom: currentZoom };
}

// --- Coordinate Calculation ---

export function getViewportWorldBounds() {
    if (!canvasRef) return { x: 0, y: 0, width: 0, height: 0 };

    const worldUnitsPerPixel = 1 / currentZoom;

    const viewWorldX = (0 - currentOffsetX) * worldUnitsPerPixel;
    const viewWorldY = (0 - currentOffsetY) * worldUnitsPerPixel;

    const viewWorldWidth = canvasRef.width * worldUnitsPerPixel;
    const viewWorldHeight = canvasRef.height * worldUnitsPerPixel;

    return {
        x: viewWorldX,
        y: viewWorldY,
        width: viewWorldWidth,
        height: viewWorldHeight
    };
}