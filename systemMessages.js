/**
 * systemMessages.js - Secure system message templates and rendering
 * 
 * This module provides a secure way to handle system messages by using
 * predefined templates with placeholders rather than arbitrary text.
 */

// Template definitions 
const MESSAGE_TEMPLATES = {
    // Chat system messages
    CHAT_RESET: "Chat system has been reset by {admin}. This should fix any messaging issues.",
    CHAT_CLEARED: "Chat history was cleared by {admin}.",
    
    // Map/drawing related messages
    MAP_RESET_VOTE: "The map has been reset by player vote!",
    MAP_RESET_ADMIN: "The map has been reset by administrator {admin}.",
    MAP_RESET_GENERIC: "The map has been reset!",
    
    // Moderation messages
    MOD_DRAWING_REMOVED: "Drawing at ({coords}) by {username} removed: {reason}",
    MOD_MULTI_DRAWINGS_REMOVED: "{count} squares by {username} removed: {reason}",
    
    // Welcome message
    WELCOME: "Welcome to Infinite Maze Paint!",
    
    // Teleport messages
    TELEPORT_HOLE: "You fell into a hole and were teleported back to start!",
    
    // Generic/fallback (for backward compatibility only)
    GENERIC: "{message}"
};

/**
 * Renders a system message from a template ID and parameters
 * @param {string} templateId - The ID of the template to use
 * @param {object} params - Parameters to fill in the template
 * @returns {string} - The rendered message
 */
export function renderSystemMessage(templateId, params = {}) {
    // Get the template, or use GENERIC if not found
    const template = MESSAGE_TEMPLATES[templateId] || MESSAGE_TEMPLATES.GENERIC;
    
    // Replace all parameters in the template
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        if (key in params) {
            return params[key];
        }
        // If parameter is missing, leave the placeholder
        return match;
    });
}

// Export template IDs as constants
export const SYSTEM_MESSAGE = {
    CHAT_RESET: 'CHAT_RESET',
    CHAT_CLEARED: 'CHAT_CLEARED',
    MAP_RESET_VOTE: 'MAP_RESET_VOTE',
    MAP_RESET_ADMIN: 'MAP_RESET_ADMIN',
    MAP_RESET_GENERIC: 'MAP_RESET_GENERIC',
    MOD_DRAWING_REMOVED: 'MOD_DRAWING_REMOVED',
    MOD_MULTI_DRAWINGS_REMOVED: 'MOD_MULTI_DRAWINGS_REMOVED',
    TELEPORT_HOLE: 'TELEPORT_HOLE',
    WELCOME: 'WELCOME',
    GENERIC: 'GENERIC'
};