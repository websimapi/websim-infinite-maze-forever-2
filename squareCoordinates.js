// squareCoordinates.js - Draws coordinate labels on maze squares

import { MAZE_CELL_SIZE } from 'config';

/**
 * Draws coordinate labels in the center of each visible square
 * @param {CanvasRenderingContext2D} ctx - The rendering context
 * @param {object} maze - The maze state object
 * @param {object} viewBounds - The current viewport bounds { x, y, width, height }
 * @param {boolean} showCoords - Whether to show the coordinates
 */
export function drawSquareCoordinates(ctx, maze, viewBounds, showCoords) {
    if (!showCoords || !ctx || !viewBounds) return;
    
    // Calculate the range of squares in view (add margin for partially visible squares)
    const startX = Math.floor(viewBounds.x / MAZE_CELL_SIZE) - 1;
    const endX = Math.ceil((viewBounds.x + viewBounds.width) / MAZE_CELL_SIZE) + 1;
    const startY = Math.floor(viewBounds.y / MAZE_CELL_SIZE) - 1;
    const endY = Math.ceil((viewBounds.y + viewBounds.height) / MAZE_CELL_SIZE) + 1;
    
    // Set text styling
    ctx.save();
    ctx.font = '2px sans-serif'; // Increased from 0.7px to 2px for much larger coordinates
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw coordinate text for each square in view
    for (let x = startX; x < endX; x++) {
        for (let y = startY; y < endY; y++) {
            const worldX = (x + 0.5) * MAZE_CELL_SIZE; // Center X
            const worldY = (y + 0.5) * MAZE_CELL_SIZE; // Center Y
            
            // Draw coordinate text with contrasting outline
            ctx.lineWidth = 0.1;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.strokeText(`${x},${y}`, worldX, worldY);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillText(`${x},${y}`, worldX, worldY);
        }
    }
    
    ctx.restore();
}