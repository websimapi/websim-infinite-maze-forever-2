// drawingTools.js - Manages drawing tools selection and interface

import { floodFill } from './fillBucket.js';

// Tool constants
export const TOOL_BRUSH = 'brush';
export const TOOL_FILL = 'fill';

// Store current tool state
let currentTool = TOOL_BRUSH;
let brushButton = null;
let fillButton = null;

/**
 * Gets the current active drawing tool
 * @returns {string} The current tool identifier
 */
export function getCurrentTool() {
    return currentTool;
}

/**
 * Handles tool selection
 * @param {string} tool - The tool to select
 */
export function selectTool(tool) {
    currentTool = tool;
    
    // Update UI to reflect selected tool
    if (brushButton && fillButton) {
        if (tool === TOOL_BRUSH) {
            brushButton.classList.add('selected');
            fillButton.classList.remove('selected');
        } else if (tool === TOOL_FILL) {
            brushButton.classList.remove('selected');
            fillButton.classList.add('selected');
        }
    }
}

/**
 * Initialize the drawing tools UI elements
 * @param {HTMLElement} toolsContainer - Container to add tool buttons to
 */
export function initDrawingTools(toolsContainer) {
    // This function is entirely replaced in the new implementation
    // The new implementation moves the fill bucket into the brush container
    // instead of having separate tools in a dedicated tools container
}

/**
 * Applies the fill bucket at the specified drawing coordinates
 * @param {Array<Array<number>>} drawingData - The drawing data array
 * @param {number} x - X coordinate in the drawing grid
 * @param {number} y - Y coordinate in the drawing grid
 * @param {number} colorIndex - Color index to fill with
 * @returns {boolean} True if pixels were changed
 */
export function applyFillBucket(drawingData, x, y, colorIndex) {
    return floodFill(drawingData, x, y, colorIndex);
}