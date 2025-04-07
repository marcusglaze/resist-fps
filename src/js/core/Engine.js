import * as THREE from 'three';
import { Scene } from './Scene';
import { Renderer } from './Renderer';
import { PlayerControls } from '../controls/PlayerControls';
import { StartMenu } from './StartMenu';
import { EnemyManager } from '../objects/EnemyManager';
import { NetworkManager } from '../network/NetworkManager.js';
import { SoundManager } from './SoundManager.js';

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
    
    // Create sound manager
    this.soundManager = new SoundManager(this);
    
    // Animation timing variables
    this.then = performance.now();
    this.delta = 0;
    
    // Performance optimization for mobile
    this.lastFrameTime = 0;
    this.targetFPS = 60;
    this.targetFrameTime = 1000 / this.targetFPS;
    this.isMobileOptimized = this.isMobileDevice();
    this.frameCount = 0;
    this.lastFPSUpdate = 0;
    this.currentFPS = 0;
    
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
        // Import MobileControls dynamically to avoid issues on desktop
        import('../controls/MobileControls.js').then(module => {
          const MobileControls = module.MobileControls;
          this.mobileControls = new MobileControls(this.controls);
          // Store reference to game engine in mobile controls
          this.mobileControls.gameEngine = this;
          console.log("Mobile controls initialized");
        }).catch(error => {
          console.error("Failed to load mobile controls:", error);
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
      
      // Add window close handler to ensure clean disconnection
      window.addEventListener('beforeunload', () => {
        console.log("Window closing, ensuring clean network disconnection");
        if (this.networkManager) {
          this.networkManager.disconnect();
        }
      });
      
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
      
      // Set difficulty multipliers based on selected level and device type
      const isMobile = this.isMobileDevice();
      
      // Base difficulty multipliers
      let baseHealthMultiplier = 1.0;
      let baseSpeedMultiplier = 1.0;
      let baseSpawnRateMultiplier = 1.0;
      
      // Set base multipliers according to difficulty setting
      switch(this.difficulty) {
        case 'very_easy': // Extremely forgiving for beginners
          baseHealthMultiplier = 0.4;  // Zombies have 40% health
          baseSpeedMultiplier = 0.5;   // Zombies move at 50% speed
          baseSpawnRateMultiplier = 0.4; // 40% spawn rate
          break;
        case 'easy':
          baseHealthMultiplier = 0.5;  // Further reduced from 0.6
          baseSpeedMultiplier = 0.6;   // Further reduced from 0.7
          baseSpawnRateMultiplier = 0.5; // Further reduced from 0.6
          break;
        case 'normal':
          baseHealthMultiplier = 0.7;  // Further reduced from 0.8
          baseSpeedMultiplier = 0.75;  // Further reduced from 0.85
          baseSpawnRateMultiplier = 0.7; // Further reduced from 0.8
          break;
        case 'hard':
          baseHealthMultiplier = 0.9;  // Further reduced from 1.1
          baseSpeedMultiplier = 0.9;   // Further reduced from 1.0
          baseSpawnRateMultiplier = 0.9; // Further reduced from 1.1
          break;
        case 'nightmare':
          baseHealthMultiplier = 1.2;  // Further reduced from 1.5
          baseSpeedMultiplier = 1.1;   // Further reduced from 1.3
          baseSpawnRateMultiplier = 1.2; // Further reduced from 1.4
          break;
      }
      
      // Additional reduction for mobile devices
      if (isMobile) {
        // Mobile devices get an additional 20% reduction to compensate for touch controls
        baseHealthMultiplier *= 0.8;
        baseSpeedMultiplier *= 0.7;  // Larger speed reduction for mobile (30%)
        baseSpawnRateMultiplier *= 0.7; // 30% fewer zombies on mobile
        
        console.log("Applied mobile difficulty reduction");
      }
      
      // Apply the final multipliers
      enemyManager.healthMultiplier = baseHealthMultiplier;
      enemyManager.speedMultiplier = baseSpeedMultiplier;
      enemyManager.spawnRateMultiplier = baseSpawnRateMultiplier;
      
      // Save base values for later reference
      enemyManager.baseMaxEnemies = isMobile ? 3 : 5; // Reduced from 5/7 to make game more manageable
      
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
  animate(timestamp) {
    requestAnimationFrame(this.animate);
    
    // Frame limiting for better performance on mobile
    if (this.isMobileOptimized) {
      // Skip frames to maintain target FPS
      const elapsed = timestamp - this.lastFrameTime;
      if (elapsed < this.targetFrameTime * 0.98) {
        return; // Skip this frame
      }
      
      // Update FPS counter every second
      this.frameCount++;
      if (timestamp - this.lastFPSUpdate > 1000) {
        this.currentFPS = Math.round((this.frameCount * 1000) / (timestamp - this.lastFPSUpdate));
        this.lastFPSUpdate = timestamp;
        this.frameCount = 0;
        
        // Adjust target FPS based on performance
        if (this.currentFPS < 30 && this.targetFPS > 30) {
          // Lower target FPS if device is struggling
          console.log("Lowering target FPS for better performance");
          this.targetFPS = 30;
          this.targetFrameTime = 1000 / this.targetFPS;
        }
      }
      
      this.lastFrameTime = timestamp;
    }
    
    // Calculate time delta for consistent animations
    const now = performance.now();
    this.delta = (now - this.then) / 1000;
    
    // Clamp delta to avoid huge jumps after tab switching or significant lag
    this.delta = Math.min(this.delta, 0.1);
    
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
    
    // Log network settings for debugging
    if (this.networkManager) {
      console.log("Network settings when starting game:", {
        gameMode: this.networkManager.gameMode,
        isMultiplayer: this.networkManager.isMultiplayer,
        isHost: this.networkManager.isHost,
        isConnected: this.networkManager.isConnected
      });
    } else {
      console.log("No network manager available when starting game");
    }
    
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
    
    // Initialize sound manager if needed
    if (this.soundManager && !this.soundManager.initialized) {
      this.soundManager.init();
    }
    
    // Set game as active
    this.isGameStarted = true;
    this.isPaused = false;
    
    // Check if we're in a network hosting mode
    const isNetworkHosting = this.networkManager && 
                             this.networkManager.isHost && 
                             this.networkManager.isMultiplayer;
    
    console.log("Game started. Network hosting mode:", isNetworkHosting);
    
    // Set up enemies only if we're not in network hosting mode or explicitly told to start
    if (this.scene.room && this.scene.room.enemyManager) {
      // Initialize the enemy manager if not already initialized
      if (typeof this.scene.room.enemyManager.init === 'function') {
        this.scene.room.enemyManager.init();
      }
      
      // Use the same approach as restartGame to ensure consistent round numbering
      setTimeout(() => {
        // Make sure we're still in an active game
        if (this.isGameStarted && !this.isGameOver) {
          // Enable spawning instead of directly starting the next round
          // This ensures the game always starts at round 1
          this.scene.room.enemyManager.toggleSpawning(true);
        }
      }, 5000);
    }
    
    // Lock the pointer if we're not on mobile
    if (!this.isMobileDevice()) {
      // Add a small delay to ensure any dialogs have been processed
      setTimeout(() => {
        if (this.isGameStarted && !this.isGameOver && !this.isPaused) {
          console.log("Locking pointer after game start");
          this.lockPointer();
        }
      }, 100);
    }
    
    // Show mobile controls if needed
    this.showMobileControlsIfNeeded();
  }

  /**
   * Show mobile controls if we're on a mobile device and in-game
   */
  showMobileControlsIfNeeded() {
    if (this.isMobileDevice() && this.isGameStarted && !this.isPaused && !this.isGameOver) {
      if (this.mobileControls) {
        console.log("Showing mobile controls");
        this.mobileControls.show();
      } else {
        console.log("Mobile controls not yet initialized, setting up...");
        // If we're mobile but controls aren't initialized yet, try to initialize them
        import('../controls/MobileControls.js').then(module => {
          const MobileControls = module.MobileControls;
          this.mobileControls = new MobileControls(this.controls);
          this.mobileControls.gameEngine = this;
          // Show controls immediately
          this.mobileControls.show();
          console.log("Mobile controls initialized and shown");
        }).catch(error => {
          console.error("Failed to load mobile controls:", error);
        });
      }
    }
  }

  /**
   * Hide mobile controls
   */
  hideMobileControls() {
    if (this.mobileControls) {
      console.log("Hiding mobile controls");
      this.mobileControls.hide();
    }
  }
  
  /**
   * Toggle mobile controls (show/hide)
   */
  toggleMobileControls() {
    if (!this.isMobileDevice()) return;
    
    if (this.mobileControls) {
      if (this.mobileControls.isActive) {
        this.hideMobileControls();
      } else {
        this.mobileControls.show();
      }
    } else {
      // Initialize if not available
      this.showMobileControlsIfNeeded();
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
    
    // In multiplayer mode, check if there are living remote players before pausing enemies
    let shouldPauseEnemies = true;
    
    if (this.networkManager && this.networkManager.isMultiplayer) {
      // Check if any remote players are still alive
      let hasLivingRemotePlayers = false;
      this.networkManager.remotePlayers.forEach(player => {
        if (!player.isDead) {
          hasLivingRemotePlayers = true;
        }
      });
      
      // Only pause enemies if all players are dead
      if (hasLivingRemotePlayers) {
        console.log("Not pausing enemies because there are still living remote players");
        shouldPauseEnemies = false;
        
        // Make sure enemies are definitely UNPAUSED if there are remote players still alive
        if (this.scene && this.scene.room && this.scene.room.enemyManager) {
          if (this.scene.room.enemyManager.isPaused) {
            console.log("Explicitly unpausing enemies because there are still living remote players");
            this.scene.room.enemyManager.setPaused(false);
          }
        }
      }
    }
    
    // Pause all enemies if needed
    if (shouldPauseEnemies && this.scene && this.scene.room && this.scene.room.enemyManager) {
      console.log("Pausing all enemies - no living players remaining");
      this.scene.room.enemyManager.setPaused(true);
    }
    
    // Check if we're in multiplayer mode
    if (this.networkManager && this.networkManager.isMultiplayer) {
      this.handleMultiplayerGameOver();
    } else {
      // Single player - show regular game over screen
      this.showGameOverScreen();
    }
  }
  
  /**
   * Handle multiplayer game over scenarios
   */
  handleMultiplayerGameOver() {
    if (!this.networkManager) return;
    
    // Disable any existing spectator mode if active
    if (this.isSpectatorMode) {
      this.disableSpectatorMode();
    }
    
    // If we're the host, check if all players are dead
    if (this.networkManager.isHost) {
      const allPlayersDead = this.checkAllPlayersDead();
      
      // Log the result of our check with clear visibility
      console.log(`HOST GAME OVER CHECK: All players dead status: ${allPlayersDead}`);
      
      // If all players are dead, show game over with host controls
      if (allPlayersDead) {
        console.log("Host: All players are dead, showing game over screen");
        this.showMultiplayerHostGameOverScreen();
        
        // Force an immediate game state update to clients to ensure they know all players are dead
        if (this.networkManager.network && this.networkManager.network.broadcastGameState) {
          console.log("Host: Broadcasting final game state with allPlayersDead=true");
          this.networkManager.network.broadcastGameState(true);
        }
      } else {
        // Not all players dead - show spectate screen
        console.log("Host: Not all players dead, showing spectate screen");
        this.showMultiplayerSpectateScreen();
        
        // Set a timer to periodically check if all players become dead while in spectator mode
        if (!this._gameOverCheckInterval) {
          this._gameOverCheckInterval = setInterval(() => {
            // Skip if we're no longer in spectator mode or game is already fully over
            if (!this.isSpectatorMode || !this.isGameOver) {
              clearInterval(this._gameOverCheckInterval);
              this._gameOverCheckInterval = null;
              return;
            }
            
            // Check again if all players are now dead
            const nowAllDead = this.checkAllPlayersDead();
            if (nowAllDead) {
              console.log("Host: All players are now dead (delayed check), showing game over screen");
              // Clear the interval
              clearInterval(this._gameOverCheckInterval);
              this._gameOverCheckInterval = null;
              
              // Switch to game over screen
              this.disableSpectatorMode();
              this.showMultiplayerHostGameOverScreen();
              
              // Force an immediate game state update to clients
              if (this.networkManager.network && this.networkManager.network.broadcastGameState) {
                this.networkManager.network.broadcastGameState(true);
              }
            }
          }, 1000); // Check every second
        }
      }
    } else {
      // For clients, check if all players are dead according to latest game state
      const gameState = this.networkManager.network.getGameState();
      const allPlayersDead = gameState.gameStatus?.allPlayersDead || false;
      
      // Log what we received from the host
      console.log(`CLIENT GAME OVER CHECK: Received allPlayersDead=${allPlayersDead} from host`);
      
      // Add a fallback check - if our local player is dead and the host player is dead
      const localPlayerDead = this.controls && this.controls.isDead;
      const hostPlayerDead = this.networkManager.getHostPlayerState()?.isDead || false;
      const otherPlayersAlive = this.networkManager.isAnyRemotePlayerAlive();
      
      console.log(`CLIENT GAME OVER CHECK: Local dead=${localPlayerDead}, Host dead=${hostPlayerDead}, Other players alive=${otherPlayersAlive}`);
      
      // We can force allPlayersDead=true if: our player is dead AND host is dead AND no other remote players are alive
      const forcedAllPlayersDead = localPlayerDead && hostPlayerDead && !otherPlayersAlive;
      if (forcedAllPlayersDead && !allPlayersDead) {
        console.log("CLIENT GAME OVER CHECK: Forcing all players dead state since all checks indicate no one is alive");
      }
      
      if (allPlayersDead || forcedAllPlayersDead) {
        // All players are dead, show game over screen
        console.log("Client: All players dead, waiting for host to restart");
        this.networkManager.showMultiplayerGameOverScreen(true);
      } else {
        // Not all players dead - show spectate screen
        console.log("Client: Not all players dead, showing spectate screen");
        this.showMultiplayerSpectateScreen();
        
        // Set a timer to periodically check if all players become dead while in spectator mode
        if (!this._gameOverCheckInterval) {
          this._gameOverCheckInterval = setInterval(() => {
            // Skip if we're no longer in spectator mode or game is already showing game over
            if (!this.isSpectatorMode || document.getElementById('game-over-menu')) {
              clearInterval(this._gameOverCheckInterval);
              this._gameOverCheckInterval = null;
              return;
            }
            
            // Recheck if all players are now dead
            const localDead = this.controls && this.controls.isDead;
            const hostDead = this.networkManager.getHostPlayerState()?.isDead || false;
            const otherAlive = this.networkManager.isAnyRemotePlayerAlive();
            const nowAllDead = localDead && hostDead && !otherAlive;
            
            if (nowAllDead) {
              console.log("Client: All players are now dead (delayed check), showing game over screen");
              // Clear the interval
              clearInterval(this._gameOverCheckInterval);
              this._gameOverCheckInterval = null;
              
              // Switch to game over screen
              this.disableSpectatorMode();
              this.networkManager.showMultiplayerGameOverScreen(true);
            }
          }, 1000); // Check every second
        }
      }
    }
  }
  
  /**
   * Check if all players in the game are dead
   * @returns {boolean} True if all players are dead
   */
  checkAllPlayersDead() {
    if (!this.networkManager) return true;
    
    // First check if local player is alive
    const localPlayerDead = this.controls && this.controls.isDead;
    
    if (!localPlayerDead) {
      console.log("Local player is still alive");
      return false; // Local player is still alive, not all players are dead
    }
    
    console.log("Local player is dead, checking remote players");
    
    // Then check remote players
    let anyPlayersAlive = false;
    
    this.networkManager.remotePlayers.forEach(player => {
      if (!player.isDead) {
        anyPlayersAlive = true;
        console.log(`Remote player is still alive`);
      }
    });
    
    const allDead = !anyPlayersAlive;
    console.log(`All players dead check result: ${allDead}`);
    return allDead;
  }
  
  /**
   * Show the multiplayer host game over screen with host controls
   */
  showMultiplayerHostGameOverScreen() {
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
    
    // Game over title
    const title = document.createElement('h1');
    title.textContent = 'ALL PLAYERS DEAD';
    title.style.color = '#ff3333';
    title.style.fontSize = '48px';
    title.style.textShadow = '0 0 10px #ff3333, 0 0 20px #ff3333';
    title.style.marginBottom = '30px';
    title.style.fontFamily = 'Impact, fantasy';
    title.style.letterSpacing = '2px';
    
    // Host message
    const hostMessage = document.createElement('h2');
    hostMessage.textContent = 'You are the host';
    hostMessage.style.color = '#fcba03';
    hostMessage.style.fontSize = '24px';
    hostMessage.style.marginBottom = '40px';
    
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
    
    // Restart game when clicked
    restartButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove game over screen
      document.body.removeChild(gameOverContainer);
      
      // Tell all connected players to restart
      if (this.networkManager) {
        this.networkManager.hostRestartGame();
      }
      
      // Reset game state properly
      this.restartGame();
    });
    
    // Create main menu button
    const menuButton = document.createElement('button');
    menuButton.textContent = 'END SESSION & RETURN TO MENU';
    menuButton.style.padding = '15px 20px';
    menuButton.style.fontSize = '18px';
    menuButton.style.backgroundColor = '#e74c3c';
    menuButton.style.color = 'white';
    menuButton.style.border = 'none';
    menuButton.style.borderRadius = '5px';
    menuButton.style.cursor = 'pointer';
    menuButton.style.fontFamily = 'monospace, Courier';
    menuButton.style.fontWeight = 'bold';
    menuButton.style.transition = 'all 0.2s ease';
    
    // Hover effects
    menuButton.addEventListener('mouseover', () => {
      menuButton.style.transform = 'scale(1.05)';
      menuButton.style.boxShadow = '0 0 10px #e74c3c';
    });
    
    menuButton.addEventListener('mouseout', () => {
      menuButton.style.transform = 'scale(1)';
      menuButton.style.boxShadow = 'none';
    });
    
    // Return to main menu when clicked
    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove game over screen
      document.body.removeChild(gameOverContainer);
      
      // Disconnect all players
      if (this.networkManager) {
        this.networkManager.disconnect();
      }
      
      // Use our comprehensive reset method
      this.resetGameState();
      
      // Show the start menu
      if (this.startMenu) {
        this.startMenu.show();
      } else {
        // Fallback to the custom main menu
        this.showMainMenu();
      }
    });
    
    // Add buttons to container
    buttonContainer.appendChild(restartButton);
    buttonContainer.appendChild(menuButton);
    
    // Add elements to game over container
    gameOverContainer.appendChild(title);
    gameOverContainer.appendChild(hostMessage);
    gameOverContainer.appendChild(buttonContainer);
    
    // Add to the document
    document.body.appendChild(gameOverContainer);
  }
  
  /**
   * Show the spectate screen when the host is dead but other players are still alive
   */
  showMultiplayerSpectateScreen() {
    // Create spectate container - use a smaller overlay instead of full screen
    const spectateContainer = document.createElement('div');
    spectateContainer.id = 'spectate-overlay'; // Use a different ID
    spectateContainer.className = 'spectate-overlay';
    spectateContainer.style.position = 'absolute';
    spectateContainer.style.top = '0';
    spectateContainer.style.left = '0';
    spectateContainer.style.width = '100%';
    spectateContainer.style.pointerEvents = 'none'; // Allow clicking through
    spectateContainer.style.display = 'flex';
    spectateContainer.style.flexDirection = 'column';
    spectateContainer.style.alignItems = 'center';
    spectateContainer.style.zIndex = '1000'; // Lower than game over menu
    spectateContainer.style.color = '#fff';
    spectateContainer.style.fontFamily = 'monospace, "Press Start 2P", Courier, fantasy';
    
    // Create header container for spectator mode info
    const headerContainer = document.createElement('div');
    headerContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    headerContainer.style.width = '100%';
    headerContainer.style.padding = '10px 0';
    headerContainer.style.textAlign = 'center';
    headerContainer.style.pointerEvents = 'auto'; // Make this clickable
    
    // Title
    const title = document.createElement('h2');
    title.textContent = 'SPECTATOR MODE';
    title.style.color = '#ff3333';
    title.style.fontSize = '24px';
    title.style.margin = '0';
    title.style.fontFamily = 'Impact, fantasy';
    title.style.letterSpacing = '2px';
    
    // Message
    const message = document.createElement('p');
    message.textContent = 'You died. Watching surviving player...';
    message.style.color = '#ffffff';
    message.style.fontSize = '14px';
    message.style.margin = '5px 0 0 0';
    
    // Add spectator info to header
    headerContainer.appendChild(title);
    headerContainer.appendChild(message);
    
    // Create footer container for buttons
    const footerContainer = document.createElement('div');
    footerContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    footerContainer.style.width = '100%';
    footerContainer.style.padding = '10px 0';
    footerContainer.style.marginTop = 'auto'; // Push to bottom
    footerContainer.style.textAlign = 'center';
    footerContainer.style.pointerEvents = 'auto'; // Make this clickable
    
    // Host message
    const hostMessage = document.createElement('p');
    hostMessage.textContent = 'You will respawn when the round ends if any player survives.';
    hostMessage.style.color = '#ffffff';
    hostMessage.style.fontSize = '14px';
    hostMessage.style.margin = '0 0 10px 0';
    
    // End session button
    const endSessionButton = document.createElement('button');
    endSessionButton.textContent = 'LEAVE SESSION';
    endSessionButton.style.padding = '8px 15px';
    endSessionButton.style.fontSize = '14px';
    endSessionButton.style.backgroundColor = '#e74c3c';
    endSessionButton.style.color = 'white';
    endSessionButton.style.border = 'none';
    endSessionButton.style.borderRadius = '3px';
    endSessionButton.style.cursor = 'pointer';
    endSessionButton.style.fontFamily = 'monospace, Courier';
    endSessionButton.style.fontWeight = 'bold';
    
    // Handle click for end session button
    endSessionButton.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Properly disconnect from multiplayer
      if (this.networkManager) {
        this.networkManager.disconnect();
      }
      
      // Use our comprehensive reset method
      this.resetGameState();
      
      // Show the start menu
      if (this.startMenu) {
        this.startMenu.show();
      } else {
        // Fallback to the custom main menu
        this.showMainMenu();
      }
      
      // Remove spectate overlay
      document.body.removeChild(spectateContainer);
    });
    
    // Add elements to footer
    footerContainer.appendChild(hostMessage);
    footerContainer.appendChild(endSessionButton);
    
    // Add header and footer to container
    spectateContainer.appendChild(headerContainer);
    spectateContainer.appendChild(footerContainer);
    
    // Add to the document
    document.body.appendChild(spectateContainer);
    
    // IMPORTANT: Make sure enemies are not paused when in spectator mode
    if (this.scene && this.scene.room && this.scene.room.enemyManager) {
      console.log("Explicitly unpausing enemies for spectator mode");
      this.scene.room.enemyManager.setPaused(false);
    }
    
    // Enable spectator camera to follow surviving players
    this.enableSpectatorMode();
  }
  
  /**
   * Enable spectator mode to follow surviving players
   */
  enableSpectatorMode() {
    if (!this.networkManager) return;
    
    // Flag that we're in spectator mode
    this.isSpectatorMode = true;
    
    // Find a surviving player to spectate
    let targetPlayerId = null;
    let targetPlayer = null;
    
    this.networkManager.remotePlayers.forEach((player, id) => {
      if (!player.isDead) {
        targetPlayerId = id;
        targetPlayer = player;
      }
    });
    
    if (!targetPlayerId || !targetPlayer) {
      console.warn("No surviving players to spectate");
      return;
    }
    
    console.log(`Spectating player: ${targetPlayerId}`);
    
    // Hide local player hands/weapons
    if (this.controls && this.controls.modelContainer) {
      this.controls.modelContainer.visible = false;
    }
    
    // Hide UI elements that shouldn't be visible in spectator mode
    this.hidePlayerUI();
    
    // Ensure enemies are not paused while spectating
    if (this.scene && this.scene.room && this.scene.room.enemyManager) {
      // Double-check that enemies are not paused
      if (this.scene.room.enemyManager.isPaused) {
        console.log("Found enemies paused during spectator mode - unpausing");
        this.scene.room.enemyManager.setPaused(false);
      }
    }
    
    // Set up an interval to update the spectator camera position
    this.spectatorInterval = setInterval(() => {
      // Check if we should still be in spectator mode
      if (!this.isSpectatorMode || !this.networkManager) {
        this.disableSpectatorMode();
        return;
      }
      
      // Update spectated player if needed (e.g. if current one died)
      if (targetPlayer.isDead) {
        // Find a new player to spectate
        let foundNewTarget = false;
        this.networkManager.remotePlayers.forEach((player, id) => {
          if (!player.isDead) {
            targetPlayerId = id;
            targetPlayer = player;
            foundNewTarget = true;
            console.log(`Switching spectator view to player: ${targetPlayerId}`);
          }
        });
        
        if (!foundNewTarget) {
          // No more players to spectate, all dead
          console.log("All players are now dead");
          this.disableSpectatorMode();
          return;
        }
      }
      
      // Update camera position to match the spectated player's position
      if (this.controls && this.controls.camera && targetPlayer.position) {
        // Position camera at player position
        this.controls.camera.position.set(
          targetPlayer.position.x,
          targetPlayer.position.y,
          targetPlayer.position.z
        );
        
        // Set camera rotation to match player's looking direction
        if (targetPlayer.position.rotationY !== undefined) {
          this.controls.camera.rotation.y = targetPlayer.position.rotationY;
        }
      }
      
      // Periodically check if enemies are still unpaused (every 2 seconds)
      if (this.scene && this.scene.room && this.scene.room.enemyManager && 
          Math.random() < 0.04) { // ~4% chance per frame (roughly every 2-3 seconds)
        if (this.scene.room.enemyManager.isPaused) {
          console.log("Enemies became paused during spectator mode - unpausing");
          this.scene.room.enemyManager.setPaused(false);
        }
      }
    }, 50); // Update 20 times per second
  }
  
  /**
   * Disable spectator mode
   */
  disableSpectatorMode() {
    // Clear the spectator interval
    if (this.spectatorInterval) {
      clearInterval(this.spectatorInterval);
      this.spectatorInterval = null;
    }
    
    // Reset the flag
    this.isSpectatorMode = false;
    
    // Show local player hands/weapons again
    if (this.controls && this.controls.modelContainer) {
      this.controls.modelContainer.visible = true;
    }
    
    // Show UI elements that were hidden
    this.showPlayerUI();
    
    // Remove the spectator overlay if it exists
    const spectateOverlay = document.getElementById('spectate-overlay');
    if (spectateOverlay) {
      document.body.removeChild(spectateOverlay);
    }
  }
  
  /**
   * Hide UI elements that shouldn't be visible in spectator mode
   */
  hidePlayerUI() {
    // Hide crosshair
    const crosshair = document.querySelector('.crosshair');
    if (crosshair) crosshair.style.display = 'none';
    
    // Hide ammo display
    const ammoDisplay = document.querySelector('.ammo-display');
    if (ammoDisplay) ammoDisplay.style.display = 'none';
    
    // Hide health display
    const healthDisplay = document.querySelector('.health-display');
    if (healthDisplay) healthDisplay.style.display = 'none';
    
    // You could hide other UI elements as needed
  }
  
  /**
   * Show UI elements that were hidden in spectator mode
   */
  showPlayerUI() {
    // Show crosshair
    const crosshair = document.querySelector('.crosshair');
    if (crosshair) crosshair.style.display = '';
    
    // Show ammo display
    const ammoDisplay = document.querySelector('.ammo-display');
    if (ammoDisplay) ammoDisplay.style.display = '';
    
    // Show health display
    const healthDisplay = document.querySelector('.health-display');
    if (healthDisplay) healthDisplay.style.display = '';
    
    // Restore other UI elements as needed
  }
  
  /**
   * Check for end-of-round conditions in multiplayer
   */
  checkMultiplayerRoundEnd() {
    if (!this.networkManager || !this.networkManager.isHost) return;
    
    // Check if round is no longer active and there are dead players
    if (this.scene.room && 
        this.scene.room.enemyManager && 
        !this.scene.room.enemyManager.roundActive) {
      // Round has ended, check if we need to respawn any players
      this.networkManager.checkPlayersForRespawn();
      
      // Disable spectator mode for all players when they respawn
      if (this.isSpectatorMode && !this.controls.isDead) {
        this.disableSpectatorMode();
      }
    }
  }
  
  /**
   * Update the game
   * @param {number} deltaTime - Time elapsed since last update
   */
  update(deltaTime) {
    // Skip if game is not started
    if (!this.isGameStarted) return;
    
    // Skip if game is paused
    if (this.isPaused) return;
    
    // Update UI manager
    if (this.uiManager) {
      this.uiManager.update(deltaTime);
    }
    
    // Update controls if available
    if (this.controls) {
      this.controls.update(deltaTime);
    }
    
    // Update weapon manager
    if (this.weaponManager) {
      this.weaponManager.update(deltaTime);
    }
    
    // Update scene
    if (this.scene) {
      this.scene.update(deltaTime);
    }
    
    // Update physics world
    if (this.physicsWorld) {
      this.physicsWorld.step(deltaTime);
    }
    
    // Update renderer
    this.render();
    
    // Check for multiplayer round end conditions
    if (this.networkManager && this.networkManager.isMultiplayer && 
        this.networkManager.isHost && !this.isGameOver) {
      this.checkMultiplayerRoundEnd();
    }
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
      
      // Remove game over screen
      document.body.removeChild(gameOverContainer);
      
      // Use our comprehensive reset method
      this.resetGameState();
      
      // Show the start menu
      if (this.startMenu) {
        this.startMenu.show();
      } else {
        // Fallback to the custom main menu
        this.showMainMenu();
      }
    }, { passive: false });
    
    // Return to main menu when clicked
    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove game over screen
      document.body.removeChild(gameOverContainer);
      
      // Use our comprehensive reset method
      this.resetGameState();
      
      // Show the start menu
      if (this.startMenu) {
        this.startMenu.show();
      } else {
        // Fallback to the custom main menu
        this.showMainMenu();
      }
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
    
    // Disable spectator mode if active
    if (this.isSpectatorMode) {
      this.disableSpectatorMode();
    }
    
    // Hide game over screen
    const gameOverMenu = document.getElementById('game-over-menu');
    if (gameOverMenu) {
      document.body.removeChild(gameOverMenu);
    }
    
    // Remove spectate overlay if it exists
    const spectateOverlay = document.getElementById('spectate-overlay');
    if (spectateOverlay) {
      document.body.removeChild(spectateOverlay);
    }
    
    // Remove pause menu if it exists
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
      document.body.removeChild(pauseMenu);
    }
    
    // Reset game state flags
    this.isGameOver = false;
    this.isGameStarted = true;
    this.isPaused = false;
    
    // Reset player if it exists
    if (this.controls) {
      console.log("Resetting player state and controls");
      
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
      
      // Explicitly enable the controls to ensure player can move
      this.controls.enabled = true;
      console.log("Player controls enabled:", this.controls.enabled);
      
      // Ensure player UI is visible
      this.showPlayerUI();
      
      // Make sure player model is visible
      if (this.controls.modelContainer) {
        this.controls.modelContainer.visible = true;
      }
    }
    
    // Reset enemies if in a room
    if (this.scene && this.scene.room && this.scene.room.enemyManager) {
      console.log("Resetting enemy manager state");
      
      // Clear any existing enemies
      this.scene.room.enemyManager.despawnAllEnemies();
      
      // Reset the round counter
      this.scene.room.enemyManager.currentRound = 0;
      
      // Reset zombies remaining
      this.scene.room.enemyManager.zombiesRemaining = 0;
      
      // Unpause if paused
      this.scene.room.enemyManager.setPaused(false);
      
      // Start a new round
      this.scene.room.enemyManager.startNextRound();
    }
    
    // Re-lock pointer to regain control - with a small delay to ensure UI is cleared
    setTimeout(() => {
      if (this.isGameStarted && !this.isGameOver && !this.isPaused) {
        console.log("Locking pointer after game restart");
        
        // Force pointer lock to regain control
        if (this.controls) {
          console.log("Enabling controls and requesting pointer lock");
          this.controls.enabled = true;
          
          if (typeof this.controls.lockPointer === 'function') {
            console.log("Using controls.lockPointer()");
            this.controls.lockPointer();
          } else {
            console.log("Fallback to document.body.requestPointerLock()");
            document.body.requestPointerLock();
          }
        } else {
          console.log("No controls object found, using document.body.requestPointerLock()");
          document.body.requestPointerLock();
        }
      }
    }, 200); // Slightly longer delay to ensure everything is reset
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
    // Use Tab key for pause menu instead of Escape
    if (event.code === 'Tab' && this.isGameStarted && !this.isGameOver) {
      // Prevent default tab behavior (which would change focus)
      event.preventDefault();
      event.stopPropagation();
      
      // If not already paused, show the pause menu immediately
      if (!this.isPaused) {
        this.isPaused = true;
        
        // Show pause menu before anything else
        this.showPauseMenu();
        
        // Pause enemies
        if (this.scene && this.scene.room && this.scene.room.enemyManager) {
          this.scene.room.enemyManager.setPaused(true);
        }
        
        // Unlock pointer last
        this.unlockPointer();
      } else {
        // If already paused, resume
        this.isPaused = false;
        this.resumeGame();
      }
    }
  }

  /**
   * Toggle the game's pause state
   */
  togglePause() {
    if (this.isGameOver) return; // Don't toggle pause if game is over
    
    if (this.isPaused) {
      // Resuming the game
      if (this.networkManager && this.networkManager.isMultiplayer) {
        if (this.networkManager.isHost) {
          // As host, resume for everyone
          console.log("Host resuming game for all clients");
          this.networkManager.hostResumeGame();
          this.resumeGame();
        } else {
          // As client, can't resume - only host can
          console.log("Client cannot resume game, only host can resume");
          // Show a notification to the player
          this.showNotification("Only the host can resume the game");
          return; // Don't proceed with resuming
        }
      } else {
        // Single player - just resume
        this.resumeGame();
      }
    } else {
      // Pausing the game
      if (this.networkManager && this.networkManager.isMultiplayer) {
        if (this.networkManager.isHost) {
          // As host, pause for everyone
          console.log("Host pausing game for all clients");
          this.networkManager.hostPauseGame();
        } else {
          // As client, we can pause locally but need to notify host
          console.log("Client pausing game locally");
          // You could add a method to send pause request to host here if needed
        }
      }
      
      // Always show pause menu locally
      this.pauseGame();
    }
  }
  
  /**
   * Pause the game and show pause menu
   */
  pauseGame() {
    console.log("Game paused");
    
    // Create and show pause menu first
    this.showPauseMenu();
    
    // Pause enemies
    if (this.scene && this.scene.room && this.scene.room.enemyManager) {
      this.scene.room.enemyManager.setPaused(true);
    }
    
    // Pause all audio
    if (this.controls) {
      // Pause background music
      if (typeof this.controls.pauseBackgroundMusic === 'function') {
        this.controls.pauseBackgroundMusic();
      }
      
      // Pause all active sounds
      if (this.controls.activeAudio && Array.isArray(this.controls.activeAudio)) {
        this.controls.activeAudio.forEach(audio => {
          if (audio && !audio.paused) {
            audio.pause();
          }
        });
      }
      
      // Pause any audio in audio pools if they exist
      if (this.controls.audioPool) {
        Object.values(this.controls.audioPool).forEach(pool => {
          if (Array.isArray(pool)) {
            pool.forEach(item => {
              if (item && item.element && !item.element.paused) {
                item.element.pause();
              }
            });
          }
        });
      }
    }
    
    // Unlock pointer last (after menu is already shown)
    this.unlockPointer();
  }
  
  /**
   * Resume game from pause state
   */
  resumeGame() {
    console.log("Game resumed");
    
    // Ensure pause state is properly set
    this.isPaused = false;
    
    // Clear any pending pause-related UI
    const clientWaitingElements = document.querySelectorAll('.client-waiting-indicator');
    clientWaitingElements.forEach(element => {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    
    // Remove pause menu if it exists
    const pauseMenu = document.getElementById('pause-menu');
    if (pauseMenu) {
      console.log("Removing pause menu");
      document.body.removeChild(pauseMenu);
    }
    
    // Resume audio
    if (this.controls) {
      // Resume background music
      if (typeof this.controls.resumeBackgroundMusic === 'function') {
        this.controls.resumeBackgroundMusic();
      }
    }
    
    // Log multiplayer status for debugging
    if (this.networkManager && this.networkManager.isMultiplayer) {
      console.log(`Resuming game as ${this.networkManager.isHost ? 'host' : 'client'}`);
    }
    
    // Unpause enemies and refresh player reference
    if (this.scene && this.scene.room && this.scene.room.enemyManager) {
      const enemyManager = this.scene.room.enemyManager;
      console.log("Unpausing enemy manager");
      
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
    
    // Lock pointer immediately - only if game is actually active
    if (this.isGameStarted && !this.isPaused && !this.isGameOver) {
      console.log("Locking pointer after resuming");
      // Force pointer lock
      this.lockPointer();
    } else {
      console.log("Not locking pointer: game state not appropriate", {
        isGameStarted: this.isGameStarted,
        isPaused: this.isPaused,
        isGameOver: this.isGameOver
      });
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
    title.style.marginBottom = '20px';
    title.style.fontFamily = 'Impact, fantasy';
    title.style.letterSpacing = '2px';
    
    // Determine if we're a client in multiplayer mode
    const isClient = this.networkManager && this.networkManager.isMultiplayer && !this.networkManager.isHost;
    
    // Subtitle message
    const subtitle = document.createElement('div');
    if (isClient) {
      subtitle.textContent = 'Waiting for host to resume the game...';
      subtitle.style.color = '#fcba03'; // Gold color for important message
      subtitle.style.fontSize = '18px';
      subtitle.style.marginBottom = '30px';
      subtitle.style.textAlign = 'center';
      subtitle.style.maxWidth = '80%';
    } else {
      subtitle.textContent = 'Press TAB to resume';
      subtitle.style.color = '#cccccc';
      subtitle.style.fontSize = '16px';
      subtitle.style.marginBottom = '30px';
    }
    
    // Buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '15px';
    buttonContainer.style.width = '300px';
    
    // Add host ID copy section if we're hosting a multiplayer game
    if (this.networkManager && this.networkManager.isMultiplayer && this.networkManager.isHost) {
      const hostIdButton = this.networkManager.createHostIdCopyButton();
      if (hostIdButton) {
        buttonContainer.appendChild(hostIdButton);
      }
    }
    
    // Create resume button
    const resumeButton = document.createElement('button');
    resumeButton.textContent = isClient ? 'WAITING FOR HOST' : 'RESUME GAME';
    resumeButton.style.padding = '15px 20px';
    resumeButton.style.fontSize = '18px';
    resumeButton.style.backgroundColor = isClient ? '#888888' : '#33aaff';
    resumeButton.style.color = 'white';
    resumeButton.style.border = 'none';
    resumeButton.style.borderRadius = '5px';
    resumeButton.style.cursor = isClient ? 'default' : 'pointer';
    resumeButton.style.fontFamily = 'monospace, Courier';
    resumeButton.style.fontWeight = 'bold';
    resumeButton.style.transition = 'all 0.2s ease';
    resumeButton.style.touchAction = 'auto'; // Allow normal touch on button
    
    // Only add hover effects if not a client
    if (!isClient) {
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
    }
    
    // Create "Leave Game" button for multiplayer
    if (this.networkManager && this.networkManager.isMultiplayer) {
      const leaveButton = document.createElement('button');
      leaveButton.textContent = 'LEAVE MULTIPLAYER';
      leaveButton.style.padding = '15px 20px';
      leaveButton.style.fontSize = '18px';
      leaveButton.style.backgroundColor = '#e74c3c'; // Red color to indicate warning
      leaveButton.style.color = 'white';
      leaveButton.style.border = 'none';
      leaveButton.style.borderRadius = '5px';
      leaveButton.style.cursor = 'pointer';
      leaveButton.style.fontFamily = 'monospace, Courier';
      leaveButton.style.fontWeight = 'bold';
      leaveButton.style.transition = 'all 0.2s ease';
      
      // Hover effects
      leaveButton.addEventListener('mouseover', () => {
        leaveButton.style.transform = 'scale(1.05)';
        leaveButton.style.boxShadow = '0 0 10px #e74c3c';
      });
      
      leaveButton.addEventListener('mouseout', () => {
        leaveButton.style.transform = 'scale(1)';
        leaveButton.style.boxShadow = 'none';
      });
      
      // Prevent pointer lock
      leaveButton.addEventListener('mousedown', (e) => e.stopPropagation());
      
      // Touch handling for button
      leaveButton.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        leaveButton.style.transform = 'scale(1.05)';
        leaveButton.style.boxShadow = '0 0 10px #e74c3c';
      }, { passive: false });
      
      leaveButton.addEventListener('touchend', (e) => {
        e.stopPropagation();
        leaveButton.style.transform = 'scale(1)';
        leaveButton.style.boxShadow = 'none';
        
        // Remove pause menu
        document.body.removeChild(pauseContainer);
        
        // Properly disconnect from multiplayer
        if (this.networkManager) {
          console.log("Explicitly disconnecting from multiplayer session");
          this.networkManager.disconnect();
        }
        
        // Use our comprehensive reset method
        this.resetGameState();
        
        // Show the start menu
        if (this.startMenu) {
          this.startMenu.show();
        } else {
          // Fallback to the custom main menu
          this.showMainMenu();
        }
      }, { passive: false });
      
      // Return to main menu when clicked
      leaveButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Remove pause menu
        document.body.removeChild(pauseContainer);
        
        // Properly disconnect from multiplayer
        if (this.networkManager) {
          console.log("Explicitly disconnecting from multiplayer session");
          this.networkManager.disconnect();
        }
        
        // Use our comprehensive reset method
        this.resetGameState();
        
        // Show the start menu
        if (this.startMenu) {
          this.startMenu.show();
        } else {
          // Fallback to the custom main menu
          this.showMainMenu();
        }
      });
      
      // Add to buttonContainer
      buttonContainer.appendChild(leaveButton);
    }
    
    // Create main menu button - only show if not in multiplayer or if we're the host
    if (!this.networkManager || !this.networkManager.isMultiplayer || this.networkManager.isHost) {
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
        
        // Use our comprehensive reset method
        this.resetGameState();
        
        // Show the start menu
        if (this.startMenu) {
          this.startMenu.show();
        } else {
          // Fallback to the custom main menu
          this.showMainMenu();
        }
      }, { passive: false });
      
      // Return to main menu when clicked
      menuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // Remove pause menu
        document.body.removeChild(pauseContainer);
        
        // Use our comprehensive reset method
        this.resetGameState();
        
        // Show the start menu
        if (this.startMenu) {
          this.startMenu.show();
        } else {
          // Fallback to the custom main menu
          this.showMainMenu();
        }
      });
      
      // Add to buttonContainer
      buttonContainer.appendChild(menuButton);
    }
    
    // Add elements to pause container
    pauseContainer.appendChild(title);
    pauseContainer.appendChild(subtitle);
    pauseContainer.appendChild(buttonContainer);
    
    // Add to the document
    document.body.appendChild(pauseContainer);
  }

  /**
   * Lock pointer for camera control
   */
  lockPointer() {
    console.log("Engine lockPointer called");
    
    // Skip pointer locking if using mobile controls
    if (this.isMobileDevice() && this.mobileControls && this.mobileControls.isActive) {
      return;
    }
    
    // Ensure controls are enabled if they exist
    if (this.controls) {
      console.log("Ensuring controls are enabled");
      this.controls.enabled = true;
    }
    
    if (this.controls && typeof this.controls.lockPointer === 'function') {
      console.log("Using controls.lockPointer()");
      this.controls.lockPointer();
    } else {
      console.log("No controls.lockPointer method, using document.body.requestPointerLock");
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
    console.log("Starting single player game");
    
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
        
        // CRITICAL FIX: Explicitly unpause the enemy manager
        // This ensures enemies aren't frozen when coming from pause menu
        this.scene.room.enemyManager.setPaused(false);
        
        // Enable spawning
        this.scene.room.enemyManager.toggleSpawning(true);
      }
    }
    
    // Show control hints to the player
    this.showControlHints();
    
    // Lock pointer to game if not on mobile
    if (!this.isMobileDevice() && this.controls) {
      this.controls.lockPointer();
    }
    
    // Show mobile controls if on mobile - with a short delay to ensure initialization
    if (this.isMobileDevice()) {
      setTimeout(() => {
        console.log("Initializing mobile controls with delay");
        if (this.mobileControls) {
          console.log("Mobile controls found, showing");
          // Make sure the player controls have a reference to the mobile controls
          this.controls.mobileControls = this.mobileControls;
          this.mobileControls.show();
        } else {
          console.log("Mobile controls not yet initialized, creating with delay");
          // If we're mobile but controls aren't initialized yet, try to initialize them
          import('../controls/MobileControls.js').then(module => {
            const MobileControls = module.MobileControls;
            this.mobileControls = new MobileControls(this.controls);
            this.mobileControls.gameEngine = this;
            
            // Make sure the player controls have a reference to the mobile controls
            this.controls.mobileControls = this.mobileControls;
            
            // Show controls immediately
            this.mobileControls.show();
            
            console.log("Mobile controls initialized and shown for game after delay");
          }).catch(error => {
            console.error("Failed to load mobile controls for game:", error);
          });
        }
      }, 1000); // 1-second delay to ensure proper initialization
    }
  }
  
  /**
   * Show control hints to the player
   */
  showControlHints() {
    // Create a control hints container
    const hintsContainer = document.createElement('div');
    hintsContainer.id = 'control-hints';
    hintsContainer.style.position = 'absolute';
    hintsContainer.style.bottom = '20px';
    hintsContainer.style.left = '50%';
    hintsContainer.style.transform = 'translateX(-50%)';
    hintsContainer.style.color = 'white';
    hintsContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    hintsContainer.style.padding = '10px 20px';
    hintsContainer.style.borderRadius = '5px';
    hintsContainer.style.fontFamily = 'monospace, Courier';
    hintsContainer.style.fontSize = '14px';
    hintsContainer.style.textAlign = 'center';
    hintsContainer.style.zIndex = '1000';
    hintsContainer.style.pointerEvents = 'none'; // Don't interfere with mouse events
    
    // Set the hint text
    hintsContainer.textContent = 'Press TAB to pause/resume game';
    
    // Add to the document
    document.body.appendChild(hintsContainer);
    
    // Remove hint after 5 seconds
    setTimeout(() => {
      if (document.body.contains(hintsContainer)) {
        document.body.removeChild(hintsContainer);
      }
    }, 5000);
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

  /**
   * Reset all game state when returning to the menu
   */
  resetGameState() {
    console.log("Performing complete game state reset");
    
    // Reset game state flags
    this.isGameStarted = false;
    this.isPaused = false;
    this.isGameOver = false;
    
    // Reset player if it exists
    if (this.controls) {
      // Reset player position to starting position
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
      
      // Disable controls while in menu
      this.controls.enabled = false;
    }
    
    // Reset room and enemies
    if (this.scene && this.scene.room) {
      // Reset windows
      if (typeof this.scene.room.resetWindows === 'function') {
        this.scene.room.resetWindows();
      }
      
      // Reset enemy manager
      if (this.scene.room.enemyManager) {
        // Clear all existing enemies
        if (typeof this.scene.room.enemyManager.clearEnemies === 'function') {
          this.scene.room.enemyManager.clearEnemies();
        }
        
        // Explicitly unpause the enemy manager to ensure it doesn't stay paused
        // when starting a new game later
        this.scene.room.enemyManager.setPaused(false);
        
        // Disable enemy spawning
        this.scene.room.enemyManager.toggleSpawning(false);
        
        // Reset enemy manager round counter if possible
        if (typeof this.scene.room.enemyManager.resetRounds === 'function') {
          this.scene.room.enemyManager.resetRounds();
        } else {
          // Manually reset round properties if method doesn't exist
          this.scene.room.enemyManager.currentRound = 0;
          this.scene.room.enemyManager.zombiesRemaining = 0;
          this.scene.room.enemyManager.zombiesSpawned = 0;
          this.scene.room.enemyManager.roundActive = false;
        }
      }
      
      // Reset mystery box if it exists
      if (this.scene.room.mysteryBox && typeof this.scene.room.mysteryBox.reset === 'function') {
        this.scene.room.mysteryBox.reset();
      }
    }
  }

  /**
   * Show a notification message to the player
   * @param {string} message - The notification message
   * @param {number} duration - How long to show the message in ms
   */
  showNotification(message, duration = 3000) {
    // Remove any existing notification
    const existingNotification = document.getElementById('game-notification');
    if (existingNotification) {
      document.body.removeChild(existingNotification);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'game-notification';
    notification.style.position = 'absolute';
    notification.style.top = '100px';
    notification.style.left = '50%';
    notification.style.transform = 'translateX(-50%)';
    notification.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    notification.style.color = '#ffaa00';
    notification.style.padding = '12px 20px';
    notification.style.borderRadius = '5px';
    notification.style.fontSize = '16px';
    notification.style.fontFamily = 'monospace, Courier';
    notification.style.zIndex = '2100';
    notification.style.textAlign = 'center';
    notification.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
    notification.style.pointerEvents = 'none'; // Allow clicking through
    notification.textContent = message;
    
    // Add to document
    document.body.appendChild(notification);
    
    // Remove after duration
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, duration);
  }
} 