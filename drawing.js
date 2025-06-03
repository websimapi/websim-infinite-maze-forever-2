// drawing.js
import {
    MAZE_CELL_SIZE, DRAWING_RESOLUTION,
    PALETTE, DEFAULT_FLOOR_INDEX, DEFAULT_WALL_INDEX,
    SELECTED_COLOR_BORDER, BRUSH_SIZES, DEFAULT_BRUSH_INDEX, SELECTED_BRUSH_BORDER,
    HOLE_PULSE_SPEED, HOLE_MIN_OPACITY, HOLE_MAX_OPACITY, DRAWING_AREA_BORDER_COLOR
} from 'config';
import { lockCameraToSquare, unlockCamera } from './camera.js';
import { initDrawingInput, removeDrawingListeners } from './drawingInput.js';
import { getIsMobile, hideJoystick, showJoystick } from './input.js';
import { initImageImport } from './imageImport.js';
// Import AI moderation check
import { performExtendedModerationCheck } from './moderation.js';
// Import sendSystemMessage for moderation notifications
import { sendSystemMessage } from './chat.js';
import { SYSTEM_MESSAGE } from './systemMessages.js'; 
import { cancelDrawing } from './drawingCancellation.js';
import { teleportPlayersInSquare } from './teleportUtils.js'; 
import { isDrawingModified } from './drawingValidation.js'; 
import { is3DModeActive, toggle3DMode } from './render3d.js';
import { get3DModeEnabled } from './settings.js';

let roomRef;
let canvasRef;
let mazeRef;
// ... existing variable declarations ...
let controlsContainerRef;
let drawingControlsRef;
let paletteContainerRef;
let brushContainerRef;
let finishDrawingButtonRef;
let undoDrawingButtonRef;
let importImageButtonRef;
let importImageInputRef;
let cancelDrawingButtonRef;

let drawingMode = false;
let currentDrawingSquare = null;
let drawingData = null;
let currentDrawingColorIndex = DEFAULT_WALL_INDEX;
let currentBrushIndex = DEFAULT_BRUSH_INDEX;
let paletteButtons = [];
let brushButtons = [];
let currentTool = 'brush'; // Default tool
let wasPreviously3D = false;

let drawingHistory = [];
const MAX_HISTORY_DEPTH = 20;

export const getDrawingMode = () => drawingMode;
export const getCurrentDrawingSquare = () => currentDrawingSquare;
export const getDrawingData = () => drawingData;
const getCurrentDrawingColorIndexInternal = () => currentDrawingColorIndex;
const getCurrentBrushIndexInternal = () => currentBrushIndex;
// Function to get current tool, used by drawingInput.js
export const getCurrentTool = () => currentTool; // Export this getter

function deepCopyDrawingData(data) {
    if (!data) return null;
    return data.map(row => [...row]);
}

export function saveUndoState() {
    if (!drawingData) return;

    if (drawingHistory.length > 0) {
        const lastState = drawingHistory[drawingHistory.length - 1];
        // Simple string comparison might be slow for large data, but easy
        if (JSON.stringify(lastState) === JSON.stringify(drawingData)) {
            // console.log("Undo: State unchanged, not saving duplicate.");
            return; // Don't save if data hasn't changed since last save
        }
    }

    // console.log("Undo: Saving state", drawingHistory.length + 1);
    drawingHistory.push(deepCopyDrawingData(drawingData));
    if (drawingHistory.length > MAX_HISTORY_DEPTH) {
        drawingHistory.shift(); // Remove the oldest state
    }
    updateUndoButtonState();

    // Add this line to update the finish button state whenever the drawing changes
    updateFinishButtonState();
}

function undoLastDrawAction() {
    if (drawingHistory.length <= 1) { // Need at least initial state + one change to undo
        console.log("Undo: No actions to undo.");
        return;
    }

    drawingHistory.pop(); // Remove the current state
    drawingData = deepCopyDrawingData(drawingHistory[drawingHistory.length - 1]); // Restore the previous state
    // console.log("Undo: Restored state", drawingHistory.length);
    updateUndoButtonState();
    updateFinishButtonState(); // Also update finish button state on undo
}

function updateUndoButtonState() {
    if (undoDrawingButtonRef) {
        // Can undo if there's more than just the initial saved state
        undoDrawingButtonRef.disabled = drawingHistory.length <= 1;
    }
}

function updateFinishButtonState() {
    if (!finishDrawingButtonRef || !drawingData) return;

    // Always re-enable finish button when starting to edit an existing square
    const existingSquareData = mazeRef?.[`${currentDrawingSquare?.x},${currentDrawingSquare?.y}`]?.data;
    if (existingSquareData) {
        finishDrawingButtonRef.disabled = false;
        finishDrawingButtonRef.classList.remove('disabled');
        finishDrawingButtonRef.title = 'Complete and save your changes';
        return; // Don't check modification for existing squares initially
    }


    // For NEW squares, check if drawing has been modified from the initial state (all DEFAULT_WALL_INDEX)
    const isModified = isDrawingModified(drawingData, DEFAULT_WALL_INDEX);

    // Disable the button if the drawing hasn't been modified
    finishDrawingButtonRef.disabled = !isModified;

    // Also update visual appearance to indicate disabled state
    if (!isModified) {
        finishDrawingButtonRef.classList.add('disabled');
        finishDrawingButtonRef.title = 'Please draw something before finishing';
    } else {
        finishDrawingButtonRef.classList.remove('disabled');
        finishDrawingButtonRef.title = 'Complete and save your drawing';
    }
}

export function initDrawing(
    _room, _canvas, _maze,
    _drawingControls, _paletteContainer, _brushContainer,
    _finishDrawingButton, _undoDrawingButton,
    _importImageButton, _importImageInput,
    _cancelDrawingButton
) {
    roomRef = _room;
    canvasRef = _canvas;
    mazeRef = _maze;
    controlsContainerRef = document.getElementById('controls'); // Get reference to main controls container
    drawingControlsRef = _drawingControls;
    paletteContainerRef = _paletteContainer;
    brushContainerRef = _brushContainer;
    finishDrawingButtonRef = _finishDrawingButton;
    undoDrawingButtonRef = _undoDrawingButton;
    importImageButtonRef = _importImageButton; // Store reference
    importImageInputRef = _importImageInput; // Store reference
    cancelDrawingButtonRef = _cancelDrawingButton; // Store reference to cancel button

    // Hide the entire controls container initially
    if (controlsContainerRef) {
        controlsContainerRef.style.display = 'none';
    }

    setupDrawingControlsInternal(); // Setup palette, brushes, buttons

    // Initialize drawing input listeners (touch/mouse)
    initDrawingInput(
        canvasRef,
        getDrawingMode,
        getCurrentDrawingSquare,
        getDrawingData,
        getCurrentDrawingColorIndexInternal,
        getCurrentBrushIndexInternal,
        // Add new parameter for getting the current tool
        getCurrentTool // Pass the exported getter function
    );

    // Return the interface needed by the renderer
    return {
        getDrawingMode,
        getCurrentDrawingSquare,
        getDrawingData,
    };
}

// Called by setup.js when the maze state reference changes
export function updateMazeReference(_maze) {
    mazeRef = _maze;
}

function selectPaletteButton(index) {
    // Ensure index is valid, fallback to default wall or 0
    if (index < 0 || index >= PALETTE.length) {
        console.warn(`Invalid palette index selected: ${index}. Falling back.`);
        index = DEFAULT_WALL_INDEX; // Try default wall first
        if (index < 0 || index >= PALETTE.length) index = 0; // Absolute fallback
    }
    currentDrawingColorIndex = index;
    paletteButtons.forEach((button, i) => {
        if (button) { // Ensure button exists at this index
            if (i === index) {
                button.classList.add('selected');
                button.style.border = SELECTED_COLOR_BORDER; // Use configured border
            } else {
                button.classList.remove('selected');
                button.style.border = '1px solid #ccc'; // Default border
            }
        }
    });
}

function selectBrushButton(index) {
    // Ensure index is valid, fallback to default brush or 0
    if (index < 0 || index >= BRUSH_SIZES.length) {
        console.warn(`Invalid brush index selected: ${index}. Falling back.`);
        index = DEFAULT_BRUSH_INDEX; // Try default brush first
        if (index < 0 || index >= BRUSH_SIZES.length) index = 0; // Absolute fallback
    }
    currentBrushIndex = index;
    brushButtons.forEach((button, i) => {
        if (button) { // Ensure button exists at this index
            if (i === index) {
                button.classList.add('selected');
                button.style.border = SELECTED_BRUSH_BORDER; // Use configured border
            } else {
                button.classList.remove('selected');
                button.style.border = '1px solid #ccc'; // Default border
            }
        }
    });
}

function setupDrawingControlsInternal() {
    if (!paletteContainerRef || !brushContainerRef || !finishDrawingButtonRef || !undoDrawingButtonRef || !importImageButtonRef || !importImageInputRef || !cancelDrawingButtonRef) { // Added cancel button check
        console.error("Drawing controls setup failed: Missing required container or button elements.");
        return;
    }

    // --- Palette Setup ---
    paletteContainerRef.innerHTML = ''; // Clear previous buttons
    paletteButtons = []; // Reset button array
    const lightContainer = document.createElement('div');
    lightContainer.id = 'palette-light';
    const darkContainer = document.createElement('div');
    darkContainer.id = 'palette-dark';
    PALETTE.forEach((item, index) => {
        const button = document.createElement('button');
        button.classList.add('palette-button');
        button.style.backgroundColor = item.color;
        
        // Fix the tooltip for hole - remove "(floor)" label
        if (item.isHole) {
            button.title = `${item.name}`;
            button.classList.add('hole-button'); // Add hole-button class for animation
        } else {
            button.title = `${item.name}${item.isWall ? ' (Wall)' : ' (Floor)'}`;
        }
        
        button.onclick = () => selectPaletteButton(index);
        // Separate into light/dark containers based on isWall
        if (item.isWall) darkContainer.appendChild(button);
        else lightContainer.appendChild(button);
        paletteButtons[index] = button; // Store button reference by index
    });

    // Add the containers to the palette container
    paletteContainerRef.appendChild(lightContainer);
    paletteContainerRef.appendChild(darkContainer);

    // Select initial color (default wall), ensure it's valid
    let initialSelectColorIndex = DEFAULT_WALL_INDEX;
    if (initialSelectColorIndex < 0 || initialSelectColorIndex >= PALETTE.length) {
        // Fallback logic if default indices are somehow invalid
        initialSelectColorIndex = DEFAULT_FLOOR_INDEX;
        if (initialSelectColorIndex < 0 || initialSelectColorIndex >= PALETTE.length) {
             initialSelectColorIndex = 0;
        }
    }
    currentDrawingColorIndex = initialSelectColorIndex; // Set internal state
    selectPaletteButton(currentDrawingColorIndex); // Update palette UI

    // --- Brush Setup ---
    brushContainerRef.innerHTML = ''; // Clear previous buttons
    brushButtons = []; // Reset button array
    const brushRow = document.createElement('div');
    brushRow.classList.add('brush-row');

    // Add brush sizes
    BRUSH_SIZES.forEach((radius, index) => {
        const button = document.createElement('button');
        button.classList.add('brush-button');
        const diameter = radius * 2; // Use diameter for display
        // Display integer if whole number, otherwise one decimal place
        button.textContent = `${Number.isInteger(diameter) ? diameter : diameter.toFixed(1)}`;
        button.title = `Brush Diameter ${diameter}`;
        button.onclick = () => {
            selectBrushButton(index);
            // Also set the current tool to brush
            currentTool = 'brush';
             // Deselect fill bucket if it was selected
             const fillButton = brushButtons[brushButtons.length - 1];
             if(fillButton) {
                 fillButton.classList.remove('selected');
                 fillButton.style.border = '1px solid #ccc';
             }
        };
        brushRow.appendChild(button);
        brushButtons[index] = button; // Store button reference by index
    });

    // Add fill bucket button to the brush row
    const fillButton = document.createElement('button');
    fillButton.classList.add('fill-bucket-button');
    fillButton.innerHTML = '🪣'; 
    fillButton.title = 'Fill Bucket Tool';
    fillButton.onclick = () => {
        // Deselect all brush buttons
        brushButtons.forEach((btn, idx) => {
            // Skip the fill bucket itself (last element)
            if (btn && idx < brushButtons.length - 1) {
                btn.classList.remove('selected');
                btn.style.border = '1px solid #ccc'; // Default border
            }
        });
        // Select the fill button
        fillButton.classList.add('selected');
        fillButton.style.border = SELECTED_BRUSH_BORDER;
        // Set the current tool
        currentTool = 'fill';
    };
    brushRow.appendChild(fillButton);
    // Store reference to fill button (last item in brushButtons array)
    brushButtons.push(fillButton);

    brushContainerRef.appendChild(brushRow);

    // Select initial brush size (default), ensure it's valid
    let initialBrushIndex = DEFAULT_BRUSH_INDEX;
    if (initialBrushIndex >= BRUSH_SIZES.length || initialBrushIndex < 0) {
         initialBrushIndex = 0; // Fallback to first brush
    }
    currentBrushIndex = initialBrushIndex; // Set internal state
    selectBrushButton(currentBrushIndex); // Update UI
    // Also set the current tool to brush initially
    currentTool = 'brush';

    // --- Action Button Setup ---
    finishDrawingButtonRef.onclick = () => finishDrawing(); // Attach finish handler
    undoDrawingButtonRef.onclick = undoLastDrawAction; // Attach undo handler
    cancelDrawingButtonRef.onclick = () => cancelDrawing(roomRef, finishDrawing, getCurrentDrawingSquare); // Attach cancel handler
    updateUndoButtonState(); // Set initial disabled state for undo

    // Initialize image import functionality, passing the input, button, and callback
    initImageImport(importImageInputRef, importImageButtonRef, handleImageImported);
}

export function startDrawing(mazeX, mazeY) {
    const mazeKey = `${mazeX},${mazeY}`;
    
    try {
        // Prevent drawing on the Start Square (0,0)
        if (mazeX === 0 && mazeY === 0) {
            console.warn("Cannot draw on the Start Square (0, 0).");
            return;
        }
        
        console.log(`Starting drawing initialization for square ${mazeKey}`);
        
        // Save 3D mode state and force 2D mode if needed
        wasPreviously3D = is3DModeActive();
        if (wasPreviously3D) {
            console.log("Forcing 2D mode for drawing");
            toggle3DMode(false);
        }
        
        // Check if this client is already editing a different square.
        const editingByUser = roomRef.roomState.editingByUser || {};
        if (editingByUser[roomRef.clientId] && editingByUser[roomRef.clientId] !== mazeKey) {
            console.log(`Replacing editing square from ${editingByUser[roomRef.clientId]} to ${mazeKey} for user ${roomRef.clientId}`);
            // Clear the previous editing claim
            roomRef.updateRoomState({
                drawingSquares: {
                    [editingByUser[roomRef.clientId]]: null
                },
                editingByUser: {
                    [roomRef.clientId]: mazeKey
                }
            });
        }
        
        // Check if someone else is already editing this square.
        const currentClaims = roomRef.roomState.drawingSquares || {};
        const existingClaimant = currentClaims[mazeKey];
        if (existingClaimant && existingClaimant !== roomRef.clientId) {
            console.warn(`Cannot start drawing at (${mazeX}, ${mazeY}): Square is being drawn by ${existingClaimant}.`);
            return;
        }
        
        console.log(`Entering drawing mode for square ${mazeX}, ${mazeY}`);
        
        // Release pointer lock (if active)
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        
        // Set Drawing Mode State
        drawingMode = true;
        currentDrawingSquare = { x: mazeX, y: mazeY };
        lockCameraToSquare(mazeX, mazeY); // Lock camera view onto the square
        if (getIsMobile()) hideJoystick();
        
        // IMPORTANT: Claim square in a single update to avoid race conditions
        roomRef.updateRoomState({
            drawingSquares: {
                [mazeKey]: roomRef.clientId
            },
            editingByUser: {
                [roomRef.clientId]: mazeKey
            }
        });
        
        // Initialize Drawing Data
        const existingSquareData = mazeRef?.[mazeKey]?.data;
        let initialFillIndex;
        let initialSelectColorIndex;
        
        if (existingSquareData) {
            drawingData = deepCopyDrawingData(existingSquareData);
            initialSelectColorIndex = DEFAULT_WALL_INDEX;
            console.log(`Loading existing data for editing square (${mazeKey})`);
        } else {
            initialFillIndex = DEFAULT_WALL_INDEX;
            drawingData = Array.from({ length: DRAWING_RESOLUTION }, () =>
                Array(DRAWING_RESOLUTION).fill(initialFillIndex)
            );
            initialSelectColorIndex = DEFAULT_FLOOR_INDEX;
            console.log(`Creating new drawing data for square (${mazeKey})`);
        }
        
        // Save initial state for undo history
        drawingHistory = [];
        saveUndoState();
        updateUndoButtonState();
        updateFinishButtonState();
        
        // Setup UI: select palette and brush
        if (initialSelectColorIndex < 0 || initialSelectColorIndex >= PALETTE.length) {
            initialSelectColorIndex = existingSquareData ? DEFAULT_WALL_INDEX : DEFAULT_FLOOR_INDEX;
            if (initialSelectColorIndex < 0 || initialSelectColorIndex >= PALETTE.length)
                initialSelectColorIndex = 0;
        }
        
        // Show drawing controls
        if (controlsContainerRef) controlsContainerRef.style.display = 'flex';
        canvasRef.style.cursor = 'crosshair';
        
        // Initialize palette and brush UI last to avoid any race conditions
        selectPaletteButton(initialSelectColorIndex);
        selectBrushButton(currentBrushIndex);
        currentTool = 'brush';
        
        updateUndoButtonState();
        updateFinishButtonState();
        
        console.log(`Drawing initialization complete for square ${mazeKey}`);
    } catch (error) {
        // Handle any errors during drawing initialization
        console.error(`Error initializing drawing for square ${mazeKey}:`, error);
        
        // Attempt to clean up if an error occurred
        drawingMode = false;
        currentDrawingSquare = null;
        drawingData = null;
        if (controlsContainerRef) controlsContainerRef.style.display = 'none';
        canvasRef.style.cursor = 'default';
        
        // Try to release the claim if we got far enough to make one
        try {
            roomRef.updateRoomState({
                drawingSquares: {
                    [mazeKey]: null
                },
                editingByUser: {
                    [roomRef.clientId]: null
                }
            });
        } catch (cleanupError) {
            console.error("Failed to clean up after drawing initialization error:", cleanupError);
        }
        
        // Restore joystick if needed
        if (getIsMobile()) showJoystick();
        
        // Restore 3D mode if active before
        if (wasPreviously3D && get3DModeEnabled()) {
            console.log("Restoring 3D mode after drawing error");
            toggle3DMode(true);
            wasPreviously3D = false;
        }
    }
}

export function finishDrawing(forceExit = false) {
    if (!drawingMode || !currentDrawingSquare) return;
    
    const mazeKey = `${currentDrawingSquare.x},${currentDrawingSquare.y}`;
    console.log(`Finishing drawing for square ${mazeKey}. Force Exit: ${forceExit}`);
    
    const finishedData = drawingData;
    const ownerId = roomRef.clientId;
    const ownerUsername = roomRef.peers[ownerId]?.username || 'Unknown';
    
    if (!forceExit && finishedData) {
        console.log(`Saving finished drawing for square ${mazeKey} to database`);
        
        // Save to database instead of room state
        roomRef.collection('tile_v1').create({
            mazeX: currentDrawingSquare.x,
            mazeY: currentDrawingSquare.y,
            data: finishedData,
            ownerId: ownerId,
            username: ownerUsername
        }).then(record => {
            console.log(`Tile saved to database with ID: ${record.id}`);
        }).catch(error => {
            console.error(`Failed to save tile to database:`, error);
        });
        
        // Clear drawing claim
        roomRef.updateRoomState({
            drawingSquares: {
                [mazeKey]: null
            }
        });
        
        // Start async moderation check
        performExtendedModerationCheck(finishedData, mazeKey, roomRef)
            .then(moderationResult => {
                console.log("Moderation: Async checks complete.", moderationResult);
                if (!moderationResult.isSfw) {
                    console.log(`Moderation: Content rejected for square ${mazeKey} by ${ownerUsername}. Removing affected squares.`);
                    
                    // Delete tiles from database
                    const tilesToDelete = [];
                    moderationResult.squaresToDelete.forEach(key => {
                        const [x, y] = key.split(',').map(Number);
                        // Skip start square
                        if (x !== 0 || y !== 0) {
                            tilesToDelete.push({ mazeX: x, mazeY: y });
                            teleportPlayersInSquare(roomRef, x, y);
                        }
                    });
                    
                    // Delete from database
                    const allTiles = roomRef.collection('tile_v1').getList();
                    tilesToDelete.forEach(tileToDelete => {
                        const tileRecord = allTiles.find(t => t.mazeX === tileToDelete.mazeX && t.mazeY === tileToDelete.mazeY);
                        if (tileRecord) {
                            roomRef.collection('tile_v1').delete(tileRecord.id).catch(err => {
                                console.error('Failed to delete tile:', err);
                            });
                        }
                    });
                    
                    // UPDATED: Use template-based system messages instead of direct text
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
                } else {
                    console.log(`Moderation: All checks passed for square ${mazeKey} by ${ownerUsername}.`);
                }
            })
            .catch(error => {
                console.error(`Moderation: Error during async checks for square ${mazeKey}:`, error);
            });
    } else {
        if (roomRef.roomState?.drawingSquares?.[mazeKey] === ownerId) {
            console.log(`Releasing drawing claim for square ${mazeKey} due to force exit or missing data.`);
            roomRef.updateRoomState({
                drawingSquares: { [mazeKey]: null }
            });
        }
    }
    
    // Clear the editingByUser mapping for this client
    if (roomRef.roomState && roomRef.roomState.editingByUser && roomRef.roomState.editingByUser[roomRef.clientId]) {
        roomRef.updateRoomState({
            editingByUser: {
                ...roomRef.roomState.editingByUser,
                [roomRef.clientId]: null
            }
        });
    }
    
    removeDrawingListeners();
    drawingMode = false;
    drawingData = null;
    currentDrawingSquare = null;
    drawingHistory = [];
    
    unlockCamera();
    updateUndoButtonState();
    if (controlsContainerRef) controlsContainerRef.style.display = 'none';
    canvasRef.style.cursor = 'default';
    if (getIsMobile()) showJoystick();
    
    // Emit an event that drawing is finished
    document.dispatchEvent(new CustomEvent('drawingFinished'));
    
    // Restore 3D mode if it was active before
    if (wasPreviously3D && get3DModeEnabled()) {
        console.log("Restoring 3D mode after drawing");
        toggle3DMode(true);
    }
    wasPreviously3D = false;
}

function handleImageImported(importedData) {
    if (!drawingMode || !drawingData) {
        console.warn("Image imported but not in drawing mode. Ignoring.");
        return;
    }
    if (!importedData || !Array.isArray(importedData) || importedData.length !== DRAWING_RESOLUTION) {
        console.error("Received invalid data from image import.");
        return;
    }

    console.log("Applying imported image data to current drawing.");
    drawingData = importedData; // Replace current data
    saveUndoState(); // Save this imported state as a new undo step
    updateFinishButtonState(); // Add this line to update button state after import
}