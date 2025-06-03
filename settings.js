// settings.js - Handles user configurable settings and preferences

import { teleportToStart } from './teleportUtils.js';
import { isAuthorizedAdmin, showUnauthorizedError } from './adminAuth.js';
import { toggle3DMode } from './render3d.js';

// Default values from config
let defaultKeyboardSpeed = 10.0;
let defaultMouseSensitivity = 0.01;
let defaultMouseMovementEnabled = true; 
let defaultDitheringEnabled = true; 
let default3DModeEnabled = false;
let defaultHolesAsWallsEnabled = false;

// References
let roomRef;
let settingsButtonRef;
let settingsModalRef;
let closeSettingsModalButtonRef;
let keyboardSpeedSliderRef;
let keyboardSpeedValueRef;
let mouseSensitivitySliderRef;
let mouseSensitivityValueRef;
let teleportHomeButtonRef;
let mouseMovementCheckboxRef; 
let ditheringCheckboxRef; 
let mode3DCheckboxRef;
let holesAsWallsCheckboxRef;

// Settings values
let currentKeyboardSpeed = defaultKeyboardSpeed;
let currentMouseSensitivity = defaultMouseSensitivity;
let currentMouseMovementEnabled = defaultMouseMovementEnabled; 
let currentDitheringEnabled = defaultDitheringEnabled; 
let current3DModeEnabled = default3DModeEnabled;
let currentHolesAsWallsEnabled = defaultHolesAsWallsEnabled;

/**
 * Initializes the settings module and UI
 * @param {object} _room - The Websim room reference
 */
export function initSettings(_room) {
    roomRef = _room;
    
    // Get references to DOM elements
    settingsButtonRef = document.getElementById('settings-button');
    settingsModalRef = document.getElementById('settings-modal');
    closeSettingsModalButtonRef = settingsModalRef?.querySelector('.modal-close');
    keyboardSpeedSliderRef = document.getElementById('keyboard-speed');
    keyboardSpeedValueRef = document.getElementById('keyboard-speed-value');
    mouseSensitivitySliderRef = document.getElementById('mouse-sensitivity');
    mouseSensitivityValueRef = document.getElementById('mouse-sensitivity-value');
    teleportHomeButtonRef = document.getElementById('teleport-home-button');
    mouseMovementCheckboxRef = document.getElementById('mouse-movement-checkbox'); 
    ditheringCheckboxRef = document.getElementById('dithering-checkbox'); 
    mode3DCheckboxRef = document.getElementById('mode-3d-checkbox');
    holesAsWallsCheckboxRef = document.getElementById('holes-as-walls-checkbox');
    
    if (!settingsButtonRef || !settingsModalRef || !closeSettingsModalButtonRef || 
        !keyboardSpeedSliderRef || !keyboardSpeedValueRef || 
        !mouseSensitivitySliderRef || !mouseSensitivityValueRef || 
        !teleportHomeButtonRef || !mouseMovementCheckboxRef || !ditheringCheckboxRef) { 
        console.error("Settings: Could not find all required DOM elements");
        return;
    }
    
    // Set initial 3D toggle button state
    updateToggle3DButtonState(current3DModeEnabled);
    
    // Add event listener for 3D toggle button
    const toggle3DButton = document.getElementById('toggle-3d-button');
    if (toggle3DButton) {
        toggle3DButton.addEventListener('click', () => {
            // Toggle the state
            const newState = !current3DModeEnabled;
            current3DModeEnabled = newState;
            
            // Update checkbox if it exists
            if (mode3DCheckboxRef) {
                mode3DCheckboxRef.checked = newState;
            }
            
            // Toggle the mode
            toggle3DMode(newState);
            
            // Update button state
            updateToggle3DButtonState(newState);
        });
    }
    
    // Setup event listeners
    settingsButtonRef.addEventListener('click', openSettingsModal);
    closeSettingsModalButtonRef.addEventListener('click', closeSettingsModal);
    settingsModalRef.addEventListener('click', (event) => {
        if (event.target === settingsModalRef) {
            closeSettingsModal();
        }
    });
    
    // Keyboard speed slider
    keyboardSpeedSliderRef.addEventListener('input', handleKeyboardSpeedChange);
    
    // Mouse sensitivity slider
    mouseSensitivitySliderRef.addEventListener('input', handleMouseSensitivityChange);
    
    // Teleport home button
    teleportHomeButtonRef.addEventListener('click', handleTeleportHome);
    
    // Mouse movement checkbox
    mouseMovementCheckboxRef.addEventListener('change', handleMouseMovementToggle);
    mouseMovementCheckboxRef.checked = defaultMouseMovementEnabled;
    
    // Dithering checkbox
    ditheringCheckboxRef.addEventListener('change', handleDitheringToggle);
    ditheringCheckboxRef.checked = defaultDitheringEnabled;
    
    // 3D Mode checkbox
    if (mode3DCheckboxRef) {
        mode3DCheckboxRef.addEventListener('change', handle3DModeToggle);
        mode3DCheckboxRef.checked = default3DModeEnabled;
    }
    
    // Holes as walls checkbox
    if (holesAsWallsCheckboxRef) {
        holesAsWallsCheckboxRef.addEventListener('change', handleHolesAsWallsToggle);
        holesAsWallsCheckboxRef.checked = defaultHolesAsWallsEnabled;
    }
    
    // Add 3D performance section after the display options section
    // Insert a new settings section for 3D performance options
    const performanceSection = document.createElement('div');
    performanceSection.className = 'settings-section';
    performanceSection.innerHTML = `
        <h4>3D Performance</h4>
        <div class="settings-row">
            <label class="settings-label" for="render-distance">Render Distance:</label>
            <span class="settings-value" id="render-distance-value">15</span>
            <input type="range" id="render-distance" class="settings-slider" min="5" max="30" step="1" value="15">
        </div>
        <div class="settings-row checkbox-row">
            <label class="settings-label" for="low-quality-3d-checkbox">
                <input type="checkbox" id="low-quality-3d-checkbox"> Low Quality Mode
            </label>
        </div>
    `;
    
    // Append the section to the modal content
    const modalContent = settingsModalRef.querySelector('.modal-content');
    modalContent.insertBefore(performanceSection, document.getElementById('teleport-home-button').parentNode.nextSibling);
    
    // Add event listeners for the new controls
    const renderDistanceSlider = document.getElementById('render-distance');
    const renderDistanceValue = document.getElementById('render-distance-value');
    const lowQualityCheckbox = document.getElementById('low-quality-3d-checkbox');
    
    if (renderDistanceSlider && renderDistanceValue) {
        renderDistanceSlider.addEventListener('input', (event) => {
            const newValue = parseInt(event.target.value);
            renderDistanceValue.textContent = newValue.toString();
            if (window.set3DRenderDistance) {
                window.set3DRenderDistance(newValue);
            }
        });
    }
    
    if (lowQualityCheckbox) {
        lowQualityCheckbox.addEventListener('change', (event) => {
            const lowQuality = event.target.checked;
            if (window.set3DLowQualityMode) {
                window.set3DLowQualityMode(lowQuality);
            }
        });
    }
    
    // Modify the Navigation section to be Gameplay instead
    const navigationSection = document.querySelector('.settings-section:nth-of-type(3)');
    if (navigationSection) {
        const navigationHeader = navigationSection.querySelector('h4');
        if (navigationHeader) {
            navigationHeader.textContent = 'Gameplay';
        }
        
        // Move the holes-as-walls checkbox from Display Options to Gameplay section
        const holesAsWallsLabel = document.querySelector('label[for="holes-as-walls-checkbox"]');
        if (holesAsWallsLabel && holesAsWallsLabel.parentNode) {
            navigationSection.insertBefore(holesAsWallsLabel.parentNode, navigationSection.lastElementChild);
        }
    }
    
    // Set initial values
    keyboardSpeedSliderRef.value = defaultKeyboardSpeed;
    keyboardSpeedValueRef.textContent = defaultKeyboardSpeed.toFixed(1);
    mouseSensitivitySliderRef.value = defaultMouseSensitivity;
    mouseSensitivityValueRef.textContent = defaultMouseSensitivity.toFixed(3);
    
    console.log("Settings module initialized");
}

// --- Modal Control ---
function openSettingsModal() {
    settingsModalRef.style.display = 'block';
}

function closeSettingsModal() {
    settingsModalRef.style.display = 'none';
}

// --- Event Handlers ---
function handleKeyboardSpeedChange(event) {
    const newValue = parseFloat(event.target.value);
    currentKeyboardSpeed = newValue;
    keyboardSpeedValueRef.textContent = newValue.toFixed(1);
    updateContinuousMoveSpeed(newValue);
}

function handleMouseSensitivityChange(event) {
    const newValue = parseFloat(event.target.value);
    currentMouseSensitivity = newValue;
    mouseSensitivityValueRef.textContent = newValue.toFixed(3);
    updateMouseSensitivity(newValue);
}

function handleTeleportHome() {
    if (!roomRef) return;
    
    teleportToStart(roomRef);
    closeSettingsModal(); 
}

function handleMouseMovementToggle(event) {
    // Remove admin check - this setting should be available to all users
    const newValue = event.target.checked;
    currentMouseMovementEnabled = newValue;
    updateMouseMovementEnabled(newValue);
}

function handleDitheringToggle(event) {
    const isDitheringEnabled = event.target.checked;
    currentDitheringEnabled = isDitheringEnabled;
    
    console.log(`Settings: Image dithering ${isDitheringEnabled ? 'enabled' : 'disabled'}`);
    
    updateDitheringEnabled(isDitheringEnabled);
}

function handle3DModeToggle(event) {
    const is3DModeEnabled = event.target.checked;
    current3DModeEnabled = is3DModeEnabled;
    
    console.log(`Settings: 3D mode ${is3DModeEnabled ? 'enabled' : 'disabled'}`);
    
    // Toggle 3D mode
    toggle3DMode(is3DModeEnabled);
    
    // Update the toggle button visual state
    updateToggle3DButtonState(is3DModeEnabled);
}

function handleHolesAsWallsToggle(event) {
    const isHolesAsWalls = event.target.checked;
    currentHolesAsWallsEnabled = isHolesAsWalls;
    
    console.log(`Settings: Treat holes as walls ${isHolesAsWalls ? 'enabled' : 'disabled'}`);
    
    // Reset hole fall counter if enabled
    if (isHolesAsWalls && typeof window.resetHoleFallCounter === 'function') {
        window.resetHoleFallCounter();
    }
}

/**
 * Updates the 3D toggle button visual state
 * @param {boolean} active - Whether 3D mode is active
 */
function updateToggle3DButtonState(active) {
    const toggle3DButton = document.getElementById('toggle-3d-button');
    if (toggle3DButton) {
        if (active) {
            toggle3DButton.classList.add('active');
            toggle3DButton.textContent = '🏙️'; // 3D city icon when active
        } else {
            toggle3DButton.classList.remove('active');
            toggle3DButton.textContent = '🗺️'; // Map icon when inactive
        }
    }
}

// --- Getters for other modules ---
export function getKeyboardSpeed() {
    return currentKeyboardSpeed;
}

export function getMouseSensitivity() {
    return currentMouseSensitivity;
}

export function getMouseMovementEnabled() {
    return currentMouseMovementEnabled;
}

export function getDitheringEnabled() {
    return currentDitheringEnabled;
}

export function get3DModeEnabled() {
    return current3DModeEnabled;
}

export function getHolesAsWallsEnabled() {
    return currentHolesAsWallsEnabled;
}

// --- Integration with other modules ---
/**
 * Updates the continuous movement speed in input.js
 * @param {number} speed - The new speed value
 */
function updateContinuousMoveSpeed(speed) {
    if (typeof window.setPlayerContinuousMoveSpeed === 'function') {
        window.setPlayerContinuousMoveSpeed(speed);
    } else {
        console.warn("Settings: setPlayerContinuousMoveSpeed function not available");
    }
}

/**
 * Updates the mouse sensitivity in input.js
 * @param {number} sensitivity - The new sensitivity value
 */
function updateMouseSensitivity(sensitivity) {
    if (typeof window.setMouseSensitivity === 'function') {
        window.setMouseSensitivity(sensitivity);
    } else {
        console.warn("Settings: setMouseSensitivity function not available");
    }
}

/**
 * Updates the mouse movement setting in input.js
 * @param {boolean} enabled - Whether mouse movement should be enabled
 */
function updateMouseMovementEnabled(enabled) {
    if (typeof window.setMouseMovementEnabled === 'function') {
        window.setMouseMovementEnabled(enabled);
    } else {
        console.warn("Settings: setMouseMovementEnabled function not available");
    }
}

/**
 * Updates the dithering enabled setting in imageImport.js
 * @param {boolean} enabled - Whether dithering should be enabled
 */
function updateDitheringEnabled(enabled) {
    if (typeof window.setDitheringEnabled === 'function') {
        window.setDitheringEnabled(enabled);
    } else {
        console.warn("Settings: setDitheringEnabled function not available");
    }
}