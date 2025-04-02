import { Engine } from './core/Engine';

/**
 * Initialize the 3D room explorer with zombie window defense
 * with Doom-like retro graphics
 */
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Create the game engine with debug options
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.has('debug');
    const doomMode = !urlParams.has('nodoom');
    const hostMode = urlParams.has('host');
    const joinMode = urlParams.has('join');
    const joinId = urlParams.get('join');
    
    console.log("Starting game...");
    console.log(`Debug mode: ${debugMode}`);
    console.log(`Doom mode (classic shader): ${doomMode}`);
    
    const loadingBar = document.createElement('div');
    loadingBar.style.position = 'fixed';
    loadingBar.style.top = '50%';
    loadingBar.style.left = '50%';
    loadingBar.style.transform = 'translate(-50%, -50%)';
    loadingBar.style.width = '300px';
    loadingBar.style.height = '20px';
    loadingBar.style.backgroundColor = '#333';
    loadingBar.style.borderRadius = '10px';
    loadingBar.style.overflow = 'hidden';
    loadingBar.style.zIndex = '1000';
    
    const loadingProgress = document.createElement('div');
    loadingProgress.style.height = '100%';
    loadingProgress.style.width = '0%';
    loadingProgress.style.backgroundColor = '#0f0';
    loadingProgress.style.transition = 'width 0.3s ease-out';
    
    loadingBar.appendChild(loadingProgress);
    document.body.appendChild(loadingBar);
    
    // Create and configure the game engine
    import('./core/Engine.js').then(module => {
      const Engine = module.Engine;
      const engine = new Engine(debugMode, doomMode);
      
      // Store global reference for easy access from anywhere
      window.gameEngine = engine;
      
      // Set loading progress updates
      engine.onLoadingProgress = (progress) => {
        loadingProgress.style.width = `${progress * 100}%`;
        if (progress >= 1) {
          setTimeout(() => {
            loadingBar.style.opacity = '0';
            setTimeout(() => {
              document.body.removeChild(loadingBar);
            }, 300);
          }, 500);
        }
      };
      
      // Check if we should auto-join or host
      if (hostMode) {
        console.log('Auto-hosting enabled via URL parameter');
        engine.initialMode = 'host';
      } else if (joinMode && joinId) {
        console.log(`Auto-joining enabled via URL parameter, joining host: ${joinId}`);
        engine.initialMode = 'join';
        engine.joinHostId = joinId;
      }
    }).catch(error => {
      console.error("Error loading game engine:", error);
      loadingBar.style.backgroundColor = '#600';
      loadingProgress.style.backgroundColor = '#f00';
      loadingProgress.style.width = '100%';
    });
    
    // Log controls for debugging
    console.log('--- Controls ---');
    console.log('W, A, S, D or Arrow keys to move');
    console.log('Mouse to look around');
    console.log('Left click to shoot');
    console.log('R to reload');
    console.log('Space to jump');
    console.log('Shift to run');
    console.log('F to toggle flashlight');
    console.log('E to interact with objects');
    console.log('1, 2, 3 to switch weapons');
    console.log('Q to toggle weapon');
    console.log('Tab to show score');
    console.log('Escape to pause');
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