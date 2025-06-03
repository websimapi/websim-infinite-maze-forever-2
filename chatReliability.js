// chatReliability.js - Enhances chat reliability with retry mechanisms and error tracking

/**
 * Sends a chat message with retry capability
 * @param {object} room - The Websim room object
 * @param {string} messageId - Unique ID for the message
 * @param {object} messageData - Message data object to send (now without username, just clientId)
 * @param {number} [maxRetries=3] - Maximum number of retry attempts
 * @param {number} [retryDelay=500] - Delay between retries in ms
 * @returns {Promise<boolean>} - Promise resolving to success status
 */
export async function sendMessageWithRetry(room, messageId, messageData, maxRetries = 3, retryDelay = 500) {
    if (!room || !messageId || !messageData) {
        console.error("ChatReliability: Missing required parameters for sending message");
        return false;
    }

    let attempts = 0;
    let success = false;

    while (attempts <= maxRetries && !success) {
        try {
            if (attempts > 0) {
                console.log(`ChatReliability: Retry attempt ${attempts}/${maxRetries} for message ${messageId}`);
            }

            // Ensure we use server ordering by appending to the chat object
            // This preserves message order regardless of timestamps
            await room.updateRoomState({
                chat: {
                    [messageId]: messageData
                }
            });

            // Verify message was stored in room state (short delay to allow state to update)
            await new Promise(resolve => setTimeout(resolve, 200));
            
            if (room.roomState?.chat?.[messageId]) {
                success = true;
                if (attempts > 0) {
                    console.log(`ChatReliability: Message ${messageId} successfully sent after ${attempts} retries`);
                }
            } else {
                console.warn(`ChatReliability: Message ${messageId} not found in room state after sending`);
                attempts++;
                if (attempts <= maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        } catch (error) {
            console.error(`ChatReliability: Error sending message (attempt ${attempts}/${maxRetries}):`, error);
            attempts++;
            if (attempts <= maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    return success;
}

/**
 * Tracks sent messages to identify potential missing messages
 */
class MessageTracker {
    constructor() {
        this.sentMessages = new Map(); // messageId -> {timestamp, data}
        this.confirmedMessages = new Set(); // messageIds confirmed in room state
        this.MAX_TRACKED_MESSAGES = 50;
    }

    /**
     * Tracks a new message being sent
     * @param {string} messageId - The unique message ID
     * @param {object} messageData - The message data being sent
     */
    trackSent(messageId, messageData) {
        this.sentMessages.set(messageId, {
            timestamp: Date.now(),
            data: messageData,
            confirmed: false
        });
        
        // Clean up old tracked messages if needed
        if (this.sentMessages.size > this.MAX_TRACKED_MESSAGES) {
            // Find oldest message
            let oldestId = null;
            let oldestTime = Infinity;
            
            for (const [id, data] of this.sentMessages.entries()) {
                if (data.timestamp < oldestTime) {
                    oldestTime = data.timestamp;
                    oldestId = id;
                }
            }
            
            // Remove oldest
            if (oldestId) {
                this.sentMessages.delete(oldestId);
            }
        }
    }

    /**
     * Marks a message as confirmed (appeared in room state)
     * @param {string} messageId - The message ID that was confirmed
     */
    markConfirmed(messageId) {
        const message = this.sentMessages.get(messageId);
        if (message) {
            message.confirmed = true;
            this.confirmedMessages.add(messageId);
        }
    }

    /**
     * Checks for any sent messages that haven't been confirmed
     * @param {number} [olderThanMs=5000] - Only check messages older than this many ms
     * @returns {Array<{id: string, data: object}>} - Array of unconfirmed messages
     */
    getUnconfirmedMessages(olderThanMs = 5000) {
        const now = Date.now();
        const result = [];
        
        for (const [id, data] of this.sentMessages.entries()) {
            if (!data.confirmed && (now - data.timestamp) > olderThanMs) {
                result.push({
                    id,
                    data: data.data
                });
            }
        }
        
        return result;
    }
}

// Export singleton instance
export const messageTracker = new MessageTracker();

/**
 * Checks for and attempts to resend any unconfirmed messages
 * @param {object} room - The Websim room object
 */
export async function checkAndResendMessages(room) {
    if (!room) return;
    
    const unconfirmed = messageTracker.getUnconfirmedMessages();
    if (unconfirmed.length === 0) return;
    
    console.log(`ChatReliability: Found ${unconfirmed.length} unconfirmed messages, attempting to resend`);
    
    for (const message of unconfirmed) {
        // Check if the message actually made it to the room state
        if (room.roomState?.chat?.[message.id]) {
            messageTracker.markConfirmed(message.id);
            continue;
        }
        
        // Attempt to resend
        console.log(`ChatReliability: Resending message ${message.id}`);
        try {
            await sendMessageWithRetry(room, message.id, message.data, 1);
        } catch (error) {
            console.error(`ChatReliability: Failed to resend message ${message.id}:`, error);
        }
    }
}

/**
 * Schedules periodic checking of unconfirmed messages
 * @param {object} room - The Websim room object
 * @param {number} [intervalMs=10000] - Check interval in milliseconds
 */
export function startMessageMonitoring(room, intervalMs = 10000) {
    if (!room) return;
    
    // Perform initial check
    checkAndResendMessages(room);
    
    // Set up interval
    const intervalId = setInterval(() => checkAndResendMessages(room), intervalMs);
    
    // Return function to stop monitoring
    return () => clearInterval(intervalId);
}