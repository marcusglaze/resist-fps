import { Engine } from './core/Engine';

/**
 * Initialize the 3D room explorer with zombie window defense
 * with Doom-like retro graphics
 */
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Configuration
    const debugMode = false; // Disable debug mode for cleaner visuals
    
    // Check if Doom mode is disabled via URL parameter
    const url = new URL(window.location.href);
    const doomParam = url.searchParams.get('doomMode');
    const doomMode = doomParam !== '0'; // Enable Doom mode by default, disable if parameter is '0'
    
    console.log("Starting game with doomMode:", doomMode);
    
    // Add title styling for Doom-like aesthetics if in Doom mode
    if (doomMode) {
      createDoomTitle();
    }
    
    // Create and initialize the engine with debug and doom modes
    const engine = new Engine(debugMode, doomMode);
    engine.init();

    // Print instructions to console
    console.log('3D Room Explorer: Zombie Defense' + (doomMode ? ' - DOOM EDITION' : ''));
    console.log('Use WASD to move and mouse to look around');
    console.log('Press F to board up windows when close to them');
    console.log('Zombies will break through the windows if you don\'t board them up!');
    console.log('Left-click to shoot zombies');
  } catch (error) {
    console.error("Fatal error initializing game:", error);
    document.body.innerHTML = `
      <div style="color: red; font-family: monospace; padding: 20px;">
        <h1>Game initialization error</h1>
        <p>An error occurred while starting the game:</p>
        <pre>${error.message}</pre>
        <p>Please check the browser console for more details.</p>
        <button onclick="location.reload()">Reload</button>
      </div>
    `;
  }
});

/**
 * Create a Doom-style title banner
 */
function createDoomTitle() {
  try {
    // Create title container
    const titleContainer = document.createElement('div');
    titleContainer.className = 'doom-title';
    titleContainer.style.position = 'fixed';
    titleContainer.style.top = '20px';
    titleContainer.style.left = '0';
    titleContainer.style.width = '100%';
    titleContainer.style.textAlign = 'center';
    titleContainer.style.zIndex = '1000';
    titleContainer.style.pointerEvents = 'none';
    
    // Create title text
    const titleText = document.createElement('h1');
    titleText.textContent = 'DOOM: WINDOW DEFENSE';
    titleText.style.fontFamily = 'Impact, fantasy';
    titleText.style.fontSize = '48px';
    titleText.style.color = '#ff0000';
    titleText.style.textShadow = '4px 4px 0 #000';
    titleText.style.margin = '0';
    titleText.style.letterSpacing = '2px';
    titleText.style.transform = 'scaleY(1.2)';
    
    // Add title to container
    titleContainer.appendChild(titleText);
    
    // Add to document
    document.body.appendChild(titleContainer);
  } catch (error) {
    console.error("Error creating Doom title:", error);
  }
} 