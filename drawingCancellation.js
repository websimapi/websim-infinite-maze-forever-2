// drawingCancellation.js - Handles cancellation of drawing mode without saving changes

/**
 * Cancels the current drawing and exits drawing mode without saving changes.
 * @param {object} roomRef - Reference to the Websim room 
 * @param {function} finishDrawingFunc - Function that handles exiting drawing mode
 * @param {function} getCurrentDrawingSquareFunc - Function that returns the current drawing square
 * @returns {boolean} - True if cancellation was successful
 */
export function cancelDrawing(roomRef, finishDrawingFunc, getCurrentDrawingSquareFunc) {
    // Get current drawing square
    const currentDrawingSquare = getCurrentDrawingSquareFunc();
    if (!currentDrawingSquare) {
        console.warn("Cancel: No active drawing square to cancel");
        return false;
    }

    const mazeKey = `${currentDrawingSquare.x},${currentDrawingSquare.y}`;
    console.log(`Cancelling drawing for square ${mazeKey}`);

    // Release the drawing claim in room state
    roomRef.updateRoomState({
        drawingSquares: {
            [mazeKey]: null // Set claim to null
        }
    });

    // Call the finish drawing function with forceExit=true to exit without saving
    // This handles all the cleanup of drawing mode and state
    finishDrawingFunc(true);
    
    console.log(`Drawing cancelled for square ${mazeKey}. Square remains unclaimed.`);
    return true;
}