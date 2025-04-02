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
    
    // Check for multiplayer mode via URL parameters
    const hostParam = url.searchParams.get('host');
    const joinParam = url.searchParams.get('join');
    
    console.log("Initializing game with doomMode:", doomMode);
    if (hostParam === '1') {
      console.log("Initializing as multiplayer host");
    } else if (joinParam) {
      console.log("Joining multiplayer game:", joinParam);
    }
    
    // Create a loading screen
    showLoadingScreen();
    
    // Create and initialize the engine with debug and doom modes
    const engine = new Engine(debugMode, doomMode);
    
    // Initialize the engine - this will show the start menu
    engine.init();
    
    // Check if we should automatically host or join a game via URL parameters
    if (hostParam === '1' && engine.networkManager) {
      setTimeout(() => {
        engine.startMenu.hide();
        engine.networkManager.startHosting();
      }, 1000);
    } else if (joinParam && engine.networkManager) {
      setTimeout(() => {
        engine.startMenu.hide();
        engine.networkManager.joinGame(joinParam);
      }, 1000);
    }
    
    // Hide loading screen once engine is initialized
    hideLoadingScreen();

    // Print instructions to console
    console.log('3D Room Explorer: Zombie Defense' + (doomMode ? ' - DOOM EDITION' : ''));
    console.log('Use WASD to move and mouse to look around');
    console.log('Press F to board up windows when close to them');
    console.log('Zombies will break through the windows if you don\'t board them up!');
    console.log('Left-click to shoot zombies');
    
    // Add multiplayer instructions
    console.log('--- Multiplayer ---');
    console.log('To host a game: Choose "Host Game" from the menu');
    console.log('To join a game: Choose "Join Game" and enter the host ID');
    console.log('You can also use URL parameters to automatically host or join:');
    console.log('  ?host=1 - Host a game');
    console.log('  ?join=HOSTID - Join a specific host');
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
 * Show a loading screen while the game initializes
 */
function showLoadingScreen() {
  const loadingScreen = document.createElement('div');
  loadingScreen.id = 'loading-screen';
  loadingScreen.style.position = 'fixed';
  loadingScreen.style.top = '0';
  loadingScreen.style.left = '0';
  loadingScreen.style.width = '100%';
  loadingScreen.style.height = '100%';
  loadingScreen.style.backgroundColor = '#000';
  loadingScreen.style.display = 'flex';
  loadingScreen.style.flexDirection = 'column';
  loadingScreen.style.alignItems = 'center';
  loadingScreen.style.justifyContent = 'center';
  loadingScreen.style.zIndex = '9999';
  loadingScreen.style.color = '#fff';
  loadingScreen.style.fontFamily = 'monospace';
  
  const title = document.createElement('h1');
  title.textContent = 'RESIST: MATRIX';
  title.style.color = '#ff3333';
  title.style.fontSize = '36px';
  title.style.textShadow = '0 0 10px #ff3333';
  title.style.marginBottom = '20px';
  
  const loadingText = document.createElement('p');
  loadingText.textContent = 'Loading...';
  loadingText.style.fontSize = '18px';
  
  // Create loading bar
  const loadingBarContainer = document.createElement('div');
  loadingBarContainer.style.width = '300px';
  loadingBarContainer.style.height = '20px';
  loadingBarContainer.style.backgroundColor = '#333';
  loadingBarContainer.style.borderRadius = '10px';
  loadingBarContainer.style.overflow = 'hidden';
  loadingBarContainer.style.marginTop = '20px';
  
  const loadingBar = document.createElement('div');
  loadingBar.style.width = '0%';
  loadingBar.style.height = '100%';
  loadingBar.style.backgroundColor = '#ff3333';
  loadingBar.style.transition = 'width 3s ease-in-out';
  loadingBarContainer.appendChild(loadingBar);
  
  loadingScreen.appendChild(title);
  loadingScreen.appendChild(loadingText);
  loadingScreen.appendChild(loadingBarContainer);
  
  document.body.appendChild(loadingScreen);
  
  // Animate loading bar
  setTimeout(() => {
    loadingBar.style.width = '100%';
  }, 100);
}

/**
 * Hide the loading screen
 */
function hideLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    loadingScreen.style.transition = 'opacity 0.5s ease-in-out';
    
    setTimeout(() => {
      if (loadingScreen.parentNode) {
        loadingScreen.parentNode.removeChild(loadingScreen);
      }
    }, 500);
  }
}

/**
 * Create a Doom-style title banner (function kept for reference but not used)
 */
function createDoomTitle() {
  // Title banner functionality removed as requested
} 