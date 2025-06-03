/**
 * Utility to track the order in which messages are received
 * This helps ensure chat messages appear in the correct order
 * regardless of timestamp anomalies.
 */
export class MessageOrderTracker {
    constructor() {
        this.receivedOrder = []; // Array of message IDs in order received
        this.maxStoredMessages = 200; // Limit the number of tracked messages
    }
    
    /**
     * Records a new message in the received order
     * @param {string} messageId - The unique message ID
     */
    recordMessage(messageId) {
        // Don't add duplicates
        if (!this.receivedOrder.includes(messageId)) {
            this.receivedOrder.push(messageId);
            
            // Prune if we're over the limit
            if (this.receivedOrder.length > this.maxStoredMessages) {
                this.receivedOrder.shift(); // Remove oldest
            }
        }
    }
    
    /**
     * Gets the list of message IDs in the order they were received
     * @returns {string[]} Array of message IDs
     */
    getOrderedMessageIds() {
        return [...this.receivedOrder];
    }
    
    /**
     * Sorts a list of message IDs based on their received order
     * @param {string[]} messageIds - The IDs to sort
     * @returns {string[]} Sorted message IDs
     */
    sortMessageIds(messageIds) {
        // First add any new IDs to our tracking that we don't have yet
        messageIds.forEach(id => {
            if (!this.receivedOrder.includes(id)) {
                this.recordMessage(id);
            }
        });
        
        // Then return the messages in the order they were received
        return this.receivedOrder.filter(id => messageIds.includes(id));
    }
    
    /**
     * Clears the message order tracker
     */
    clear() {
        this.receivedOrder = [];
    }
}

// Export singleton instance
export const messageOrderTracker = new MessageOrderTracker();