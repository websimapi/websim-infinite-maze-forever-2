// squareRendererCache.js - Handles caching of pre-rendered maze square canvases

import {
    DRAWING_RESOLUTION,
    PALETTE, DEFAULT_FLOOR_INDEX
} from 'config';
import { isStartSquare, getProtectedStartSquareData } from './startSquareProtection.js';

let imageCache = new Map(); // Cache for pre-rendered maze square canvases
let lastMazeStateRef = null; // Keep track of the maze state object reference

/**
 * Updates the reference to the global maze state for cache pruning.
 * @param {object} mazeState - The current maze state object from room.roomState.maze.
 */
export function updateCacheMazeRef(mazeState) {
    lastMazeStateRef = mazeState;
}

/**
 * Checks if a square contains any hole pixels
 * @param {Array<Array<number>>} squareData - The drawing data for the square
 * @returns {boolean} - True if the square contains any holes
 */
function squareContainsHoles(squareData) {
    for (let y = 0; y < DRAWING_RESOLUTION; y++) {
        if (!squareData[y]) continue;
        
        for (let x = 0; x < DRAWING_RESOLUTION; x++) {
            if (squareData[y][x] === undefined) continue;
            
            const colorIndex = squareData[y][x];
            if (colorIndex >= 0 && colorIndex < PALETTE.length && PALETTE[colorIndex]?.isHole) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Creates or retrieves a pre-rendered canvas image for a maze square.
 * Checks cache validity based on the source data reference.
 * For squares with holes, returns the appropriate frame based on the current time.
 * @param {string} mazeKey - The key for the maze square (e.g., "x,y").
 * @param {object} squareInfo - The data object for the square { data: [...], ownerId: ... }.
 * @param {boolean} [forceFrame=null] - Force a specific frame (null=auto, 0=normal, 1=flash)
 * @returns {HTMLCanvasElement | null} A canvas element with the rendered square.
 */
export function getOrCreateSquareImage(mazeKey, squareInfo, forceFrame = null) {
    // Special handling for start square
    const [x, y] = mazeKey.split(',').map(Number);
    if (isStartSquare(x, y)) {
        // Always use the protected start square data
        squareInfo = getProtectedStartSquareData();
    }

    const cachedEntry = imageCache.get(mazeKey);

    // Check if cache is valid: entry exists AND the data reference hasn't changed
    if (cachedEntry && squareInfo && cachedEntry.sourceDataRef === squareInfo.data) {
        // If the cached entry has both frames (for holes), return the appropriate one
        if (cachedEntry.hasHoles) {
            // Return appropriate frame based on the global hole animation state
            // or the forced frame if specified
            if (forceFrame === 1 || (forceFrame === null && getHoleAnimationState())) {
                return cachedEntry.flashCanvas;
            } else {
                return cachedEntry.normalCanvas;
            }
        } else {
            // Just return the normal canvas for squares without holes
            return cachedEntry.normalCanvas;
        }
    }

    // Cache invalid or missing, or data changed - Regenerate
    if (!squareInfo || !squareInfo.data || !Array.isArray(squareInfo.data)) {
        imageCache.delete(mazeKey); // Remove potentially stale entry
        return null; // No valid data to draw
    }

    // Check if this square contains holes
    const hasHoles = squareContainsHoles(squareInfo.data);

    // Generate normal canvas (black holes)
    const normalCanvas = createSquareCanvas(squareInfo.data, false);
    
    // If the square has holes, also generate the flash canvas (red holes)
    let flashCanvas = null;
    if (hasHoles) {
        flashCanvas = createSquareCanvas(squareInfo.data, true);
    }

    // Store in cache with a reference to the source data array
    imageCache.set(mazeKey, { 
        normalCanvas: normalCanvas, 
        flashCanvas: flashCanvas,
        hasHoles: hasHoles,
        sourceDataRef: squareInfo.data 
    });

    // Return the appropriate canvas based on current animation state
    if (hasHoles) {
        if (forceFrame === 1 || (forceFrame === null && getHoleAnimationState())) {
            return flashCanvas;
        }
    }
    return normalCanvas;
}

/**
 * Creates a canvas for a square with the given data
 * @param {Array<Array<number>>} squareData - The drawing data for the square
 * @param {boolean} flashHoles - Whether to render holes in flash state (red instead of black)
 * @returns {HTMLCanvasElement} - The rendered canvas
 */
function createSquareCanvas(squareData, flashHoles) {
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = DRAWING_RESOLUTION;
    offscreenCanvas.height = DRAWING_RESOLUTION;
    const ctx = offscreenCanvas.getContext('2d', { alpha: false });
    if (!ctx) {
        console.error(`SquareRendererCache: Failed to create offscreen context`);
        return null;
    }

    // Fill background with default floor color first
    ctx.fillStyle = PALETTE[DEFAULT_FLOOR_INDEX]?.color || '#FFFFFF';
    ctx.fillRect(0, 0, DRAWING_RESOLUTION, DRAWING_RESOLUTION);

    // Draw the pixels from the square data
    for (let y = 0; y < DRAWING_RESOLUTION; y++) {
        if (!squareData[y] || !Array.isArray(squareData[y])) continue;
        for (let x = 0; x < DRAWING_RESOLUTION; x++) {
            if (squareData[y][x] === undefined || squareData[y][x] === null) continue;

            let colorIndex = squareData[y][x];
            if (colorIndex < 0 || colorIndex >= PALETTE.length || !PALETTE[colorIndex]) {
                colorIndex = DEFAULT_FLOOR_INDEX; // Fallback
            }

            const paletteEntry = PALETTE[colorIndex];
            if (!paletteEntry) {
                ctx.fillStyle = PALETTE[DEFAULT_FLOOR_INDEX]?.color || '#FFFFFF';
            } else if (paletteEntry.isHole && flashHoles) {
                // If this is a hole and we're in flash mode, use darker red
                ctx.fillStyle = 'rgba(195, 51, 51, 1)'; // Darker red for flash state
            } else {
                ctx.fillStyle = paletteEntry.color;
            }

            ctx.fillRect(x, y, 1, 1); // Draw single pixel
        }
    }

    return offscreenCanvas;
}

/**
 * Gets the current hole animation state based on global time
 * @returns {boolean} - True if holes should be shown in flash state (red)
 */
export function getHoleAnimationState() {
    const HOLE_PULSE_SPEED = 2.5; // Ensure this matches the config value
    const currentTime = performance.now() / 1000; // Get time in seconds
    // Simplified animation - 0.5 second intervals
    return Math.sin(currentTime * Math.PI * HOLE_PULSE_SPEED) > 0;
}

/**
 * Prunes the image cache if the global maze state object reference has changed.
 * Removes entries for squares no longer present or whose data reference differs.
 * @param {object} currentMazeState - The current maze state object.
 */
export function pruneImageCacheIfNeeded(currentMazeState) {
    // Check if the reference is the same. If so, no need to prune globally.
    if (currentMazeState === lastMazeStateRef) {
        return;
    }

    // Maze state object reference has changed, prune entries for keys not present
    // or whose data reference differs from the new state.
    const currentKeys = new Set(Object.keys(currentMazeState || {}));
    let prunedCount = 0;
    for (const [key, cachedEntry] of imageCache.entries()) {
        const currentSquareInfo = currentMazeState ? currentMazeState[key] : undefined;
        // Remove if:
        // 1. Key no longer exists in currentMazeState
        // 2. Key exists, but squareInfo is missing/invalid
        // 3. Key exists, squareInfo exists, but the data reference is different
        if (!currentKeys.has(key) || !currentSquareInfo || !currentSquareInfo.data || currentSquareInfo.data !== cachedEntry.sourceDataRef) {
            imageCache.delete(key);
            prunedCount++;
        }
    }

    // Update the reference tracker AFTER pruning
    updateCacheMazeRef(currentMazeState);
}