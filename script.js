import { initGame } from 'setup';
import { initUserIdentity } from './userIdentity.js';

// WebsimSocket is globally available
const room = new WebsimSocket();

// Initialize the game
async function start() {
  try {
    // First check for duplicate username
    const canProceed = await initUserIdentity(room);
    
    if (!canProceed) {
      console.log("User blocked due to duplicate username");
      return; // Stop initialization if duplicate detected
    }
    
    // Continue with normal game initialization
    await initGame(room);
  } catch (error) {
    console.error("Failed to initialize Websim room or game:", error);
    // Display an error message to the user
    document.body.innerHTML = `<div style="color: red; text-align: center; padding: 20px;">Error connecting to multiplayer service. Please try refreshing. Details: ${error.message || 'Unknown'}</div>`;
  }
}

// Start the application
start();