/**
 * popupSystem.js - Reusable popup notification system
 * 
 * Provides functions to show various types of popups that appear
 * in the bottom right corner and auto-dismiss after a configurable delay.
 */

// Store active popups to manage them
const activePopups = [];
const MAX_POPUPS = 3; // Maximum number of visible popups at once

/**
 * Shows a popup notification
 * @param {Object} options - Popup configuration options
 * @param {string} options.title - Title of the popup
 * @param {string} options.message - Main message text
 * @param {number} [options.duration=5000] - Time in ms before auto-dismissal (0 for no auto-dismiss)
 * @param {string} [options.type='info'] - Popup type: 'info', 'warning', 'error', 'success' 
 * @param {Array<{label: string, onClick: Function, primary: boolean}>} [options.buttons] - Array of button configurations
 * @returns {Object} - Popup control object with remove() method
 */
export function showPopup(options) {
    const {
        title,
        message,
        duration = 5000,
        type = 'info',
        buttons = []
    } = options;

    // Create popup element
    const popup = document.createElement('div');
    popup.className = `game-popup game-popup-${type}`;
    popup.style.position = 'fixed';
    popup.style.bottom = '20px';
    popup.style.right = '20px';
    popup.style.padding = '15px';
    popup.style.background = 'rgba(0, 0, 0, 0.85)';
    popup.style.color = 'white';
    popup.style.borderRadius = '8px';
    popup.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    popup.style.zIndex = '1000';
    popup.style.maxWidth = '320px';
    popup.style.minWidth = '240px';
    popup.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    popup.style.opacity = '0';
    popup.style.transform = 'translateY(20px)';
    popup.style.backdropFilter = 'blur(4px)';
    popup.style.border = '1px solid rgba(255, 255, 255, 0.2)';
    
    // Color accent based on type
    let accentColor = '#3498db'; // Default blue for info
    switch (type) {
        case 'warning': accentColor = '#f39c12'; break;
        case 'error': accentColor = '#e74c3c'; break;
        case 'success': accentColor = '#2ecc71'; break;
    }
    
    popup.style.borderLeft = `4px solid ${accentColor}`;
    
    // Create popup content
    let popupContent = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <h3 style="margin: 0; font-size: 16px; color: ${accentColor};">${title}</h3>
            <button class="popup-close" style="background: none; border: none; color: #999; font-size: 18px; cursor: pointer; padding: 0; line-height: 1;">×</button>
        </div>
        <p style="margin: 0 0 10px 0; font-size: 14px;">${message}</p>
    `;
    
    // Add buttons if provided
    if (buttons.length > 0) {
        popupContent += `<div class="popup-buttons" style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px;">`;
        
        buttons.forEach((button, index) => {
            const buttonStyle = button.primary ? 
                'background-color: ' + accentColor + '; color: white;' : 
                'background-color: rgba(80, 80, 80, 0.8); color: white;';
                
            popupContent += `
                <button 
                    class="popup-button popup-button-${index}" 
                    style="padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; ${buttonStyle}">
                    ${button.label}
                </button>
            `;
        });
        
        popupContent += `</div>`;
    }
    
    popup.innerHTML = popupContent;
    
    // Position the popup based on existing popups
    positionPopup(popup);
    
    // Add to document
    document.body.appendChild(popup);
    
    // Fade in
    setTimeout(() => {
        popup.style.opacity = '1';
        popup.style.transform = 'translateY(0)';
    }, 10);
    
    // Set up auto-dismiss
    let dismissTimeout = null;
    if (duration > 0) {
        dismissTimeout = setTimeout(() => removePopup(popup), duration);
    }
    
    // Add event listeners for buttons
    buttons.forEach((button, index) => {
        const buttonElement = popup.querySelector(`.popup-button-${index}`);
        if (buttonElement && typeof button.onClick === 'function') {
            buttonElement.addEventListener('click', () => {
                button.onClick();
                removePopup(popup);
            });
        }
    });
    
    // Add click listener for close button
    const closeButton = popup.querySelector('.popup-close');
    if (closeButton) {
        closeButton.addEventListener('click', () => removePopup(popup));
    }
    
    // Add this popup to active popups array
    const popupObject = {
        element: popup,
        timeout: dismissTimeout,
        remove: () => removePopup(popup)
    };
    
    activePopups.push(popupObject);
    
    // If we have too many popups, remove the oldest one
    if (activePopups.length > MAX_POPUPS) {
        const oldest = activePopups.shift();
        if (oldest) {
            removePopup(oldest.element);
        }
    }
    
    return popupObject;
}

/**
 * Positions a new popup based on existing popups
 * @param {HTMLElement} popup - The popup element to position
 */
function positionPopup(popup) {
    // Calculate the height for existing popups
    let totalOffset = 0;
    activePopups.forEach(activePopup => {
        if (activePopup && activePopup.element) {
            totalOffset += activePopup.element.offsetHeight + 10; // 10px spacing
        }
    });
    
    // Set the position
    popup.style.bottom = `${20 + totalOffset}px`;
}

/**
 * Removes a popup from the DOM and active popups list
 * @param {HTMLElement} popup - The popup element to remove
 */
function removePopup(popup) {
    // Find the popup in the active popups array
    const index = activePopups.findIndex(p => p.element === popup);
    
    if (index !== -1) {
        // Clear any existing timeout
        if (activePopups[index].timeout) {
            clearTimeout(activePopups[index].timeout);
        }
        
        // Remove from the array
        activePopups.splice(index, 1);
    }
    
    // Fade out
    popup.style.opacity = '0';
    popup.style.transform = 'translateY(20px)';
    
    // Remove after animation
    setTimeout(() => {
        if (document.body.contains(popup)) {
            document.body.removeChild(popup);
            
            // Reposition remaining popups
            repositionPopups();
        }
    }, 300);
}

/**
 * Repositions all active popups after one is removed
 */
function repositionPopups() {
    let currentOffset = 0;
    
    // Reposition each popup from bottom to top
    [...activePopups].reverse().forEach(popupObj => {
        if (popupObj && popupObj.element) {
            popupObj.element.style.bottom = `${20 + currentOffset}px`;
            currentOffset += popupObj.element.offsetHeight + 10; // 10px spacing
        }
    });
}

/**
 * Convenience function to show an info popup
 * @param {string} title - Popup title
 * @param {string} message - Popup message
 * @param {number} [duration=5000] - Auto-dismiss delay in ms
 * @param {Array} [buttons=[]] - Array of button configurations
 * @returns {Object} - Popup control object
 */
export function showInfoPopup(title, message, duration = 5000, buttons = []) {
    return showPopup({
        title,
        message,
        duration,
        type: 'info',
        buttons
    });
}

/**
 * Convenience function to show a warning popup
 * @param {string} title - Popup title
 * @param {string} message - Popup message
 * @param {number} [duration=8000] - Auto-dismiss delay in ms
 * @param {Array} [buttons=[]] - Array of button configurations
 * @returns {Object} - Popup control object
 */
export function showWarningPopup(title, message, duration = 8000, buttons = []) {
    return showPopup({
        title,
        message,
        duration,
        type: 'warning',
        buttons
    });
}

/**
 * Convenience function to show an error popup
 * @param {string} title - Popup title
 * @param {string} message - Popup message
 * @param {number} [duration=10000] - Auto-dismiss delay in ms
 * @param {Array} [buttons=[]] - Array of button configurations
 * @returns {Object} - Popup control object
 */
export function showErrorPopup(title, message, duration = 10000, buttons = []) {
    return showPopup({
        title,
        message,
        duration,
        type: 'error',
        buttons
    });
}

/**
 * Convenience function to show a success popup
 * @param {string} title - Popup title
 * @param {string} message - Popup message
 * @param {number} [duration=5000] - Auto-dismiss delay in ms
 * @param {Array} [buttons=[]] - Array of button configurations
 * @returns {Object} - Popup control object
 */
export function showSuccessPopup(title, message, duration = 5000, buttons = []) {
    return showPopup({
        title,
        message,
        duration,
        type: 'success',
        buttons
    });
}

/**
 * Clears all active popups
 */
export function clearAllPopups() {
    // Make a copy since we'll be modifying the array
    const popupsToRemove = [...activePopups];
    popupsToRemove.forEach(popup => {
        if (popup && popup.remove) {
            popup.remove();
        }
    });
}