import * as THREE from 'three';
import { Scene } from './Scene';
import { Renderer } from './Renderer';
import { PlayerControls } from '../controls/PlayerControls';
import { StartMenu } from './StartMenu';
import { EnemyManager } from '../objects/EnemyManager';
import { NetworkManager } from '../network/NetworkManager.js';

/**
 * Main engine class that ties all components together
 */
export class Engine {
  constructor(debugMode = false, doomMode = true) {
    console.log("Initializing Engine with debugMode:", debugMode, "doomMode:", doomMode);
    
    // Debug mode
    this.debugMode = debugMode;
    
    // Doom mode
    this.doomMode = doomMode;
    
    // Sound settings
    this.soundVolume = 0.8;
    this.musicVolume = 0.5;
    
    // Difficulty setting
    this.difficulty = 'normal';
    
    // Create core components with appropriate modes
    this.scene = new Scene(this.debugMode, this.doomMode);
    this.renderer = new Renderer(this.doomMode, 320); // 320x240 was a common resolution in Doom era
    
    // Create controls after Scene so we can pass room dimensions
    this.controls = new PlayerControls(this.scene.camera, this.renderer.domElement);
    
    // Give controls a reference to the engine
    this.controls.gameEngine = this;
    
    // Setup clock for animation
    this.clock = new THREE.Clock();
    
    // Game state
    this.isGameStarted = false;
    this.isGameOver = false;
    this.isPaused = false;
    
    // Create start menu
    this.startMenu = new StartMenu(this);
    
    // Animation timing variables
    this.then = performance.now();
    this.delta = 0;
    
    // Bind the animate method to this instance
    this.animate = this.animate.bind(this);
    
    // Initialize network manager
    this.networkManager = null;
    
    // Initialize and show the start menu
    this.startMenu.init((settings) => {
      // Apply settings from menu
      this.applySettings(settings);
      
      // Start the game
      this.startGame();
    }, this);
  }

  /**
   * Initialize engine and components
   */
  init() {
    try {
      console.log("Engine init started");
      
      // Initialize components
      this.scene.init();
      this.renderer.init();
      
      // Update room dimensions in controls for collision detection
      const room = this.scene.room;
      this.controls.roomWidth = room.width;
      this.controls.roomDepth = room.depth;
      this.controls.wallThickness = 0.1; // Same as in Room.js
      
      // Connect player to room for interaction
      room.setPlayer(this.controls);
      
      // Set scene reference in controls for shooting
      if (this.scene.instance) {
        this.controls.setScene(this.scene.instance);
      } else {
        console.error("Cannot access scene instance for shooting");
      }
      
      // Initialize controls but don't enable them yet
      this.controls.init();
      this.controls.enabled = false; // Disable controls until game starts
      
      // Initialize mobile controls if needed
      if (this.isMobileDevice()) {
        console.log("Mobile device detected, initializing mobile controls");
        // Import the MobileControls class dynamically
        import('../controls/MobileControls.js').then(module => {
          const MobileControls = module.MobileControls;
          this.mobileControls = new MobileControls(this.controls);
          // Store reference in controls for bi-directional access
          this.controls.mobileControls = this.mobileControls;
          console.log("Mobile controls initialized successfully");
        }).catch(error => {
          console.error("Failed to initialize mobile controls:", error);
        });
      }
      
      // Add renderer to DOM
      const container = document.getElementById('container');
      if (container) {
        container.appendChild(this.renderer.domElement);
      } else {
        console.log("Container element not found, falling back to body");
        document.body.appendChild(this.renderer.domElement);
      }
      
      // Hide any instructions
      const instructionsEl = document.querySelector('.info');
      if (instructionsEl) {
        instructionsEl.style.display = 'none';
      }
      
      // Add window resize handler
      window.addEventListener('resize', this.onWindowResize.bind(this), false);
      
      // Add keyboard event listener for pause
      window.addEventListener('keydown', this.handleKeyDown.bind(this));
      
      // Start animation loop (will render scenes but game logic won't run until started)
      this.then = performance.now();
      this.animate();
      
      // Initialize network manager
      this.networkManager = new NetworkManager(this);
      this.networkManager.init();
      
      console.log("Engine init completed successfully");
    } catch (error) {
      console.error("Error during engine initialization:", error);
      alert("Error initializing game engine. Check console for details.");
    }
  }
  
  /**
   * Apply settings from the start menu
   * @param {Object} settings - Settings from the start menu
   */
  applySettings(settings) {
    console.log("Applying game settings:", settings);
    
    // Apply Doom mode setting
    if (this.doomMode !== settings.doomMode) {
      this.doomMode = settings.doomMode;
      this.scene.setDoomMode(this.doomMode);
      this.renderer.setDoomMode(this.doomMode);
    }
    
    // Apply sound volume settings
    this.soundVolume = settings.soundVolume;
    this.musicVolume = settings.musicVolume;
    
    // Set volumes if control methods exist
    if (this.controls) {
      if (typeof this.controls.setSoundVolume === 'function') {
        this.controls.setSoundVolume(this.soundVolume);
      }
      
      if (typeof this.controls.setMusicVolume === 'function') {
        this.controls.setMusicVolume(this.musicVolume);
      }
    }
    
    // Apply difficulty setting
    this.difficulty = settings.difficulty;
    
    // Update enemy manager with difficulty if available
    if (this.scene.room && this.scene.room.enemyManager) {
      const enemyManager = this.scene.room.enemyManager;
      
      // Set difficulty multipliers based on selected level
      switch(this.difficulty) {
        case 'easy':
          enemyManager.healthMultiplier = 0.7;
          enemyManager.speedMultiplier = 0.8;
          enemyManager.spawnRateMultiplier = 0.7;
          break;
        case 'normal':
          enemyManager.healthMultiplier = 1.0;
          enemyManager.speedMultiplier = 1.0;
          enemyManager.spawnRateMultiplier = 1.0;
          break;
        case 'hard':
          enemyManager.healthMultiplier = 1.3;
          enemyManager.speedMultiplier = 1.2;
          enemyManager.spawnRateMultiplier = 1.3;
          break;
        case 'nightmare':
          enemyManager.healthMultiplier = 2.0;
          enemyManager.speedMultiplier = 1.5;
          enemyManager.spawnRateMultiplier = 1.7;
          break;
      }
      
      console.log(`Difficulty set to ${this.difficulty} with multipliers:`, {
        health: enemyManager.healthMultiplier,
        speed: enemyManager.speedMultiplier,
        spawnRate: enemyManager.spawnRateMultiplier
      });
    }
  }

  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(this.animate.bind(this));
    
    // Calculate time delta for consistent animations
    const now = performance.now();
    this.delta = (now - this.then) / 1000;
    this.then = now;
    
    // Only update game logic if the game has started and is not paused
    if (this.isGameStarted && !this.isGameOver && !this.isPaused) {
      // Update controls
      if (this.controls && this.controls.enabled) {
        this.controls.update(this.delta);
      }
      
      // Update current scene
      if (this.scene) {
        this.scene.update(this.delta);
        
        // Update room logic (enemies, windows, mystery box, etc)
        if (this.scene.room) {
          this.scene.room.update(this.delta);
        }
      }
    }
    
    // Always render, even when paused or game over
    if (this.scene && this.scene.camera) {
      // Pass the scene wrapper object to the renderer instead of scene.instance
      // The renderer will extract the instance and camera as needed
      this.renderer.render(this.scene);
    }
  }
  
  /**
   * Start the game
   * @param {Object} settings - Game settings from menu
   */
  startGame(settings = {}) {
    console.log("Starting game with settings:", settings);
    
    if (this.isGameStarted) {
      console.warn("Game is already active, ignoring startGame call");
      return;
    }
    
    // Apply settings
    this.settings = settings;
    
    // Initialize scene if not already done
    if (!this.scene) {
      this.init();
    }
    
    // Load or reset the room
    if (!this.scene.room) {
      this.scene.loadRoom();
    } else {
      this.scene.room.resetRoom();
    }
    
    // Hide start menu if visible
    if (this.startMenu && this.startMenu.isVisible) {
      this.startMenu.hide();
    }
    
    // Show in-game UI
    if (this.uiManager) {
      this.uiManager.showGameUI();
    }
    
    // Reset player health and ammo
    if (this.controls) {
      this.controls.resetHealth();
      if (typeof this.controls.resetWeapons === 'function') {
        this.controls.resetWeapons();
      }
      
      // Explicitly enable the controls to ensure player can move
      this.controls.enabled = true;
    }
    
    // Reset player points
    if (this.playerStats) {
      this.playerStats.reset();
    }
    
    // Start/resume audio
    if (this.audioManager) {
      this.audioManager.setMusicVolume(settings.musicVolume || 0.5);
      this.audioManager.setSoundVolume(settings.soundVolume || 0.8);
      this.audioManager.playBackgroundMusic();
    }
    
    // Set game as active
    this.isGameStarted = true;
    this.isPaused = false;
    
    // Check if we're in a network hosting mode
    const isNetworkHosting = this.networkManager && 
                             this.networkManager.isHost && 
                             this.networkManager.isMultiplayer;
                             
    // Set up enemies only if we're not in network hosting mode or explicitly told to start
    if (this.scene.room && this.scene.room.enemyManager) {
      // Initialize the enemy manager if not already initialized
      if (typeof this.scene.room.enemyManager.init === 'function') {
        this.scene.room.enemyManager.init();
      }
      
      // Start spawning enemies (with a short delay) only if we're not in network hosting mode
      // or if we've explicitly been told to start by the NetworkManager
      setTimeout(() => {
        if (typeof this.scene.room.enemyManager.startNextRound === 'function') {
          this.scene.room.enemyManager.startNextRound();
        }
      }, 5000);
    }
    
    // Lock the pointer if we're not on mobile and not in network hosting mode setup
    if (!this.isMobileDevice()) {
      this.lockPointer();
    }
    
    // Show mobile controls if needed
    this.showMobileControlsIfNeeded();
  }

  /**
   * Show mobile controls if we're on a mobile device and in-game
   */
  showMobileControlsIfNeeded() {
    if (this.isMobileDevice() && this.isGameStarted && !this.isPaused && !this.isGameOver) {
      console.log("Showing mobile controls");
      
      // If mobileControls is not initialized yet, try to initialize it now
      if (!this.mobileControls) {
        console.log("Mobile controls not initialized yet, attempting to initialize now");
        import('../controls/MobileControls.js').then(module => {
          const MobileControls = module.MobileControls;
          this.mobileControls = new MobileControls(this.controls);
          this.controls.mobileControls = this.mobileControls;
          
          // Now show the controls
          if (this.mobileControls) {
            this.mobileControls.show();
            console.log("Mobile controls initialized and shown");
          }
        }).catch(error => {
          console.error("Failed to initialize mobile controls:", error);
        });
      } else {
        // Controls already initialized, just show them
        this.mobileControls.show();
        console.log("Mobile controls shown");
      }
    }
  }

  /**
   * Hide mobile controls
   */
  hideMobileControls() {
    console.log("Hiding mobile controls");
    if (this.mobileControls) {
      this.mobileControls.hide();
      console.log("Mobile controls hidden");
    }
  }

  /**
   * Check if device is mobile
   * @returns {boolean} True if running on mobile device
   */
  isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * End the game (called when player dies)
   */
  endGame() {
    console.log("Game over!");
    this.isGameOver = true;
    
    // Unlock pointer
    this.unlockPointer();
    
    // Pause all enemies
    if (this.scene.room && this.scene.room.enemyManager) {
      this.scene.room.enemyManager.setPaused(true);
    }
    
    // Show game over screen
    this.showGameOverScreen();
  }
  
  /**
   * Show the game over screen
   */
  showGameOverScreen() {
    // Create game over container
    const gameOverContainer = document.createElement('div');
    gameOverContainer.id = 'game-over-menu';
    gameOverContainer.className = 'game-over-menu';
    gameOverContainer.style.position = 'absolute';
    gameOverContainer.style.top = '0';
    gameOverContainer.style.left = '0';
    gameOverContainer.style.width = '100%';
    gameOverContainer.style.height = '100%';
    gameOverContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    gameOverContainer.style.display = 'flex';
    gameOverContainer.style.flexDirection = 'column';
    gameOverContainer.style.alignItems = 'center';
    gameOverContainer.style.justifyContent = 'center';
    gameOverContainer.style.zIndex = '2000';
    gameOverContainer.style.color = '#fff';
    gameOverContainer.style.fontFamily = 'monospace, "Press Start 2P", Courier, fantasy';
    gameOverContainer.style.touchAction = 'auto'; // Allow normal touch actions in menu
    
    // Prevent pointer lock when interacting with menu
    gameOverContainer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    gameOverContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    // Add touch event listeners to prevent game touches
    gameOverContainer.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: false });
    gameOverContainer.addEventListener('touchmove', (e) => {
      // Only prevent default if we're touching menu elements
      if (e.target.closest('button, h1, h2, #game-over-menu')) {
        e.preventDefault();
      }
      e.stopPropagation();
    }, { passive: false });
    gameOverContainer.addEventListener('touchend', (e) => {
      e.stopPropagation();
    }, { passive: false });
    
    // Game over title
    const title = document.createElement('h1');
    title.textContent = 'GAME OVER';
    title.style.color = '#ff3333';
    title.style.fontSize = '48px';
    title.style.textShadow = '0 0 10px #ff3333, 0 0 20px #ff3333';
    title.style.marginBottom = '30px';
    title.style.fontFamily = 'Impact, fantasy';
    title.style.letterSpacing = '2px';
    
    // Score display
    let scoreText = "Score: 0";
    if (this.controls && this.controls.score !== undefined) {
      scoreText = `Score: ${this.controls.score}`;
    }
    
    const scoreDisplay = document.createElement('h2');
    scoreDisplay.textContent = scoreText;
    scoreDisplay.style.color = '#ffffff';
    scoreDisplay.style.fontSize = '24px';
    scoreDisplay.style.marginBottom = '40px';
    
    // Buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '15px';
    buttonContainer.style.width = '300px';
    
    // Create restart button
    const restartButton = document.createElement('button');
    restartButton.textContent = 'RESTART GAME';
    restartButton.style.padding = '15px 20px';
    restartButton.style.fontSize = '18px';
    restartButton.style.backgroundColor = '#ff3333';
    restartButton.style.color = 'white';
    restartButton.style.border = 'none';
    restartButton.style.borderRadius = '5px';
    restartButton.style.cursor = 'pointer';
    restartButton.style.fontFamily = 'monospace, Courier';
    restartButton.style.fontWeight = 'bold';
    restartButton.style.transition = 'all 0.2s ease';
    restartButton.style.touchAction = 'auto'; // Allow normal touch on button
    
    // Hover effects
    restartButton.addEventListener('mouseover', () => {
      restartButton.style.transform = 'scale(1.05)';
      restartButton.style.boxShadow = '0 0 10px #ff3333';
    });
    
    restartButton.addEventListener('mouseout', () => {
      restartButton.style.transform = 'scale(1)';
      restartButton.style.boxShadow = 'none';
    });
    
    // Prevent pointer lock
    restartButton.addEventListener('mousedown', (e) => e.stopPropagation());
    
    // Touch handling for restart button
    restartButton.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      restartButton.style.transform = 'scale(1.05)';
      restartButton.style.boxShadow = '0 0 10px #ff3333';
    }, { passive: false });
    
    restartButton.addEventListener('touchend', (e) => {
      e.stopPropagation();
      restartButton.style.transform = 'scale(1)';
      restartButton.style.boxShadow = 'none';
      
      // Remove game over screen
      document.body.removeChild(gameOverContainer);
      
      // Reset game state properly
      this.restartGame();
    }, { passive: false });
    
    // Restart game when clicked
    restartButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove game over screen
      document.body.removeChild(gameOverContainer);
      
      // Reset game state properly
      this.restartGame();
    });
    
    // Create main menu button
    const menuButton = document.createElement('button');
    menuButton.textContent = 'MAIN MENU';
    menuButton.style.padding = '15px 20px';
    menuButton.style.fontSize = '18px';
    menuButton.style.backgroundColor = '#333333';
    menuButton.style.color = '#dddddd';
    menuButton.style.border = 'none';
    menuButton.style.borderRadius = '5px';
    menuButton.style.cursor = 'pointer';
    menuButton.style.fontFamily = 'monospace, Courier';
    menuButton.style.fontWeight = 'bold';
    menuButton.style.transition = 'all 0.2s ease';
    menuButton.style.touchAction = 'auto'; // Allow normal touch on button
    
    // Hover effects
    menuButton.addEventListener('mouseover', () => {
      menuButton.style.transform = 'scale(1.05)';
      menuButton.style.boxShadow = '0 0 10px #555555';
    });
    
    menuButton.addEventListener('mouseout', () => {
      menuButton.style.transform = 'scale(1)';
      menuButton.style.boxShadow = 'none';
    });
    
    // Prevent pointer lock
    menuButton.addEventListener('mousedown', (e) => e.stopPropagation());
    
    // Touch handling for menu button
    menuButton.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      menuButton.style.transform = 'scale(1.05)';
      menuButton.style.boxShadow = '0 0 10px #555555';
    }, { passive: false });
    
    menuButton.addEventListener('touchend', (e) => {
      e.stopPropagation();
      menuButton.style.transform = 'scale(1)';
      menuButton.style.boxShadow = 'none';
      
      // Remove game over screen
      document.body.removeChild(gameOverContainer);
      
      // Reset game state and show main menu
      this.showMainMenu();
    }, { passive: false });
    
    // Return to main menu when clicked
    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove game over screen
      document.body.removeChild(gameOverContainer);
      
      // Reset game state and show main menu
      this.showMainMenu();
    });
    
    // Add buttons to container
    buttonContainer.appendChild(restartButton);
    buttonContainer.appendChild(menuButton);
    
    // Add elements to game over container
    gameOverContainer.appendChild(title);
    gameOverContainer.appendChild(scoreDisplay);
    gameOverContainer.appendChild(buttonContainer);
    
    // Add to the document
    document.body.appendChild(gameOverContainer);
  }

  /**
   * Restart the game
   */
  restartGame() {
    console.log("Restarting game...");
    
    // Hide game over screen
    const gameOverMenu = document.getElementById('game-over-menu');
    if (gameOverMenu) {
      document.body.removeChild(gameOverMenu);
    }
    
    // Reset game state flags
    this.isGameOver = false;
    this.isGameStarted = true;
    this.isPaused = false;
    
    // Reset player if it exists
    if (this.controls) {
      // Reset player position
      if (typeof this.controls.resetPosition === 'function') {
        this.controls.resetPosition();
      }
      
      // Reset player health
      if (typeof this.controls.resetHealth === 'function') {
        this.controls.resetHealth();
      }
      
      // Reset player score
      if (typeof this.controls.resetScore === 'function') {
        this.controls.resetScore();
      }
      
      // Reset player weapons
      if (typeof this.controls.resetWeapons === 'function') {
        this.controls.resetWeapons();
      }
    }
    
    // Reset room state
    if (this.scene && this.scene.room) {
      // Reset windows
      if (typeof this.scene.room.resetWindows === 'function') {
        this.scene.room.resetWindows();
      }
      
      // Reset enemy manager completely to avoid any lingering state issues
      if (this.scene.room.enemyManager) {
        // First clear all existing enemies
        if (typeof this.scene.room.enemyManager.clearEnemies === 'function') {
          this.scene.room.enemyManager.clearEnemies();
        }
        
        // Disable spawning
        this.scene.room.enemyManager.toggleSpawning(false);
        
        // Recreate the enemy manager to fully reset its state
        const windows = this.scene.room.windows;
        this.scene.room.enemyManager = new EnemyManager(this.scene.instance, windows);
        
        // Initialize the new enemy manager
        this.scene.room.enemyManager.init();
        
        // Set the player reference for the new enemy manager
        if (this.controls) {
          this.scene.room.enemyManager.setPlayer(this.controls);
        }
        
        // Wait a moment, then enable spawning to start round 1
        setTimeout(() => {
          // Make sure we're still in an active game
          if (this.isGameStarted && !this.isGameOver) {
            this.scene.room.enemyManager.toggleSpawning(true);
          }
        }, 1500);
      }
      
      // Reset mystery box if it exists
      if (this.scene.room.mysteryBox && typeof this.scene.room.mysteryBox.reset === 'function') {
        this.scene.room.mysteryBox.reset();
      }
    }
    
    // Show mobile controls if needed
    this.showMobileControlsIfNeeded();
    
    // Re-enable controls
    if (this.controls) {
      this.controls.enabled = true;
    }
    
    // Lock pointer again
    setTimeout(() => {
      if (this.controls) {
        this.controls.lockPointer();
      }
    }, 100);
  }
  
  /**
   * Show the main menu
   */
  showMainMenu() {
    // Make sure we unlock the pointer
    if (this.controls) {
      this.controls.unlockPointer();
    }
    
    // Reset game state
    this.isGameStarted = false;
    this.isPaused = false;
    this.isGameOver = false;
    
    // Remove any existing UI
    const existingPause = document.getElementById('pause-menu');
    if (existingPause) {
      document.body.removeChild(existingPause);
    }
    
    const existingGameOver = document.getElementById('game-over-menu');
    if (existingGameOver) {
      document.body.removeChild(existingGameOver);
    }
    
    const existingMenu = document.getElementById('main-menu');
    if (existingMenu) {
      document.body.removeChild(existingMenu);
    }
    
    // Create main menu container
    const menuContainer = document.createElement('div');
    menuContainer.id = 'main-menu';
    menuContainer.className = 'main-menu';
    menuContainer.style.position = 'absolute';
    menuContainer.style.top = '0';
    menuContainer.style.left = '0';
    menuContainer.style.width = '100%';
    menuContainer.style.height = '100%';
    menuContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    menuContainer.style.display = 'flex';
    menuContainer.style.flexDirection = 'column';
    menuContainer.style.alignItems = 'center';
    menuContainer.style.justifyContent = 'center';
    menuContainer.style.zIndex = '2000';
    menuContainer.style.color = '#fff';
    menuContainer.style.fontFamily = 'monospace, "Press Start 2P", Courier, fantasy';
    menuContainer.style.touchAction = 'auto'; // Allow normal touch actions in menu
    
    // Prevent pointer lock when interacting with menu
    menuContainer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    
    menuContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Add touch event listeners to prevent game touches
    menuContainer.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: false });
    
    menuContainer.addEventListener('touchmove', (e) => {
      // Only prevent default if we're touching menu elements
      if (e.target.closest('button, h1, div, h2, #main-menu')) {
        e.preventDefault();
      }
      e.stopPropagation();
    }, { passive: false });
    
    menuContainer.addEventListener('touchend', (e) => {
      e.stopPropagation();
    }, { passive: false });
    
    // Game title
    const title = document.createElement('h1');
    title.textContent = 'RESIST MATRIX';
    title.style.color = '#00ff00';
    title.style.fontSize = '48px';
    title.style.textShadow = '0 0 10px #00ff00, 0 0 20px #00ff00';
    title.style.marginBottom = '20px';
    title.style.fontFamily = 'Impact, fantasy';
    title.style.letterSpacing = '2px';
    
    // Subtitle
    const subtitle = document.createElement('h2');
    subtitle.textContent = 'Multiplayer Zombie Survival';
    subtitle.style.color = '#cccccc';
    subtitle.style.fontSize = '20px';
    subtitle.style.marginBottom = '40px';
    
    // Buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '15px';
    buttonContainer.style.width = '300px';
    
    // Create Single player button
    const singlePlayerButton = document.createElement('button');
    singlePlayerButton.textContent = 'SINGLE PLAYER';
    singlePlayerButton.style.padding = '15px 20px';
    singlePlayerButton.style.fontSize = '18px';
    singlePlayerButton.style.backgroundColor = '#00aa00';
    singlePlayerButton.style.color = 'white';
    singlePlayerButton.style.border = 'none';
    singlePlayerButton.style.borderRadius = '5px';
    singlePlayerButton.style.cursor = 'pointer';
    singlePlayerButton.style.fontFamily = 'monospace, Courier';
    singlePlayerButton.style.fontWeight = 'bold';
    singlePlayerButton.style.transition = 'all 0.2s ease';
    singlePlayerButton.style.touchAction = 'auto'; // Allow normal touch on button
    
    // Hover effects
    singlePlayerButton.addEventListener('mouseover', () => {
      singlePlayerButton.style.transform = 'scale(1.05)';
      singlePlayerButton.style.boxShadow = '0 0 10px #00ff00';
    });
    
    singlePlayerButton.addEventListener('mouseout', () => {
      singlePlayerButton.style.transform = 'scale(1)';
      singlePlayerButton.style.boxShadow = 'none';
    });
    
    // Prevent pointer lock
    singlePlayerButton.addEventListener('mousedown', (e) => e.stopPropagation());
    
    // Touch handling for single player button
    singlePlayerButton.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      singlePlayerButton.style.transform = 'scale(1.05)';
      singlePlayerButton.style.boxShadow = '0 0 10px #00ff00';
    }, { passive: false });
    
    singlePlayerButton.addEventListener('touchend', (e) => {
      e.stopPropagation();
      singlePlayerButton.style.transform = 'scale(1)';
      singlePlayerButton.style.boxShadow = 'none';
      
      // Remove main menu
      document.body.removeChild(menuContainer);
      
      // Start single player game
      this.startSinglePlayerGame();
    }, { passive: false });
    
    // Start single player game when clicked
    singlePlayerButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove main menu
      document.body.removeChild(menuContainer);
      
      // Start single player game
      this.startSinglePlayerGame();
    });
    
    // Create Multiplayer button
    const multiplayerButton = document.createElement('button');
    multiplayerButton.textContent = 'MULTIPLAYER';
    multiplayerButton.style.padding = '15px 20px';
    multiplayerButton.style.fontSize = '18px';
    multiplayerButton.style.backgroundColor = '#0066cc';
    multiplayerButton.style.color = 'white';
    multiplayerButton.style.border = 'none';
    multiplayerButton.style.borderRadius = '5px';
    multiplayerButton.style.cursor = 'pointer';
    multiplayerButton.style.fontFamily = 'monospace, Courier';
    multiplayerButton.style.fontWeight = 'bold';
    multiplayerButton.style.transition = 'all 0.2s ease';
    multiplayerButton.style.touchAction = 'auto'; // Allow normal touch on button
    
    // Hover effects
    multiplayerButton.addEventListener('mouseover', () => {
      multiplayerButton.style.transform = 'scale(1.05)';
      multiplayerButton.style.boxShadow = '0 0 10px #0099ff';
    });
    
    multiplayerButton.addEventListener('mouseout', () => {
      multiplayerButton.style.transform = 'scale(1)';
      multiplayerButton.style.boxShadow = 'none';
    });
    
    // Prevent pointer lock
    multiplayerButton.addEventListener('mousedown', (e) => e.stopPropagation());
    
    // Touch handling for multiplayer button
    multiplayerButton.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      multiplayerButton.style.transform = 'scale(1.05)';
      multiplayerButton.style.boxShadow = '0 0 10px #0099ff';
    }, { passive: false });
    
    multiplayerButton.addEventListener('touchend', (e) => {
      e.stopPropagation();
      multiplayerButton.style.transform = 'scale(1)';
      multiplayerButton.style.boxShadow = 'none';
      
      // Remove main menu
      document.body.removeChild(menuContainer);
      
      // Show multiplayer options
      this.showMultiplayerOptions();
    }, { passive: false });
    
    // Show multiplayer options when clicked
    multiplayerButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove main menu
      document.body.removeChild(menuContainer);
      
      // Show multiplayer options
      this.showMultiplayerOptions();
    });
    
    // Add buttons to container
    buttonContainer.appendChild(singlePlayerButton);
    buttonContainer.appendChild(multiplayerButton);
    
    // Add elements to menu container
    menuContainer.appendChild(title);
    menuContainer.appendChild(subtitle);
    menuContainer.appendChild(buttonContainer);
    
    // Add to the document
    document.body.appendChild(menuContainer);
  }

  /**
   * Handle window resize
   */
  onWindowResize() {
    this.scene.camera.aspect = window.innerWidth / window.innerHeight;
    this.scene.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Handle key down events
   * @param {KeyboardEvent} event 
   */
  handleKeyDown(event) {
    // Only handle Escape if the game is active and not over
    if (event.code === 'Escape' && this.isGameStarted && !this.isGameOver) {
      // Prevent default behavior (which exits pointer lock)
      event.preventDefault();
      event.stopPropagation();
      
      // Toggle pause state
      this.togglePause();
    }
  }

  /**
   * Toggle game pause state
   */
  togglePause() {
    this.isPaused = !this.isPaused;
    
    if (this.isPaused) {
      this.pauseGame();
    } else {
      this.resumeGame();
    }
  }
  
  /**
   * Pause the game and show pause menu
   */
  pauseGame() {
    console.log("Game paused");
    
    // Unlock pointer
    this.unlockPointer();
    
    // Pause enemies
    if (this.scene.room && this.scene.room.enemyManager) {
      this.scene.room.enemyManager.setPaused(true);
    }
    
    // Show pause menu
    this.showPauseMenu();
  }
  
  /**
   * Resume game from pause state
   */
  resumeGame() {
    console.log("Game resumed");
    
    // Remove pause menu if it exists
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
      document.body.removeChild(pauseMenu);
    }
    
    // Unpause enemies and refresh player reference
    if (this.scene.room && this.scene.room.enemyManager) {
      const enemyManager = this.scene.room.enemyManager;
      
      // Reset player reference in enemy manager and all enemies
      if (this.controls) {
        enemyManager.setPlayer(this.controls);
        
        // Explicitly update player reference for all existing enemies
        enemyManager.enemies.forEach(enemy => {
          enemy.setPlayer(this.controls);
        });
      }
      
      // Unpause enemy manager
      enemyManager.setPaused(false);
    }
    
    // Show mobile controls if needed
    this.showMobileControlsIfNeeded();
    
    // Lock pointer immediately
    if (this.isGameStarted && !this.isPaused && !this.isGameOver) {
      // Force pointer lock
      this.lockPointer();
    }
  }
  
  /**
   * Show the pause menu
   */
  showPauseMenu() {
    // Create pause menu container
    const pauseContainer = document.createElement('div');
    pauseContainer.id = 'pause-menu';
    pauseContainer.className = 'pause-menu';
    pauseContainer.style.position = 'absolute';
    pauseContainer.style.top = '0';
    pauseContainer.style.left = '0';
    pauseContainer.style.width = '100%';
    pauseContainer.style.height = '100%';
    pauseContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    pauseContainer.style.display = 'flex';
    pauseContainer.style.flexDirection = 'column';
    pauseContainer.style.alignItems = 'center';
    pauseContainer.style.justifyContent = 'center';
    pauseContainer.style.zIndex = '2000';
    pauseContainer.style.color = '#fff';
    pauseContainer.style.fontFamily = 'monospace, "Press Start 2P", Courier, fantasy';
    pauseContainer.style.touchAction = 'auto'; // Allow normal touch actions in menu
    
    // Prevent pointer lock when interacting with menu
    pauseContainer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    pauseContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    // Add touch event listeners to prevent game touches
    pauseContainer.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: false });
    pauseContainer.addEventListener('touchmove', (e) => {
      // Only prevent default if we're touching menu elements
      if (e.target.closest('button, h1, #pause-menu')) {
        e.preventDefault();
      }
      e.stopPropagation();
    }, { passive: false });
    pauseContainer.addEventListener('touchend', (e) => {
      e.stopPropagation();
    }, { passive: false });
    
    // Pause title
    const title = document.createElement('h1');
    title.textContent = 'PAUSED';
    title.style.color = '#33aaff';
    title.style.fontSize = '48px';
    title.style.textShadow = '0 0 10px #33aaff, 0 0 20px #33aaff';
    title.style.marginBottom = '40px';
    title.style.fontFamily = 'Impact, fantasy';
    title.style.letterSpacing = '2px';
    
    // Buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '15px';
    buttonContainer.style.width = '300px';
    
    // Create resume button
    const resumeButton = document.createElement('button');
    resumeButton.textContent = 'RESUME GAME';
    resumeButton.style.padding = '15px 20px';
    resumeButton.style.fontSize = '18px';
    resumeButton.style.backgroundColor = '#33aaff';
    resumeButton.style.color = 'white';
    resumeButton.style.border = 'none';
    resumeButton.style.borderRadius = '5px';
    resumeButton.style.cursor = 'pointer';
    resumeButton.style.fontFamily = 'monospace, Courier';
    resumeButton.style.fontWeight = 'bold';
    resumeButton.style.transition = 'all 0.2s ease';
    resumeButton.style.touchAction = 'auto'; // Allow normal touch on button
    
    // Hover effects
    resumeButton.addEventListener('mouseover', () => {
      resumeButton.style.transform = 'scale(1.05)';
      resumeButton.style.boxShadow = '0 0 10px #33aaff';
    });
    
    resumeButton.addEventListener('mouseout', () => {
      resumeButton.style.transform = 'scale(1)';
      resumeButton.style.boxShadow = 'none';
    });
    
    // Prevent pointer lock
    resumeButton.addEventListener('mousedown', (e) => e.stopPropagation());
    
    // Touch handling for button
    resumeButton.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      resumeButton.style.transform = 'scale(1.05)';
      resumeButton.style.boxShadow = '0 0 10px #33aaff';
    }, { passive: false });
    
    resumeButton.addEventListener('touchend', (e) => {
      e.stopPropagation();
      resumeButton.style.transform = 'scale(1)';
      resumeButton.style.boxShadow = 'none';
      this.togglePause();
    }, { passive: false });
    
    // Resume game when clicked
    resumeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.togglePause();
    });
    
    // Create main menu button
    const menuButton = document.createElement('button');
    menuButton.textContent = 'MAIN MENU';
    menuButton.style.padding = '15px 20px';
    menuButton.style.fontSize = '18px';
    menuButton.style.backgroundColor = '#333333';
    menuButton.style.color = '#dddddd';
    menuButton.style.border = 'none';
    menuButton.style.borderRadius = '5px';
    menuButton.style.cursor = 'pointer';
    menuButton.style.fontFamily = 'monospace, Courier';
    menuButton.style.fontWeight = 'bold';
    menuButton.style.transition = 'all 0.2s ease';
    menuButton.style.touchAction = 'auto'; // Allow normal touch on button
    
    // Hover effects
    menuButton.addEventListener('mouseover', () => {
      menuButton.style.transform = 'scale(1.05)';
      menuButton.style.boxShadow = '0 0 10px #555555';
    });
    
    menuButton.addEventListener('mouseout', () => {
      menuButton.style.transform = 'scale(1)';
      menuButton.style.boxShadow = 'none';
    });
    
    // Prevent pointer lock
    menuButton.addEventListener('mousedown', (e) => e.stopPropagation());
    
    // Touch handling for button
    menuButton.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      menuButton.style.transform = 'scale(1.05)';
      menuButton.style.boxShadow = '0 0 10px #555555';
    }, { passive: false });
    
    menuButton.addEventListener('touchend', (e) => {
      e.stopPropagation();
      menuButton.style.transform = 'scale(1)';
      menuButton.style.boxShadow = 'none';
      
      // Remove pause menu
      document.body.removeChild(pauseContainer);
      
      // Reset pause state
      this.isPaused = false;
      
      // Reset game state and show main menu
      this.showMainMenu();
    }, { passive: false });
    
    // Return to main menu when clicked
    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove pause menu
      document.body.removeChild(pauseContainer);
      
      // Reset pause state
      this.isPaused = false;
      
      // Reset game state and show main menu
      this.showMainMenu();
    });
    
    // Add buttons to container
    buttonContainer.appendChild(resumeButton);
    buttonContainer.appendChild(menuButton);
    
    // Add elements to pause container
    pauseContainer.appendChild(title);
    pauseContainer.appendChild(buttonContainer);
    
    // Add to the document
    document.body.appendChild(pauseContainer);
  }

  /**
   * Lock pointer for camera control
   */
  lockPointer() {
    // Skip pointer locking if using mobile controls
    if (this.isMobileDevice() && this.mobileControls && this.mobileControls.isActive) {
      return;
    }
    
    if (this.controls && typeof this.controls.lockPointer === 'function') {
      this.controls.lockPointer();
    } else {
      const element = document.body;
      if (element.requestPointerLock) {
        element.requestPointerLock();
      } else if (element.mozRequestPointerLock) {
        element.mozRequestPointerLock();
      } else if (element.webkitRequestPointerLock) {
        element.webkitRequestPointerLock();
      }
    }
  }

  /**
   * Unlock the pointer, used when displaying menus
   */
  unlockPointer() {
    // Hide mobile controls when showing menus
    this.hideMobileControls();
    
    if (this.controls && typeof this.controls.unlockPointer === 'function') {
      this.controls.unlockPointer();
    } else if (document.exitPointerLock) {
      document.exitPointerLock();
    } else if (document.mozExitPointerLock) {
      document.mozExitPointerLock();
    } else if (document.webkitExitPointerLock) {
      document.webkitExitPointerLock();
    }
  }

  /**
   * Start a single player game
   */
  startSinglePlayerGame() {
    // Reset game state
    this.isGameStarted = true;
    this.isPaused = false;
    this.isGameOver = false;
    this.isMultiplayer = false;
    
    // Reset any existing network connections
    if (this.networkManager) {
      this.networkManager.disconnect();
    }
    
    // Reset player if it exists
    if (this.controls) {
      // Re-enable controls
      this.controls.enabled = true;
      
      // Reset player position
      this.controls.resetPosition();
      
      // Reset other player state if methods exist
      if (typeof this.controls.resetHealth === 'function') {
        this.controls.resetHealth();
      }
      
      if (typeof this.controls.resetScore === 'function') {
        this.controls.resetScore();
      }
      
      if (typeof this.controls.resetWeapons === 'function') {
        this.controls.resetWeapons();
      }
    }
    
    // Reset the scene if it exists
    if (this.scene && this.scene.room) {
      // Reset enemy manager
      if (this.scene.room.enemyManager) {
        // First clear all existing enemies
        if (typeof this.scene.room.enemyManager.clearEnemies === 'function') {
          this.scene.room.enemyManager.clearEnemies();
        }
        
        // Enable spawning
        this.scene.room.enemyManager.toggleSpawning(true);
      }
    }
    
    // Lock pointer to game
    if (this.controls) {
      this.controls.lockPointer();
    }
    
    // Show mobile controls if on mobile
    if (this.mobileControls && this.mobileControls.isMobile) {
      this.mobileControls.showControls();
    }
  }
  
  /**
   * Show multiplayer options
   */
  showMultiplayerOptions() {
    // Create multiplayer options container
    const multiplayerContainer = document.createElement('div');
    multiplayerContainer.id = 'multiplayer-menu';
    multiplayerContainer.className = 'multiplayer-menu';
    multiplayerContainer.style.position = 'absolute';
    multiplayerContainer.style.top = '0';
    multiplayerContainer.style.left = '0';
    multiplayerContainer.style.width = '100%';
    multiplayerContainer.style.height = '100%';
    multiplayerContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    multiplayerContainer.style.display = 'flex';
    multiplayerContainer.style.flexDirection = 'column';
    multiplayerContainer.style.alignItems = 'center';
    multiplayerContainer.style.justifyContent = 'center';
    multiplayerContainer.style.zIndex = '2000';
    multiplayerContainer.style.color = '#fff';
    multiplayerContainer.style.fontFamily = 'monospace, "Press Start 2P", Courier, fantasy';
    multiplayerContainer.style.touchAction = 'auto'; // Allow normal touch actions in menu
    
    // Prevent pointer lock when interacting with menu
    multiplayerContainer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    
    multiplayerContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Add touch event listeners to prevent game touches
    multiplayerContainer.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: false });
    
    multiplayerContainer.addEventListener('touchmove', (e) => {
      // Only prevent default if we're touching menu elements
      if (e.target.closest('button, h1, div, h2, input, #multiplayer-menu')) {
        e.preventDefault();
      }
      e.stopPropagation();
    }, { passive: false });
    
    multiplayerContainer.addEventListener('touchend', (e) => {
      e.stopPropagation();
    }, { passive: false });
    
    // Title
    const title = document.createElement('h1');
    title.textContent = 'MULTIPLAYER OPTIONS';
    title.style.color = '#0099ff';
    title.style.fontSize = '32px';
    title.style.textShadow = '0 0 10px #0099ff, 0 0 20px #0099ff';
    title.style.marginBottom = '30px';
    title.style.fontFamily = 'Impact, fantasy';
    title.style.letterSpacing = '2px';
    
    // Options container
    const optionsContainer = document.createElement('div');
    optionsContainer.style.display = 'flex';
    optionsContainer.style.flexDirection = 'column';
    optionsContainer.style.gap = '20px';
    optionsContainer.style.width = '350px';
    optionsContainer.style.marginBottom = '30px';
    
    // Host game option
    const hostGameButton = document.createElement('button');
    hostGameButton.textContent = 'HOST NEW GAME';
    hostGameButton.style.padding = '15px 20px';
    hostGameButton.style.fontSize = '18px';
    hostGameButton.style.backgroundColor = '#0066cc';
    hostGameButton.style.color = 'white';
    hostGameButton.style.border = 'none';
    hostGameButton.style.borderRadius = '5px';
    hostGameButton.style.cursor = 'pointer';
    hostGameButton.style.fontFamily = 'monospace, Courier';
    hostGameButton.style.fontWeight = 'bold';
    hostGameButton.style.transition = 'all 0.2s ease';
    hostGameButton.style.touchAction = 'auto'; // Allow normal touch on button
    
    // Hover effects
    hostGameButton.addEventListener('mouseover', () => {
      hostGameButton.style.transform = 'scale(1.05)';
      hostGameButton.style.boxShadow = '0 0 10px #0099ff';
    });
    
    hostGameButton.addEventListener('mouseout', () => {
      hostGameButton.style.transform = 'scale(1)';
      hostGameButton.style.boxShadow = 'none';
    });
    
    // Prevent pointer lock
    hostGameButton.addEventListener('mousedown', (e) => e.stopPropagation());
    
    // Touch handling for host game button
    hostGameButton.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      hostGameButton.style.transform = 'scale(1.05)';
      hostGameButton.style.boxShadow = '0 0 10px #0099ff';
    }, { passive: false });
    
    hostGameButton.addEventListener('touchend', (e) => {
      e.stopPropagation();
      hostGameButton.style.transform = 'scale(1)';
      hostGameButton.style.boxShadow = 'none';
      
      // Remove multiplayer options
      document.body.removeChild(multiplayerContainer);
      
      // Host a new game
      this.startHostGame();
    }, { passive: false });
    
    // Host a new game when clicked
    hostGameButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove multiplayer options
      document.body.removeChild(multiplayerContainer);
      
      // Host a new game
      this.startHostGame();
    });
    
    // Join game container
    const joinGameContainer = document.createElement('div');
    joinGameContainer.style.display = 'flex';
    joinGameContainer.style.flexDirection = 'column';
    joinGameContainer.style.gap = '10px';
    
    // Join game label
    const joinGameLabel = document.createElement('label');
    joinGameLabel.textContent = 'Enter Game ID to Join:';
    joinGameLabel.style.fontSize = '16px';
    joinGameLabel.style.color = '#dddddd';
    
    // Join game input
    const joinGameInput = document.createElement('input');
    joinGameInput.type = 'text';
    joinGameInput.placeholder = 'Game ID';
    joinGameInput.style.padding = '10px';
    joinGameInput.style.fontSize = '16px';
    joinGameInput.style.backgroundColor = '#222222';
    joinGameInput.style.color = '#ffffff';
    joinGameInput.style.border = '1px solid #0099ff';
    joinGameInput.style.borderRadius = '5px';
    joinGameInput.style.fontFamily = 'monospace, Courier';
    joinGameInput.style.touchAction = 'auto'; // Allow normal touch on input
    
    // Prevent pointer lock
    joinGameInput.addEventListener('mousedown', (e) => e.stopPropagation());
    joinGameInput.addEventListener('click', (e) => e.stopPropagation());
    
    // Join game button
    const joinGameButton = document.createElement('button');
    joinGameButton.textContent = 'JOIN GAME';
    joinGameButton.style.padding = '15px 20px';
    joinGameButton.style.fontSize = '18px';
    joinGameButton.style.backgroundColor = '#0066cc';
    joinGameButton.style.color = 'white';
    joinGameButton.style.border = 'none';
    joinGameButton.style.borderRadius = '5px';
    joinGameButton.style.cursor = 'pointer';
    joinGameButton.style.fontFamily = 'monospace, Courier';
    joinGameButton.style.fontWeight = 'bold';
    joinGameButton.style.transition = 'all 0.2s ease';
    joinGameButton.style.marginTop = '10px';
    joinGameButton.style.touchAction = 'auto'; // Allow normal touch on button
    
    // Hover effects
    joinGameButton.addEventListener('mouseover', () => {
      joinGameButton.style.transform = 'scale(1.05)';
      joinGameButton.style.boxShadow = '0 0 10px #0099ff';
    });
    
    joinGameButton.addEventListener('mouseout', () => {
      joinGameButton.style.transform = 'scale(1)';
      joinGameButton.style.boxShadow = 'none';
    });
    
    // Prevent pointer lock
    joinGameButton.addEventListener('mousedown', (e) => e.stopPropagation());
    
    // Touch handling for join game button
    joinGameButton.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      joinGameButton.style.transform = 'scale(1.05)';
      joinGameButton.style.boxShadow = '0 0 10px #0099ff';
    }, { passive: false });
    
    joinGameButton.addEventListener('touchend', (e) => {
      e.stopPropagation();
      joinGameButton.style.transform = 'scale(1)';
      joinGameButton.style.boxShadow = 'none';
      
      const gameId = joinGameInput.value.trim();
      if (gameId) {
        // Remove multiplayer options
        document.body.removeChild(multiplayerContainer);
        
        // Join the game
        this.joinGame(gameId);
      } else {
        // Show error for empty game ID
        joinGameInput.style.border = '2px solid #ff3333';
        setTimeout(() => {
          joinGameInput.style.border = '1px solid #0099ff';
        }, 2000);
      }
    }, { passive: false });
    
    // Join game when clicked
    joinGameButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      const gameId = joinGameInput.value.trim();
      if (gameId) {
        // Remove multiplayer options
        document.body.removeChild(multiplayerContainer);
        
        // Join the game
        this.joinGame(gameId);
      } else {
        // Show error for empty game ID
        joinGameInput.style.border = '2px solid #ff3333';
        setTimeout(() => {
          joinGameInput.style.border = '1px solid #0099ff';
        }, 2000);
      }
    });
    
    // Add elements to join game container
    joinGameContainer.appendChild(joinGameLabel);
    joinGameContainer.appendChild(joinGameInput);
    joinGameContainer.appendChild(joinGameButton);
    
    // Back button
    const backButton = document.createElement('button');
    backButton.textContent = 'BACK TO MAIN MENU';
    backButton.style.padding = '10px 15px';
    backButton.style.fontSize = '16px';
    backButton.style.backgroundColor = '#333333';
    backButton.style.color = '#dddddd';
    backButton.style.border = 'none';
    backButton.style.borderRadius = '5px';
    backButton.style.cursor = 'pointer';
    backButton.style.fontFamily = 'monospace, Courier';
    backButton.style.transition = 'all 0.2s ease';
    backButton.style.marginTop = '30px';
    backButton.style.touchAction = 'auto'; // Allow normal touch on button
    
    // Hover effects
    backButton.addEventListener('mouseover', () => {
      backButton.style.transform = 'scale(1.05)';
      backButton.style.backgroundColor = '#444444';
    });
    
    backButton.addEventListener('mouseout', () => {
      backButton.style.transform = 'scale(1)';
      backButton.style.backgroundColor = '#333333';
    });
    
    // Prevent pointer lock
    backButton.addEventListener('mousedown', (e) => e.stopPropagation());
    
    // Touch handling for back button
    backButton.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      backButton.style.transform = 'scale(1.05)';
      backButton.style.backgroundColor = '#444444';
    }, { passive: false });
    
    backButton.addEventListener('touchend', (e) => {
      e.stopPropagation();
      backButton.style.transform = 'scale(1)';
      backButton.style.backgroundColor = '#333333';
      
      // Remove multiplayer options
      document.body.removeChild(multiplayerContainer);
      
      // Show main menu
      this.showMainMenu();
    }, { passive: false });
    
    // Return to main menu when clicked
    backButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove multiplayer options
      document.body.removeChild(multiplayerContainer);
      
      // Show main menu
      this.showMainMenu();
    });
    
    // Add elements to options container
    optionsContainer.appendChild(hostGameButton);
    optionsContainer.appendChild(joinGameContainer);
    
    // Add elements to multiplayer container
    multiplayerContainer.appendChild(title);
    multiplayerContainer.appendChild(optionsContainer);
    multiplayerContainer.appendChild(backButton);
    
    // Add to the document
    document.body.appendChild(multiplayerContainer);
  }
} 