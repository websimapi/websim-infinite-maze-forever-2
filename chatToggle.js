// chatToggle.js - Handles toggling the chat (show/hide) functionality.
// This new module replaces the inline toggleChatVisibility code in buttonHandlers.js.

let isVisible = true; // Keep track of chat visibility state
let chatContainer; // Reference to the chat container
let chatInput; // Reference to the chat input

export function initChatToggle() {
  const toggleChatButton = document.getElementById('toggle-chat-button');
  chatContainer = document.getElementById('chat-container');
  chatInput = document.getElementById('chat-input');
  
  if (!toggleChatButton || !chatContainer || !chatInput) {
    console.error("ChatToggle: Required elements not found.");
    return;
  }
  
  // Set initial state if needed
  isVisible = true;
  
  toggleChatButton.addEventListener('click', toggleChatVisibility);
  
  // Add global keyboard listener for slash key
  document.addEventListener('keydown', handleSlashKey);
  
  console.log("Chat toggle system initialized");
}

// Function to toggle chat visibility
function toggleChatVisibility() {
  isVisible = !isVisible;
  // Toggle the chat container display: use 'flex' (the original visible style) when showing and 'none' when hidden.
  chatContainer.style.display = isVisible ? 'flex' : 'none';
  // Update the button icon/text.
  document.getElementById('toggle-chat-button').textContent = isVisible ? '💬' : '🗨️';
}

// New function to handle the slash key press
function handleSlashKey(event) {
  // Only respond to slash key when not in an input element already
  if (event.key === '/' && 
      document.activeElement.tagName !== 'INPUT' && 
      document.activeElement.tagName !== 'TEXTAREA') {
    
    // Prevent the slash character from being typed in the chat input
    event.preventDefault();
    
    // If chat is hidden, show it first
    if (!isVisible) {
      toggleChatVisibility();
    }
    
    // Make mouse cursor visible again if it was hidden
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    
    // Focus the chat input
    chatInput.focus();
  }
}

// Export toggleChatVisibility for external use if needed
export function toggleChat() {
  toggleChatVisibility();
}

// Function to check if chat is currently visible
export function isChatVisible() {
  return isVisible;
}