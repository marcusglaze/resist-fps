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
    if (this.isMobileDevice() && this.isGameStarted && !this.isPaused && this.mobileControls) {
      this.mobileControls.show();
    }
  }

  /**
   * Hide mobile controls
   */
  hideMobileControls() {
    if (this.mobileControls) {
      this.mobileControls.hide();
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
    
    // Prevent pointer lock when interacting with menu
    gameOverContainer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    gameOverContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
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
   * Show the main menu and reset the game state
   */
  showMainMenu() {
    console.log("Showing main menu");
    
    // Make sure to disconnect from any P2P network first
    if (this.networkManager) {
      console.log("Disconnecting from network before showing main menu");
      this.networkManager.disconnect();
    }
    
    // Reset game state flags
    this.isGameOver = false;
    this.isGameStarted = false;
    
    // If enemy manager exists, reset it completely
    if (this.scene && this.scene.room) {
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
      }
    }
    
    // Reset player if it exists
    if (this.controls) {
      // Disable controls
      this.controls.enabled = false;
      
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
    
    // Show the start menu if it exists
    if (this.startMenu) {
      this.startMenu.show();
    } else {
      // If for some reason the start menu doesn't exist, create a new one
      this.startMenu = new StartMenu(this);
      this.startMenu.init((settings) => {
        this.applySettings(settings);
        this.startGame();
      }, this);
    }
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
    if (event.code === 'Escape' && this.isGameStarted && !this.isGameOver) {
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
    
    // Unpause enemies
    if (this.scene.room && this.scene.room.enemyManager) {
      this.scene.room.enemyManager.setPaused(false);
    }
    
    // Show mobile controls if needed
    this.showMobileControlsIfNeeded();
    
    // Lock pointer again after a short delay
    setTimeout(() => {
      if (this.isGameStarted && !this.isPaused && !this.isGameOver) {
        this.controls.lockPointer();
      }
    }, 100);
  }
  
  /**
   * Show the pause menu
   */
  showPauseMenu() {
    // Create pause menu container
    const pauseContainer = document.createElement('div');
    pauseContainer.id = 'pause-menu';
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
    
    // Prevent pointer lock when interacting with menu
    pauseContainer.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    pauseContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
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
} 