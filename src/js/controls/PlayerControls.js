import * as THREE from 'three';
import { Raycaster } from 'three';
import { Weapon, WeaponTypes } from '../weapons/Weapon';
import { MobileControls } from './MobileControls';

/**
 * First-person controls with WASD movement and mouse look
 */
export class PlayerControls {
  constructor(camera, domElement) {
    console.log("Initializing PlayerControls");
    
    // Store camera reference for first person view
    this.camera = camera;
    
    // Store dom element for pointer lock
    this.domElement = domElement;
    
    // Initialize input keys object
    this.keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      f: false,
      r: false
    };
    console.log("Input keys object initialized:", this.keys);
    
    // Audio elements for weapon sounds and other effects
    this.audioElements = {
      pistolShoot: null,
      shotgunShoot: null,
      machineGunShoot: null,
      pistolReload: null,
      shotgunReload: null,
      machineGunReload: null,
      playerWalk: null,
      windowBoardAdd: null,
      windowBoardBreaking: null,
      backgroundMusic: null,
      playerDamage: null,
      zombieSound1: null,
      zombieSound2: null,
      zombieSound3: null,
      zombieSound4: null,
      zombieSound5: null
    };
    this.audioContext = null;
    
    // Movement properties
    this.moveSpeed = 5.0;
    this.movementEnabled = true;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.running = false;
    this.runMultiplier = 1.5; // Sprint multiplier
    this.stamina = 100;
    this.maxStamina = 100;
    this.staminaRegenRate = 20; // Stamina regeneration per second
    this.staminaDecayRate = 30; // Stamina decay per second when running
    
    // Movement vectors
    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    
    // Player size and room dimensions for collision
    this.height = 1.7; // Eye level
    this.playerRadius = 0.5; // Width of player
    this.roomWidth = 10; // Same as room size
    this.roomDepth = 10; // Same as room size
    this.wallThickness = 0.1; // Same as wall thickness
    
    // Shooting properties
    this.raycaster = new THREE.Raycaster();
    this.shooting = false;
    this.shootingCooldown = 0.5; // seconds between shots
    this.lastShootTime = 0;
    
    // Weapon system
    this.weapons = [];
    this.currentWeaponIndex = 0;
    this.activeWeapon = null;
    this.isReloading = false;
    
    // FPS view models
    this.weaponViewModel = null;
    this.handsModel = null;
    this.modelContainer = null;
    
    // Audio system
    this.audioContext = null;
    this.audioUnlocked = false;
    this.isWalkSoundPlaying = false;
    
    // Interaction properties
    this.isInteracting = false;
    this.isLocked = false;
    this.isDead = false;
    this.nearbyWallBuy = null;
    
    // Mouse movement
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseSensitivity = 0.002;
    
    // Health
    this.health = 100;
    this.maxHealth = 100;
    this.healthAccumulator = 0; // For tracking fractional health regeneration
    this.dead = false;
    this.healthRegenRate = 5; // Health regeneration per second
    this.healthRegenDelay = 5; // Seconds to wait before regenerating health
    this.lastDamageTime = 0;
    this.regenEffectActive = false; // To prevent multiple regen effects
    this.regenerationRate = 5; // health points per second
    this.regenerationDelay = 3; // seconds before health starts regenerating
    this.isRegenerating = false;
    
    // Score system
    this.score = 0;
    this.scoreDisplay = null;
    this.lastKillTime = 0;
    
    // Scene reference
    this.scene = null;
    
    // Bind methods to this instance
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseClick = this.onMouseClick.bind(this);
    this.lockPointer = this.lockPointer.bind(this);
    this.onPointerlockChange = this.onPointerlockChange.bind(this);
    this.onMouseWheel = this.onMouseWheel.bind(this);
    
    // Mobile controls
    this.mobileControls = new MobileControls(this);
    
    // Initialize
    this.init();
  }

  /**
   * Initialize controls
   */
  init() {
    // Add event listeners
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('click', this.lockPointer);
    document.addEventListener('mousedown', this.onMouseClick);
    document.addEventListener('mouseup', this.onMouseClick);
    document.addEventListener('pointerlockchange', this.onPointerlockChange);
    document.addEventListener('wheel', this.onMouseWheel);
    
    // Initial camera orientation
    this.camera.rotation.order = 'YXZ'; // Yaw (Y), Pitch (X), Roll (Z)
    
    // Create crosshair UI
    this.createCrosshair();
    
    // Create health display UI
    this.createHealthDisplay();
    
    // Create score display UI
    this.createScoreDisplay();
    
    // Create ammo display UI
    this.createAmmoDisplay();
    
    // Create model container for hands and weapon
    this.createModelContainer();
    
    // Create default weapon (pistol)
    this.initializeDefaultWeapon();
    
    // Initialize audio elements for weapon sounds
    this.initializeAudio();
    
    // Try to play background music immediately (may not work until user interaction)
    setTimeout(() => this.playBackgroundMusic(), 1000);
  }

  /**
   * Initialize audio elements for weapon sounds
   */
  initializeAudio() {
    // Check if mobile first for audio context configuration
    const isMobile = this.isMobileDevice();
    const audioContextOptions = isMobile 
      ? { sampleRate: 22050 } // Lower sample rate on mobile
      : {}; // Default options on desktop
    
    // Create audio context with appropriate options
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass(audioContextOptions);
      console.log(`AudioContext created with sample rate: ${this.audioContext.sampleRate}Hz`);
    } catch (e) {
      console.warn('Web Audio API not supported in this browser', e);
      this.audioContext = null;
    }
    
    // Mobile-specific audio settings
    this.mobileAudioSettings = {
      disableBackgroundMusic: isMobile, // Turn off background music on mobile
      disableContinuousSounds: isMobile, // Turn off continuous sounds like walking
      maxConcurrentSounds: isMobile ? 2 : 6, // Limit concurrent sounds more on mobile
      prioritizeWeaponSounds: true // Always keep weapon sounds for gameplay
    };
    
    console.log("Mobile audio settings:", this.mobileAudioSettings);
    
    // Audio pooling and limitations for mobile optimization
    this.maxConcurrentAudio = isMobile ? 2 : 3; // Limit concurrent sounds on mobile
    this.activeAudio = [];
    this.audioPool = {
      pistolShoot: [],
      shotgunShoot: [],
      machineGunShoot: [],
      zombieSound: []
    };
    
    // Create audio elements for weapon sounds
    this.audioElements.pistolShoot = new Audio('/audio/pistol-shooting.wav');
    this.audioElements.shotgunShoot = new Audio('/audio/shotgun-shooting.wav');
    this.audioElements.machineGunShoot = new Audio('/audio/machine-gun-shooting.wav');
    this.audioElements.pistolReload = new Audio('/audio/pistol-reload.wav');
    this.audioElements.shotgunReload = new Audio('/audio/shotgun-reload.wav');
    this.audioElements.machineGunReload = new Audio('/audio/machine-gun-reload.wav');
    this.audioElements.playerWalk = new Audio('/audio/player-walk.wav');
    this.audioElements.windowBoardAdd = new Audio('/audio/window-board-add.wav');
    this.audioElements.windowBoardBreaking = new Audio('/audio/window-board-breaking.wav');
    this.audioElements.playerDamage = new Audio('/audio/player-damage.wav');
    
    // Add zombie sounds
    this.audioElements.zombieSound1 = new Audio('/audio/zombie-1.wav');
    this.audioElements.zombieSound2 = new Audio('/audio/zombie-2.wav');
    this.audioElements.zombieSound3 = new Audio('/audio/zombie-3.wav');
    this.audioElements.zombieSound4 = new Audio('/audio/zombie-4.wav');
    this.audioElements.zombieSound5 = new Audio('/audio/zombie-5.wav');
    
    // Add background music
    this.audioElements.backgroundMusic = new Audio('/audio/game-music.wav');
    
    // Create audio pools for common sounds
    this.createAudioPool('pistolShoot', '/audio/pistol-shooting.wav', 2);
    this.createAudioPool('shotgunShoot', '/audio/shotgun-shooting.wav', 2);
    this.createAudioPool('machineGunShoot', '/audio/machine-gun-shooting.wav', 1);
    this.createAudioPool('zombieSound', '/audio/zombie-1.wav', 3);
    
    // Configure audio elements
    Object.values(this.audioElements).forEach(audio => {
      if (audio) {
        audio.preload = 'auto';
        audio.volume = 0.7; // Set default volume
      }
    });
    
    // Set specific volume for pistol shooting (lowered by 40%)
    if (this.audioElements.pistolShoot) {
      this.audioElements.pistolShoot.volume = 0.42; // 0.7 * (1 - 0.4) = 0.42
    }
    
    // Configure sounds that should loop
    if (this.audioElements.machineGunShoot) {
      this.audioElements.machineGunShoot.loop = true;
    }
    
    // Configure walking sound to loop
    if (this.audioElements.playerWalk) {
      this.audioElements.playerWalk.loop = true;
      this.audioElements.playerWalk.volume = 0.5; // Slightly lower volume for walking
      // Initialize tracking variable for walking sound
      this.isWalkSoundPlaying = false;
    }
    
    // Configure background music to loop at lower volume (reduced by 60%)
    if (this.audioElements.backgroundMusic) {
      this.audioElements.backgroundMusic.loop = true;
      this.audioElements.backgroundMusic.volume = 0.16; // 0.4 * (1 - 0.6) = 0.16
      console.log('Background music initialized and configured to loop at lowered volume');
    }
    
    // Check if mobile for further optimization
    if (this.isMobileDevice()) {
      console.log('Mobile device detected - optimizing audio for better performance');
      this.maxConcurrentAudio = 2; // More strict limitation on mobile
      
      // Note: We can't change the sample rate of an existing AudioContext
      // as it's a read-only property. The optimal approach is to create
      // AudioContext with the right options at initialization time.
      
      // Instead, we'll focus on limiting concurrent sounds and managing audio resources
      console.log('Audio optimization applied: limited to', this.maxConcurrentAudio, 'concurrent sounds');
    }
    
    // We can't play audio until user interaction has occurred
    this.audioUnlocked = false;
    
    console.log('Weapon audio and background music initialized, waiting for user interaction to unlock audio');
  }
  
  /**
   * Create a pool of audio elements for a given sound type
   * @param {string} type - The type of sound to pool
   * @param {string} src - Source URL of the audio file
   * @param {number} count - Number of instances to create
   */
  createAudioPool(type, src, count) {
    for (let i = 0; i < count; i++) {
      const audio = new Audio(src);
      audio.preload = 'auto';
      audio.volume = 0.7;
      this.audioPool[type].push({
        element: audio,
        inUse: false
      });
    }
  }
  
  /**
   * Get an available audio element from the pool
   * @param {string} type - The type of sound to get
   * @returns {HTMLAudioElement|null} An available audio element or null
   */
  getFromAudioPool(type) {
    if (!this.audioPool[type]) return null;
    
    // Check if we're at the concurrent audio limit
    if (this.isMobileDevice() && this.activeAudio.length >= this.maxConcurrentAudio) {
      // If at limit, prioritize by stopping less important sounds
      const lowPrioritySounds = this.activeAudio.filter(audio => 
        !audio.src.includes('background') && !audio.src.includes('shooting')
      );
      
      if (lowPrioritySounds.length > 0) {
        const oldestSound = lowPrioritySounds[0];
        oldestSound.pause();
        this.activeAudio = this.activeAudio.filter(a => a !== oldestSound);
      } else if (this.activeAudio.length > 0) {
        // If no low priority sounds, stop the oldest sound
        const oldestSound = this.activeAudio[0];
        oldestSound.pause();
        this.activeAudio = this.activeAudio.filter(a => a !== oldestSound);
      }
    }
    
    // Try to find an available audio element in the pool
    for (const pooled of this.audioPool[type]) {
      if (!pooled.inUse) {
        pooled.inUse = true;
        
        // Add event to mark as available when playback ends
        const handleEnded = () => {
          pooled.inUse = false;
          pooled.element.removeEventListener('ended', handleEnded);
          this.activeAudio = this.activeAudio.filter(a => a !== pooled.element);
        };
        
        pooled.element.addEventListener('ended', handleEnded);
        this.activeAudio.push(pooled.element);
        
        return pooled.element;
      }
    }
    
    return null;
  }
  
  /**
   * Unlock audio on user interaction
   * This must be called after a user gesture (click, keypress, etc.)
   */
  unlockAudio() {
    if (this.audioUnlocked) return;
    
    console.log('Attempting to unlock audio...');
    
    // Create and play a silent sound to unlock audio
    if (this.audioContext) {
      // Resume the audio context (needed for Chrome)
      this.audioContext.resume().then(() => {
        console.log('AudioContext resumed successfully');
      }).catch(error => {
        console.warn('Error resuming AudioContext:', error);
      });
    }
    
    // Try to play each audio element briefly
    Object.values(this.audioElements).forEach(audio => {
      if (audio) {
        // Set to very low volume for the unlock attempt
        const originalVolume = audio.volume;
        audio.volume = 0.001;
        
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
          playPromise.then(() => {
            // Audio started playing - pause it right away
            audio.pause();
            audio.currentTime = 0;
            // Restore original volume
            audio.volume = originalVolume;
          }).catch(error => {
            // Auto-play was prevented, this is ok during unlock attempt
            console.log('Audio unlock attempt prevented for one element, this is normal');
          });
        }
      }
    });
    
    this.audioUnlocked = true;
    console.log('Audio unlocked successfully');
    
    // Start background music explicitly after unlocking
    setTimeout(() => this.playBackgroundMusic(), 500);
  }

  /**
   * Play background music
   */
  playBackgroundMusic() {
    console.log("Attempting to play background music");
    
    // Skip background music on mobile for performance optimization
    if (this.mobileAudioSettings && this.mobileAudioSettings.disableBackgroundMusic) {
      console.log("Background music disabled on mobile for performance optimization");
      return;
    }
    
    if (!this.audioUnlocked || !this.audioElements.backgroundMusic) {
      console.log("Cannot play background music: audio not unlocked or element missing");
      return;
    }
    
    this.audioElements.backgroundMusic.loop = true;
    this.audioElements.backgroundMusic.volume = this.musicVolume || 0.5;
    
    this.audioElements.backgroundMusic.play().catch(error => {
      console.warn(`Error playing background music: ${error}`);
    });
  }

  /**
   * Pause background music
   */
  pauseBackgroundMusic() {
    if (this.audioUnlocked && this.audioElements.backgroundMusic) {
      this.audioElements.backgroundMusic.pause();
      console.log('Background music paused');
    }
  }

  /**
   * Resume background music
   */
  resumeBackgroundMusic() {
    if (this.audioUnlocked && this.audioElements.backgroundMusic) {
      this.audioElements.backgroundMusic.play().catch(error => {
        console.warn('Could not resume background music:', error);
      });
      console.log('Background music resumed');
    }
  }

  /**
   * Create a crosshair in the center of the screen
   */
  createCrosshair() {
    // Remove any existing crosshair first
    const existingCrosshair = document.querySelector('.crosshair');
    if (existingCrosshair) {
      document.body.removeChild(existingCrosshair);
    }

    // Create crosshair container
    const crosshair = document.createElement('div');
    crosshair.className = 'crosshair';
    crosshair.style.position = 'absolute';
    crosshair.style.top = '50%';
    crosshair.style.left = '50%';
    crosshair.style.transform = 'translate(-50%, -50%)';
    crosshair.style.width = '20px';
    crosshair.style.height = '20px';
    crosshair.style.pointerEvents = 'none';
    
    // Create crosshair lines
    const horizontal = document.createElement('div');
    horizontal.style.position = 'absolute';
    horizontal.style.top = '50%';
    horizontal.style.left = '0';
    horizontal.style.width = '100%';
    horizontal.style.height = '2px';
    horizontal.style.backgroundColor = 'white';
    horizontal.style.transform = 'translateY(-50%)';
    
    const vertical = document.createElement('div');
    vertical.style.position = 'absolute';
    vertical.style.top = '0';
    vertical.style.left = '50%';
    vertical.style.width = '2px';
    vertical.style.height = '100%';
    vertical.style.backgroundColor = 'white';
    vertical.style.transform = 'translateX(-50%)';
    
    // Add lines to crosshair
    crosshair.appendChild(horizontal);
    crosshair.appendChild(vertical);
    
    // Add to document
    document.body.appendChild(crosshair);
    
    this.crosshair = crosshair;
  }

  /**
   * Create a health display UI
   */
  createHealthDisplay() {
    // Remove any existing health display first
    const existingHealthDisplay = document.querySelector('.health-display');
    if (existingHealthDisplay) {
      document.body.removeChild(existingHealthDisplay);
    }

    // Create health container
    const healthContainer = document.createElement('div');
    healthContainer.className = 'health-display';
    healthContainer.style.position = 'absolute';
    healthContainer.style.bottom = '20px';
    healthContainer.style.left = '20px';
    healthContainer.style.width = '200px';
    healthContainer.style.height = '20px';
    healthContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    healthContainer.style.border = '2px solid white';
    healthContainer.style.borderRadius = '4px';
    
    // Create health bar
    const healthBar = document.createElement('div');
    healthBar.className = 'health-bar';
    healthBar.style.width = '100%';
    healthBar.style.height = '100%';
    healthBar.style.backgroundColor = '#ff3333';
    healthBar.style.transition = 'width 0.3s';
    
    // Create health text
    const healthText = document.createElement('div');
    healthText.className = 'health-text';
    healthText.style.position = 'absolute';
    healthText.style.top = '0';
    healthText.style.left = '0';
    healthText.style.width = '100%';
    healthText.style.height = '100%';
    healthText.style.display = 'flex';
    healthText.style.alignItems = 'center';
    healthText.style.justifyContent = 'center';
    healthText.style.color = 'white';
    healthText.style.fontFamily = 'Arial, sans-serif';
    healthText.style.fontSize = '12px';
    healthText.style.fontWeight = 'bold';
    healthText.style.textShadow = '1px 1px 1px black';
    healthText.textContent = `${this.health}/${this.maxHealth}`;
    
    // Add to container
    healthContainer.appendChild(healthBar);
    healthContainer.appendChild(healthText);
    
    // Add to document
    document.body.appendChild(healthContainer);
    
    // Store references
    this.healthBar = healthBar;
    this.healthText = healthText;
  }

  /**
   * Create a score display UI
   */
  createScoreDisplay() {
    // Remove any existing score container first
    const existingContainer = document.querySelector('.score-container');
    if (existingContainer) {
      document.body.removeChild(existingContainer);
    }

    // Create container for score display
    const scoreContainer = document.createElement('div');
    scoreContainer.className = 'score-container';
    scoreContainer.style.position = 'absolute';
    scoreContainer.style.top = '20px';
    scoreContainer.style.left = '50%';
    scoreContainer.style.transform = 'translateX(-50%)';
    scoreContainer.style.display = 'flex';
    scoreContainer.style.flexDirection = 'column';
    scoreContainer.style.alignItems = 'center';
    scoreContainer.style.pointerEvents = 'none';
    
    // Create current score display
    const currentScore = document.createElement('div');
    currentScore.className = 'score-display';
    currentScore.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    currentScore.style.color = 'white';
    currentScore.style.padding = '10px';
    currentScore.style.borderRadius = '5px';
    currentScore.style.fontFamily = 'Impact, fantasy';
    currentScore.style.fontSize = '20px';
    currentScore.style.fontWeight = 'bold';
    currentScore.style.textAlign = 'center';
    currentScore.textContent = 'POINTS: 0';
    
    // Add score to container
    scoreContainer.appendChild(currentScore);
    
    // Add to document
    document.body.appendChild(scoreContainer);
    
    // Store reference
    this.scoreDisplay = currentScore;
  }

  /**
   * Update the score display
   */
  updateScoreDisplay() {
    if (this.scoreDisplay) {
      this.scoreDisplay.textContent = `POINTS: ${this.score}`;
      
      // Special effects for milestone scores
      if (this.score >= 5000) {
        this.scoreDisplay.style.color = '#ffcc00'; // Gold
        this.scoreDisplay.style.textShadow = '0 0 5px #ffcc00';
      } else if (this.score >= 2000) {
        this.scoreDisplay.style.color = '#ffffff'; // White
        this.scoreDisplay.style.textShadow = '0 0 5px #ffffff';
      } else if (this.score >= 1000) {
        this.scoreDisplay.style.color = '#cccccc'; // Light gray
        this.scoreDisplay.style.textShadow = '0 0 3px #cccccc';
      } else {
        this.scoreDisplay.style.color = '#ffffff'; // White (default)
        this.scoreDisplay.style.textShadow = 'none';
      }
    }
  }

  /**
   * Check if position is inside a wall
   * @param {Vector3} position - The position to check
   * @returns {boolean} True if position is in a wall
   */
  checkWallCollision(position) {
    // Half dimensions for easier calculations
    const halfWidth = this.roomWidth / 2;
    const halfDepth = this.roomDepth / 2;
    const buffer = this.playerRadius + this.wallThickness;
    
    // Only check collision with outer walls
    // North wall (Z+)
    if (position.z > halfDepth - buffer) {
      return true;
    }
    // South wall (Z-)
    if (position.z < -halfDepth + buffer) {
      return true;
    }
    // East wall (X+)
    if (position.x > halfWidth - buffer) {
      return true;
    }
    // West wall (X-)
    if (position.x < -halfWidth + buffer) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if position is in a window cutout
   * @param {THREE.Vector3} position - Position to check
   * @param {string} wall - Wall side to check ('north', 'south', 'east', 'west')
   * @returns {boolean} True if position is in a window cutout
   */
  isPositionInWindowCutout(position, wall) {
    // Define window dimensions
    const windowWidth = 2;
    const windowHeight = 1.5;
    
    // Don't allow walking through windows even if they have cutouts
    // Just return false to maintain wall collision
    return false;
  }

  /**
   * Update function called every frame
   * @param {number} deltaTime - Time elapsed since last frame
   */
  update(deltaTime) {
    // Skip updates if dead
    if (this.isDead) {
      return;
    }
    
    // Update player movement
    this.updateMovement(deltaTime);
    
    // Update player shooting
    this.updateShooting(deltaTime);
    
    // Update health regeneration
    this.updateHealthRegeneration(deltaTime);
    
    // Update hands and weapon animations if model container exists
    if (this.modelContainer) {
      this.updateHandsAndWeaponAnimations(deltaTime);
    }
  }
  
  /**
   * Update player movement
   * @param {number} deltaTime - Time elapsed since last frame
   */
  updateMovement(deltaTime) {
    // Skip if movement is disabled or player is dead
    if (!this.movementEnabled || !this.isLocked || this.isDead) {
      // Make sure walking sound is stopped when movement is disabled
      this.stopWalkingSound();
      return;
    }
    
    // Get current position for collision checks
    const originalPosition = this.camera.position.clone();
    
    // Initialize velocity
    this.velocity.x = 0;
    this.velocity.z = 0;
    
    // Calculate run speed multiplier and update stamina
    const speedMultiplier = this.running ? this.runMultiplier : 1;
    
    // Handle stamina for running
    if (this.running && (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight)) {
      // Reduce stamina when running
      this.stamina = Math.max(0, this.stamina - this.staminaDecayRate * deltaTime);
      
      // If stamina depleted, stop running
      if (this.stamina <= 0) {
        this.running = false;
      }
    } else {
      // Regenerate stamina when not running
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * deltaTime);
    }
    
    // Calculate direction vector based on input
    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();
    
    // Apply movement in camera direction with speed multiplier
    if (this.moveForward || this.moveBackward) {
      this.velocity.z -= this.direction.z * this.moveSpeed * speedMultiplier * deltaTime;
    }
    
    if (this.moveLeft || this.moveRight) {
      this.velocity.x += this.direction.x * this.moveSpeed * speedMultiplier * deltaTime;
    }
    
    // Handle walking sound
    const isMoving = this.moveForward || this.moveBackward || this.moveLeft || this.moveRight;
    if (isMoving) {
      // Play walking sound if not already playing
      this.playWalkingSound();
    } else {
      // Stop walking sound if not moving
      this.stopWalkingSound();
    }
    
    // Save current position for collision detection
    const previousPosition = this.camera.position.clone();
    
    // Try to move along Z axis
    if (this.velocity.z !== 0) {
      // Apply movement
      this.camera.translateZ(this.velocity.z);
      
      // Check for collision and revert if needed
      if (this.checkWallCollision(this.camera.position)) {
        this.camera.position.copy(previousPosition);
      } else {
        // Update previous position for X movement
        previousPosition.copy(this.camera.position);
      }
    }
    
    // Try to move along X axis
    if (this.velocity.x !== 0) {
      // Apply movement
      this.camera.translateX(this.velocity.x);
      
      // Check for collision and revert if needed
      if (this.checkWallCollision(this.camera.position)) {
        this.camera.position.copy(previousPosition);
      }
    }
    
    // Keep player at constant height
    this.camera.position.y = this.height;
    
    // Handle wall buy interactions - REMOVED to allow hold-to-buy mechanic to work
    // Wall buys are now handled via the hold-to-buy mechanism in Room.js
  }
  
  /**
   * Update player shooting
   * @param {number} deltaTime - Time elapsed since last frame
   */
  updateShooting(deltaTime) {
    // Only handle shooting if the player is holding down the mouse button
    // and has an automatic weapon
    if (this.shooting && 
        this.activeWeapon && 
        this.activeWeapon.automatic) {
      this.shoot();
    }
  }
  
  /**
   * Update health regeneration
   * @param {number} delta - Time elapsed since last update
   */
  updateHealthRegeneration(delta) {
    // Skip regeneration if player is at full health
    if (this.health >= this.maxHealth) {
      this.isRegenerating = false;
      return;
    }
    
    // Check if enough time has passed since last damage
    const currentTime = performance.now() / 1000;
    const timeSinceDamage = currentTime - this.lastDamageTime;
    
    if (timeSinceDamage >= this.regenerationDelay) {
      // Start regenerating health
      this.isRegenerating = true;
      
      // Track accumulated health to make sure we increase by whole numbers
      if (!this.healthAccumulator) {
        this.healthAccumulator = 0;
      }
      
      // Calculate health increase for this frame and add to accumulator
      this.healthAccumulator += this.regenerationRate * delta;
      
      // When accumulator reaches 1 or more, increase health by that many points
      if (this.healthAccumulator >= 1) {
        // Extract whole number (integer) part
        const healthToAdd = Math.floor(this.healthAccumulator);
        
        // Keep only the fractional part in the accumulator
        this.healthAccumulator -= healthToAdd;
        
        // Apply regeneration as whole number
        this.health = Math.min(this.maxHealth, this.health + healthToAdd);
        
        // Update health display
        this.updateHealthDisplay();
        
        // Show regeneration effect
        this.showRegenerationEffect();
      }
    } else {
      this.isRegenerating = false;
    }
  }
  
  /**
   * Show health regeneration effect
   */
  showRegenerationEffect() {
    // Create regeneration overlay if it doesn't exist
    if (!this.regenerationOverlay) {
      const overlay = document.createElement('div');
      overlay.className = 'regeneration-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(0, 255, 0, 0.05)';
      overlay.style.pointerEvents = 'none';
      overlay.style.opacity = '0';
      
      document.body.appendChild(overlay);
      this.regenerationOverlay = overlay;
    }
    
    // Pulse the overlay to indicate regeneration
    this.regenerationOverlay.style.opacity = '0.2';
    this.regenerationOverlay.style.transition = 'opacity 0.5s';
    
    // Reset opacity after a short delay for pulsing effect
    setTimeout(() => {
      if (this.regenerationOverlay) {
        this.regenerationOverlay.style.opacity = '0';
      }
    }, 500);
  }

  /**
   * Shoot the current weapon
   */
  shoot() {
    // Skip if dead or no weapon
    if (this.isDead || !this.activeWeapon) {
      return;
    }
    
    // Check if we can shoot (cooldown and ammo)
    const currentTime = performance.now() / 1000;
    const timeSinceLastShot = currentTime - this.lastShootTime;
    
    if (timeSinceLastShot < this.activeWeapon.cooldown || this.isReloading) {
      return;
    }
    
    // Try to fire the weapon
    const fireData = this.activeWeapon.fire();
    
    // If no fire data, weapon couldn't shoot (no ammo)
    if (!fireData) {
      // Check if the weapon is completely out of ammo
      if (this.activeWeapon.currentAmmo === 0 && this.activeWeapon.totalAmmo === 0 && !this.activeWeapon.hasInfiniteAmmo) {
        console.log(`${this.activeWeapon.name} is completely out of ammo, switching to pistol`);
        // Stop any continuous weapon sound before switching
        this.stopWeaponSound();
        this.switchToPistol();
        return;
      }
      
      // Try to reload if no ammo
      if (this.activeWeapon.currentAmmo === 0) {
        this.reload();
      }
      return;
    }
    
    // Update last shoot time
    this.lastShootTime = currentTime;
    
    // Update ammo display
    this.updateAmmoDisplay();
    
    // Play shoot animation
    this.playShootAnimation();
    
    // Play appropriate sound based on weapon type
    this.playWeaponShootSound();
    
    // Check if we have access to the scene
    if (!this.scene) {
      console.warn("Cannot shoot: scene reference not set");
      return;
    }
    
    try {
      // Process each projectile (for shotguns and similar weapons)
      for (let i = 0; i < fireData.projectiles; i++) {
        // Calculate spread effect
        const spread = fireData.spread;
        const spreadVector = new THREE.Vector2(
          (Math.random() - 0.5) * 2 * spread,
          (Math.random() - 0.5) * 2 * spread
        );
        
        // Create ray from camera with spread
        this.raycaster.setFromCamera(spreadVector, this.camera);
        
        // Create arrays of objects to check for intersection
        const zombieObjects = this.getZombieObjects();
        const wallObjects = this.getWallObjects();
        
        if (zombieObjects.length === 0 && wallObjects.length === 0) {
          continue; // No objects to hit
        }
        
        // Check wall collisions first
        const wallIntersects = this.raycaster.intersectObjects(wallObjects, true);
        
        // Get the closest wall hit distance
        let closestWallDistance = Infinity;
        if (wallIntersects.length > 0) {
          closestWallDistance = wallIntersects[0].distance;
        }
        
        // Check zombie intersections
        const zombieIntersects = this.raycaster.intersectObjects(zombieObjects, true);
        
        // Filter zombie hits that are behind walls
        const validZombieHits = zombieIntersects.filter(hit => hit.distance < closestWallDistance);
        
        if (validZombieHits.length > 0) {
          // Get the first object hit
          const hit = validZombieHits[0];
          const zombieObject = this.findZombieParent(hit.object);
          
          if (zombieObject && zombieObject.userData && zombieObject.userData.enemy) {
            // Check if it's a headshot
            const isHeadshot = this.isHeadshot(hit, zombieObject);
            
            // Apply damage to zombie
            if (isHeadshot) {
              const damageDealt = fireData.headDamage;
              zombieObject.userData.enemy.takeDamage(damageDealt);
              this.showDamageNumber(hit.point, damageDealt, true);
              
              // Add points based on damage (headshots are worth more)
              this.addPoints(damageDealt * 2, false, true);
              
              // If this damage kills the zombie, award bonus points
              if (zombieObject.userData.enemy.health <= 0) {
                this.addPoints(100, true, true); // Headshot kill bonus
              }
              
              // If we're a client (not host), notify the host about the damage
              if (this.networkManager && !this.networkManager.isHost && this.networkManager.network) {
                console.log(`Client notifying host of headshot damage: ${damageDealt} to enemy ${zombieObject.userData.enemy.id}`);
                this.networkManager.network.sendPlayerAction('damageEnemy', {
                  enemyId: zombieObject.userData.enemy.id,
                  damage: damageDealt,
                  isHeadshot: true
                });
              }
            } else {
              const damageDealt = fireData.bodyDamage;
              zombieObject.userData.enemy.takeDamage(damageDealt);
              this.showDamageNumber(hit.point, damageDealt, false);
              
              // Add points based on damage
              this.addPoints(damageDealt, false, false);
              
              // If this damage kills the zombie, award bonus points
              if (zombieObject.userData.enemy.health <= 0) {
                this.addPoints(50, true, false); // Regular kill bonus
              }
              
              // If we're a client (not host), notify the host about the damage
              if (this.networkManager && !this.networkManager.isHost && this.networkManager.network) {
                console.log(`Client notifying host of body damage: ${damageDealt} to enemy ${zombieObject.userData.enemy.id}`);
                this.networkManager.network.sendPlayerAction('damageEnemy', {
                  enemyId: zombieObject.userData.enemy.id,
                  damage: damageDealt,
                  isHeadshot: false
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error during shooting:", error);
    }
  }

  /**
   * Get all zombie objects in the scene
   * @returns {Array} Array of zombie objects
   */
  getZombieObjects() {
    // Find all zombie objects in the scene
    const objects = [];
    
    // Check if we have access to the scene
    if (!this.scene) {
      console.warn("Cannot get zombie objects: scene reference not set");
      return objects;
    }
    
    try {
      // First try to get zombies directly from the room's enemy manager
      if (this.scene.room && 
          this.scene.room.enemyManager && 
          this.scene.room.enemyManager.enemies) {
        
        // Get zombie instances directly
        this.scene.room.enemyManager.enemies.forEach(enemy => {
          if (enemy.instance) {
            objects.push(enemy.instance);
          }
        });
        
        return objects;
      }
      
      // Fallback: traverse the scene looking for objects with enemy userData
      this.scene.traverse((object) => {
        if (object.userData && object.userData.enemy) {
          objects.push(object);
        }
      });
    } catch (error) {
      console.error("Error getting zombie objects:", error);
    }
    
    return objects;
  }

  /**
   * Get all wall objects in the scene
   * @returns {Array} Array of wall objects
   */
  getWallObjects() {
    const objects = [];
    
    // Check if we have access to the scene
    if (!this.scene) {
      console.warn("Cannot get wall objects: scene reference not set");
      return objects;
    }
    
    try {
      // Traverse the scene looking for wall objects
      this.scene.traverse((object) => {
        // Skip objects that are specifically marked as windows or zombie
        if (object.userData && (object.userData.window || object.userData.enemy)) {
          return;
        }
        
        // Check if it's a Mesh with wall material
        if (object instanceof THREE.Mesh && 
            object.material && 
            !object.userData.isFloor && 
            !object.userData.isCeiling) {
          
          // Walls should be BoxGeometry objects
          if (object.geometry instanceof THREE.BoxGeometry) {
            objects.push(object);
          }
        }
      });
    } catch (error) {
      console.error("Error getting wall objects:", error);
    }
    
    return objects;
  }

  /**
   * Find the zombie parent object
   * @param {Object3D} object - The object hit by the ray
   * @returns {Object3D} The zombie parent object
   */
  findZombieParent(object) {
    if (!object) return null;
    
    try {
      let current = object;
      
      // Traverse up the parent hierarchy to find the zombie parent
      while (current) {
        if (current.userData && current.userData.enemy) {
          return current;
        }
        
        // Stop if we reach the scene or if no parent exists
        if (!current.parent || current === this.scene) {
          break;
        }
        
        current = current.parent;
      }
    } catch (error) {
      console.error("Error finding zombie parent:", error);
    }
    
    return null;
  }

  /**
   * Check if the hit is a headshot
   * @param {Object} hit - The intersection data
   * @param {Object3D} zombieObject - The zombie object
   * @returns {boolean} True if it's a headshot
   */
  isHeadshot(hit, zombieObject) {
    if (!hit || !hit.point || !zombieObject) {
      return false;
    }
    
    try {
      // First check if we hit an object explicitly named as the head
      if (hit.object && hit.object.name === "zombieHead") {
        return true;
      }
      
      // Get the hit position relative to the zombie
      const localHitPoint = zombieObject.worldToLocal(hit.point.clone());
      
      // Check if the y position is in the head region
      // Head is typically above 1.5 units from the base for our 1.7-unit tall zombies
      return localHitPoint.y > 1.5;
    } catch (error) {
      console.error("Error checking for headshot:", error);
      return false;
    }
  }

  /**
   * Show damage number above hit point
   * @param {Vector3} position - World position of hit
   * @param {number} damage - Amount of damage
   * @param {boolean} isHeadshot - Whether it was a headshot
   */
  showDamageNumber(position, damage, isHeadshot) {
    // Create a text element
    const damageText = document.createElement('div');
    damageText.className = 'damage-number';
    damageText.textContent = damage.toString();
    damageText.style.position = 'absolute';
    damageText.style.color = isHeadshot ? '#ff5500' : 'white';
    damageText.style.fontFamily = 'Arial, sans-serif';
    damageText.style.fontSize = isHeadshot ? '24px' : '18px';
    damageText.style.fontWeight = 'bold';
    damageText.style.textShadow = '1px 1px 2px black';
    damageText.style.pointerEvents = 'none';
    damageText.style.zIndex = '1000';
    
    // Add to document
    document.body.appendChild(damageText);
    
    // Create a function to update the position
    const updatePosition = () => {
      // Convert 3D position to screen coordinates
      const screenPosition = position.clone().project(this.camera);
      
      // Convert to CSS coordinates
      const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
      const y = (1 - (screenPosition.y * 0.5 + 0.5)) * window.innerHeight;
      
      // Set position
      damageText.style.left = `${x}px`;
      damageText.style.top = `${y}px`;
    };
    
    // Initial position
    updatePosition();
    
    // Animate the damage number
    let opacity = 1;
    let posY = 0;
    
    const animate = () => {
      opacity -= 0.05;
      posY -= 2;
      
      damageText.style.opacity = opacity;
      damageText.style.transform = `translateY(${posY}px)`;
      
      if (opacity > 0) {
        requestAnimationFrame(animate);
      } else {
        document.body.removeChild(damageText);
      }
    };
    
    requestAnimationFrame(animate);
  }

  /**
   * Play shoot animation for weapon
   */
  playShootAnimation() {
    if (!this.weaponViewModel) return;
    
    // Flash the crosshair
    if (this.crosshair) {
      this.crosshair.style.transform = 'translate(-50%, -50%) scale(1.2)';
      this.crosshair.style.opacity = '0.8';
      
      // Reset crosshair after animation
      setTimeout(() => {
        this.crosshair.style.transform = 'translate(-50%, -50%) scale(1)';
        this.crosshair.style.opacity = '1';
      }, 50);
    }
    
    // Store original position and rotation
    const originalPosZ = this.weaponViewModel.position.z;
    const originalRotX = this.weaponViewModel.rotation.x;
    
    // Move back (recoil)
    this.weaponViewModel.position.z += 0.05;
    this.weaponViewModel.rotation.x -= 0.1;
    
    // Animate hands too if they exist
    if (this.handsModel) {
      // Move hands back slightly with the weapon
      this.handsModel.children.forEach(hand => {
        hand.position.z += 0.03;
      });
    }
    
    // Return to original position
    setTimeout(() => {
      this.weaponViewModel.position.z = originalPosZ;
      this.weaponViewModel.rotation.x = originalRotX;
      
      // Reset hand positions
      if (this.handsModel) {
        this.updateHandPositions();
      }
    }, 100);
  }

  /**
   * Play reload animation
   */
  playReloadAnimation() {
    if (!this.weaponViewModel) return;
    
    // Store original position and rotation
    const originalPosY = this.weaponViewModel.position.y;
    const originalRotZ = this.weaponViewModel.rotation.z;
    
    // Move weapon down and rotate
    this.weaponViewModel.position.y -= 0.2;
    this.weaponViewModel.rotation.z -= 0.5;
    
    // Animate hands for reload
    if (this.handsModel) {
      const rightHand = this.handsModel.children[0];
      const leftHand = this.handsModel.children[1];
      
      // Right hand stays relatively in place
      rightHand.position.y -= 0.1;
      
      // Left hand moves more to simulate magazine change
      leftHand.position.y -= 0.25;
      leftHand.position.z += 0.15;
      leftHand.rotation.x -= 0.3;
    }
    
    // Return to original position after half the reload time
    setTimeout(() => {
      this.weaponViewModel.position.y = originalPosY;
      this.weaponViewModel.rotation.z = originalRotZ;
      
      // Reset hand positions
      if (this.handsModel) {
        this.updateHandPositions();
      }
    }, this.activeWeapon.reloadTime * 500);
  }

  /**
   * Take damage from enemies or environment
   * @param {number} damage - Amount of damage to take
   */
  takeDamage(damage) {
    // Don't take damage if dead or in god mode
    if (this.isDead || this.godMode) return;
    
    // Convert damage to an integer and apply it
    const damageTaken = Math.floor(damage);
    this.health = Math.max(0, this.health - damageTaken);
    
    // Play damage sound
    this.playDamageSound();
    
    // Reset regeneration timer
    this.lastDamageTime = performance.now() / 1000;
    this.isRegenerating = false;
    this.healthAccumulator = 0; // Reset health accumulator
    
    // Update health display
    this.updateHealthDisplay();
    
    // Show damage effect
    this.showDamageEffect();
    
    // Check if player has died
    if (this.health <= 0) {
      this.die();
    }
  }

  /**
   * Play damage sound when player is hit
   */
  playDamageSound() {
    if (!this.audioUnlocked) return;
    
    try {
      const audio = this.audioElements.playerDamage;
      if (audio) {
        // Reset audio to start if already playing
        audio.currentTime = 0;
        audio.play().catch(error => {
          console.warn(`Error playing damage sound: ${error}`);
        });
      }
    } catch (error) {
      console.error(`Error in playDamageSound: ${error}`);
    }
  }

  /**
   * Update health display UI
   */
  updateHealthDisplay() {
    // Update health bar width
    this.healthBar.style.width = `${(this.health / this.maxHealth) * 100}%`;
    
    // Update health text
    this.healthText.textContent = `${this.health}/${this.maxHealth}`;
  }

  /**
   * Show screen damage effect
   */
  showDamageEffect() {
    // Create damage overlay if it doesn't exist
    if (!this.damageOverlay) {
      const overlay = document.createElement('div');
      overlay.className = 'damage-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
      overlay.style.pointerEvents = 'none';
      overlay.style.opacity = '0';
      
      document.body.appendChild(overlay);
      this.damageOverlay = overlay;
    }
    
    // Show and fade out the overlay
    this.damageOverlay.style.opacity = '1';
    
    setTimeout(() => {
      this.damageOverlay.style.opacity = '0';
      this.damageOverlay.style.transition = 'opacity 0.5s';
    }, 100);
  }

  /**
   * Player death function
   */
  die() {
    if (this.isDead) return; // Prevent multiple calls
    
    console.log("Player has died!");
    
    // Set player as dead
    this.isDead = true;
    
    // Lock movement
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    
    // Stop any weapon sounds
    this.stopWeaponSound();
    
    // Stop walking sound
    this.stopWalkingSound();
    
    // Pause background music
    this.pauseBackgroundMusic();
    
    // Disable interactions
    this.isInteracting = false;
    this.shooting = false;
    
    // Stop any reload in progress
    this.isReloading = false;
    
    // Unlock pointer to allow button interaction
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    
    // Signal the engine that the game is over
    if (this.gameEngine) {
      this.gameEngine.endGame();
    }
  }

  /**
   * Set scene reference for raycasting
   * @param {Scene} scene - Three.js scene
   */
  setScene(scene) {
    this.scene = scene;
    
    // Add this camera to the scene if it's not already there
    if (this.camera && scene && !scene.parent) {
      scene.add(this.camera);
    }
    
    // Ensure weapon models are visible in the scene
    if (this.activeWeapon && !this.weaponViewModel) {
      this.updateWeaponViewModel();
    }
  }

  /**
   * Handle key down events
   */
  onKeyDown(event) {
    // Skip if input is in a text field or player is dead
    if (document.activeElement.tagName === 'INPUT' || this.isDead) return;
    
    switch (event.code) {
      case 'KeyW':
        this.moveForward = true;
        break;
      case 'KeyA':
        this.moveLeft = true;
        break;
      case 'KeyS':
        this.moveBackward = true;
        break;
      case 'KeyD':
        this.moveRight = true;
        break;
      case 'KeyF':
        // For single-press interactions like window boarding
        this.isInteracting = true;
        
        // For hold-to-buy interactions
        if (!this.keys) {
          this.keys = {};
        }
        this.keys.f = true;
        console.log("F key pressed - keys.f set to true for hold tracking");
        break;
      case 'KeyR':
        // Reload weapon
        this.reload();
        break;
    }
  }

  /**
   * Handle key up events
   */
  onKeyUp(event) {
    switch (event.code) {
      case 'KeyW':
        this.moveForward = false;
        break;
      case 'KeyA':
        this.moveLeft = false;
        break;
      case 'KeyS':
        this.moveBackward = false;
        break;
      case 'KeyD':
        this.moveRight = false;
        break;
      case 'KeyF':
        // Set interaction key to false on key up
        if (this.keys) {
          this.keys.f = false;
          console.log("F key released - keys.f set to false");
        }
        break;
    }
  }

  /**
   * Handle mouse movement
   */
  onMouseMove(event) {
    if (!this.isLocked) return;
    
    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;
    
    // Rotate camera based on mouse movement
    this.camera.rotation.y -= movementX * this.mouseSensitivity;
    this.camera.rotation.x -= movementY * this.mouseSensitivity;
    
    // Limit vertical look angle
    this.camera.rotation.x = Math.max(
      -Math.PI / 2, 
      Math.min(Math.PI / 2, this.camera.rotation.x)
    );
  }

  /**
   * Handle mouse wheel events for weapon switching
   */
  onMouseWheel(event) {
    if (!this.isLocked || this.isDead) return;
    
    // Switch weapon based on scroll direction
    if (event.deltaY < 0) {
      // Scroll up, previous weapon
      this.prevWeapon();
    } else {
      // Scroll down, next weapon
      this.nextWeapon();
    }
  }

  /**
   * Handle mouse clicks for shooting
   */
  onMouseClick(event) {
    // Skip if not locked or if player is dead
    if (!this.isLocked || this.isDead) return;
    
    // Left mouse button for shooting
    if (event.button === 0) {
      if (event.type === 'mousedown') {
        this.shooting = true;
        this.shoot();
      } else if (event.type === 'mouseup') {
        this.shooting = false;
        // Stop continuous weapon sounds when player releases trigger
        this.stopWeaponSound();
      }
    }
  }

  /**
   * Request pointer lock to capture mouse movements
   */
  lockPointer(event) {
    console.log("PlayerControls lockPointer called", event ? "with event" : "without event");
    
    // Skip if on mobile - handled by touch controls
    if (this.mobileControls && this.mobileControls.isMobile) {
      return;
    }
    
    // Make sure controls are enabled
    this.enabled = true;
    
    // Only lock pointer on non-shooting clicks
    if (this.isLocked && event && event.button === 0) {
      console.log("Pointer already locked, skipping");
      return;
    }
    
    this.domElement.requestPointerLock = (
      this.domElement.requestPointerLock ||
      this.domElement.mozRequestPointerLock ||
      this.domElement.webkitRequestPointerLock
    );
    
    try {
      // Attempt to lock the pointer
      console.log("Requesting pointer lock");
      this.domElement.requestPointerLock();
      
      // Unlock audio on user interaction
      this.unlockAudio();
    } catch (error) {
      console.error("Error requesting pointer lock:", error);
    }
  }

  /**
   * Handle pointer lock change
   */
  onPointerlockChange() {
    const isLocked = document.pointerLockElement === this.domElement;
    
    console.log("Pointer lock changed, isLocked:", isLocked);
    
    if (isLocked) {
      console.log("Pointer locked, enabling controls and mouse movement");
      document.addEventListener('mousemove', this.onMouseMove, false);
      this.isLocked = true;
      this.enabled = true; // Make sure controls are enabled when pointer is locked
    } else {
      console.log("Pointer unlocked, disabling mouse movement");
      document.removeEventListener('mousemove', this.onMouseMove, false);
      this.isLocked = false;
      // Note: we don't disable controls here to allow keyboard movement still
    }
  }
  
  /**
   * Release pointer lock to allow cursor movement
   */
  unlockPointer() {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    } else if (document.mozExitPointerLock) {
      document.mozExitPointerLock();
    } else if (document.webkitExitPointerLock) {
      document.webkitExitPointerLock();
    }
    
    this.isLocked = false;
  }

  /**
   * Add points to the player's score
   * @param {number} points - Number of points to add
   * @param {boolean} isKill - Whether points are from a kill
   * @param {boolean} isHeadshot - Whether points are from a headshot
   */
  addPoints(points, isKill = false, isHeadshot = false) {
    // Add bonus for headshots
    if (isHeadshot) {
      points *= 2; // Double points for headshots
    }
    
    // Add kill bonus without combo system
    if (isKill) {
      points += isHeadshot ? 100 : 50; // Simple kill bonus
    }
    
    // Add points directly without multiplier
    this.score += points;
    
    // Update display
    this.updateScoreDisplay();
    
    // Show points message if significant amount
    if (points >= 30 || isHeadshot) {
      this.showPointsMessage(points, isHeadshot);
    }
  }
  
  /**
   * Remove points from the player's score
   * @param {number} points - Number of points to remove
   */
  removePoints(points) {
    // Subtract points from score
    this.score -= points;
    
    // Ensure score doesn't go negative
    if (this.score < 0) {
      this.score = 0;
    }
    
    // Update the display
    this.updateScoreDisplay();
  }

  /**
   * Show points message for significant points
   * @param {number} points - Points awarded
   * @param {boolean} isHeadshot - Whether it was a headshot
   */
  showPointsMessage(points, isHeadshot) {
    // Create message element
    const pointsMessage = document.createElement('div');
    
    // Set message text based on action
    if (isHeadshot) {
      pointsMessage.textContent = `HEADSHOT! +${points}`;
      pointsMessage.style.color = '#ff5500';
    } else if (points >= 100) {
      pointsMessage.textContent = `EXCELLENT! +${points}`;
      pointsMessage.style.color = '#00ccff';
    } else {
      pointsMessage.textContent = `+${points}`;
      pointsMessage.style.color = '#ffffff';
    }
    
    // Style the message
    pointsMessage.style.position = 'absolute';
    pointsMessage.style.top = '25%';
    pointsMessage.style.left = '50%';
    pointsMessage.style.transform = 'translate(-50%, -50%)';
    pointsMessage.style.fontFamily = 'Impact, fantasy';
    pointsMessage.style.fontSize = '22px';
    pointsMessage.style.fontWeight = 'bold';
    pointsMessage.style.textShadow = '0 0 5px #000000';
    pointsMessage.style.zIndex = '1000';
    pointsMessage.style.pointerEvents = 'none';
    
    // Add to document
    document.body.appendChild(pointsMessage);
    
    // Animate
    let opacity = 1;
    let posY = 0;
    
    const animate = () => {
      opacity -= 0.02;
      posY -= 1;
      
      pointsMessage.style.opacity = opacity;
      pointsMessage.style.transform = `translate(-50%, -50%) translateY(${posY}px)`;
      
      if (opacity > 0) {
        requestAnimationFrame(animate);
      } else {
        document.body.removeChild(pointsMessage);
      }
    };
    
    requestAnimationFrame(animate);
  }

  /**
   * Create ammo display UI
   */
  createAmmoDisplay() {
    // Remove any existing ammo display first
    const existingAmmoDisplay = document.querySelector('.ammo-display');
    if (existingAmmoDisplay) {
      document.body.removeChild(existingAmmoDisplay);
    }

    // Create ammo container
    const ammoContainer = document.createElement('div');
    ammoContainer.className = 'ammo-display';
    ammoContainer.style.position = 'absolute';
    ammoContainer.style.bottom = '20px';
    ammoContainer.style.right = '20px';
    ammoContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    ammoContainer.style.color = 'white';
    ammoContainer.style.padding = '10px';
    ammoContainer.style.borderRadius = '5px';
    ammoContainer.style.fontFamily = 'Impact, fantasy';
    ammoContainer.style.fontSize = '24px';
    ammoContainer.style.textAlign = 'right';
    ammoContainer.style.minWidth = '120px';
    ammoContainer.textContent = '0 / 0';
    
    // Add weapon name display
    const weaponNameElement = document.createElement('div');
    weaponNameElement.className = 'weapon-name';
    weaponNameElement.style.fontSize = '14px';
    weaponNameElement.style.marginBottom = '5px';
    weaponNameElement.style.color = '#aaaaaa';
    weaponNameElement.textContent = 'No Weapon';
    
    // Insert weapon name at top
    ammoContainer.insertBefore(weaponNameElement, ammoContainer.firstChild);
    
    // Add to document
    document.body.appendChild(ammoContainer);
    
    // Store references
    this.ammoDisplay = ammoContainer;
    this.weaponNameDisplay = weaponNameElement;
  }

  /**
   * Create a container for hands and weapon models
   */
  createModelContainer() {
    // Remove any existing model container first
    if (this.modelContainer) {
      this.camera.remove(this.modelContainer);
      this.modelContainer = null;
      this.weaponViewModel = null;
      this.handsModel = null;
    }
    
    // Create a group to hold the hands and weapon models
    this.modelContainer = new THREE.Group();
    
    // Add it to the camera
    this.camera.add(this.modelContainer);
    
    // Create hands model
    this.createHandsModel();
    
    console.log("Model container created and added to camera");
  }

  /**
   * Create a simple model for the player's hands
   */
  createHandsModel() {
    // Remove existing hands model if it exists
    if (this.handsModel) {
      this.modelContainer.remove(this.handsModel);
      this.handsModel = null;
    }
    
    // Create hands group
    const handsGroup = new THREE.Group();
    
    // Materials
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xffdbac, // Skin tone
      roughness: 0.8,
      metalness: 0.1
    });
    
    const sleeveMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333, // Dark sleeve
      roughness: 0.9,
      metalness: 0.1
    });
    
    // Create right hand (trigger hand)
    const rightHand = this.createHandMesh(skinMaterial, sleeveMaterial);
    rightHand.position.set(0.05, -0.25, -0.3);
    rightHand.rotation.set(-0.3, 0.2, 0);
    handsGroup.add(rightHand);
    
    // Create left hand (support hand)
    const leftHand = this.createHandMesh(skinMaterial, sleeveMaterial);
    leftHand.position.set(-0.06, -0.25, -0.4);
    leftHand.rotation.set(-0.2, -0.3, 0.1);
    handsGroup.add(leftHand);
    
    // Store the hands model
    this.handsModel = handsGroup;
    
    // Add to container
    this.modelContainer.add(handsGroup);
    
    console.log("Hand models created and added to model container");
  }
  
  /**
   * Create a hand mesh with fingers and sleeve
   * @param {THREE.Material} skinMaterial - Material for the skin
   * @param {THREE.Material} sleeveMaterial - Material for the sleeve
   * @returns {THREE.Group} - Hand mesh
   */
  createHandMesh(skinMaterial, sleeveMaterial) {
    const handGroup = new THREE.Group();
    
    // Create palm
    const palmGeometry = new THREE.BoxGeometry(0.08, 0.025, 0.1);
    const palm = new THREE.Mesh(palmGeometry, skinMaterial);
    handGroup.add(palm);
    
    // Create sleeve/wrist
    const sleeveGeometry = new THREE.CylinderGeometry(0.05, 0.04, 0.1, 8);
    const sleeve = new THREE.Mesh(sleeveGeometry, sleeveMaterial);
    sleeve.position.set(0, 0, 0.08);
    sleeve.rotation.set(Math.PI / 2, 0, 0);
    handGroup.add(sleeve);
    
    // Create fingers - positioned to look like they're gripping
    const fingerPositions = [
      { x: 0.03, y: 0.005, z: -0.04, rotX: -0.2, rotY: 0, rotZ: 0 },  // Index
      { x: 0.01, y: 0.005, z: -0.05, rotX: -0.3, rotY: 0, rotZ: 0 },  // Middle
      { x: -0.01, y: 0.005, z: -0.045, rotX: -0.3, rotY: 0, rotZ: 0 }, // Ring
      { x: -0.03, y: 0.005, z: -0.035, rotX: -0.2, rotY: 0, rotZ: 0 }  // Pinky
    ];
    
    fingerPositions.forEach(pos => {
      const fingerGeometry = new THREE.BoxGeometry(0.015, 0.015, 0.06);
      const finger = new THREE.Mesh(fingerGeometry, skinMaterial);
      finger.position.set(pos.x, pos.y, pos.z);
      finger.rotation.set(pos.rotX, pos.rotY, pos.rotZ);
      handGroup.add(finger);
    });
    
    // Create thumb - positioned to wrap around grip
    const thumbGeometry = new THREE.BoxGeometry(0.02, 0.015, 0.04);
    const thumb = new THREE.Mesh(thumbGeometry, skinMaterial);
    thumb.position.set(0.045, 0.01, -0.01);
    thumb.rotation.set(0.2, Math.PI / 4, 0);
    handGroup.add(thumb);
    
    return handGroup;
  }
  
  /**
   * Update weapon view model when active weapon changes
   */
  updateWeaponViewModel() {
    // Remove existing weapon model if there is one
    if (this.weaponViewModel) {
      this.modelContainer.remove(this.weaponViewModel);
      this.weaponViewModel = null; // Explicitly set to null to ensure garbage collection
    }
    
    if (!this.activeWeapon) return;
    
    // Create a new weapon model based on the active weapon
    this.weaponViewModel = this.createWeaponViewModel(this.activeWeapon);
    
    // Position the weapon model based on type (moved closer to camera)
    if (this.activeWeapon.name === 'Pistol') {
      this.weaponViewModel.position.set(0.05, -0.2, -0.3);
      this.weaponViewModel.rotation.set(0, 0, 0);
    } else if (this.activeWeapon.name === 'Shotgun') {
      this.weaponViewModel.position.set(0.02, -0.18, -0.3);
      this.weaponViewModel.rotation.set(0, -0.05, 0);
    } else if (this.activeWeapon.name === 'Assault Rifle') {
      this.weaponViewModel.position.set(0.02, -0.18, -0.3);
      this.weaponViewModel.rotation.set(0, -0.05, 0);
    } else {
      // Default position
      this.weaponViewModel.position.set(0, -0.2, -0.3);
    }
    
    // Add to container
    this.modelContainer.add(this.weaponViewModel);
    
    // Update hand positions based on current weapon
    this.updateHandPositions();
    
    // Log for debugging
    console.log(`Updated weapon model to: ${this.activeWeapon.name}`);
  }
  
  /**
   * Create the weapon view model for first-person display
   * @param {Weapon} weapon - The weapon to create model for
   */
  createWeaponViewModel(weapon) {
    const weaponGroup = new THREE.Group();
    
    // Create different models based on weapon type
    let model;
    
    // Check if it's a mystery weapon (AI generated)
    if (weapon.isMysteryWeapon) {
      model = this.createMysteryWeaponModel(weapon);
    } else {
      // Regular weapons
      switch (weapon.name) {
        case 'Pistol':
          model = this.createPistolModel();
          break;
        case 'Shotgun':
          model = this.createShotgunModel();
          break;
        case 'Assault Rifle':
          model = this.createAssaultRifleModel();
          break;
        default:
          // Fallback to a generic model
          model = this.createGenericWeaponModel();
      }
    }
    
    weaponGroup.add(model);
    return weaponGroup;
  }
  
  /**
   * Create a model for a mystery weapon obtained from the mystery box
   * @param {Weapon} weapon - The mystery weapon to create a model for
   * @returns {THREE.Group} - The weapon model
   */
  createMysteryWeaponModel(weapon) {
    const weaponGroup = new THREE.Group();
    
    // Extract quality from weapon properties
    // Use spread as an inverse indicator of quality (lower spread = higher quality)
    const qualityIndicator = 1 - (weapon.spread / 0.1); // 0-1 range
    
    // Create base materials with quality-based effects
    const primaryMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.3 + qualityIndicator * 0.7, 0.4, 0.8),
      roughness: 0.2,
      metalness: 0.8,
      emissive: new THREE.Color(0.1, 0.2, qualityIndicator * 0.5),
      emissiveIntensity: qualityIndicator,
    });
    
    const secondaryMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.2, 0.5, 0.7 + qualityIndicator * 0.3),
      roughness: 0.1,
      metalness: 0.9,
      emissive: new THREE.Color(0.0, qualityIndicator * 0.3, qualityIndicator * 0.6),
      emissiveIntensity: qualityIndicator * 0.8,
    });
    
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(qualityIndicator, qualityIndicator * 0.8, 0.2),
      roughness: 0.05,
      metalness: 1.0,
      emissive: new THREE.Color(qualityIndicator * 0.7, qualityIndicator * 0.5, 0.1),
      emissiveIntensity: qualityIndicator * 1.5,
    });
    
    // Create main body
    const bodyGeometry = new THREE.BoxGeometry(0.08, 0.1, 0.4);
    const body = new THREE.Mesh(bodyGeometry, primaryMaterial);
    body.position.set(0, 0, 0);
    weaponGroup.add(body);
    
    // Create barrel - more complex for higher quality weapons
    if (qualityIndicator > 0.3) {
      // High quality has more detailed barrel
      const barrelGroup = new THREE.Group();
      
      const mainBarrelGeometry = new THREE.CylinderGeometry(0.02, 0.025, 0.5, 8);
      const mainBarrel = new THREE.Mesh(mainBarrelGeometry, secondaryMaterial);
      mainBarrel.rotation.set(0, 0, Math.PI / 2);
      mainBarrel.position.set(0, 0, -0.3);
      barrelGroup.add(mainBarrel);
      
      // Add energy coils for high quality weapons
      if (qualityIndicator > 0.7) {
        for (let i = 0; i < 3; i++) {
          const coilGeometry = new THREE.TorusGeometry(0.035, 0.01, 8, 16);
          const coil = new THREE.Mesh(coilGeometry, accentMaterial);
          coil.position.set(0, 0, -0.2 - (i * 0.12));
          coil.rotation.set(Math.PI / 2, 0, 0);
          barrelGroup.add(coil);
        }
      }
      
      // Muzzle energy effect for highest quality
      if (qualityIndicator > 0.85) {
        const muzzleGeometry = new THREE.SphereGeometry(0.03, 16, 16);
        const muzzle = new THREE.Mesh(muzzleGeometry, accentMaterial);
        muzzle.position.set(0, 0, -0.5);
        muzzle.scale.set(1, 1, 1.5);
        barrelGroup.add(muzzle);
        
        // Add point light at muzzle for glow effect
        const muzzleLight = new THREE.PointLight(
          new THREE.Color(qualityIndicator, qualityIndicator * 0.8, 0.2),
          1.5,
          0.5
        );
        muzzleLight.position.set(0, 0, -0.5);
        barrelGroup.add(muzzleLight);
      }
      
      weaponGroup.add(barrelGroup);
    } else {
      // Simpler barrel for lower quality
      const barrelGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
      const barrel = new THREE.Mesh(barrelGeometry, secondaryMaterial);
      barrel.rotation.set(0, 0, Math.PI / 2);
      barrel.position.set(0, 0, -0.25);
      weaponGroup.add(barrel);
    }
    
    // Add handle/grip
    const gripGeometry = new THREE.BoxGeometry(0.06, 0.15, 0.07);
    const grip = new THREE.Mesh(gripGeometry, primaryMaterial);
    grip.position.set(0, -0.12, 0.05);
    weaponGroup.add(grip);
    
    // Add top rail or scope based on quality
    if (qualityIndicator > 0.5) {
      // Scope for higher quality
      const scopeBaseGeometry = new THREE.BoxGeometry(0.06, 0.03, 0.2);
      const scopeBase = new THREE.Mesh(scopeBaseGeometry, secondaryMaterial);
      scopeBase.position.set(0, 0.07, 0);
      weaponGroup.add(scopeBase);
      
      const scopeGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8);
      const scope = new THREE.Mesh(scopeGeometry, secondaryMaterial);
      scope.rotation.set(Math.PI / 2, 0, 0);
      scope.position.set(0, 0.12, 0);
      weaponGroup.add(scope);
      
      // Add lens effect
      const lensGeometry = new THREE.CircleGeometry(0.025, 16);
      const lens = new THREE.Mesh(lensGeometry, accentMaterial);
      lens.position.set(0, 0.12, -0.08);
      lens.rotation.set(0, 0, 0);
      weaponGroup.add(lens);
      
      // Add scope reticle for highest quality
      if (qualityIndicator > 0.8) {
        const reticleGeometry = new THREE.RingGeometry(0.01, 0.015, 16);
        const reticle = new THREE.Mesh(
          reticleGeometry,
          new THREE.MeshBasicMaterial({
            color: 0xff0000,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
          })
        );
        reticle.position.set(0, 0.12, -0.075);
        weaponGroup.add(reticle);
      }
    } else {
      // Simple rail for lower quality
      const railGeometry = new THREE.BoxGeometry(0.04, 0.02, 0.2);
      const rail = new THREE.Mesh(railGeometry, secondaryMaterial);
      rail.position.set(0, 0.06, 0);
      weaponGroup.add(rail);
    }
    
    // Add magazine
    const magGeometry = new THREE.BoxGeometry(0.06, 0.12, 0.08);
    const mag = new THREE.Mesh(magGeometry, secondaryMaterial);
    mag.position.set(0, -0.06, 0.1);
    weaponGroup.add(mag);
    
    // Add unique features based on weapon properties
    
    // Add multiple barrels for weapons with multiple projectiles
    if (weapon.projectilesPerShot > 1) {
      const numExtraBarrels = Math.min(3, Math.floor(weapon.projectilesPerShot / 4)); // Cap at 3 extra barrels
      
      for (let i = 0; i < numExtraBarrels; i++) {
        const offset = 0.03;
        const extraBarrelGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.4, 8);
        const extraBarrel = new THREE.Mesh(extraBarrelGeometry, secondaryMaterial);
        extraBarrel.rotation.set(0, 0, Math.PI / 2);
        
        // Position in a triangular pattern
        switch (i) {
          case 0:
            extraBarrel.position.set(offset, offset, -0.25);
            break;
          case 1:
            extraBarrel.position.set(-offset, offset, -0.25);
            break;
          case 2:
            extraBarrel.position.set(0, -offset, -0.25);
            break;
        }
        
        weaponGroup.add(extraBarrel);
      }
    }
    
    // Add rotating core for weapons with high damage
    if (weapon.bodyDamage > 60) {
      const coreGeometry = new THREE.SphereGeometry(0.04, 16, 16);
      const core = new THREE.Mesh(coreGeometry, accentMaterial);
      core.position.set(0, 0, -0.05);
      
      // Create an animation function for the core
      core.userData.update = (deltaTime) => {
        core.rotation.y += deltaTime * 2;
        core.rotation.z += deltaTime * 3;
      };
      
      weaponGroup.add(core);
    }
    
    // Add fins for very fast firing weapons
    if (weapon.cooldown < 0.1) {
      for (let i = 0; i < 3; i++) {
        const finGeometry = new THREE.BoxGeometry(0.02, 0.08, 0.15);
        const fin = new THREE.Mesh(finGeometry, secondaryMaterial);
        fin.position.set(0, 0, 0.1);
        fin.rotation.set(0, 0, i * Math.PI * 2 / 3);
        fin.translateX(0.06);
        weaponGroup.add(fin);
      }
    }
    
    // Store weapon quality for future effects
    weaponGroup.userData.quality = qualityIndicator;
    weaponGroup.userData.isMysteryWeapon = true;
    
    // Add update function for animated effects
    weaponGroup.userData.update = (deltaTime) => {
      // Update any child meshes that have update functions
      weaponGroup.children.forEach(child => {
        if (child.userData && typeof child.userData.update === 'function') {
          child.userData.update(deltaTime);
        }
      });
      
      // Pulse glow for high quality weapons
      if (qualityIndicator > 0.7) {
        const pulseValue = (Math.sin(performance.now() / 500) + 1) / 2;
        weaponGroup.children.forEach(child => {
          if (child.material && child.material.emissive) {
            child.material.emissiveIntensity = qualityIndicator * (0.8 + pulseValue * 0.5);
          }
        });
      }
    };
    
    return weaponGroup;
  }
  
  /**
   * Create a generic weapon model
   * @returns {THREE.Mesh} - Generic weapon mesh
   */
  createGenericWeaponModel() {
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
    const material = new THREE.MeshStandardMaterial({ color: 0x333333 });
    return new THREE.Mesh(geometry, material);
  }
  
  /**
   * Create a pistol model
   * @returns {THREE.Group} - Pistol model
   */
  createPistolModel() {
    const pistolGroup = new THREE.Group();
    
    // Materials
    const darkMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.4,
      metalness: 0.8
    });
    
    const lightMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.3,
      metalness: 0.9
    });
    
    const gripMaterial = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.9,
      metalness: 0.1
    });
    
    // Create slide
    const slideGeometry = new THREE.BoxGeometry(0.06, 0.06, 0.15);
    const slide = new THREE.Mesh(slideGeometry, lightMetalMaterial);
    slide.position.set(0, 0.04, -0.05);
    pistolGroup.add(slide);
    
    // Create slide details (serrations)
    for (let i = 0; i < 5; i++) {
      const serrationGeometry = new THREE.BoxGeometry(0.062, 0.01, 0.01);
      const serration = new THREE.Mesh(serrationGeometry, darkMetalMaterial);
      serration.position.set(0, 0.06, -0.08 + (i * 0.015));
      pistolGroup.add(serration);
    }
    
    // Create barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.2, 16);
    const barrel = new THREE.Mesh(barrelGeometry, darkMetalMaterial);
    barrel.rotation.set(0, 0, Math.PI / 2);
    barrel.position.set(0, 0.04, -0.15);
    pistolGroup.add(barrel);
    
    // Create barrel extension (muzzle)
    const muzzleGeometry = new THREE.CylinderGeometry(0.017, 0.017, 0.02, 16);
    const muzzle = new THREE.Mesh(muzzleGeometry, darkMetalMaterial);
    muzzle.rotation.set(0, 0, Math.PI / 2);
    muzzle.position.set(0, 0.04, -0.24);
    pistolGroup.add(muzzle);
    
    // Create frame
    const frameGeometry = new THREE.BoxGeometry(0.056, 0.04, 0.1);
    const frame = new THREE.Mesh(frameGeometry, darkMetalMaterial);
    frame.position.set(0, 0.02, -0.02);
    pistolGroup.add(frame);
    
    // Create grip
    const gripGeometry = new THREE.BoxGeometry(0.06, 0.12, 0.07);
    const grip = new THREE.Mesh(gripGeometry, gripMaterial);
    grip.position.set(0, -0.05, 0);
    pistolGroup.add(grip);
    
    // Create grip texture (stippling)
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 6; j++) {
        const stippleGeometry = new THREE.BoxGeometry(0.004, 0.004, 0.004);
        const stipple = new THREE.Mesh(stippleGeometry, darkMetalMaterial);
        stipple.position.set(
          -0.025 + (i * 0.017),
          -0.05 + (j * 0.017),
          0.036
        );
        pistolGroup.add(stipple);
      }
    }
    
    // Create trigger guard
    const guardGeometry = new THREE.TorusGeometry(0.022, 0.006, 8, 12, Math.PI);
    const guard = new THREE.Mesh(guardGeometry, darkMetalMaterial);
    guard.rotation.set(Math.PI / 2, 0, 0);
    guard.position.set(0, -0.01, -0.04);
    pistolGroup.add(guard);
    
    // Create trigger
    const triggerGeometry = new THREE.BoxGeometry(0.01, 0.03, 0.01);
    const trigger = new THREE.Mesh(triggerGeometry, darkMetalMaterial);
    trigger.position.set(0, -0.01, -0.01);
    pistolGroup.add(trigger);
    
    // Create sights
    const frontSightGeometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    const frontSight = new THREE.Mesh(frontSightGeometry, darkMetalMaterial);
    frontSight.position.set(0, 0.075, -0.14);
    pistolGroup.add(frontSight);
    
    const rearSightGeometry = new THREE.BoxGeometry(0.03, 0.01, 0.01);
    const rearSight = new THREE.Mesh(rearSightGeometry, darkMetalMaterial);
    rearSight.position.set(0, 0.075, 0.01);
    pistolGroup.add(rearSight);
    
    // Create magazine release
    const magReleaseGeometry = new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8);
    const magRelease = new THREE.Mesh(magReleaseGeometry, darkMetalMaterial);
    magRelease.rotation.set(Math.PI / 2, 0, 0);
    magRelease.position.set(-0.031, -0.01, -0.02);
    pistolGroup.add(magRelease);
    
    return pistolGroup;
  }
  
  /**
   * Create a shotgun model
   * @returns {THREE.Group} - Shotgun model
   */
  createShotgunModel() {
    const shotgunGroup = new THREE.Group();
    
    // Materials
    const darkMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.4,
      metalness: 0.8
    });
    
    const barrelMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.3,
      metalness: 0.85
    });
    
    const darkWoodMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b2504,
      roughness: 0.9,
      metalness: 0.1
    });
    
    const lightWoodMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b4423,
      roughness: 0.85,
      metalness: 0.1
    });
    
    // Create main barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.55, 16);
    const barrel = new THREE.Mesh(barrelGeometry, barrelMetalMaterial);
    barrel.rotation.set(0, 0, Math.PI / 2);
    barrel.position.set(0, 0, -0.22);
    shotgunGroup.add(barrel);
    
    // Create second barrel below
    const barrel2Geometry = new THREE.CylinderGeometry(0.02, 0.02, 0.55, 16);
    const barrel2 = new THREE.Mesh(barrel2Geometry, barrelMetalMaterial);
    barrel2.rotation.set(0, 0, Math.PI / 2);
    barrel2.position.set(0, -0.04, -0.22);
    shotgunGroup.add(barrel2);
    
    // Create barrel band connecting the barrels
    const barrelBandGeometry = new THREE.BoxGeometry(0.05, 0.06, 0.03);
    const barrelBand = new THREE.Mesh(barrelBandGeometry, darkMetalMaterial);
    barrelBand.position.set(0, -0.02, -0.43);
    shotgunGroup.add(barrelBand);
    
    // Create muzzle
    const muzzleGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.03, 16);
    const muzzle = new THREE.Mesh(muzzleGeometry, darkMetalMaterial);
    muzzle.rotation.set(0, 0, Math.PI / 2);
    muzzle.position.set(0, 0, -0.49);
    shotgunGroup.add(muzzle);
    
    // Create second muzzle
    const muzzle2Geometry = new THREE.CylinderGeometry(0.025, 0.025, 0.03, 16);
    const muzzle2 = new THREE.Mesh(muzzle2Geometry, darkMetalMaterial);
    muzzle2.rotation.set(0, 0, Math.PI / 2);
    muzzle2.position.set(0, -0.04, -0.49);
    shotgunGroup.add(muzzle2);
    
    // Create receiver
    const receiverGeometry = new THREE.BoxGeometry(0.07, 0.1, 0.2);
    const receiver = new THREE.Mesh(receiverGeometry, darkMetalMaterial);
    receiver.position.set(0, 0, 0);
    shotgunGroup.add(receiver);
    
    // Create pump action
    const pumpGeometry = new THREE.BoxGeometry(0.06, 0.06, 0.12);
    const pump = new THREE.Mesh(pumpGeometry, darkWoodMaterial);
    pump.position.set(0, -0.02, -0.3);
    shotgunGroup.add(pump);
    
    // Create pump grip detail
    for (let i = 0; i < 5; i++) {
      const gripLineGeometry = new THREE.BoxGeometry(0.062, 0.01, 0.01);
      const gripLine = new THREE.Mesh(gripLineGeometry, darkMetalMaterial);
      gripLine.position.set(0, -0.02, -0.34 + (i * 0.02));
      shotgunGroup.add(gripLine);
    }
    
    // Create stock
    const stockGeometry = new THREE.BoxGeometry(0.06, 0.08, 0.3);
    const stock = new THREE.Mesh(stockGeometry, lightWoodMaterial);
    stock.position.set(0, -0.01, 0.2);
    shotgunGroup.add(stock);
    
    // Create stock grip curve
    const stockCurveGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.06, 16, 1, false, 0, Math.PI);
    const stockCurve = new THREE.Mesh(stockCurveGeometry, lightWoodMaterial);
    stockCurve.rotation.set(0, Math.PI / 2, Math.PI / 2);
    stockCurve.position.set(0, -0.05, 0.35);
    shotgunGroup.add(stockCurve);
    
    // Create trigger guard
    const guardGeometry = new THREE.TorusGeometry(0.025, 0.005, 8, 12, Math.PI);
    const guard = new THREE.Mesh(guardGeometry, darkMetalMaterial);
    guard.rotation.set(Math.PI / 2, 0, 0);
    guard.position.set(0, -0.03, -0.05);
    shotgunGroup.add(guard);
    
    // Create trigger
    const triggerGeometry = new THREE.BoxGeometry(0.01, 0.03, 0.01);
    const trigger = new THREE.Mesh(triggerGeometry, darkMetalMaterial);
    trigger.position.set(0, -0.03, -0.03);
    shotgunGroup.add(trigger);
    
    // Create sight bead at muzzle
    const beadSightGeometry = new THREE.SphereGeometry(0.005, 8, 8);
    const beadSight = new THREE.Mesh(beadSightGeometry, new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.9
    }));
    beadSight.position.set(0, 0.02, -0.49);
    shotgunGroup.add(beadSight);
    
    return shotgunGroup;
  }
  
  /**
   * Create an assault rifle model
   * @returns {THREE.Group} - Assault rifle model
   */
  createAssaultRifleModel() {
    const rifleGroup = new THREE.Group();
    
    // Materials
    const darkMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.4,
      metalness: 0.8
    });
    
    const mainMetalMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.3,
      metalness: 0.85
    });
    
    const polymerMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.8,
      metalness: 0.2
    });
    
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.5,
      metalness: 0.6
    });
    
    // Create upper receiver
    const upperReceiverGeometry = new THREE.BoxGeometry(0.06, 0.06, 0.25);
    const upperReceiver = new THREE.Mesh(upperReceiverGeometry, mainMetalMaterial);
    upperReceiver.position.set(0, 0.04, 0);
    rifleGroup.add(upperReceiver);
    
    // Create lower receiver
    const lowerReceiverGeometry = new THREE.BoxGeometry(0.06, 0.08, 0.15);
    const lowerReceiver = new THREE.Mesh(lowerReceiverGeometry, mainMetalMaterial);
    lowerReceiver.position.set(0, -0.02, 0.05);
    rifleGroup.add(lowerReceiver);
    
    // Create barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.3, 16);
    const barrel = new THREE.Mesh(barrelGeometry, darkMetalMaterial);
    barrel.rotation.set(0, 0, Math.PI / 2);
    barrel.position.set(0, 0.04, -0.27);
    rifleGroup.add(barrel);
    
    // Create barrel shroud/handguard
    const handguardGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.2, 16);
    const handguard = new THREE.Mesh(handguardGeometry, polymerMaterial);
    handguard.rotation.set(0, 0, Math.PI / 2);
    handguard.position.set(0, 0.04, -0.22);
    rifleGroup.add(handguard);
    
    // Create muzzle brake
    const muzzleBrakeGeometry = new THREE.CylinderGeometry(0.02, 0.025, 0.04, 16);
    const muzzleBrake = new THREE.Mesh(muzzleBrakeGeometry, darkMetalMaterial);
    muzzleBrake.rotation.set(0, 0, Math.PI / 2);
    muzzleBrake.position.set(0, 0.04, -0.42);
    rifleGroup.add(muzzleBrake);
    
    // Create top rail
    const railGeometry = new THREE.BoxGeometry(0.03, 0.01, 0.3);
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.position.set(0, 0.075, -0.05);
    rifleGroup.add(rail);
    
    // Create rail detail
    for (let i = 0; i < 10; i++) {
      const railNotchGeometry = new THREE.BoxGeometry(0.04, 0.005, 0.01);
      const railNotch = new THREE.Mesh(railNotchGeometry, darkMetalMaterial);
      railNotch.position.set(0, 0.08, -0.18 + (i * 0.03));
      rifleGroup.add(railNotch);
    }
    
    // Create front sight
    const frontSightBaseGeometry = new THREE.BoxGeometry(0.04, 0.02, 0.02);
    const frontSightBase = new THREE.Mesh(frontSightBaseGeometry, darkMetalMaterial);
    frontSightBase.position.set(0, 0.09, -0.3);
    rifleGroup.add(frontSightBase);
    
    const frontSightPostGeometry = new THREE.BoxGeometry(0.01, 0.02, 0.01);
    const frontSightPost = new THREE.Mesh(frontSightPostGeometry, darkMetalMaterial);
    frontSightPost.position.set(0, 0.11, -0.3);
    rifleGroup.add(frontSightPost);
    
    // Create charging handle
    const chargingHandleGeometry = new THREE.BoxGeometry(0.03, 0.02, 0.04);
    const chargingHandle = new THREE.Mesh(chargingHandleGeometry, darkMetalMaterial);
    chargingHandle.position.set(0, 0.07, 0.1);
    rifleGroup.add(chargingHandle);
    
    // Create magazine
    const magGeometry = new THREE.BoxGeometry(0.05, 0.18, 0.05);
    const magazine = new THREE.Mesh(magGeometry, polymerMaterial);
    magazine.position.set(0, -0.12, 0.05);
    rifleGroup.add(magazine);
    
    // Create magazine curve
    const magCurveGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const magCurve = new THREE.Mesh(magCurveGeometry, polymerMaterial);
    magCurve.position.set(0, -0.21, 0.05);
    magCurve.rotation.set(0.3, 0, 0);
    rifleGroup.add(magCurve);
    
    // Create magazine base plate
    const baseGeometry = new THREE.BoxGeometry(0.055, 0.01, 0.055);
    const basePlate = new THREE.Mesh(baseGeometry, darkMetalMaterial);
    basePlate.position.set(0, -0.235, 0.05);
    rifleGroup.add(basePlate);
    
    // Create pistol grip
    const gripGeometry = new THREE.BoxGeometry(0.04, 0.1, 0.05);
    const grip = new THREE.Mesh(gripGeometry, polymerMaterial);
    grip.position.set(0, -0.06, 0.12);
    grip.rotation.set(-0.3, 0, 0);
    rifleGroup.add(grip);
    
    // Create trigger
    const triggerGeometry = new THREE.BoxGeometry(0.01, 0.03, 0.01);
    const trigger = new THREE.Mesh(triggerGeometry, darkMetalMaterial);
    trigger.position.set(0, 0, 0.12);
    rifleGroup.add(trigger);
    
    // Create trigger guard
    const guardGeometry = new THREE.TorusGeometry(0.02, 0.005, 8, 12, Math.PI);
    const guard = new THREE.Mesh(guardGeometry, darkMetalMaterial);
    guard.rotation.set(Math.PI / 2, 0, 0);
    guard.position.set(0, -0.02, 0.12);
    rifleGroup.add(guard);
    
    // Create stock
    const stockGeometry = new THREE.BoxGeometry(0.05, 0.07, 0.18);
    const stock = new THREE.Mesh(stockGeometry, polymerMaterial);
    stock.position.set(0, 0.01, 0.25);
    rifleGroup.add(stock);
    
    // Create stock plate
    const stockPlateGeometry = new THREE.BoxGeometry(0.06, 0.08, 0.01);
    const stockPlate = new THREE.Mesh(stockPlateGeometry, polymerMaterial);
    stockPlate.position.set(0, 0.01, 0.34);
    rifleGroup.add(stockPlate);
    
    // Create ejection port
    const ejectionPortGeometry = new THREE.BoxGeometry(0.04, 0.01, 0.08);
    const ejectionPort = new THREE.Mesh(ejectionPortGeometry, darkMetalMaterial);
    ejectionPort.position.set(0.03, 0.04, 0.05);
    rifleGroup.add(ejectionPort);
    
    return rifleGroup;
  }

  /**
   * Update hand positions based on current weapon
   */
  updateHandPositions() {
    if (!this.handsModel || !this.activeWeapon) return;
    
    const rightHand = this.handsModel.children[0];
    const leftHand = this.handsModel.children[1];
    
    // Base position for different weapons (moved closer to camera)
    if (this.activeWeapon.name === 'Pistol') {
      // Right hand (trigger hand)
      rightHand.position.set(0.05, -0.22, -0.3);
      rightHand.rotation.set(-0.2, 0.2, 0);
      
      // Left hand (support hand, optional for pistol)
      leftHand.position.set(0.02, -0.25, -0.28);
      leftHand.rotation.set(-0.3, 0, 0.8);
    } 
    else if (this.activeWeapon.name === 'Shotgun') {
      // Right hand (trigger hand)
      rightHand.position.set(0.05, -0.19, -0.3);
      rightHand.rotation.set(-0.2, 0.1, 0);
      
      // Left hand (pump/foregrip)
      leftHand.position.set(0.04, -0.19, -0.45);
      leftHand.rotation.set(-0.1, -0.1, 0);
    }
    else if (this.activeWeapon.name === 'Assault Rifle') {
      // Right hand (trigger hand)
      rightHand.position.set(0.05, -0.18, -0.3);
      rightHand.rotation.set(-0.2, 0.1, 0);
      
      // Left hand (foregrip support)
      leftHand.position.set(0.0, -0.2, -0.5);
      leftHand.rotation.set(-0.1, -0.2, 0.2);
    }
    else {
      // Default positions
      rightHand.position.set(0.05, -0.22, -0.3);
      rightHand.rotation.set(-0.3, 0.2, 0);
      leftHand.position.set(-0.06, -0.22, -0.4);
      leftHand.rotation.set(-0.2, -0.3, 0.1);
    }
  }

  /**
   * Initialize the default weapon (pistol)
   */
  initializeDefaultWeapon() {
    // Create default pistol
    const pistol = new Weapon(WeaponTypes.PISTOL);
    pistol.init();
    
    // WeaponTypes.PISTOL already has hasInfiniteAmmo set to true
    // No need to override these values manually
    
    // Add to weapons array
    this.weapons.push(pistol);
    
    // Set as active weapon
    this.activeWeapon = pistol;
    this.currentWeaponIndex = 0;
    
    // Create the weapon view model
    this.updateWeaponViewModel();
    
    // Update the ammo display
    this.updateAmmoDisplay();
    
    console.log("Initialized default pistol with infinite ammo");
  }

  /**
   * Update ammo display
   */
  updateAmmoDisplay() {
    if (this.ammoDisplay && this.activeWeapon) {
      // Show infinity symbol for weapons with infinite ammo
      if (this.activeWeapon.hasInfiniteAmmo) {
        this.ammoDisplay.textContent = `${this.activeWeapon.currentAmmo} / ∞`;
      } else {
        this.ammoDisplay.textContent = `${this.activeWeapon.currentAmmo} / ${this.activeWeapon.totalAmmo}`;
      }
      
      this.weaponNameDisplay.textContent = this.activeWeapon.name;
      
      // Highlight in red if low ammo
      if (this.activeWeapon.currentAmmo === 0) {
        this.ammoDisplay.style.color = '#ff3333';
      } else if (this.activeWeapon.currentAmmo <= this.activeWeapon.magazineSize * 0.3) {
        this.ammoDisplay.style.color = '#ffcc00';
      } else {
        this.ammoDisplay.style.color = 'white';
      }
    }
  }

  /**
   * Equip a new weapon purchased from a wall buy
   * @param {Weapon} weapon - The weapon to equip
   */
  equipWeapon(weapon) {
    // Skip if already reloading or dead
    if (this.isReloading || this.isDead) {
      return;
    }
    
    console.log(`Equipping ${weapon.name}`);
    
    // Stop any weapon sounds from previous weapon
    this.stopWeaponSound();
    
    // Make sure wall buy weapons have limited ammo (just one extra magazine)
    if (weapon.name !== 'Pistol') {
      weapon.hasInfiniteAmmo = false;
      // Set total ammo to exactly one extra magazine
      weapon.totalAmmo = weapon.magazineSize;
      console.log(`Limited ${weapon.name} ammo to one extra magazine (${weapon.totalAmmo})`);
    } else {
      // Ensure pistol always has infinite ammo
      weapon.hasInfiniteAmmo = true;
      weapon.totalAmmo = Infinity;
    }
    
    // Check if we already have this weapon type by comparing names
    const existingWeaponIndex = this.weapons.findIndex(w => w.name === weapon.name);
    
    if (existingWeaponIndex >= 0) {
      // If we already have this weapon type, just add ammo
      const existingWeapon = this.weapons[existingWeaponIndex];
      
      if (!existingWeapon.hasInfiniteAmmo) {
        // Add one magazine of ammo for non-infinite weapons
        existingWeapon.totalAmmo += weapon.magazineSize;
        console.log(`Added one magazine (${weapon.magazineSize}) to existing ${existingWeapon.name}`);
      }
      
      // Switch to this weapon if not already active
      if (this.currentWeaponIndex !== existingWeaponIndex) {
        this.currentWeaponIndex = existingWeaponIndex;
        this.activeWeapon = existingWeapon;
        
        // Remove existing weapon model first
        if (this.weaponViewModel) {
          this.modelContainer.remove(this.weaponViewModel);
          this.weaponViewModel = null;
        }
        
        // Make sure the weapon view updates
        this.updateWeaponViewModel();
        this.updateHandPositions();
        this.playWeaponSwitchAnimation();
        
        console.log("Switched to existing weapon:", this.activeWeapon.name);
      } else {
        console.log("Already equipped with this weapon, added ammo only");
      }
    } else {
      // Add new weapon to arsenal
      this.weapons.push(weapon);
      
      // Switch to the new weapon
      this.currentWeaponIndex = this.weapons.length - 1;
      this.activeWeapon = weapon;
      
      // Remove existing weapon model first
      if (this.weaponViewModel) {
        this.modelContainer.remove(this.weaponViewModel);
        this.weaponViewModel = null;
      }
      
      // Make sure the weapon view updates
      this.updateWeaponViewModel();
      this.updateHandPositions();
      this.playWeaponSwitchAnimation();
      
      console.log("Added new weapon:", this.activeWeapon.name);
    }
    
    // Update display
    this.updateAmmoDisplay();
  }

  /**
   * Switch to next weapon
   */
  nextWeapon() {
    // Skip if dead or only one weapon
    if (this.isDead || this.weapons.length <= 1) {
      return;
    }
    
    // Stop any continuous weapon sound
    this.stopWeaponSound();
    
    // Cycle to next weapon
    this.currentWeaponIndex = (this.currentWeaponIndex + 1) % this.weapons.length;
    this.activeWeapon = this.weapons[this.currentWeaponIndex];
    
    // Play weapon switch animation
    this.playWeaponSwitchAnimation();
    
    // Update ammo display for new weapon
    this.updateAmmoDisplay();
  }

  /**
   * Switch to previous weapon
   */
  prevWeapon() {
    // Skip if dead or only one weapon
    if (this.isDead || this.weapons.length <= 1) {
      return;
    }
    
    // Stop any continuous weapon sound
    this.stopWeaponSound();
    
    // Cycle to previous weapon
    this.currentWeaponIndex = (this.currentWeaponIndex - 1 + this.weapons.length) % this.weapons.length;
    this.activeWeapon = this.weapons[this.currentWeaponIndex];
    
    // Play weapon switch animation
    this.playWeaponSwitchAnimation();
    
    // Update ammo display for new weapon
    this.updateAmmoDisplay();
  }

  /**
   * Play weapon switch animation
   */
  playWeaponSwitchAnimation() {
    if (!this.modelContainer) return;
    
    // Store original position
    const originalY = this.modelContainer.position.y;
    
    // Move down (out of view)
    this.modelContainer.position.y = -1;
    
    // Animate back up
    setTimeout(() => {
      if (this.modelContainer) {
        this.modelContainer.position.y = originalY;
        
        // Ensure hand positions are correctly updated
        this.updateHandPositions();
        
        console.log("Weapon switch animation completed");
      }
    }, 200);
  }

  /**
   * Reload the current weapon
   */
  reload() {
    // Skip if reloading, no weapon, or player is dead
    if (this.isReloading || !this.activeWeapon || this.isDead) {
      return;
    }
    
    // Skip reload if the magazine is already full
    if (this.activeWeapon.currentAmmo === this.activeWeapon.magazineSize) {
      console.log(`${this.activeWeapon.name} magazine already full`);
      return;
    }
    
    // Can't reload if no reserve ammo and weapon doesn't have infinite ammo
    if (this.activeWeapon.totalAmmo <= 0 && !this.activeWeapon.hasInfiniteAmmo) {
      console.log(`No ammo left for ${this.activeWeapon.name}`);
      return;
    }
    
    console.log(`Reloading ${this.activeWeapon.name}...`);
    
    // Stop any ongoing weapon sound (for automatic weapons)
    this.stopWeaponSound();
    
    // Set reloading flag
    this.isReloading = true;
    
    // Play reload animation
    this.playReloadAnimation();
    
    // Play reload sound
    this.playWeaponReloadSound();
    
    // Perform the actual reload calculation now (don't rely on the weapon's internal setTimeout)
    const neededAmmo = this.activeWeapon.magazineSize - this.activeWeapon.currentAmmo;
    let reloadAmount;
    
    if (this.activeWeapon.hasInfiniteAmmo) {
      reloadAmount = neededAmmo;
    } else {
      reloadAmount = Math.min(neededAmmo, this.activeWeapon.totalAmmo);
      // Immediately update the totalAmmo to prevent double-counting
      this.activeWeapon.totalAmmo -= reloadAmount;
    }
    
    // Wait for the reload animation to complete
    setTimeout(() => {
      // Skip if player died during reload
      if (this.isDead) {
        return;
      }
      
      // Add the ammo to the current weapon directly
      this.activeWeapon.currentAmmo += reloadAmount;
      
      // Clear reloading flag
      this.isReloading = false;
      
      // Update ammo display
      this.updateAmmoDisplay();
      
      console.log(`Reload complete: ${this.activeWeapon.currentAmmo}/${this.activeWeapon.totalAmmo}`);
    }, this.activeWeapon.reloadTime * 1000);
  }
  
  /**
   * Switch back to the pistol when other weapons are out of ammo
   */
  switchToPistol() {
    // First try to find by type
    let pistolIndex = this.weapons.findIndex(w => w.type === WeaponTypes.PISTOL);
    
    // If not found by type, try by name as fallback
    if (pistolIndex === -1) {
      pistolIndex = this.weapons.findIndex(w => w.name === 'Pistol');
    }
    
    // If we have a pistol, switch to it
    if (pistolIndex !== -1) {
      // Stop any continuous weapon sound from current weapon
      this.stopWeaponSound();
      
      // Switch to pistol
      this.currentWeaponIndex = pistolIndex;
      this.activeWeapon = this.weapons[this.currentWeaponIndex];
      
      // Remove existing weapon model first
      if (this.weaponViewModel) {
        this.modelContainer.remove(this.weaponViewModel);
        this.weaponViewModel = null;
      }
      
      // Make sure the weapon view updates
      this.updateWeaponViewModel();
      this.updateHandPositions();
      
      // Play weapon switch animation
      this.playWeaponSwitchAnimation();
      
      // Update ammo display for pistol
      this.updateAmmoDisplay();
      
      console.log("Switched to pistol due to ammo depletion");
    } else {
      console.warn("No pistol found to switch to! This shouldn't happen.");
      
      // Last resort: check if we need to initialize a pistol
      if (this.weapons.length === 0) {
        console.log("No weapons found, initializing default pistol");
        this.initializeDefaultWeapon();
      }
    }
  }

  /**
   * Set nearby wall buy for interaction
   * @param {WallBuy} wallBuy - The wall buy in proximity, or null if none
   */
  setNearbyWallBuy(wallBuy) {
    this.nearbyWallBuy = wallBuy;
  }

  /**
   * Update hands and weapon animations
   * @param {number} deltaTime - Time elapsed since last frame
   */
  updateHandsAndWeaponAnimations(deltaTime) {
    if (!this.modelContainer) return;
    
    // Base position and rotation
    let targetPosY = -0.005;
    let targetRotZ = 0;
    let targetRotX = 0;
    
    // Add movement based on velocity
    const speed = Math.sqrt(
      this.velocity.x * this.velocity.x + 
      this.velocity.z * this.velocity.z
    );
    
    // Bob up and down when moving
    if (speed > 0.1) {
      // Walking/running bob
      const bobFrequency = this.running ? 10 : 5;
      const bobAmount = this.running ? 0.02 : 0.01;
      targetPosY += Math.sin(performance.now() / 1000 * bobFrequency) * bobAmount;
      
      // Slight tilt when moving
      targetRotZ = this.moveLeft ? 0.02 : (this.moveRight ? -0.02 : 0);
    }
    
    // Smooth movement with lerp
    this.modelContainer.position.y = this.lerp(
      this.modelContainer.position.y,
      targetPosY,
      10 * deltaTime
    );
    
    this.modelContainer.rotation.z = this.lerp(
      this.modelContainer.rotation.z,
      targetRotZ,
      5 * deltaTime
    );
    
    this.modelContainer.rotation.x = this.lerp(
      this.modelContainer.rotation.x,
      targetRotX,
      5 * deltaTime
    );
    
    // Update mystery weapon animations if present
    if (this.weaponViewModel && this.weaponViewModel.userData && 
        this.weaponViewModel.userData.isMysteryWeapon && 
        typeof this.weaponViewModel.userData.update === 'function') {
      this.weaponViewModel.userData.update(deltaTime);
    }
  }
  
  /**
   * Linear interpolation helper
   * @param {number} a - Start value
   * @param {number} b - Target value
   * @param {number} t - Interpolation factor
   * @returns {number} Interpolated value
   */
  lerp(a, b, t) {
    return a + (b - a) * Math.min(t, 1);
  }

  /**
   * Play weapon shooting sound based on current weapon
   * @returns {HTMLAudioElement} The audio element being played
   */
  playWeaponShootSound() {
    if (!this.audioUnlocked) return null;
    
    try {
      let audio = null;
      let isContinuousSound = false;
      
      // Determine which sound to play based on weapon type
      if (this.activeWeapon) {
        switch (this.activeWeapon.type) {
          case 'shotgun':
            // Try to get from pool first
            audio = this.getFromAudioPool('shotgunShoot');
            
            // Fallback to direct audio element
            if (!audio) {
              audio = this.audioElements.shotgunShoot;
            }
            break;
          
          case 'assaultRifle':
            // For assault rifle, use looping sound if holding trigger
            if (this.shooting) {
              audio = this.audioElements.machineGunShoot;
              audio.loop = true;
              isContinuousSound = true; // Mark as continuous sound for mobile check
            } else {
              // For single shot, use pooled sound
              audio = this.getFromAudioPool('machineGunShoot');
              
              // Fallback to direct audio element
              if (!audio) {
                audio = this.audioElements.machineGunShoot;
                audio.loop = false;
              }
            }
            break;
          
          case 'pistol':
          default:
            // Try to get from pool first
            audio = this.getFromAudioPool('pistolShoot');
            
            // Fallback to direct audio element
            if (!audio) {
              audio = this.audioElements.pistolShoot;
            }
            break;
        }
      } else {
        // Default to pistol sound if no weapon
        audio = this.audioElements.pistolShoot;
      }
      
      // Check if this is a continuous sound that should be skipped on mobile
      if (isContinuousSound && this.mobileAudioSettings && this.mobileAudioSettings.disableContinuousSounds) {
        console.log("Skipping continuous weapon sound on mobile");
        return null;
      }
      
      // Play the sound if we found a valid audio element
      if (audio) {
        // Reset to start
        audio.currentTime = 0;
        
        // If not already tracked, add to active sounds
        if (!this.activeAudio.includes(audio)) {
          this.activeAudio.push(audio);
          
          // Remove from active sounds when done (for non-looping sounds)
          if (!audio.loop) {
            const handleEnded = () => {
              this.activeAudio = this.activeAudio.filter(a => a !== audio);
              audio.removeEventListener('ended', handleEnded);
            };
            
            audio.addEventListener('ended', handleEnded);
          }
        }
        
        // Play the sound
        audio.play().catch(error => {
          console.warn(`Error playing weapon sound: ${error}`);
        });
        
        return audio;
      }
    } catch (error) {
      console.error(`Error in playWeaponShootSound: ${error}`);
    }
    
    return null;
  }

  /**
   * Stop the current weapon sound, particularly for automatic weapons
   */
  stopWeaponSound() {
    if (!this.activeWeapon || !this.audioUnlocked) return;
    
    try {
      let audio = null;
      
      // Only needed for continuous fire weapons like the assault rifle
      if (this.activeWeapon.name === 'Assault Rifle') {
        audio = this.audioElements.machineGunShoot;
        
        if (audio && !audio.paused) {
          audio.pause();
          audio.currentTime = 0;
        }
      }
    } catch (error) {
      console.error(`Error in stopWeaponSound: ${error}`);
    }
  }

  /**
   * Play the appropriate reload sound based on the active weapon
   */
  playWeaponReloadSound() {
    if (!this.activeWeapon || !this.audioUnlocked) return;
    
    try {
      let audio = null;
      
      // Select the appropriate audio based on weapon name
      if (this.activeWeapon.name === 'Pistol') {
        audio = this.audioElements.pistolReload;
      } else if (this.activeWeapon.name === 'Shotgun') {
        audio = this.audioElements.shotgunReload;
      } else if (this.activeWeapon.name === 'Assault Rifle') {
        audio = this.audioElements.machineGunReload;
      } else {
        // Default to pistol for other weapons
        audio = this.audioElements.pistolReload;
      }
      
      // Play the sound if available
      if (audio) {
        // Reset audio to start if it's already playing
        audio.currentTime = 0;
        audio.play().catch(error => {
          console.warn(`Error playing reload sound: ${error}`);
        });
      }
    } catch (error) {
      console.error(`Error in playWeaponReloadSound: ${error}`);
    }
  }

  /**
   * Play walking sound
   */
  playWalkingSound() {
    if (!this.audioUnlocked) return;
    
    // Skip walking sounds on mobile to reduce audio load
    if (this.mobileAudioSettings && this.mobileAudioSettings.disableContinuousSounds) {
      return;
    }
    
    if (this.audioElements.playerWalk) {
      if (this.audioElements.playerWalk.paused) {
        this.audioElements.playerWalk.currentTime = 0;
        this.audioElements.playerWalk.play().catch(error => {
          console.warn(`Error playing walking sound: ${error}`);
        });
        // Set tracking variable for playing state
        this.isWalkSoundPlaying = true;
      }
      // No need to restart if already playing
    }
  }
  
  /**
   * Stop walking sound when player stops moving
   */
  stopWalkingSound() {
    try {
      const audio = this.audioElements.playerWalk;
      if (audio && !audio.paused) {
        audio.pause();
        if (audio.fastSeek) {
          audio.fastSeek(0);
        } else {
          audio.currentTime = 0;
        }
        this.isWalkSoundPlaying = false;
      }
    } catch (error) {
      console.error(`Error in stopWalkingSound: ${error}`);
    }
  }

  /**
   * Play window board add sound
   */
  playWindowBoardAddSound() {
    if (!this.audioUnlocked) return;
    
    try {
      const audio = this.audioElements.windowBoardAdd;
      if (audio) {
        // Reset audio to start if already playing
        audio.currentTime = 0;
        audio.play().catch(error => {
          console.warn(`Error playing window board add sound: ${error}`);
        });
      }
    } catch (error) {
      console.error(`Error in playWindowBoardAddSound: ${error}`);
    }
  }
  
  /**
   * Play window board breaking sound
   */
  playWindowBoardBreakingSound() {
    if (!this.audioUnlocked) return;
    
    try {
      const audio = this.audioElements.windowBoardBreaking;
      if (audio) {
        // Set playback to start at 0.45 seconds as requested
        audio.currentTime = 0.45;
        
        // Create a timeout to stop the sound at 2 seconds (1.55 seconds of actual playback)
        const stopSound = () => {
          audio.pause();
          audio.currentTime = 0.45; // Reset to beginning of our segment
        };
        
        // Play the audio
        audio.play().then(() => {
          // Set timeout to stop after 1.55 seconds of playback
          setTimeout(stopSound, 1550);
        }).catch(error => {
          console.warn(`Error playing window board breaking sound: ${error}`);
        });
      }
    } catch (error) {
      console.error(`Error in playWindowBoardBreakingSound: ${error}`);
    }
  }

  /**
   * Pause background music
   */
  pauseBackgroundMusic() {
    if (this.audioUnlocked && this.audioElements.backgroundMusic) {
      this.audioElements.backgroundMusic.pause();
      console.log('Background music paused');
    }
  }

  /**
   * Resume background music
   */
  resumeBackgroundMusic() {
    if (this.audioUnlocked && this.audioElements.backgroundMusic) {
      this.audioElements.backgroundMusic.play().catch(error => {
        console.warn('Could not resume background music:', error);
      });
      console.log('Background music resumed');
    }
  }

  /**
   * Play a random zombie sound
   * @param {THREE.Vector3} zombiePosition - Position of the zombie (for potential future 3D audio)
   * @returns {HTMLAudioElement} The audio element that was played
   */
  playRandomZombieSound(zombiePosition) {
    if (!this.audioUnlocked) return null;
    
    // On mobile, limit zombie sounds more aggressively for better performance
    if (this.isMobileDevice()) {
      // Only play 33% of zombie sounds on mobile
      if (Math.random() > 0.33) return null;
      
      // Skip if at sound limit
      if (this.activeAudio.length >= this.maxConcurrentAudio) return null;
    }
    
    try {
      // Try to get from the zombie sound pool first
      let audio = this.getFromAudioPool('zombieSound');
      
      // If no pooled sound available, fall back to random selection
      if (!audio) {
        // Get all zombie sound elements
        const zombieSounds = [
          this.audioElements.zombieSound1,
          this.audioElements.zombieSound2,
          this.audioElements.zombieSound3,
          this.audioElements.zombieSound4,
          this.audioElements.zombieSound5
        ].filter(sound => sound !== null);
        
        if (zombieSounds.length === 0) return null;
        
        // Choose a random sound
        const randomIndex = Math.floor(Math.random() * zombieSounds.length);
        audio = zombieSounds[randomIndex];
      }
      
      if (audio) {
        // Set volume based on distance (simplified for now)
        audio.volume = 0.4; // Lower volume than default
        
        // Reset to beginning
        audio.currentTime = 0;
        
        // Track active sounds (if not already tracked via pool)
        if (!this.activeAudio.includes(audio)) {
          this.activeAudio.push(audio);
          
          // Remove from active sounds when done
          const handleEnded = () => {
            this.activeAudio = this.activeAudio.filter(a => a !== audio);
            audio.removeEventListener('ended', handleEnded);
          };
          
          audio.addEventListener('ended', handleEnded);
        }
        
        // Play the sound
        audio.play().catch(error => {
          console.warn(`Error playing zombie sound: ${error}`);
        });
        
        return audio;
      }
    } catch (error) {
      console.error(`Error in playRandomZombieSound: ${error}`);
    }
    
    return null;
  }

  /**
   * Reset player position to center of room
   */
  resetPosition() {
    console.log("Resetting player position");
    
    // Reset to position (0,0,0) which is the center of the room
    this.camera.position.set(0, this.height, 0);
    this.camera.rotation.set(0, 0, 0);
    
    // Reset movement flags
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.running = false;
    
    // Reset velocity
    this.velocity.set(0, 0, 0);
    
    // Reset stamina
    this.stamina = this.maxStamina;
  }
  
  /**
   * Reset player health to maximum
   */
  resetHealth() {
    console.log("Resetting player health");
    
    // Reset health to maximum
    this.health = this.maxHealth;
    
    // Reset damage-related flags
    this.isDead = false;
    this.dead = false;
    this.lastDamageTime = 0;
    this.regenEffectActive = false;
    this.isRegenerating = false;
    this.healthAccumulator = 0;
    
    // Update the health bar UI
    this.updateHealthDisplay();
  }
  
  /**
   * Reset player score to zero
   */
  resetScore() {
    console.log("Resetting player score");
    
    // Reset score to zero
    this.score = 0;
    
    // Update the score display
    if (this.scoreDisplay) {
      this.scoreDisplay.textContent = `POINTS: ${this.score}`;
    } else {
      // Create score display if it doesn't exist
      this.createScoreDisplay();
    }
  }
  
  /**
   * Reset player weapons to default loadout
   */
  resetWeapons() {
    console.log("Resetting player weapons");
    
    // Clear existing weapons
    this.weapons = [];
    
    // Add default pistol using the proper weapon type definition
    const defaultPistol = new Weapon(WeaponTypes.PISTOL);
    
    // Initialize and add the weapon
    defaultPistol.init();
    this.equipWeapon(defaultPistol);
    
    // Set current weapon to pistol
    this.currentWeaponIndex = 0;
    this.activeWeapon = this.weapons[0];
    
    // Update weapon model and display
    this.updateWeaponViewModel();
    this.updateAmmoDisplay();
    
    // Update hand positions for the current weapon
    this.updateHandPositions();
  }

  /**
   * Apply mobile movement based on joystick input
   * @param {number} dirX X direction (-1 to 1)
   * @param {number} dirY Y direction (-1 to 1)
   */
  applyMobileMovement(dirX, dirY) {
    // Only apply if we're on mobile and not dead
    if (this.isDead) {
      return;
    }
    
    // Skip if movement is disabled
    if (!this.movementEnabled) {
      return;
    }
    
    // If the joystick is too close to center, ignore it (deadzone)
    const threshold = 0.2;
    const hasMovement = Math.abs(dirX) > threshold || Math.abs(dirY) > threshold;
    
    if (!hasMovement) {
      // Reset movement states when in deadzone
      this.moveForward = false;
      this.moveBackward = false;
      this.moveLeft = false;
      this.moveRight = false;
      this.stopWalkingSound();
      return;
    }
    
    console.log("Applying mobile movement, dirX:", dirX.toFixed(2), "dirY:", dirY.toFixed(2));
    
    // Calculate the delta time ourselves if not provided
    const deltaTime = 1/60; // Assume 60fps if no better value
    
    // Set movement flags based on joystick position for other systems to use
    this.moveForward = dirY < -threshold;
    this.moveBackward = dirY > threshold;
    this.moveLeft = dirX < -threshold;
    this.moveRight = dirX > threshold;
    
    // Calculate run speed multiplier and update stamina
    const speedMultiplier = this.running ? this.runMultiplier : 1;
    
    // Handle stamina for running
    if (this.running) {
      // Reduce stamina when running
      this.stamina = Math.max(0, this.stamina - this.staminaDecayRate * deltaTime);
      
      // If stamina depleted, stop running
      if (this.stamina <= 0) {
        this.running = false;
      }
    }
    
    // Get current position for collision checks
    const previousPosition = this.camera.position.clone();
    
    // Calculate move speed based on dirY (forward/backward) 
    const moveSpeedZ = this.moveSpeed * speedMultiplier * deltaTime;
    // Use dirY for forward/backward movement (y is inverted, negative is forward)
    const forwardAmount = -dirY * moveSpeedZ;
    
    // Calculate strafe speed based on dirX (left/right)
    const moveSpeedX = this.moveSpeed * speedMultiplier * deltaTime;
    // Use dirX for left/right movement
    const strafeAmount = dirX * moveSpeedX;
    
    // Try to move forward/backward
    if (forwardAmount !== 0) {
      // Create a movement vector in the direction the camera is facing
      const forwardVector = new THREE.Vector3(0, 0, -1);
      forwardVector.applyQuaternion(this.camera.quaternion);
      forwardVector.y = 0; // Keep movement on xz plane
      forwardVector.normalize();
      
      // Apply movement
      this.camera.position.addScaledVector(forwardVector, forwardAmount);
      
      // Check for collision and revert if needed
      if (this.checkWallCollision(this.camera.position)) {
        this.camera.position.copy(previousPosition);
      } else {
        // Update previous position for next movement
        previousPosition.copy(this.camera.position);
      }
    }
    
    // Try to move left/right
    if (strafeAmount !== 0) {
      // Create a movement vector perpendicular to the direction the camera is facing
      const strafeVector = new THREE.Vector3(1, 0, 0);
      strafeVector.applyQuaternion(this.camera.quaternion);
      strafeVector.y = 0; // Keep movement on xz plane
      strafeVector.normalize();
      
      // Apply movement
      this.camera.position.addScaledVector(strafeVector, strafeAmount);
      
      // Check for collision and revert if needed
      if (this.checkWallCollision(this.camera.position)) {
        this.camera.position.copy(previousPosition);
      }
    }
    
    // Keep player at constant height
    this.camera.position.y = this.height;
    
    // Play walking sound if moving
    if (hasMovement) {
      this.playWalkingSound();
    } else {
      this.stopWalkingSound();
    }
  }
  
  /**
   * Check if device is mobile
   * @returns {boolean} True if running on mobile device
   */
  isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
} 