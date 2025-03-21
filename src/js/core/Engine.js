import * as THREE from 'three';
import { Scene } from './Scene';
import { Renderer } from './Renderer';
import { PlayerControls } from '../controls/PlayerControls';

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
    
    // Start the animation loop
    this.animate = this.animate.bind(this);
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
      
      // Initialize controls after setting dimensions
      this.controls.init();
      
      // Add renderer to DOM
      const container = document.getElementById('container');
      if (container) {
        container.appendChild(this.renderer.domElement);
      } else {
        console.error("Container element not found, falling back to body");
        document.body.appendChild(this.renderer.domElement);
      }
      
      // Create game UI
      this.createGameUI();
      
      // Add window resize handler
      window.addEventListener('resize', this.onWindowResize.bind(this), false);
      
      // Start animation loop
      this.animate();
      
      console.log("Engine init completed successfully");
    } catch (error) {
      console.error("Error during engine initialization:", error);
      alert("Error initializing game engine. Check console for details.");
    }
  }

  /**
   * Create game UI elements
   */
  createGameUI() {
    // Create start button
    const startButton = document.createElement('button');
    startButton.id = 'start-game';
    startButton.textContent = 'Start Zombie Attack';
    startButton.style.position = 'absolute';
    startButton.style.top = '50%';
    startButton.style.left = '50%';
    startButton.style.transform = 'translate(-50%, -50%)';
    startButton.style.padding = '15px 30px';
    startButton.style.fontSize = '24px';
    startButton.style.backgroundColor = '#4CAF50';
    startButton.style.color = 'white';
    startButton.style.border = 'none';
    startButton.style.borderRadius = '5px';
    startButton.style.cursor = 'pointer';
    
    // Add start button click handler
    startButton.addEventListener('click', () => {
      this.startGame();
      startButton.style.display = 'none';
    });
    
    // Add button to DOM
    document.body.appendChild(startButton);
    
    // Hide any instructions
    const instructionsEl = document.querySelector('.info');
    if (instructionsEl) {
      instructionsEl.style.display = 'none';
    }
  }

  /**
   * Start the game, enabling enemies
   */
  startGame() {
    this.isGameStarted = true;
    
    console.log("Starting game...");
    
    // Unlock audio system when game starts (user interaction)
    if (this.controls && typeof this.controls.unlockAudio === 'function') {
      console.log("Unlocking audio system...");
      this.controls.unlockAudio();
    }
    
    // Explicitly start background music after a short delay
    setTimeout(() => {
      if (this.controls && typeof this.controls.playBackgroundMusic === 'function') {
        console.log("Explicitly starting background music from Engine...");
        this.controls.playBackgroundMusic();
      }
    }, 1500);
    
    // Start the round-based system in the enemy manager
    if (this.scene.room.enemyManager) {
      console.log("Enabling enemy spawning...");
      this.scene.room.enemyManager.toggleSpawning(true);
      
      // Double-check that round 1 has started after a short delay
      setTimeout(() => {
        const enemyManager = this.scene.room.enemyManager;
        if (enemyManager.currentRound === 0 || (enemyManager.currentRound === 1 && !enemyManager.roundActive)) {
          console.log("Fallback: Force starting round 1");
          
          // Reset and restart round 1
          enemyManager.currentRound = 0;
          enemyManager.roundActive = false;
          enemyManager.zombiesRemaining = 0;
          enemyManager.startNextRound();
        }
      }, 2000);
    } else {
      console.error("Enemy manager not found");
    }
    
    // Lock pointer automatically
    this.controls.lockPointer();
  }

  /**
   * Animation loop
   */
  animate() {
    requestAnimationFrame(this.animate);
    
    const delta = this.clock.getDelta();
    
    // Always render the scene even if game is over
    // so player can see the death screen
    this.renderer.render(this.scene);
    
    // Check if player is dead or game is over
    if (this.isGameOver) {
      // Don't update game logic when game is over
      return;
    }
    
    // Update controls
    this.controls.update(delta);
    
    // Update scene (for flickering lights in Doom mode)
    this.scene.update(delta);
    
    // Update room logic (enemies, windows, etc)
    this.scene.room.update(delta);
  }

  /**
   * End the game (called when player dies)
   */
  endGame() {
    console.log("Game over!");
    this.isGameOver = true;
    
    // Pause all enemies
    if (this.scene.room && this.scene.room.enemyManager) {
      this.scene.room.enemyManager.setPaused(true);
    }
    
    // Make sure we keep rendering for the death screen
    // but game updates are stopped by the check in animate()
  }

  /**
   * Handle window resize
   */
  onWindowResize() {
    this.scene.camera.aspect = window.innerWidth / window.innerHeight;
    this.scene.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
} 