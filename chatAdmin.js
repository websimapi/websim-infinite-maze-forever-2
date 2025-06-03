// chatAdmin.js - Admin functionality for chat management

import { sendSystemMessage, reinitializeChat } from './chat.js';
import { isAuthorizedAdmin, showUnauthorizedError } from './adminAuth.js';
import { SYSTEM_MESSAGE } from './systemMessages.js';

/**
 * Clears all chat messages from the room state
 * @param {object} room - The Websim room object
 * @returns {Promise<boolean>} - Whether the operation was successful
 */
export async function clearChatHistory(room) {
  // Check if user is authorized
  if (!isAuthorizedAdmin(room)) {
    showUnauthorizedError("chat clearing");
    return false;
  }
  
  try {
    // Get admin username for the system message
    const adminUsername = room.peers[room.clientId]?.username || "Administrator";
    
    // Create a timestamp for the new system message
    const timestamp = Date.now();
    const randomComponent = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const systemMessageId = `${timestamp}-${randomComponent}-system-clear`;
    
    // Prepare an object with just the clear notification message using template
    const newChatState = {
      [systemMessageId]: {
        templateId: SYSTEM_MESSAGE.CHAT_CLEARED,
        params: { admin: adminUsername },
        timestamp: timestamp,
        clientId: 'system'
      }
    };
    
    // Update room state with the cleared chat (just contains the system message)
    await room.updateRoomState({
      chat: newChatState
    });
    
    // Force local chat reset for all users
    // This will happen for the admin first, then for others when they get the room state update
    reinitializeChat();
    
    console.log(`ChatAdmin: Chat history cleared by ${adminUsername}`);
    return true;
  } catch (error) {
    console.error("ChatAdmin: Error clearing chat history:", error);
    return false;
  }
}

/**
 * Performs an emergency reset of the chat system
 * @param {object} room - The Websim room object
 * @returns {Promise<boolean>} - Whether the operation was successful
 */
export async function emergencyChatReset(room) {
  // Check if user is authorized
  if (!isAuthorizedAdmin(room)) {
    showUnauthorizedError("emergency chat reset");
    return false;
  }
  
  try {
    // Get admin username for the system message
    const adminUsername = room.peers[room.clientId]?.username || "Administrator";
    
    // Create a chat reset message using template
    const messageId = await sendSystemMessage(SYSTEM_MESSAGE.CHAT_RESET, { admin: adminUsername });
    
    // Force local chat reset
    reinitializeChat();
    
    console.log(`ChatAdmin: Emergency chat reset performed by ${adminUsername}`);
    return true;
  } catch (error) {
    console.error("ChatAdmin: Error during emergency chat reset:", error);
    return false;
  }
}