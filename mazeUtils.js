// mazeUtils.js
import { MAZE_CELL_SIZE, PALETTE, DEFAULT_FLOOR_INDEX, DRAWING_RESOLUTION } from 'config';
import { isStartSquare, getProtectedStartSquareData } from './startSquareProtection.js';

// --- Maze Logic ---

export function getPlayerMazeSquare(player) {
    if (!player || player.x === undefined || player.y === undefined) {
        console.warn("getPlayerMazeSquare: Invalid player object", player);
        // Return a default or handle error appropriately
        return { mazeX: 0, mazeY: 0 }; 
    }
    // Calculate maze square coordinates based on player's world position
    const mazeX = Math.floor(player.x / MAZE_CELL_SIZE);
    const mazeY = Math.floor(player.y / MAZE_CELL_SIZE);
    return { mazeX, mazeY };
}

/**
 * Checks if a given world coordinate corresponds to a wall.
 * Treats unclaimed/non-existent squares as walls by default.
 * @param {number} worldX - The world X coordinate.
 * @param {number} worldY - The world Y coordinate.
 * @param {object} mazeState - The current maze state from room.roomState.maze
 *                             Structure: { "x,y": { data: [[...]], ownerId: ... } }
 * @param {object} [options={}] - Optional parameters.
 * @param {boolean} [options.ignoreUnclaimed=false] - If true, does not treat unclaimed squares as walls.
 * @returns {boolean} - True if the coordinate is a wall, false otherwise.
 */
export function isWall(worldX, worldY, mazeState, options = {}) {
    const { ignoreUnclaimed = false } = options; // Destructure the option

    // Determine which maze square the world coordinates fall into
    const mazeX = Math.floor(worldX / MAZE_CELL_SIZE);
    const mazeY = Math.floor(worldY / MAZE_CELL_SIZE);
    const mazeKey = `${mazeX},${mazeY}`;

    // Special handling for start square
    let squareInfo;
    if (isStartSquare(mazeX, mazeY)) {
        squareInfo = getProtectedStartSquareData();
    } else {
        // Get the data object for the square: { data: [...], ownerId: ... }
        squareInfo = mazeState ? mazeState[mazeKey] : undefined;
    }

    // --- Check if the square exists and has data ---
    if (!squareInfo || !squareInfo.data) {
        // If ignoreUnclaimed is true, return false (passable).
        // Otherwise, return true (unclaimed squares are walls by default).
        return !ignoreUnclaimed;
    }

    // --- Square exists, check pixel data ---
    const cellData = squareInfo.data; // This is the DRAWING_RESOLUTION x DRAWING_RESOLUTION grid

    // Calculate the position *within* the maze square, in world units (0 to MAZE_CELL_SIZE)
    const innerWorldX = ((worldX % MAZE_CELL_SIZE) + MAZE_CELL_SIZE) % MAZE_CELL_SIZE;
    const innerWorldY = ((worldY % MAZE_CELL_SIZE) + MAZE_CELL_SIZE) % MAZE_CELL_SIZE;

    // Map the inner world coordinates to the internal drawing grid coordinates
    const drawGridX = Math.floor((innerWorldX / MAZE_CELL_SIZE) * DRAWING_RESOLUTION);
    const drawGridY = Math.floor((innerWorldY / MAZE_CELL_SIZE) * DRAWING_RESOLUTION);

    // Clamp coordinates to be safely within the drawing resolution bounds [0, DRAWING_RESOLUTION - 1]
    const clampedGridX = Math.max(0, Math.min(DRAWING_RESOLUTION - 1, drawGridX));
    const clampedGridY = Math.max(0, Math.min(DRAWING_RESOLUTION - 1, drawGridY));

     // Check bounds and if the cell data exists at the mapped coordinates within the specific square
     // Note: cellData is squareInfo.data which we already checked exists
    if (!cellData[clampedGridY] || cellData[clampedGridY][clampedGridX] === undefined) {
        // This case should ideally not happen if drawingData is always fully initialized.
        // If it does, treat as default floor (or wall? Let's stick to floor for safety inside defined square)
        console.warn(`isWall: Coordinates out of bounds or missing data within defined square ${mazeKey}: ${clampedGridX}, ${clampedGridY}. Treating as default floor.`);
        return PALETTE[DEFAULT_FLOOR_INDEX]?.isWall === true; // Treat as default floor inside a defined square
    }

    const colorIndex = cellData[clampedGridY][clampedGridX];

    // Check if the color index is valid for the PALETTE array
    if (colorIndex < 0 || colorIndex >= PALETTE.length || !PALETTE[colorIndex]) {
        console.warn(`isWall: Invalid color index ${colorIndex} at ${mazeKey} [${clampedGridX}, ${clampedGridY}]. Treating as default floor.`);
        return PALETTE[DEFAULT_FLOOR_INDEX]?.isWall === true; // Invalid index, treat as default floor
    }

    // Check the isWall property from the palette configuration
    return PALETTE[colorIndex]?.isWall === true; // Return true if it's a wall, false otherwise
}

/**
 * Checks if a given world coordinate corresponds to a hole.
 * @param {number} worldX - The world X coordinate.
 * @param {number} worldY - The world Y coordinate.
 * @param {object} mazeState - The current maze state from room.roomState.maze
 * @returns {boolean} - True if the coordinate is a hole, false otherwise.
 */
export function isHole(worldX, worldY, mazeState) {
    // Determine which maze square the world coordinates fall into
    const mazeX = Math.floor(worldX / MAZE_CELL_SIZE);
    const mazeY = Math.floor(worldY / MAZE_CELL_SIZE);
    const mazeKey = `${mazeX},${mazeY}`;

    // Special handling for start square - start square can't have holes
    if (isStartSquare(mazeX, mazeY)) {
        return false;
    }

    // Get the data object for the square: { data: [...], ownerId: ... }
    const squareInfo = mazeState ? mazeState[mazeKey] : undefined;

    // If the square doesn't exist or has no data, it's not a hole
    if (!squareInfo || !squareInfo.data) {
        return false;
    }

    // Get the cell data for this square
    const cellData = squareInfo.data;

    // Calculate the position *within* the maze square, in world units (0 to MAZE_CELL_SIZE)
    const innerWorldX = ((worldX % MAZE_CELL_SIZE) + MAZE_CELL_SIZE) % MAZE_CELL_SIZE;
    const innerWorldY = ((worldY % MAZE_CELL_SIZE) + MAZE_CELL_SIZE) % MAZE_CELL_SIZE;

    // Map the inner world coordinates to the internal drawing grid coordinates
    const drawGridX = Math.floor((innerWorldX / MAZE_CELL_SIZE) * DRAWING_RESOLUTION);
    const drawGridY = Math.floor((innerWorldY / MAZE_CELL_SIZE) * DRAWING_RESOLUTION);

    // Clamp to valid bounds
    const clampedGridX = Math.max(0, Math.min(DRAWING_RESOLUTION - 1, drawGridX));
    const clampedGridY = Math.max(0, Math.min(DRAWING_RESOLUTION - 1, drawGridY));

    // Check if the cell data exists
    if (!cellData[clampedGridY] || cellData[clampedGridY][clampedGridX] === undefined) {
        return false;
    }

    const colorIndex = cellData[clampedGridY][clampedGridX];

    // Check if the color index is valid
    if (colorIndex < 0 || colorIndex >= PALETTE.length || !PALETTE[colorIndex]) {
        return false;
    }

    // Check if it's a hole
    return PALETTE[colorIndex]?.isHole === true;
}