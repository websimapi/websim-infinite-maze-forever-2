// startSquareProtection.js - Ensures the start square (0,0) always displays correctly

import { getInitialStartSquareData } from './mapManager.js';

/**
 * Gets the data that should be displayed for the start square (0,0)
 * This will always return the default start square data
 * @returns {object} The canonical start square data
 */
export function getProtectedStartSquareData() {
    return getInitialStartSquareData();
}

/**
 * Checks if coordinates refer to the start square (0,0)
 * @param {number} x - The X coordinate
 * @param {number} y - The Y coordinate
 * @returns {boolean} True if these are start square coordinates
 */
export function isStartSquare(x, y) {
    return x === 0 && y === 0;
}

/**
 * Protects the maze data by ensuring the start square always has the default data
 * @param {object} originalMazeData - The maze data from the database
 * @returns {object} The maze data with the start square protected
 */
export function getProtectedMazeData(originalMazeData) {
    if (!originalMazeData) return originalMazeData;
    
    // Create a shallow copy, so we don't modify the original
    const protectedMaze = {...originalMazeData};
    
    // Always override the start square data with the canonical version
    const startSquareData = getProtectedStartSquareData();
    if (startSquareData) {
        protectedMaze["0,0"] = startSquareData;
    }
    
    return protectedMaze;
}