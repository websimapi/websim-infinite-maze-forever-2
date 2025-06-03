// mapManager.js - Handles start square generation and validation

import {
    MAZE_CELL_SIZE, DRAWING_RESOLUTION,
    PALETTE, DEFAULT_FLOOR_INDEX, DEFAULT_WALL_INDEX
} from 'config';

// Import necessary functions that will be passed during initialization
let roomRef;
let sendSystemMessageFunc;

let initialStartSquareData = null; // Store the canonical start square data

/**
 * Initializes the map manager with necessary references.
 * @param {object} _room - The Websim room object.
 * @param {function} _sendSystemMessage - Function to send system messages to chat.
 */
export function initMapManager(_room, _sendSystemMessage) {
    roomRef = _room;
    sendSystemMessageFunc = _sendSystemMessage;
    // Generate the start square data immediately if it doesn't exist
    if (!initialStartSquareData) {
        createInitialMazeSquare();
    }
}

/**
 * Generates the data for the initial start square (0,0).
 * Avoids regeneration if data already exists.
 * @returns {object} The maze data object for square 0,0: { data: [...], ownerId: 'system' }
 */
export function createInitialMazeSquare() {
    // Only generate if not already stored
    if (initialStartSquareData) return initialStartSquareData;

    const startSquareKey = '0,0';

    const text = "START";
    // Ensure default indices are valid, provide fallbacks
    const wallColorIndex = (DEFAULT_WALL_INDEX >= 0 && DEFAULT_WALL_INDEX < PALETTE.length) ? DEFAULT_WALL_INDEX : PALETTE.findIndex(p => p.isWall) ?? 0;
    const floorColorIndex = (DEFAULT_FLOOR_INDEX >= 0 && DEFAULT_FLOOR_INDEX < PALETTE.length && !PALETTE[DEFAULT_FLOOR_INDEX].isWall) ? DEFAULT_FLOOR_INDEX : 0;
    const textColorIndex = wallColorIndex; // Use wall color for text

    const textPixelHeight = 7;
    const textPixelWidthPerChar = 5;
    const textPixelSpacing = 1;
    const totalTextPixelWidth = text.length * textPixelWidthPerChar + (text.length - 1) * textPixelSpacing;
    const textStartX = Math.floor((DRAWING_RESOLUTION - totalTextPixelWidth) / 2);
    const textStartY = Math.floor((DRAWING_RESOLUTION - textPixelHeight) / 2);

    // Basic 5x7 font definition (1=draw, 0=background)
    const font = {
        'S': [ [0,1,1,1,0], [1,0,0,0,1], [0,1,0,0,0], [0,0,1,1,0], [0,0,0,0,1], [1,0,0,0,1], [0,1,1,1,0] ],
        'T': [ [1,1,1,1,1], [0,0,1,0,0], [0,0,1,0,0], [0,0,1,0,0], [0,0,1,0,0], [0,0,1,0,0], [0,0,1,0,0] ],
        'A': [ [0,1,1,1,0], [1,0,0,0,1], [1,0,0,0,1], [1,1,1,1,1], [1,0,0,0,1], [1,0,0,0,1], [1,0,0,0,1] ],
        'R': [ [1,1,1,1,0], [1,0,0,0,1], [1,0,0,0,1], [1,1,1,1,0], [1,0,1,0,0], [1,0,0,1,0], [1,0,0,0,1] ],
    };

    // Generate a background pattern using non-default floor colors
    const floorColors = PALETTE.filter(p => !p.isWall);
    const floorColorIndices = PALETTE.map((p, i) => ({...p, index: i}))
                                    .filter(p => !p.isWall && !p.isHole && p.index !== floorColorIndex) // Exclude default floor and holes
                                    .map(p => p.index);
    // Ensure we have at least one floor color index to use
    if (floorColorIndices.length === 0) floorColorIndices.push(floorColorIndex === 0 ? 1 : 0); // Add a fallback if only default existed

    // Initialize data with the background pattern
    const initialDrawingData = Array.from({ length: DRAWING_RESOLUTION }, (_, y) =>
        Array.from({ length: DRAWING_RESOLUTION }, (__, x) => {
            // Simple pattern using available floor indices
            const colorIndexOffset = (x + y * 2) % floorColorIndices.length;
            return floorColorIndices[colorIndexOffset];
        })
    );

    // Draw the text characters
    let currentX = textStartX;
    for (let charIndex = 0; charIndex < text.length; charIndex++) {
        const char = text[charIndex];
        const charData = font[char];
        if (charData) {
            for (let y = 0; y < charData.length; y++) {
                if (y >= textPixelHeight) continue;
                const row = charData[y];
                for (let x = 0; x < row.length; x++) {
                    if (x >= textPixelWidthPerChar) continue;
                    const targetX = currentX + x;
                    const targetY = textStartY + y;
                    // Check bounds before drawing
                    if (targetX >= 0 && targetX < DRAWING_RESOLUTION && targetY >= 0 && targetY < DRAWING_RESOLUTION) {
                        if (row[x] === 1) initialDrawingData[targetY][targetX] = textColorIndex;
                    }
                }
            }
            currentX += textPixelWidthPerChar + textPixelSpacing; // Advance X position
        } else {
            // If character not in font, still advance position to maintain spacing
            currentX += textPixelWidthPerChar + textPixelSpacing;
        }
    }

    // Draw border walls with openings
    const openingSizePixels = Math.max(1, Math.floor(DRAWING_RESOLUTION * 0.2)); // 20% opening
    const openingStart = Math.floor((DRAWING_RESOLUTION - openingSizePixels) / 2);
    const openingEnd = openingStart + openingSizePixels;
    const wallThickness = 3; // Thickness of the border wall

    for(let y=0; y<DRAWING_RESOLUTION; ++y){
        for(let x=0; x<DRAWING_RESOLUTION; ++x){
            let isWall = false;
            // Check if pixel is part of the border
            if (y < wallThickness || y >= DRAWING_RESOLUTION - wallThickness || x < wallThickness || x >= DRAWING_RESOLUTION - wallThickness) {
                isWall = true;
                // Check if pixel is part of an opening
                if ((y < wallThickness || y >= DRAWING_RESOLUTION - wallThickness) && (x >= openingStart && x < openingEnd)) { // Top/Bottom opening
                    isWall = false;
                }
                if ((x < wallThickness || x >= DRAWING_RESOLUTION - wallThickness) && (y >= openingStart && y < openingEnd)) { // Left/Right opening
                    isWall = false;
                }
            }
            if (isWall) {
                initialDrawingData[y][x] = wallColorIndex;
            }
        }
    }

    // Store the generated data locally
    initialStartSquareData = { data: initialDrawingData, ownerId: 'system', ownerUsername: 'System' }; // Add system username
    console.log("MapManager: Generated initial start square data.");
    return initialStartSquareData;
}

/**
 * Gets the locally stored initial start square data.
 * @returns {object | null} The maze data object for square 0,0, or null if not generated.
 */
export function getInitialStartSquareData() {
    return initialStartSquareData;
}