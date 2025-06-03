/**
 * Checks if two maze squares are adjacent (including diagonals).
 * @param {number} x1 - First square X coordinate
 * @param {number} y1 - First square Y coordinate
 * @param {number} x2 - Second square X coordinate
 * @param {number} y2 - Second square Y coordinate
 * @returns {boolean} - True if squares are adjacent or the same
 */
export function areSquaresAdjacent(x1, y1, x2, y2) {
    // Check if squares are the same
    if (x1 === x2 && y1 === y2) return true;
    
    // Check if squares are adjacent (horizontally, vertically, or diagonally)
    const xDiff = Math.abs(x1 - x2);
    const yDiff = Math.abs(y1 - y2);
    
    // Adjacent if they differ by at most 1 in each direction
    return xDiff <= 1 && yDiff <= 1;
}

/**
 * Checks if a point is very close to a specific maze square border
 * @param {number} worldX - World X coordinate of the point
 * @param {number} worldY - World Y coordinate of the point
 * @param {number} mazeX - Maze square X coordinate to check against
 * @param {number} mazeY - Maze square Y coordinate to check against
 * @param {number} proximityThreshold - Threshold distance to consider "very close" in world units
 * @returns {boolean} - True if point is very close to the square border
 */
export function isVeryCloseToSquare(worldX, worldY, mazeX, mazeY, proximityThreshold = 0.5) {
    const MAZE_CELL_SIZE = 20; // Using direct value to avoid circular imports
    
    // Calculate square bounds
    const squareMinX = mazeX * MAZE_CELL_SIZE;
    const squareMaxX = (mazeX + 1) * MAZE_CELL_SIZE;
    const squareMinY = mazeY * MAZE_CELL_SIZE;
    const squareMaxY = (mazeY + 1) * MAZE_CELL_SIZE;
    
    // Check if point is outside the square but within threshold distance of any edge
    if (
        // Left edge
        (Math.abs(worldX - squareMinX) <= proximityThreshold && worldY >= squareMinY && worldY <= squareMaxY) ||
        // Right edge
        (Math.abs(worldX - squareMaxX) <= proximityThreshold && worldY >= squareMinY && worldY <= squareMaxY) ||
        // Top edge
        (Math.abs(worldY - squareMinY) <= proximityThreshold && worldX >= squareMinX && worldX <= squareMaxX) ||
        // Bottom edge
        (Math.abs(worldY - squareMaxY) <= proximityThreshold && worldX >= squareMinX && worldX <= squareMaxX)
    ) {
        return true;
    }
    
    return false;
}