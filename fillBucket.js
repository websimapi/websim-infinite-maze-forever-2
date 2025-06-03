// fillBucket.js - Handles fill bucket tool functionality for the drawing UI

/**
 * Performs a flood fill at the given coordinates with the specified color index.
 * Uses a queue-based approach for efficiency with large areas.
 * @param {Array<Array<number>>} drawingData - The 2D array of pixel color indices
 * @param {number} startX - Starting X coordinate for the fill
 * @param {number} startY - Starting Y coordinate for the fill
 * @param {number} fillColorIndex - The color index to fill with
 * @returns {boolean} - True if any pixels were changed, false otherwise
 */
export function floodFill(drawingData, startX, startY, fillColorIndex) {
    if (!drawingData || !Array.isArray(drawingData) || drawingData.length === 0) {
        console.warn("Fill: Invalid drawing data");
        return false;
    }

    // Round and ensure coordinates are integers within bounds
    startX = Math.floor(startX);
    startY = Math.floor(startY);
    
    if (startX < 0 || startY < 0 || startY >= drawingData.length || 
        !drawingData[startY] || startX >= drawingData[startY].length) {
        console.warn(`Fill: Coordinates out of bounds: ${startX},${startY}`);
        return false;
    }

    // Get the target color to replace (the color at the starting point)
    const targetColorIndex = drawingData[startY][startX];
    
    // If target color is already the fill color, nothing to do
    if (targetColorIndex === fillColorIndex) {
        return false;
    }

    const width = drawingData[0].length;
    const height = drawingData.length;
    let changed = false;
    
    // Using a queue for better performance with large areas
    const queue = [{x: startX, y: startY}];
    
    // Process the queue
    while (queue.length > 0) {
        const {x, y} = queue.shift();
        
        // Skip if outside bounds or not the target color
        if (x < 0 || y < 0 || x >= width || y >= height || 
            !drawingData[y] || drawingData[y][x] !== targetColorIndex) {
            continue;
        }
        
        // Set the color
        drawingData[y][x] = fillColorIndex;
        changed = true;
        
        // Add the 4 adjacent pixels to the queue
        queue.push({x: x+1, y: y}); // Right
        queue.push({x: x-1, y: y}); // Left
        queue.push({x: x, y: y+1}); // Down
        queue.push({x: x, y: y-1}); // Up
    }
    
    return changed;
}