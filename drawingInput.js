// drawingInput.js - Simplified for better cross-platform reliability
import {
    MAZE_CELL_SIZE, DRAWING_RESOLUTION,
    BRUSH_SIZES
} from 'config';
import { getCurrentTransform } from './camera.js';
import { saveUndoState } from './drawing.js';
import { applyFillBucket } from './drawingTools.js';

let canvasRef;
let isDrawing = false;
let lastDrawGridX = null;
let lastDrawGridY = null;
let strokeOccurred = false; // Track if any drawing happened during the stroke

// Functions provided by drawing.js
let getDrawingModeFunc;
let getCurrentDrawingSquareFunc;
let getDrawingDataFunc;
let getCurrentDrawingColorIndexFunc;
let getCurrentBrushIndexFunc;
let getCurrentToolFunc;

export function initDrawingInput(
    _canvas,
    _getDrawingMode,
    _getCurrentDrawingSquare,
    _getCurrentDrawingData,
    _getCurrentDrawingColorIndex,
    _getCurrentBrushIndex,
    _getCurrentTool
) {
    canvasRef = _canvas;
    getDrawingModeFunc = _getDrawingMode;
    getCurrentDrawingSquareFunc = _getCurrentDrawingSquare;
    getDrawingDataFunc = _getCurrentDrawingData;
    getCurrentDrawingColorIndexFunc = _getCurrentDrawingColorIndex;
    getCurrentBrushIndexFunc = _getCurrentBrushIndex;
    getCurrentToolFunc = _getCurrentTool;

    // Clean up any existing listeners first
    removeDrawingListeners();

    // SIMPLIFIED APPROACH: Use unified touch handling that works on all platforms
    // For touch devices (including iOS/iPad)
    canvasRef.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    // For mouse/pointer on desktop
    canvasRef.addEventListener('mousedown', handleMouseDown);

    console.log("Drawing input initialized with unified touch/mouse handlers");
}

// Calculates drawing grid coordinates from canvas coordinates, accounting for camera transform
function getDrawingGridCoords(canvasX, canvasY) {
    const currentDrawingSquare = getCurrentDrawingSquareFunc();
    if (!currentDrawingSquare) return null;

    const { offsetX, offsetY, zoom } = getCurrentTransform();
    const worldX = (canvasX - offsetX) / zoom;
    const worldY = (canvasY - offsetY) / zoom;

    const drawingSquareWorldOriginX = currentDrawingSquare.x * MAZE_CELL_SIZE;
    const drawingSquareWorldOriginY = currentDrawingSquare.y * MAZE_CELL_SIZE;

    const innerWorldX = worldX - drawingSquareWorldOriginX;
    const innerWorldY = worldY - drawingSquareWorldOriginY;

    const drawGridX = (innerWorldX / MAZE_CELL_SIZE) * DRAWING_RESOLUTION;
    const drawGridY = (innerWorldY / MAZE_CELL_SIZE) * DRAWING_RESOLUTION;

    return { drawGridX: drawGridX, drawGridY: drawGridY };
}

// SIMPLIFIED: Draws at the given client coordinates and returns if any pixels changed
function drawAtClientCoords(clientX, clientY) {
    // Safety check - only proceed if in drawing mode
    if (!getDrawingModeFunc() || !getDrawingDataFunc()) {
        lastDrawGridX = null;
        lastDrawGridY = null;
        return false;
    }

    try {
        const rect = canvasRef.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;

        const coords = getDrawingGridCoords(canvasX, canvasY);
        if (!coords) return false;

        const { drawGridX, drawGridY } = coords;
        const currentTool = getCurrentToolFunc();
        let didDraw = false;

        // Fill bucket tool
        if (currentTool === 'fill') {
            if (applyFillBucket(getDrawingDataFunc(), drawGridX, drawGridY, getCurrentDrawingColorIndexFunc())) {
                didDraw = true;
            }
            lastDrawGridX = null;
            lastDrawGridY = null;
        } 
        // Brush tool
        else {
            // If we have previous coordinates, draw a line
            if (lastDrawGridX !== null && lastDrawGridY !== null) {
                if (drawLine(lastDrawGridX, lastDrawGridY, drawGridX, drawGridY)) {
                    didDraw = true;
                }
            } else {
                if (applyBrush(drawGridX, drawGridY)) {
                    didDraw = true;
                }
            }
            lastDrawGridX = drawGridX;
            lastDrawGridY = drawGridY;
        }

        return didDraw;
    } catch (error) {
        console.error("Error in drawAtClientCoords:", error);
        return false;
    }
}

// SIMPLIFIED: Applies the brush to drawing data
function applyBrush(centerX, centerY) {
    const drawingData = getDrawingDataFunc();
    const currentBrushIndex = getCurrentBrushIndexFunc();
    const currentDrawingColorIndex = getCurrentDrawingColorIndexFunc();
    
    if (!drawingData || currentBrushIndex === undefined || currentDrawingColorIndex === undefined) {
        return false;
    }

    let changed = false;
    const brushRadius = BRUSH_SIZES[currentBrushIndex];
    const brushRadiusSq = brushRadius * brushRadius;

    // Special case for tiny brush (0.5px)
    if (brushRadius === 0.5) {
        const pixelX = Math.floor(centerX);
        const pixelY = Math.floor(centerY);

        if (pixelY >= 0 && pixelY < DRAWING_RESOLUTION && 
            pixelX >= 0 && pixelX < DRAWING_RESOLUTION) {
            if (drawingData[pixelY][pixelX] !== currentDrawingColorIndex) {
                drawingData[pixelY][pixelX] = currentDrawingColorIndex;
                changed = true;
            }
        }
        return changed;
    }

    // Normal brush for larger sizes
    const startX = Math.max(0, Math.floor(centerX - brushRadius));
    const endX = Math.min(DRAWING_RESOLUTION, Math.ceil(centerX + brushRadius));
    const startY = Math.max(0, Math.floor(centerY - brushRadius));
    const endY = Math.min(DRAWING_RESOLUTION, Math.ceil(centerY + brushRadius));

    for (let y = startY; y < endY; y++) {
        if (!drawingData[y]) continue;
        
        for (let x = startX; x < endX; x++) {
            if (x < 0 || x >= DRAWING_RESOLUTION) continue;

            const dx = x - centerX + 0.5;
            const dy = y - centerY + 0.5;
            if (dx * dx + dy * dy <= brushRadiusSq) {
                if (drawingData[y][x] !== currentDrawingColorIndex) {
                    drawingData[y][x] = currentDrawingColorIndex;
                    changed = true;
                }
            }
        }
    }
    
    return changed;
}

// SIMPLIFIED: Draw line between two points using linear interpolation
function drawLine(x1, y1, x2, y2) {
    let changed = false;
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const brushRadius = BRUSH_SIZES[getCurrentBrushIndexFunc()];

    // Special case for tiny brush (0.5px)
    if (brushRadius === 0.5) {
        const drawingData = getDrawingDataFunc();
        const currentDrawingColorIndex = getCurrentDrawingColorIndexFunc();

        // Bresenham algorithm for pixel-perfect lines
        let x = Math.floor(x1);
        let y = Math.floor(y1);
        const x2Floor = Math.floor(x2);
        const y2Floor = Math.floor(y2);

        const absX = Math.abs(x2Floor - x);
        const absY = Math.abs(y2Floor - y);
        const signX = x < x2Floor ? 1 : -1;
        const signY = y < y2Floor ? 1 : -1;

        let err = (absX > absY ? absX : -absY) / 2;

        while (true) {
            if (y >= 0 && y < DRAWING_RESOLUTION && x >= 0 && x < DRAWING_RESOLUTION) {
                if (drawingData[y][x] !== currentDrawingColorIndex) {
                    drawingData[y][x] = currentDrawingColorIndex;
                    changed = true;
                }
            }

            if (x === x2Floor && y === y2Floor) break;

            const e2 = err;
            if (e2 > -absX) {
                err -= absY;
                x += signX;
            }
            if (e2 < absY) {
                err += absX;
                y += signY;
            }
        }

        return changed;
    }

    // Standard interpolation for larger brushes
    const steps = Math.max(1, Math.ceil(Math.max(dx, dy)));
    
    if (steps <= 1 && x1 === x2 && y1 === y2) {
        return applyBrush(x2, y2);
    }

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const currentX = x1 + t * (x2 - x1);
        const currentY = y1 + t * (y2 - y1);
        if (applyBrush(currentX, currentY)) {
            changed = true;
        }
    }
    
    return changed;
}

//===================== MOUSE HANDLERS ======================

function handleMouseDown(event) {
    // Only handle left mouse button
    if (event.button !== 0) return;
    
    // Ignore if not in drawing mode or pointer is locked
    if (!getDrawingModeFunc() || document.pointerLockElement === canvasRef) return;
    
    event.preventDefault();
    
    // Start drawing
    isDrawing = true;
    strokeOccurred = false;
    lastDrawGridX = null;
    lastDrawGridY = null;
    
    if (drawAtClientCoords(event.clientX, event.clientY)) {
        strokeOccurred = true;
    }
    
    // Add document-level event listeners (remove first to prevent duplicates)
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(event) {
    if (!isDrawing || !getDrawingModeFunc()) return;
    
    if (drawAtClientCoords(event.clientX, event.clientY)) {
        strokeOccurred = true;
    }
}

function handleMouseUp(event) {
    if (!isDrawing) return;
    
    // Save undo state only if drawing occurred
    if (strokeOccurred) {
        saveUndoState();
    }
    
    // Reset state
    isDrawing = false;
    strokeOccurred = false;
    lastDrawGridX = null;
    lastDrawGridY = null;
    
    // Clean up event listeners
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
}

//===================== TOUCH HANDLERS ======================

function handleTouchStart(event) {
    // IMPORTANT: Always prevent default on touch start to avoid iOS Safari issues
    event.preventDefault();
    
    // Only proceed if in drawing mode
    if (!getDrawingModeFunc()) return;
    
    // Ignore if no touches or pointer is locked
    if (event.touches.length < 1 || document.pointerLockElement === canvasRef) return;

    // Start drawing
    isDrawing = true;
    strokeOccurred = false;
    lastDrawGridX = null;
    lastDrawGridY = null;
    
    // Process the first touch
    const touch = event.touches[0];
    if (drawAtClientCoords(touch.clientX, touch.clientY)) {
        strokeOccurred = true;
    }
    
    // Add document-level event listeners (remove first to prevent duplicates)
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    document.removeEventListener('touchcancel', handleTouchEnd);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);
    
    console.log("Touch start handled, drawing started");
}

function handleTouchMove(event) {
    // IMPORTANT: Prevent default to stop scrolling during drawing
    event.preventDefault();
    
    if (!isDrawing || !getDrawingModeFunc()) return;
    
    // Only handle first touch
    if (event.touches.length < 1) return;
    
    const touch = event.touches[0];
    if (drawAtClientCoords(touch.clientX, touch.clientY)) {
        strokeOccurred = true;
    }
}

function handleTouchEnd(event) {
    if (!isDrawing) return;
    
    // Prevent default if we can
    if (event.cancelable) event.preventDefault();
    
    // Save undo state only if drawing occurred
    if (strokeOccurred) {
        saveUndoState();
        console.log("Touch end - saving undo state");
    }
    
    // Reset state
    isDrawing = false;
    strokeOccurred = false;
    lastDrawGridX = null;
    lastDrawGridY = null;
    
    // Clean up event listeners
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    document.removeEventListener('touchcancel', handleTouchEnd);
}

// Removes all drawing event listeners
export function removeDrawingListeners() {
    isDrawing = false;
    lastDrawGridX = null;
    lastDrawGridY = null;
    strokeOccurred = false;

    // Remove document-level event listeners
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    document.removeEventListener('touchcancel', handleTouchEnd);
    
    console.log("All drawing event listeners removed");
}