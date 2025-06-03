// collision.js - Contains collision detection logic extracted from input.js

import { MAZE_CELL_SIZE, DRAWING_RESOLUTION, PLAYER_COLLISION_RADIUS } from 'config';
import { isWall, isHole } from './mazeUtils.js';
import { teleportToStart } from './teleportUtils.js';
import { getHolesAsWallsEnabled } from './settings.js';
import { showWarningPopup } from './popupSystem.js';
import { SYSTEM_MESSAGE } from './systemMessages.js';

// Track how many times the player has fallen in holes
let holeFallCount = 0;
let holeSettingPopupShown = false;

/**
 * Calculates the final valid position after moving from (currentX, currentY) by (deltaX, deltaY).
 * Handles collisions with defined walls and sliding.
 * Uses multi-point checking to prevent clipping through thin walls.
 * @param {number} currentX - Starting X position in world units.
 * @param {number} currentY - Starting Y position in world units.
 * @param {number} deltaX - Proposed change in X in world units.
 * @param {number} deltaY - Proposed change in Y in world units.
 * @param {object} mazeData - The current maze state { "x,y": { data: [...], ... } }.
 * @param {boolean} [noClipMode=false] - Whether to ignore wall collisions (admin only).
 * @param {object} room - The Websim room object for teleporting if a hole is hit.
 * @returns {{x: number, y: number, fellInHole: boolean}} - The final valid position and whether a hole was hit.
 */
export function calculateValidMove(currentX, currentY, deltaX, deltaY, mazeData, noClipMode = false, room = null) {
    const proposedX = currentX + deltaX;
    const proposedY = currentY + deltaY;

    // If noclip mode is enabled, bypass all collision checks
    if (noClipMode) {
        // Even in noclip mode, check for holes
        const fellInHole = checkForHole(proposedX, proposedY, mazeData, room);
        return { x: proposedX, y: proposedY, fellInHole };
    }

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance === 0) {
        return { x: currentX, y: currentY, fellInHole: false }; // No movement
    }

    // Determine step size: Use a fraction of the collision radius, but ensure it's not excessively large.
    // Minimum step size ensures we don't skip over very thin walls.
    // Ensure steps are small enough relative to pixel size, especially with small collision radius.
    const pixelWorldSize = MAZE_CELL_SIZE / DRAWING_RESOLUTION;
    const stepSize = Math.max(PLAYER_COLLISION_RADIUS * 0.5, pixelWorldSize * 0.5); // Smaller steps: half radius or half pixel size
    const numSteps = Math.max(1, Math.ceil(distance / stepSize));

    let potentialX = currentX;
    let potentialY = currentY;
    let fellInHole = false;

    const moveUnitX = deltaX / distance; // Normalized direction vector
    const moveUnitY = deltaY / distance;
    
    // Check if we're treating holes as walls
    const treatHolesAsWalls = getHolesAsWallsEnabled();

    for (let i = 1; i <= numSteps; i++) {
        const intermediateX = currentX + (deltaX * i / numSteps);
        const intermediateY = currentY + (deltaY * i / numSteps);

        // First check if this position is a hole - but ONLY if we're not treating holes as walls
        if (!treatHolesAsWalls) {
            fellInHole = checkForHole(intermediateX, intermediateY, mazeData, room);
            if (fellInHole) {
                // If we hit a hole, return the current position (player will be teleported anyway)
                return { x: currentX, y: currentY, fellInHole };
            }
        }

        // --- Multi-Point Collision Check ---
        // Check center and points offset by the radius in cardinal directions.
        const checkPoints = [
            { x: intermediateX, y: intermediateY }, // Center
            { x: intermediateX + PLAYER_COLLISION_RADIUS, y: intermediateY }, // Right
            { x: intermediateX - PLAYER_COLLISION_RADIUS, y: intermediateY }, // Left
            { x: intermediateX, y: intermediateY + PLAYER_COLLISION_RADIUS }, // Down
            { x: intermediateX, y: intermediateY - PLAYER_COLLISION_RADIUS }, // Up
            // Optional: Add diagonal checks for even smaller radii / higher precision needs
            //{ x: intermediateX + PLAYER_COLLISION_RADIUS * 0.707, y: intermediateY + PLAYER_COLLISION_RADIUS * 0.707 }, // Down-Right
            //{ x: intermediateX - PLAYER_COLLISION_RADIUS * 0.707, y: intermediateY + PLAYER_COLLISION_RADIUS * 0.707 }, // Down-Left
            //{ x: intermediateX + PLAYER_COLLISION_RADIUS * 0.707, y: intermediateY - PLAYER_COLLISION_RADIUS * 0.707 }, // Up-Right
            //{ x: intermediateX - PLAYER_COLLISION_RADIUS * 0.707, y: intermediateY - PLAYER_COLLISION_RADIUS * 0.707 }, // Up-Left
        ];

        let collisionDetected = false;
        for (const point of checkPoints) {
            // Check against defined walls within claimed squares
            if (isWall(point.x, point.y, mazeData, { ignoreUnclaimed: true })) {
                collisionDetected = true;
                break; // Stop checking points if collision found
            }
            
            // IMPORTANT CHANGE: If treating holes as walls, also check for holes here
            if (treatHolesAsWalls && isHole(point.x, point.y, mazeData)) {
                collisionDetected = true;
                break; // Stop checking if we hit a hole-wall
            }
        }
        // --- End Multi-Point Check ---


        if (collisionDetected) {
            // Collision detected. Try sliding from the *last valid position* (potentialX, potentialY).
            // The amount to slide by is the remaining portion of this single step.
            const singleStepDeltaX = (deltaX / numSteps);
            const singleStepDeltaY = (deltaY / numSteps);

            let slid = false;

            // Attempt 1: Try moving only along X axis from the last valid spot
            const slideCheckX = potentialX + singleStepDeltaX;
            // Use multi-point check for the slide attempt as well
            const slideCheckPointsX = [
                { x: slideCheckX, y: potentialY },
                { x: slideCheckX + PLAYER_COLLISION_RADIUS, y: potentialY },
                { x: slideCheckX - PLAYER_COLLISION_RADIUS, y: potentialY },
                { x: slideCheckX, y: potentialY + PLAYER_COLLISION_RADIUS },
                { x: slideCheckX, y: potentialY - PLAYER_COLLISION_RADIUS },
            ];
            let collisionOnSlideX = false;
            for (const point of slideCheckPointsX) {
                if (isWall(point.x, point.y, mazeData, { ignoreUnclaimed: true })) {
                    collisionOnSlideX = true;
                    break;
                }
                // Check for holes as walls here too
                if (treatHolesAsWalls && isHole(point.x, point.y, mazeData)) {
                    collisionOnSlideX = true;
                    break;
                }
            }

            if (!collisionOnSlideX) {
                // Check if the X slide would hit a hole (only if not treating holes as walls)
                if (!treatHolesAsWalls && checkForHole(slideCheckX, potentialY, mazeData, room)) {
                    fellInHole = true;
                    return { x: currentX, y: currentY, fellInHole };
                }
                
                potentialX = slideCheckX;
                // potentialY remains the same
                slid = true;
            } else {
                // Attempt 2: Try moving only along Y axis from the last valid spot
                const slideCheckY = potentialY + singleStepDeltaY;
                // Use multi-point check for the slide attempt as well
                const slideCheckPointsY = [
                    { x: potentialX, y: slideCheckY },
                    { x: potentialX + PLAYER_COLLISION_RADIUS, y: slideCheckY },
                    { x: potentialX - PLAYER_COLLISION_RADIUS, y: slideCheckY },
                    { x: potentialX, y: slideCheckY + PLAYER_COLLISION_RADIUS },
                    { x: potentialX, y: slideCheckY - PLAYER_COLLISION_RADIUS },
                ];
                let collisionOnSlideY = false;
                for (const point of slideCheckPointsY) {
                    if (isWall(point.x, point.y, mazeData, { ignoreUnclaimed: true })) {
                        collisionOnSlideY = true;
                        break;
                    }
                    // Check for holes as walls here too
                    if (treatHolesAsWalls && isHole(point.x, point.y, mazeData)) {
                        collisionOnSlideY = true;
                        break;
                    }
                }

                if (!collisionOnSlideY) {
                    // Check if the Y slide would hit a hole (only if not treating holes as walls)
                    if (!treatHolesAsWalls && checkForHole(potentialX, slideCheckY, mazeData, room)) {
                        fellInHole = true;
                        return { x: currentX, y: currentY, fellInHole };
                    }
                    
                    // potentialX remains the same
                    potentialY = slideCheckY;
                    slid = true;
                }
            }

            // If no slide was possible, potentialX/Y remain at the last valid position before this step.
            // Stop checking further steps after collision/slide attempt.
            break;
        } else {
            // No collision at this step, update potential position
            potentialX = intermediateX;
            potentialY = intermediateY;
        }
    }
    
    // After all movement is done, if we're treating holes as walls,
    // check one final time if we landed in a hole
    if (treatHolesAsWalls) {
        fellInHole = checkForHole(potentialX, potentialY, mazeData, room, true);
    }
    
    // At this point, (potentialX, potentialY) is the position after moving and colliding/sliding
    return { x: potentialX, y: potentialY, fellInHole };
}

/**
 * Checks if a given position is a hole, and triggers teleport if it is.
 * @param {number} worldX - The world X coordinate.
 * @param {number} worldY - The world Y coordinate.
 * @param {object} mazeData - The current maze state.
 * @param {object} room - The Websim room object for teleporting.
 * @param {boolean} [skipTreatAsWall=false] - If true, ignores the "holes as walls" setting
 * @returns {boolean} - True if the position is a hole, false otherwise.
 */
function checkForHole(worldX, worldY, mazeData, room, skipTreatAsWall = false) {
    if (isHole(worldX, worldY, mazeData)) {
        // Check if no-clip mode is enabled for this player
        const isNoClipMode = room && room.clientId && 
                            room.presence && 
                            room.presence[room.clientId]?.adminNoClip === true;
        
        // If in no-clip mode, don't trigger teleport
        if (isNoClipMode) {
            console.log(`Player in no-clip mode passed over hole at (${worldX}, ${worldY}) without effect`);
            return false;
        }
        
        // Check if the "Treat Holes as Walls" setting is enabled
        const treatHolesAsWalls = getHolesAsWallsEnabled();
        
        if (treatHolesAsWalls && !skipTreatAsWall) {
            // Treat hole as a wall - return true to indicate collision but don't teleport
            return true;
        }
        
        // If not in no-clip mode and not treating holes as walls, teleport immediately
        if (room && room.clientId) {
            console.log(`Player fell in hole at (${worldX}, ${worldY}). Teleporting to start.`);
            teleportToStart(room);
            
            // Increment fall counter and check if we should show the settings tip
            holeFallCount++;
            console.log(`Player has fallen in holes ${holeFallCount} times`);
            if (holeFallCount >= 5 && !holeSettingPopupShown) {
                showHoleSettingPopup();
                holeSettingPopupShown = true;
            }
            
            // Play falling sound effect
            playFallingSound();
        }
        return true;
    }
    return false;
}

/**
 * Shows a popup informing the player about the "holes as walls" setting
 */
function showHoleSettingPopup() {
    showWarningPopup(
        "Trouble with Holes?", 
        "You've fallen into holes 5 times! If you find holes frustrating, you can make them act like walls instead in the Settings menu.",
        8000, // Show for 8 seconds
        [
            {
                label: "Ignore",
                onClick: () => {
                    console.log("User ignored the holes settings tip");
                },
                primary: false
            },
            {
                label: "Open Settings",
                onClick: () => {
                    // Open settings modal
                    const settingsButton = document.getElementById('settings-button');
                    if (settingsButton) {
                        settingsButton.click();
                    }
                },
                primary: true
            }
        ]
    );
}

/**
 * Plays a sound effect when a player falls in a hole.
 */
function playFallingSound() {
    try {
        // Create a simple falling sound using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create an oscillator for the falling sound
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        // Connect the nodes
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Configure the sound (falling pitch)
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(150, audioContext.currentTime + 0.5);
        
        // Configure the volume (fade out)
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        // Start and stop
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        console.log("Could not play falling sound effect:", e);
    }
}

// Export a function to reset the hole fall counter
window.resetHoleFallCounter = function() {
    holeFallCount = 0;
    holeSettingPopupShown = true; // Also set popup shown to true since user is now aware
};