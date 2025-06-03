// moderation.js - Handles AI-based content moderation for drawings

import {
    DRAWING_RESOLUTION, PALETTE, DEFAULT_FLOOR_INDEX
} from 'config';
import { teleportPlayersInSquare } from './teleportUtils.js';

/**
 * Creates a PNG data URL from drawing data (2D array of palette indices).
 * @param {Array<Array<number>>} drawingData - The 2D array of palette indices.
 * @returns {Promise<string>} A promise that resolves with the data URL string.
 */
async function createImageDataUrlFromDrawing(drawingData) {
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = DRAWING_RESOLUTION;
    offscreenCanvas.height = DRAWING_RESOLUTION;
    const ctx = offscreenCanvas.getContext('2d', { alpha: false });
    if (!ctx) {
        throw new Error("Could not create offscreen canvas context for moderation image");
    }

    // Fill background with default floor color first
    ctx.fillStyle = PALETTE[DEFAULT_FLOOR_INDEX]?.color || '#FFFFFF';
    ctx.fillRect(0, 0, DRAWING_RESOLUTION, DRAWING_RESOLUTION);

    // Draw the pixels from the drawing data
    for (let y = 0; y < DRAWING_RESOLUTION; y++) {
        if (!drawingData[y] || !Array.isArray(drawingData[y])) continue;
        for (let x = 0; x < DRAWING_RESOLUTION; x++) {
            if (drawingData[y][x] === undefined || drawingData[y][x] === null) continue;

            let colorIndex = drawingData[y][x];
            if (colorIndex < 0 || colorIndex >= PALETTE.length || !PALETTE[colorIndex]) {
                colorIndex = DEFAULT_FLOOR_INDEX; // Fallback
            }

            const paletteEntry = PALETTE[colorIndex];
             if (!paletteEntry) {
                 ctx.fillStyle = PALETTE[DEFAULT_FLOOR_INDEX]?.color || '#FFFFFF';
             } else if (paletteEntry.isHole) {
                 // For moderation images, render holes as dark red instead of black
                 ctx.fillStyle = 'rgba(128, 0, 0, 1)'; // Dark red for holes
             } else {
                  ctx.fillStyle = paletteEntry.color;
             }

            ctx.fillRect(x, y, 1, 1); // Draw single pixel
        }
    }

    return offscreenCanvas.toDataURL('image/png');
}

/**
 * Checks if the provided drawing data is safe for work using an AI model.
 * @param {Array<Array<number>>} drawingData - The 2D array of palette indices.
 * @param {string} mazeKey - The maze coordinates in 'x,y' format for the square
 * @returns {Promise<{isSfw: boolean, reason: string | null}>} - A promise resolving to the moderation result. Defaults to SFW if check fails.
 */
export async function checkDrawingSfw(drawingData, mazeKey) {
    console.log("Moderation: Generating image for AI check...");
    try {
        const imageDataUrl = await createImageDataUrlFromDrawing(drawingData);
        console.log("Moderation: Sending image to AI for analysis...");

        // --- Call LLM for Moderation ---
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are an expert on content moderation in a collaborative pixel art maze game. 
You are looking for content that is actively and clearly *malicious*, specifically:
- Clearly pornographic images (e.g., explicit sexual organs, even in pixel form)
- Realistic graphic violence (e.g., gore)
- Unambiguous hate symbols (e.g., precise swastika shape intended as such)

However, you should NOT flag for SFW removal all of the following:
- Drawings of faces, stick figures, smiling people, cartoons, or exaggerated features, even if they look odd or silly
- Odd body proportions or weird art style (faces, limbs, shapes etc) -- pixel art is stylized and often crude!
- Any text-based content (except explicit hate speech or slurs spelled out clearly)
- Stylized violence, toy weapons, ambiguous patterns, rude gestures, non-sexual nudity, or suggestive art that is not clearly pornographic
- Religious or political symbols unless they are obviously intended as hate symbols or are offensive in a known context
- Crosses, plus-signs, geometric patterns that might resemble symbols if rotated, unless they are intentionally aggressive or accompanied by hateful context
- Crude humor, memes, or ambiguous forms -- BE lenient

Be skeptical that something is actually intended to be inappropriate: give benefit of the doubt unless truly obvious.
Block only content that is so explicit you would not be comfortable showing it to young children (age 7+).
Never block for things just because they "look weird", "exaggerated", "possibly" offensive, "vaguely" like something bad, or could be *interpreted* as bad -- unless it's unmistakable.

If in doubt, always mark as SFW.
Respond ONLY with JSON matching this schema, and absolutely no other text:
{
  "isSfw": boolean, // true if safe for work (not clearly malicious), false only if it's absolutely disallowed
  "reason": string | null // Brief human explanation for any block, null otherwise
}
`,
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Is this pixel art image clearly inappropriate and must be removed from a public collaborative project?"
                        },
                        {
                            type: "image_url",
                            image_url: { url: imageDataUrl },
                        },
                    ],
                },
            ],
            json: true, // Request JSON output
        });
        // --- End LLM Call ---

        console.log("Moderation: AI response received.");
        const result = JSON.parse(completion.content);

        // Validate the structure of the response
        if (typeof result?.isSfw !== 'boolean') {
             console.warn("Moderation: AI response missing or invalid 'isSfw' field. Defaulting to SFW.", result);
             return { isSfw: true, reason: 'AI response format invalid.' };
        }

        console.log("Moderation: Check complete.", result);
        return {
            isSfw: result.isSfw,
            // Ensure reason is null if SFW, and a string (even empty) if NSFW
            reason: result.isSfw ? null : (typeof result.reason === 'string' ? result.reason : 'Content deemed inappropriate.')
        };

    } catch (error) {
        console.error("Moderation: Error during AI check:", error);
        // Default to SFW in case of any error during the process
        return { isSfw: true, reason: 'Moderation check failed.' };
    }
}

/**
 * Creates a composite image of a 3x3 area around a specific maze square
 * @param {object} mazeState - The complete maze state
 * @param {number} centerX - X coordinate of the center square
 * @param {number} centerY - Y coordinate of the center square
 * @param {string} ownerId - The owner ID to check against
 * @returns {Promise<{imageUrl: string, squareKeys: string[]}>} - The image data URL and list of squares included
 */
async function createAreaImageForModeration(mazeState, centerX, centerY, ownerId) {
    // Create a larger canvas for the 3x3 grid
    const offscreenCanvas = document.createElement('canvas');
    const gridSize = 3; // 3x3 grid
    offscreenCanvas.width = DRAWING_RESOLUTION * gridSize;
    offscreenCanvas.height = DRAWING_RESOLUTION * gridSize;
    const ctx = offscreenCanvas.getContext('2d', { alpha: false });
    
    if (!ctx) {
        throw new Error("Could not create offscreen canvas context for area moderation");
    }
    
    // Fill background with default floor color first
    ctx.fillStyle = PALETTE[DEFAULT_FLOOR_INDEX]?.color || '#FFFFFF';
    ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    
    // Track which squares are included (for potential deletion)
    const includedSquares = [];
    
    // Draw each square in the 3x3 grid if it exists and is owned by the same user
    for (let yOffset = -1; yOffset <= 1; yOffset++) {
        for (let xOffset = -1; xOffset <= 1; xOffset++) {
            const x = centerX + xOffset;
            const y = centerY + yOffset;
            const key = `${x},${y}`;
            
            const squareInfo = mazeState[key];
            // Only include squares owned by the same user or the center square
            if (squareInfo && squareInfo.data && 
                ((squareInfo.ownerId === ownerId) || (x === centerX && y === centerY))) {
                
                // Add to list of included squares for potential deletion
                includedSquares.push(key);
                
                // Calculate position in the composite image
                const canvasX = (xOffset + 1) * DRAWING_RESOLUTION; // +1 to shift from -1,0,1 to 0,1,2
                const canvasY = (yOffset + 1) * DRAWING_RESOLUTION;
                
                // Draw this square's pixels onto the composite
                drawSquareDataToCanvas(ctx, squareInfo.data, canvasX, canvasY);
            }
        }
    }
    
    // Convert to data URL
    const imageDataUrl = offscreenCanvas.toDataURL('image/png');
    
    return {
        imageUrl: imageDataUrl,
        squareKeys: includedSquares
    };
}

/**
 * Draws square pixel data onto a canvas at specified position
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array<Array<number>>} drawingData - Pixel data to draw
 * @param {number} offsetX - X position on canvas
 * @param {number} offsetY - Y position on canvas
 */
function drawSquareDataToCanvas(ctx, drawingData, offsetX, offsetY) {
    // Draw the pixels
    for (let y = 0; y < DRAWING_RESOLUTION; y++) {
        if (!drawingData[y] || !Array.isArray(drawingData[y])) continue;
        for (let x = 0; x < DRAWING_RESOLUTION; x++) {
            if (drawingData[y][x] === undefined || drawingData[y][x] === null) continue;

            let colorIndex = drawingData[y][x];
            if (colorIndex < 0 || colorIndex >= PALETTE.length || !PALETTE[colorIndex]) {
                colorIndex = DEFAULT_FLOOR_INDEX; // Fallback
            }

            const paletteEntry = PALETTE[colorIndex];
            if (!paletteEntry) {
                ctx.fillStyle = PALETTE[DEFAULT_FLOOR_INDEX]?.color || '#FFFFFF';
            } else {
                ctx.fillStyle = paletteEntry.color;
            }

            ctx.fillRect(offsetX + x, offsetY + y, 1, 1);
        }
    }
}

/**
 * Performs extended moderation checks on both individual square and 3x3 area
 * @param {Array<Array<number>>} drawingData - The 2D array of palette indices for current square
 * @param {string} mazeKey - The maze coordinates in 'x,y' format for the square
 * @param {object} room - The Websim room object for accessing full maze state
 * @returns {Promise<{isSfw: boolean, reason: string | null, areaViolation: boolean, squaresToDelete: string[]}>}
 */
export async function performExtendedModerationCheck(drawingData, mazeKey, room) {
    // First, check the individual square
    console.log("Moderation: Starting single square check for", mazeKey);
    const singleSquareResult = await checkDrawingSfw(drawingData, mazeKey);
    
    // If single square fails, return immediately
    if (!singleSquareResult.isSfw) {
        return {
            isSfw: false,
            reason: singleSquareResult.reason,
            areaViolation: false,
            squaresToDelete: [mazeKey]
        };
    }
    
    // Parse coordinates
    const [centerX, centerY] = mazeKey.split(',').map(Number);
    
    // Get the maze state and owner ID
    const mazeState = room.roomState?.maze || {};
    const squareInfo = mazeState[mazeKey];
    
    if (!squareInfo || !squareInfo.ownerId) {
        console.warn("Moderation: Missing owner ID for extended check, skipping area check");
        return {
            isSfw: true,
            reason: null,
            areaViolation: false,
            squaresToDelete: []
        };
    }
    
    const ownerId = squareInfo.ownerId;
    const ownerUsername = squareInfo.username; // Get owner username
    
    // Create composite image of 3x3 area around this square where squares have the same owner
    console.log("Moderation: Creating 3x3 area image for extended check");
    const { imageUrl, squareKeys } = await createAreaImageForModeration(
        mazeState, centerX, centerY, ownerId
    );
    
    // If only the center square was included (no surrounding owned squares), 
    // skip the area check as we already checked the single square
    if (squareKeys.length <= 1) {
        console.log("Moderation: No surrounding squares by same owner, skipping area check");
        return {
            isSfw: true,
            reason: null,
            areaViolation: false,
            squaresToDelete: []
        };
    }
    
    // Perform moderation check on the composite area image
    console.log("Moderation: Starting AI check on 3x3 area...");
    
    try {
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are an expert content moderator evaluating a combined pixel art image made by one user across 3x3 squares in a public grid. 
Flag only *truly malicious and unmistakable* content that appears *clearly* when viewing the group of squares as a whole, such as:
- Explicit pornography (e.g., sexual organs, sex acts—must be unmistakable, not just "suggestive" or "maybe")
- Very obvious hate symbols (e.g., deliberate swastika, KKK, etc.—must not be just a geometric pattern)
- Realistic, graphic violence or gore
- Combinations of symbols or words that are unmistakably meant for hate speech

Do NOT flag for:
- Faces, bodies, stylized or weird figures, or anything that just looks "strange"
- Exaggerated features, crude drawings, ambiguous shapes, or art that is "possibly" suggestive but not explicit
- Cartoonish, crude, or ambiguous imagery
- Crosses, plus signs, stars, geometric patterns, or symbols unless the context is clearly hateful (use common sense, don't assume worst intent)
- Political, religious, or meme content unless it is obviously malicious
- Accidental patterns that might slightly resemble symbols

Be *highly lenient* and only block if you are *entirely certain* that inappropriate, hateful, or pornographic content is intentional. Give users the benefit of the doubt.

Only mark as NOT SFW if you would immediately remove it from a children's (age 7+) game without hesitation.
Respond ONLY with JSON matching this schema, and absolutely no other text:
{
  "isSfw": boolean, // true if safe, false if inappropriate content detected across squares
  "reason": string | null // Brief explanation if not SFW, null otherwise
}
`,
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Is there any malicious or truly inappropriate content in this 3x3 combined pixel art image? Only block if it's unmistakable."
                        },
                        {
                            type: "image_url",
                            image_url: { url: imageUrl },
                        },
                    ],
                },
            ],
            json: true,
        });
        
        console.log("Moderation: Area check AI response received");
        const result = JSON.parse(completion.content);
        
        // Validate the structure of the response
        if (typeof result?.isSfw !== 'boolean') {
            console.warn("Moderation: Area check AI response invalid format, defaulting to SFW", result);
            return {
                isSfw: true,
                reason: null,
                areaViolation: false,
                squaresToDelete: []
            };
        }
        
        const moderationResult = {
            isSfw: result.isSfw,
            reason: result.isSfw ? null : (typeof result.reason === 'string' ? result.reason : 'Inappropriate pattern detected'),
            areaViolation: !result.isSfw,
            squaresToDelete: result.isSfw ? [] : squareKeys
        };
        
        if (typeof sendSystemMessage === 'function') {
            const reason = moderationResult.reason || 'Inappropriate content';
            if (moderationResult.areaViolation) {
                sendSystemMessage(SYSTEM_MESSAGE.MOD_MULTI_DRAWINGS_REMOVED, {
                    count: moderationResult.squaresToDelete.length,
                    username: ownerUsername,
                    reason: reason
                });
            } else {
                sendSystemMessage(SYSTEM_MESSAGE.MOD_DRAWING_REMOVED, {
                    coords: mazeKey,
                    username: ownerUsername,
                    reason: reason
                });
            }
        }
        
        return moderationResult;
        
    } catch (error) {
        console.error("Moderation: Error during area check:", error);
        // Default to SFW if the check fails
        return {
            isSfw: true,
            reason: null,
            areaViolation: false,
            squaresToDelete: []
        };
    }
}