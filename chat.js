// chat.js

import { CHAT_MESSAGE_MAX_LENGTH } from 'config';
import { sendMessageWithRetry, messageTracker, startMessageMonitoring } from './chatReliability.js';
import { messageOrderTracker } from './chatMessageOrder.js';
import { renderSystemMessage, SYSTEM_MESSAGE } from './systemMessages.js';

let roomRef;
let messagesContainerRef;
let inputElementRef;
let lastMessageTimestamp = 0;
const MAX_MESSAGES_DISPLAY = 100; // Limit messages kept in the DOM
let messageMonitoringStopFunc = null; // Function to stop message monitoring
let lastMessageSentTimestamp = 0;
const MESSAGE_COOLDOWN_MS = 300; // Prevent spamming messages too quickly

// Track if we've initialized the UI for this session
let uiInitialized = false;
// Track if we're experiencing connection issues
let hasConnectionIssues = false;
// Track messages we've already displayed
const displayedMessageIds = new Set();

export function initChat(_room, _messagesContainer, _inputElement) {
    roomRef = _room;
    messagesContainerRef = _messagesContainer;
    inputElementRef = _inputElement;

    if (!roomRef || !messagesContainerRef || !inputElementRef) {
        console.error("Chat init failed: Missing required elements or room reference.");
        return;
    }

    // Reset state variables on initialization
    uiInitialized = false;
    hasConnectionIssues = false;
    displayedMessageIds.clear();
    messageOrderTracker.clear();

    // Event listener for sending messages
    inputElementRef.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default form submission/newline
            const message = inputElementRef.value.trim();
            if (message) {
                sendMessage(message);
                inputElementRef.value = ''; // Clear input field
            }
        }
    });

    // Prevent game input (like pointer lock) when chat input is focused
    inputElementRef.addEventListener('focus', () => {
        console.log("Chat input focused");
        // We might need a more robust way to signal input module to pause
    });
    inputElementRef.addEventListener('blur', () => {
        console.log("Chat input blurred");
        // Signal input module to resume?
    });

    // Start message reliability monitoring
    messageMonitoringStopFunc = startMessageMonitoring(roomRef);

    console.log("Chat initialized.");
    // Display initial messages on load
    handleRoomStateUpdate(roomRef.roomState);
}

// Add a new function to reinitialize the chat system when stuck
export function reinitializeChat() {
    console.log("Chat: Performing emergency chat reinitialization...");
    
    // Stop existing monitoring
    if (messageMonitoringStopFunc) {
        messageMonitoringStopFunc();
        messageMonitoringStopFunc = null;
    }
    
    // Clear local tracking states
    displayedMessageIds.clear();
    messageOrderTracker.clear();
    hasConnectionIssues = false;
    
    // Add a system message about the reset
    const timestamp = Date.now();
    lastMessageTimestamp = timestamp;
    
    // Clear the chat display
    if (messagesContainerRef) {
        // Keep up to 5 most recent messages to preserve context
        const existingMessages = Array.from(messagesContainerRef.children);
        const messagesToKeep = existingMessages.slice(-5);
        messagesContainerRef.innerHTML = '';
        
        // Add back the 5 most recent messages
        messagesToKeep.forEach(msg => messagesContainerRef.appendChild(msg));
        
        // Add a status message
        const statusMessage = document.createElement('p');
        statusMessage.classList.add('message-system');
        statusMessage.innerHTML = '<em>Chat system has been reset locally. This may help resolve connection issues.</em>';
        messagesContainerRef.appendChild(statusMessage);
        messagesContainerRef.scrollTop = messagesContainerRef.scrollHeight;
    }
    
    // Restart monitoring with a fresh state
    messageMonitoringStopFunc = startMessageMonitoring(roomRef);

    return true;
}

/**
 * Display system message using the template system
 * @param {string} messageId - The system message template ID
 * @param {object} params - Parameters for the template
 * @param {number} timestamp - Message timestamp
 * @param {string} systemMessageId - Unique ID for the message
 */
function displaySystemMessage(messageId, params, timestamp, systemMessageId) {
    // Render the message text from the template and parameters
    const messageText = renderSystemMessage(messageId, params);
    
    // Display the rendered message
    displayMessage('System', messageText, timestamp, systemMessageId, false, true);
}

function displayMessage(username, message, timestamp, messageId, isSelf = false, isSystem = false) {
    if (!messagesContainerRef) return;

    // Skip if we've already displayed this message
    if (displayedMessageIds.has(messageId)) {
        return;
    }
    
    // Record that we've displayed this message
    displayedMessageIds.add(messageId);
    
    // Record message in order tracker
    messageOrderTracker.recordMessage(messageId);

    const messageElement = document.createElement('p');
    messageElement.dataset.messageId = messageId; // Store message ID
    
    if (isSystem) {
        messageElement.classList.add('message-system');
        // Italicize system messages
        const italicElement = document.createElement('em');
        italicElement.textContent = message;
        messageElement.appendChild(italicElement);
    } else {
        const usernameSpan = document.createElement('span');
        usernameSpan.classList.add('message-username');
        
        // Check if the username is an admin
        const isAdmin = username === "BookwormKevin" || username === "MapleLeavess" || username === "areyouaperson";
        if (isAdmin) {
            usernameSpan.classList.add('admin-username');
            messageElement.classList.add('message-admin');
        }
        
        usernameSpan.textContent = username + ':';

        const messageSpan = document.createElement('span');
        messageSpan.textContent = ' ' + message; // Add space after username
        
        messageElement.appendChild(usernameSpan);
        messageElement.appendChild(messageSpan);
    }

    if (isSelf) {
        messageElement.classList.add('message-self');
    }

    messageElement.dataset.timestamp = timestamp; // Store timestamp for potential cleanup

    messagesContainerRef.appendChild(messageElement);

    // Keep chat scrolled to the bottom
    messagesContainerRef.scrollTop = messagesContainerRef.scrollHeight;

    // Optional: Limit DOM nodes
    if (messagesContainerRef.children.length > MAX_MESSAGES_DISPLAY) {
        const oldestElements = Array.from(messagesContainerRef.children)
            .slice(0, messagesContainerRef.children.length - MAX_MESSAGES_DISPLAY);
        
        oldestElements.forEach(element => {
            // Also remove from tracking
            if (element.dataset.messageId) {
                displayedMessageIds.delete(element.dataset.messageId);
            }
            element.remove();
        });
    }
}

// Sends a message from the current user
async function sendMessage(message) {
    if (!roomRef || !message) return;

    // Prevent rapid message sending (message flooding)
    const now = Date.now();
    if (now - lastMessageSentTimestamp < MESSAGE_COOLDOWN_MS) {
        console.log("Chat: Message sending too quickly, enforcing cooldown");
        return; // Silently ignore too-rapid messages
    }
    lastMessageSentTimestamp = now;

    // Truncate message if it exceeds the max length
    const truncatedMessage = message.slice(0, CHAT_MESSAGE_MAX_LENGTH);

    const timestamp = Date.now();
    // Add random component to prevent ID collisions
    const randomComponent = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const messageId = `${timestamp}-${randomComponent}-${roomRef.clientId}`; // Unique ID
    
    // Create message data WITHOUT username - use clientId instead
    const messageData = {
        message: truncatedMessage,
        timestamp: timestamp,
        clientId: roomRef.clientId
    };

    // Track the message being sent
    messageTracker.trackSent(messageId, messageData);

    try {
        // Add local immediate feedback for the user's own message
        const username = roomRef.peers[roomRef.clientId]?.username || 'User';
        displayMessage(username, truncatedMessage, timestamp, messageId, true, false);
        
        // Send with retry
        const success = await sendMessageWithRetry(roomRef, messageId, messageData);
        
        if (success) {
            messageTracker.markConfirmed(messageId);
            // Reset connection issues flag if message sent successfully
            if (hasConnectionIssues) {
                hasConnectionIssues = false;
                console.log("Chat: Connection issues appear to be resolved");
            }
        } else {
            console.warn(`Chat: Failed to send message ${messageId} after retries`);
            hasConnectionIssues = true;
            
            // Add a system message indicating the failure (only visible to the sender)
            const errorElement = document.createElement('p');
            errorElement.classList.add('message-error');
            errorElement.textContent = '⚠️ Message may not have been delivered to other users. Chat connection issues detected.';
            errorElement.style.color = '#d9534f';
            errorElement.style.fontSize = '0.8em';
            errorElement.style.fontStyle = 'italic';
            
            // Add emergency reset button
            const resetButton = document.createElement('button');
            resetButton.textContent = 'Reset Chat';
            resetButton.style.marginLeft = '5px';
            resetButton.style.fontSize = '0.8em';
            resetButton.style.padding = '2px 5px';
            resetButton.onclick = () => {
                reinitializeChat();
                errorElement.remove();
            };
            
            errorElement.appendChild(resetButton);
            messagesContainerRef.appendChild(errorElement);
            messagesContainerRef.scrollTop = messagesContainerRef.scrollHeight;
        }
    } catch (error) {
        console.error(`Chat: Error sending message: ${error.message}`);
        hasConnectionIssues = true;
    }
}

/**
 * Function to send a system message (e.g., for map reset or moderation)
 * @param {string} messageId - The system message template ID from SYSTEM_MESSAGE
 * @param {object} params - Parameters to fill in the template
 * @returns {Promise<string>} - Promise resolving to the messageId
 */
export async function sendSystemMessage(messageId, params = {}) {
    if (!roomRef || !messageId) return;

    const timestamp = Date.now();
    const randomComponent = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const systemMessageId = `${timestamp}-${randomComponent}-system`; // Unique ID for system message

    // Create message data without rendered text - only store ID and params
    const messageData = {
        templateId: messageId, // store template ID
        params: params, // store parameters
        timestamp: timestamp,
        clientId: 'system'
    };

    // Track the system message
    messageTracker.trackSent(systemMessageId, messageData);

    try {
        // Send with retry
        const success = await sendMessageWithRetry(roomRef, systemMessageId, messageData);
        
        if (success) {
            messageTracker.markConfirmed(systemMessageId);
            console.log(`Chat: System message ${systemMessageId} sent successfully`);
            
            // Also display locally to ensure it appears
            displaySystemMessage(messageId, params, timestamp, systemMessageId);
        } else {
            console.warn(`Chat: Failed to send system message ${systemMessageId} after retries`);
            
            // Still display the system message locally, even if sending failed
            displaySystemMessage(messageId, params, timestamp, systemMessageId);
            
            // Display error notice
            displayMessage('System', 'Warning: The system message may not be visible to other users due to connection issues.', 
                          Date.now(), `${Date.now()}-local-error`, false, true);
        }
    } catch (error) {
        console.error(`Chat: Error sending system message: ${error.message}`);
        
        // Still display system message locally even if failed
        displaySystemMessage(messageId, params, timestamp, systemMessageId);
    }
    
    return systemMessageId;
}

// Function to be called from game.js when room state updates
export function handleRoomStateUpdate(currentRoomState) {
    if (!messagesContainerRef || !currentRoomState || !currentRoomState.chat) {
        return; // Nothing to do if chat state doesn't exist
    }

    const chatMessages = currentRoomState.chat;
    
    // Get list of message IDs
    const messageIds = Object.keys(chatMessages);

    // Mark any tracked messages as confirmed
    messageIds.forEach(id => {
        messageTracker.markConfirmed(id);
    });

    // Sort messages by the order they were received, not by timestamp
    // This ensures consistent ordering regardless of device clock settings
    const orderedMessageIds = messageOrderTracker.sortMessageIds(messageIds);
    
    let newMessagesFound = false;
    
    // Process messages in the sorted order
    orderedMessageIds.forEach(messageId => {
        const messageData = chatMessages[messageId];
        
        // Skip invalid messages
        if (!messageData || !messageData.timestamp) return;
        
        // Update last message timestamp if this is newer
        if (messageData.timestamp > lastMessageTimestamp) {
            lastMessageTimestamp = messageData.timestamp;
        }
        
        // Skip messages we've already displayed
        if (displayedMessageIds.has(messageId)) return;
        
        const isSelf = messageData.clientId === roomRef.clientId;
        const isSystem = messageData.clientId === 'system';
        
        if (isSystem && messageData.templateId) {
            // This is a templated system message
            displaySystemMessage(
                messageData.templateId,
                messageData.params || {},
                messageData.timestamp,
                messageId
            );
        } else {
            // Regular message or legacy system message
            let username;
            let messageText;
            
            if (isSystem) {
                username = 'System';
                // For backward compatibility with old system messages
                messageText = messageData.message || "System message";
            } else {
                // Look up username from peers using the clientId
                username = roomRef.peers[messageData.clientId]?.username || `User (${messageData.clientId.substring(0, 4)})`;
                messageText = messageData.message;
            }
            
            // Display the message
            displayMessage(
                username, 
                messageText, 
                messageData.timestamp,
                messageId,
                isSelf, 
                isSystem
            );
        }
        
        newMessagesFound = true;
    });

    if (newMessagesFound) {
        console.log(`Chat: Processed new messages`);
    }
    
    // Track the UI as initialized once we've handled the first update
    if (!uiInitialized) {
        uiInitialized = true;
    }
}