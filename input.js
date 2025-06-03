import nipplejs from 'nipplejs';
import { isWall, getPlayerMazeSquare } from './mazeUtils.js';
import { getDrawingMode } from './drawing.js';
import {
    MOUSE_SENSITIVITY,
    MAZE_CELL_SIZE, DRAWING_RESOLUTION,
    PLAYER_CONTINUOUS_MOVE_SPEED,
    JOYSTICK_DEADZONE
} from 'config';
import { isCameraLocked } from './camera.js';
import { calculateValidMove } from './collision.js';
import { handleBanPresenceUpdateRequest } from './reportSystem.js';
import {
    is3DModeActive,
    handle3DMouseLook,
    get3DCameraDirection,
    init3DRenderer,
    update3DMazeReference
} from './render3d.js';

let roomRef;
let mazeRef;
let canvasRef;
let chatInputRef;
let drawingSquaresRef;
let joystickContainerRef;
let isPointerLocked = false;
let joystickManager = null;
let joystickActive = false;
let currentJoystickVector = { x: 0, y: 0 };
let keyboardInputVector = { x: 0, y: 0 };
let pressedKeys = new Set();
let isMobileDevice = false;
let startDrawingFunc = null;

let mouseSensitivity = MOUSE_SENSITIVITY;
let playerContinuousMoveSpeed = PLAYER_CONTINUOUS_MOVE_SPEED;
let mouseMovementEnabled = true;

window.setMouseSensitivity = function(value) {
    mouseSensitivity = value;
    console.log(`Mouse sensitivity updated to ${value}`);
};

window.setPlayerContinuousMoveSpeed = function(value) {
    playerContinuousMoveSpeed = value;
    console.log(`Continuous move speed updated to ${value}`);
};

window.setMouseMovementEnabled = function(value) {
    mouseMovementEnabled = value;
    console.log(`Mouse movement ${value ? 'enabled' : 'disabled'}`);
    
    if (!value && isPointerLocked && document.exitPointerLock) {
        document.exitPointerLock();
    }
};

export const getIsMobile = () => isMobileDevice;

function isInputFocused() {
    const activeElement = document.activeElement;
    return activeElement && (
        activeElement === chatInputRef || 
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.isContentEditable
    );
}

function checkAndHandleSquareTransition(currentPlayer, finalX, finalY, fellInHole) {
    // If player fell in a hole, no need to update position (teleport is handled elsewhere)
    if (fellInHole) {
        return { blockMovement: true };
    }
    
    let targetX = finalX;
    let targetY = finalY;
    let shouldUpdatePresence = false;
    let blockMovement = false;

    const isNoClipMode = roomRef.presence[roomRef.clientId]?.adminNoClip === true;

    if (isNoClipMode) {
        roomRef.updatePresence({ x: finalX, y: finalY });
        return { blockMovement: false };
    }

    const { mazeX: currentMazeX, mazeY: currentMazeY } = getPlayerMazeSquare(currentPlayer);
    const { mazeX: potentialMazeX, mazeY: potentialMazeY } = getPlayerMazeSquare({ x: finalX, y: finalY });

    if (potentialMazeX !== currentMazeX || potentialMazeY !== currentMazeY) {
        const newMazeKey = `${potentialMazeX},${potentialMazeY}`;
        const isLocallyUnclaimed = !mazeRef?.[newMazeKey]?.data;
        const isStartSquare = potentialMazeX === 0 && potentialMazeY === 0;

        if (isLocallyUnclaimed && !isStartSquare) {
            if (startDrawingFunc) {
                console.log(`Attempting to enter unclaimed square (${potentialMazeX}, ${potentialMazeY}). Starting drawing with short delay.`);
                // Add a short delay to prevent freezing on touch devices
                setTimeout(() => {
                    startDrawingFunc(potentialMazeX, potentialMazeY);
                }, 50);
                targetX = currentPlayer.x;
                targetY = currentPlayer.y;
                blockMovement = true;
            } else {
                console.warn(`Cannot claim square (${potentialMazeX}, ${potentialMazeY}): startDrawing function not provided.`);
                targetX = currentPlayer.x;
                targetY = currentPlayer.y;
                blockMovement = true;
            }
        } else {
            shouldUpdatePresence = true;
        }
    } else {
        shouldUpdatePresence = true;
    }

    if (!blockMovement && shouldUpdatePresence && (targetX !== currentPlayer.x || targetY !== currentPlayer.y)) {
        const distMovedSq = (targetX - currentPlayer.x)**2 + (targetY - currentPlayer.y)**2;
        if (distMovedSq > 1e-6) {
            roomRef.updatePresence({ x: targetX, y: targetY });
        }
    }

    return { blockMovement };
}

function handleMouseMoveLocked(event) {
    if (!mouseMovementEnabled || !isPointerLocked || isInputFocused() || 
        getDrawingMode() || isCameraLocked() || !roomRef || !roomRef.presence || !roomRef.clientId) {
        return;
    }
    
    // If 3D mode is active, handle mouse movement differently
    if (is3DModeActive()) {
        handle3DMouseLook(event);
        return;
    }

    // Standard 2D mouse movement
    const player = roomRef.presence[roomRef.clientId];
    if (!player || player.x === undefined || player.y === undefined) return;

    if (keyboardInputVector.x !== 0 || keyboardInputVector.y !== 0 || joystickActive) {
        return;
    }

    const dx = event.movementX || 0;
    const dy = event.movementY || 0;

    const moveDeltaX = dx * mouseSensitivity;
    const moveDeltaY = dy * mouseSensitivity;

    const isNoClipMode = player.adminNoClip === true;

    const { x: finalX, y: finalY, fellInHole } = calculateValidMove(player.x, player.y, moveDeltaX, moveDeltaY, mazeRef, isNoClipMode, roomRef);

    const { blockMovement } = checkAndHandleSquareTransition(player, finalX, finalY, fellInHole);
}

function updateKeyboardInputVector() {
    keyboardInputVector = { x: 0, y: 0 };
    let dx = 0;
    let dy = 0;

    if (pressedKeys.has('w') || pressedKeys.has('arrowup')) dy -= 1;
    if (pressedKeys.has('s') || pressedKeys.has('arrowdown')) dy += 1;
    if (pressedKeys.has('a') || pressedKeys.has('arrowleft')) dx -= 1;
    if (pressedKeys.has('d') || pressedKeys.has('arrowright')) dx += 1;

    const length = Math.sqrt(dx * dx + dy * dy);
    if (length > 0) {
        keyboardInputVector.x = dx / length;
        keyboardInputVector.y = dy / length;
    }
}

function handleKeyDown(event) {
    if (isInputFocused() || getDrawingMode()) return;

    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault();
        if (!pressedKeys.has(key)) {
            pressedKeys.add(key);
            updateKeyboardInputVector();
        }
    }
}

function handleKeyUp(event) {
    const key = event.key.toLowerCase();
    if (pressedKeys.has(key)) {
        pressedKeys.delete(key);
        updateKeyboardInputVector();
    }
}

function handleJoystickMove(evt, data) {
    joystickActive = true;
    const angle = data.angle.radian;
    const force = Math.min(1, data.force);

    if (force < JOYSTICK_DEADZONE) {
        currentJoystickVector = { x: 0, y: 0 };
        return;
    }

    const effectiveMagnitude = (force - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE);

    currentJoystickVector = {
        x: Math.cos(angle) * effectiveMagnitude,
        y: -Math.sin(angle) * effectiveMagnitude
    };
}

function handleJoystickEnd(evt, data) {
    joystickActive = false;
    currentJoystickVector = { x: 0, y: 0 };
}

export function updatePlayerMovementFromContinuousInput(deltaTime) {
    if (getDrawingMode() || isCameraLocked() || isInputFocused()) {
        if (currentJoystickVector.x !== 0 || currentJoystickVector.y !== 0) {
            currentJoystickVector = { x: 0, y: 0 };
            joystickActive = false;
        }
        if (keyboardInputVector.x !== 0 || keyboardInputVector.y !== 0) {
            keyboardInputVector = { x: 0, y: 0 };
            pressedKeys.clear();
        }
        return;
    }

    let moveVector = { x: 0, y: 0 };
    if (keyboardInputVector.x !== 0 || keyboardInputVector.y !== 0) {
        moveVector = keyboardInputVector;
    } else if (currentJoystickVector.x !== 0 || currentJoystickVector.y !== 0) {
        moveVector = currentJoystickVector;
    } else {
        return;
    }

    if (!roomRef || !roomRef.presence || !roomRef.clientId) return;
    const player = roomRef.presence[roomRef.clientId];
    if (!player || player.x === undefined || player.y === undefined) return;

    // Transform movement direction based on camera in 3D mode
    if (is3DModeActive()) {
        // Get the camera's forward direction
        const cameraDir = get3DCameraDirection();
        
        // FIXED: Made direction consistent with camera direction
        const forward = { x: -cameraDir.x, y: cameraDir.y };
        // Right is perpendicular to forward (90° clockwise rotation)
        const right = { x: -cameraDir.y, y: -cameraDir.x };
        
        // Calculate movement direction - fixed to be consistent in all directions
        // Forward/backward movement (W/S keys) - removed negative sign
        // Left/right movement (A/D keys) - consistent in all directions
        const moveDirX = (forward.x * -moveVector.y) + (right.x * moveVector.x);
        const moveDirY = (forward.y * -moveVector.y) + (right.y * moveVector.x);
        
        // Normalize the movement vector if needed
        const length = Math.sqrt(moveDirX * moveDirX + moveDirY * moveDirY);
        if (length > 0) {
            moveVector = {
                x: moveDirX / length,
                y: moveDirY / length
            };
        }
    }

    const moveDeltaX = moveVector.x * playerContinuousMoveSpeed * deltaTime;
    const moveDeltaY = moveVector.y * playerContinuousMoveSpeed * deltaTime;

    if (moveDeltaX === 0 && moveDeltaY === 0) return;

    const isNoClipMode = player.adminNoClip === true;

    const { x: finalX, y: finalY, fellInHole } = calculateValidMove(
        player.x, player.y, moveDeltaX, moveDeltaY, mazeRef, isNoClipMode, roomRef
    );

    const { blockMovement } = checkAndHandleSquareTransition(player, finalX, finalY, fellInHole);

    if (blockMovement) {
        if (keyboardInputVector.x !== 0 || keyboardInputVector.y !== 0) {
            keyboardInputVector = { x: 0, y: 0 };
            pressedKeys.clear();
        }
        if (currentJoystickVector.x !== 0 || currentJoystickVector.y !== 0) {
             currentJoystickVector = { x: 0, y: 0 };
        }
    }
}

function handlePointerLockChange() {
    if (document.pointerLockElement === canvasRef) {
        console.log('Pointer Lock active');
        isPointerLocked = true;
        document.addEventListener("mousemove", handleMouseMoveLocked, false);
    } else {
        console.log('Pointer Lock released');
        isPointerLocked = false;
        document.removeEventListener("mousemove", handleMouseMoveLocked, false);
        pressedKeys.clear();
        updateKeyboardInputVector();
    }
}

function handlePointerLockError() {
    console.error('Pointer Lock Error');
    isPointerLocked = false;
    document.removeEventListener("mousemove", handleMouseMoveLocked, false);
    pressedKeys.clear();
    updateKeyboardInputVector();
}

export function hideJoystick() {
    if (isMobileDevice && joystickContainerRef) {
        joystickContainerRef.style.display = 'none';
    }
}

export function showJoystick() {
    if (isMobileDevice && joystickContainerRef) {
        if (joystickContainerRef.classList.contains('mobile-controls-visible')) {
             joystickContainerRef.style.display = 'block';
        }
    }
}

export function setupInputHandling(_room, _maze, _canvas, _drawingSquares, _chatInput, _startDrawingFunc) {
    roomRef = _room;
    mazeRef = _maze;
    canvasRef = _canvas;
    drawingSquaresRef = _drawingSquares;
    chatInputRef = _chatInput;
    startDrawingFunc = _startDrawingFunc;
    isMobileDevice = checkIsMobile();
    console.log("Input: Is Mobile Device:", isMobileDevice);

    joystickContainerRef = document.getElementById('joystick-container');
    const zoomButtonsContainer = document.getElementById('zoom-buttons');

    if (isMobileDevice) {
        if (joystickContainerRef) {
            joystickContainerRef.classList.add('mobile-controls-visible');
            joystickContainerRef.style.display = 'block';
            const options = {
                zone: joystickContainerRef,
                mode: 'static',
                position: { left: '50%', top: '50%' },
                color: 'grey',
                size: 100,
                threshold: JOYSTICK_DEADZONE,
                fadeTime: 150,
            };
            joystickManager = nipplejs.create(options);
            joystickManager.on('move', handleJoystickMove);
            joystickManager.on('end', handleJoystickEnd);
            console.log("Input: Joystick initialized for mobile.");
        } else {
            console.error("Input: Joystick container not found!");
        }
        if (zoomButtonsContainer) {
            zoomButtonsContainer.classList.add('mobile-controls-visible');
             zoomButtonsContainer.style.display = 'flex';
            console.log("Input: Zoom buttons shown for mobile.");
        }
    } else {
        if (joystickContainerRef) {
            joystickContainerRef.classList.remove('mobile-controls-visible');
             joystickContainerRef.style.display = 'none';
        }
        if (zoomButtonsContainer) {
            zoomButtonsContainer.classList.remove('mobile-controls-visible');
             zoomButtonsContainer.style.display = 'none';
        }
    }

    canvasRef.addEventListener('click', () => {
        if (mouseMovementEnabled && !getDrawingMode() && !isPointerLocked && 
            !isCameraLocked() && !joystickActive && !isInputFocused()) {
            canvasRef.requestPointerLock = canvasRef.requestPointerLock ||
                                         canvasRef.mozRequestPointerLock ||
                                         canvasRef.webkitRequestPointerLock;
            if (canvasRef.requestPointerLock) {
                canvasRef.requestPointerLock();
            } else {
                console.warn("Input: Pointer Lock API not available.");
            }
        }
    }, false);

    document.addEventListener('pointerlockchange', handlePointerLockChange, false);
    document.addEventListener('mozpointerlockchange', handlePointerLockChange, false);
    document.addEventListener('webkitpointerlockchange', handlePointerLockChange, false);

    document.addEventListener('pointerlockerror', handlePointerLockError, false);
    document.addEventListener('mozpointerlockerror', handlePointerLockError, false);
    document.addEventListener('webkitpointerlockerror', handlePointerLockError, false);

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    console.log("Input: Pointer lock and Keyboard listeners added.");
    
    // Expose 3D mouse look handler globally
    window.init3DRenderer = init3DRenderer;
    window.update3DMazeReference = update3DMazeReference;
}

export function updateMazeReference(_maze) {
    mazeRef = _maze;
}

export function updateInputDrawingSquaresRef(_drawingSquares) {
    drawingSquaresRef = _drawingSquares;
}

function checkIsMobile() {
    let check = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!check) {
        check = window.matchMedia("(pointer: coarse)").matches;
    }
    if (!check) {
        check = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    }
    return check;
}