// imageExporter.js - Functions to generate and download images of the maze

import {
    MAZE_CELL_SIZE, DRAWING_RESOLUTION,
    PALETTE, DEFAULT_FLOOR_INDEX, DEFAULT_WALL_INDEX
} from 'config';
// Import cache functions for potentially faster generation (optional)
import { getOrCreateSquareImage } from './squareRendererCache.js';
import { getProtectedMazeData } from './startSquareProtection.js';

// --- Helper Functions ---

/**
 * Triggers a browser download for a given data URL and filename.
 * @param {string} dataUrl - The data URL of the image (e.g., from canvas.toDataURL()).
 * @param {string} filename - The desired filename for the download.
 */
function triggerDownload(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link); // Required for Firefox
    link.click();
    document.body.removeChild(link);
}

/**
 * Creates a pattern for unclaimed squares (similar to renderer).
 * @param {CanvasRenderingContext2D} ctx - A context to create the pattern on.
 * @returns {CanvasPattern | string} The fill style for unclaimed areas.
 */
function createUnclaimedPatternForExport(ctx) {
    const patternCanvas = document.createElement('canvas');
    const patternCtx = patternCanvas.getContext('2d');
    const size = 10; // Pattern tile size
    patternCanvas.width = size;
    patternCanvas.height = size;

    // Base color (default wall color)
    patternCtx.fillStyle = PALETTE[DEFAULT_WALL_INDEX]?.color || '#000000';
    patternCtx.fillRect(0, 0, size, size);

    // Diagonal lines
    patternCtx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    patternCtx.lineWidth = 0.5;
    const step = 2;
    for (let i = -size; i < size * 2; i += step) {
        patternCtx.beginPath();
        patternCtx.moveTo(i, 0);
        patternCtx.lineTo(i + size, size);
        patternCtx.stroke();
    }

    return ctx.createPattern(patternCanvas, 'repeat');
}

// --- Export Functions ---

/**
 * Generates and downloads an image of a specific maze square.
 * Uses current drawing data if the player is actively editing that square.
 * @param {object} room - The Websim room object.
 * @param {number} mazeX - The X coordinate of the maze square.
 * @param {number} mazeY - The Y coordinate of the maze square.
 * @param {object|null} currentDrawing - Info about the square currently being drawn {x, y, data}, or null.
 */
export async function exportCurrentSquareImage(room, mazeX, mazeY, currentDrawing) {
    const mazeKey = `${mazeX},${mazeY}`;
    console.log(`Exporting image for square: ${mazeKey}`);

    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = DRAWING_RESOLUTION;
    offscreenCanvas.height = DRAWING_RESOLUTION;
    const ctx = offscreenCanvas.getContext('2d', { alpha: false }); // No transparency needed
    if (!ctx) {
        throw new Error("Could not create offscreen canvas context");
    }

    // Determine the data to draw
    let squareInfo = null; // Store the whole squareInfo object
    let useCurrentDrawing = false;
    if (currentDrawing && currentDrawing.x === mazeX && currentDrawing.y === mazeY && currentDrawing.data) {
        squareInfo = { data: currentDrawing.data }; // Use in-progress drawing data
        useCurrentDrawing = true;
        console.log("Using current drawing data for export.");
    } else {
        const protectedMazeState = getProtectedMazeData(room.roomState?.maze || {});
        squareInfo = protectedMazeState[mazeKey]; // Use saved (and protected) maze data
    }

    if (squareInfo && squareInfo.data) {
        // Attempt to use cached image if not using current drawing data
        const cachedImage = (!useCurrentDrawing) ? getOrCreateSquareImage(mazeKey, squareInfo) : null;
        if (cachedImage) {
             console.log(`Exporting square ${mazeKey} using cached image.`);
             ctx.drawImage(cachedImage, 0, 0);
        } else {
            // Draw the pixels manually if no cache or using current drawing
            const squareData = squareInfo.data;
            for (let y = 0; y < DRAWING_RESOLUTION; y++) {
                if (!squareData[y]) continue;
                for (let x = 0; x < DRAWING_RESOLUTION; x++) {
                    if (squareData[y][x] === undefined) continue;

                    let colorIndex = squareData[y][x] ?? DEFAULT_FLOOR_INDEX;
                    if (colorIndex < 0 || colorIndex >= PALETTE.length) {
                        colorIndex = DEFAULT_FLOOR_INDEX;
                    }
                    const paletteEntry = PALETTE[colorIndex];
                    ctx.fillStyle = paletteEntry ? paletteEntry.color : PALETTE[DEFAULT_FLOOR_INDEX].color;
                    ctx.fillRect(x, y, 1, 1); // Draw single pixel
                }
            }
        }
    } else {
        // Square doesn't exist or has no data, fill with default wall color
        console.log("Square data not found, filling with default wall color.");
        ctx.fillStyle = PALETTE[DEFAULT_WALL_INDEX]?.color || '#000000';
        ctx.fillRect(0, 0, DRAWING_RESOLUTION, DRAWING_RESOLUTION);
    }

    // Generate data URL and trigger download
    const dataUrl = offscreenCanvas.toDataURL('image/png');
    const filename = `maze_square_${mazeX}_${mazeY}.png`;
    triggerDownload(dataUrl, filename);
    console.log(`Image for square ${mazeKey} ready for download.`);
}

/**
 * Generates and downloads an image of the entire discovered maze map.
 * @param {object} room - The Websim room object.
 */
export async function exportWholeMapImage(room) {
    console.log("Starting whole map image export for download...");

    try {
        // Generate the image data URL
        const { dataUrl, filename } = await generateMapImageDataUrl(room);

        // Trigger the download
        triggerDownload(dataUrl, filename);
        console.log("Whole map image ready for download.");

    } catch (error) {
        console.error("Error generating or downloading whole map image:", error);
        alert(`Error generating map image: ${error.message}. Check console for details.`);
        throw error; // Re-throw for potential upstream handling
    }
}

/**
 * Generates a PNG data URL of the entire discovered maze map.
 * @param {object} room - The Websim room object.
 * @param {object} [mazeDataOverride=null] - Optional: Provide specific maze data to render instead of room state.
 * @returns {Promise<{dataUrl: string, filename: string, bounds: {minX: number, maxX: number, minY: number, maxY: number}, totalSquares: number}>} - Object containing the data URL, suggested filename, bounds, and square count.
 */
export async function generateMapImageDataUrl(room, mazeDataOverride = null) {
    console.log("Generating map image data URL...");
    // Use override if provided, otherwise use current room state
    const mazeState = mazeDataOverride || (room?.roomState?.maze || {});
    // Apply start square protection to the data being rendered
    const protectedMazeState = getProtectedMazeData(mazeState);
    const mazeKeys = Object.keys(protectedMazeState).filter(key => protectedMazeState[key]?.data); // Only keys with data

    if (mazeKeys.length === 0) {
        throw new Error("The maze is empty, cannot generate image.");
    }

    // 1. Determine Bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    mazeKeys.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        if (!isNaN(x) && !isNaN(y)) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
    });
    const totalSquares = mazeKeys.length; // Total claimed squares

    // 2. Calculate Canvas Size
    const numSquaresX = maxX - minX + 1;
    const numSquaresY = maxY - minY + 1;
    const canvasWidth = numSquaresX * DRAWING_RESOLUTION;
    const canvasHeight = numSquaresY * DRAWING_RESOLUTION;

    // Simple limit to prevent excessively large images
    const MAX_DIMENSION = 16384; // Common browser limit, may vary
    if (canvasWidth > MAX_DIMENSION || canvasHeight > MAX_DIMENSION) {
         throw new Error(`Map too large (${canvasWidth}x${canvasHeight}) to generate image. Maximum dimension allowed is ${MAX_DIMENSION}px.`);
    }
     console.log(`Map bounds: (${minX},${minY}) to (${maxX},${maxY}). Image size: ${canvasWidth}x${canvasHeight}`);

    // 3. Create Offscreen Canvas
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvasWidth;
    offscreenCanvas.height = canvasHeight;
    const ctx = offscreenCanvas.getContext('2d', { alpha: true }); // Transparency
     if (!ctx) {
        throw new Error("Could not create offscreen canvas context for whole map");
    }

    // 4. Draw Background / Unclaimed Areas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 5. Draw Each Claimed Square (using protected data)
    for (let currentY = minY; currentY <= maxY; currentY++) {
        for (let currentX = minX; currentX <= maxX; currentX++) {
            const mazeKey = `${currentX},${currentY}`;
            const squareInfo = protectedMazeState[mazeKey]; // Use protected data

            if (squareInfo && squareInfo.data) {
                // Calculate the top-left corner position for this square on the large canvas
                const destX = (currentX - minX) * DRAWING_RESOLUTION;
                const destY = (currentY - minY) * DRAWING_RESOLUTION;

                // --- Optimization: Use cached square image if available ---
                const cachedImage = getOrCreateSquareImage(mazeKey, squareInfo);
                if (cachedImage) {
                     try {
                        ctx.imageSmoothingEnabled = false; // Ensure crisp drawing
                        ctx.drawImage(cachedImage, destX, destY);
                     } catch (e) {
                         console.warn(`Error drawing cached image for ${mazeKey}:`, e, "Falling back to pixel drawing.");
                         // Fallback to drawing pixels if drawImage fails (e.g., tainted canvas)
                         drawSquarePixels(ctx, squareInfo.data, destX, destY);
                     }
                } else {
                    // Fallback to drawing pixels if cache fails or returns null
                    drawSquarePixels(ctx, squareInfo.data, destX, destY);
                }
                // -----------------------------------------------------------
            }
            // else: Unclaimed square - already cleared
        }
         // Yield to the event loop occasionally for large maps to prevent freezing UI
         if (currentY % 10 === 0) {
             console.log(`Drew row Y=${currentY}`);
             await new Promise(resolve => setTimeout(resolve, 0)); // Allow other tasks to run
         }
    }
    console.log("Finished drawing all squares.");

    // 6. Generate data URL
    // Using PNG is generally better for this type of graphic
    const dataUrl = offscreenCanvas.toDataURL('image/png');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `maze_map_${timestamp}.png`;

    return {
        dataUrl,
        filename,
        bounds: { minX, maxX, minY, maxY },
        totalSquares
    };
}

/**
 * Helper function to draw individual pixels for a square onto a larger canvas.
 * @param {CanvasRenderingContext2D} ctx - The context of the large canvas.
 * @param {Array<Array<number>>} squareData - The pixel data for the single square.
 * @param {number} destX - The top-left X coordinate on the large canvas.
 * @param {number} destY - The top-left Y coordinate on the large canvas.
 */
function drawSquarePixels(ctx, squareData, destX, destY) {
    for (let y = 0; y < DRAWING_RESOLUTION; y++) {
        if (!squareData[y]) continue;
        for (let x = 0; x < DRAWING_RESOLUTION; x++) {
            if (squareData[y][x] === undefined) continue;

            let colorIndex = squareData[y][x] ?? DEFAULT_FLOOR_INDEX;
            if (colorIndex < 0 || colorIndex >= PALETTE.length) {
                colorIndex = DEFAULT_FLOOR_INDEX;
            }
            
            const paletteEntry = PALETTE[colorIndex];
            if (!paletteEntry) {
                ctx.fillStyle = PALETTE[DEFAULT_FLOOR_INDEX].color;
                ctx.fillRect(destX + x, destY + y, 1, 1);
            } else if (paletteEntry.isHole) {
                // Make holes transparent in exported images
                // First clear the area to make it transparent
                ctx.clearRect(destX + x, destY + y, 1, 1);
            } else {
                ctx.fillStyle = paletteEntry.color;
                ctx.fillRect(destX + x, destY + y, 1, 1);
            }
        }
    }
}