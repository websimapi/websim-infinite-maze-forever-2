/**
 * Checks if a drawing has been modified from its initial state.
 * @param {Array<Array<number>>} drawingData - The 2D array of pixel color indices
 * @param {number} defaultIndex - The default color index to check against
 * @returns {boolean} - True if drawing has been modified, false if still entirely default color
 */
export function isDrawingModified(drawingData, defaultIndex) {
    if (!drawingData || !Array.isArray(drawingData)) return false;
    
    for (let y = 0; y < drawingData.length; y++) {
        if (!drawingData[y] || !Array.isArray(drawingData[y])) continue;
        
        for (let x = 0; x < drawingData[y].length; x++) {
            // If any pixel is not the default color, the drawing has been modified
            if (drawingData[y][x] !== defaultIndex) {
                return true;
            }
        }
    }
    
    // If we got here, all pixels are still the default color
    return false;
}