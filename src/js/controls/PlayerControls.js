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
            const enemy = zombieObject.userData.enemy;
            
            // Apply damage to zombie
            if (isHeadshot) {
              const damageDealt = fireData.headDamage;
              
              // If we're a client, use the special client damage method that handles networking
              if (this.networkManager && !this.networkManager.isHost) {
                enemy.clientTakeDamage(damageDealt, true, this.networkManager);
              } else {
                // Otherwise just apply damage directly (for host or single player)
                enemy.takeDamage(damageDealt);
              }
              
              this.showDamageNumber(hit.point, damageDealt, true);
              
              // Add points based on damage (headshots are worth more)
              this.addPoints(damageDealt * 2, false, true);
              
              // If this damage kills the zombie, award bonus points
              if (enemy.health <= 0) {
                this.addPoints(100, true, true); // Headshot kill bonus
              }
            } else {
              // Handle body shots
              const damageDealt = fireData.bodyDamage;
              
              // If we're a client, use the special client damage method that handles networking
              if (this.networkManager && !this.networkManager.isHost) {
                enemy.clientTakeDamage(damageDealt, false, this.networkManager);
              } else {
                // Otherwise just apply damage directly (for host or single player)
                enemy.takeDamage(damageDealt);
              }
              
              this.showDamageNumber(hit.point, damageDealt, false);
              
              // Add points based on damage
              this.addPoints(damageDealt, false, false);
              
              // If this damage kills the zombie, award bonus points
              if (enemy.health <= 0) {
                this.addPoints(50, true, false); // Regular kill bonus
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
    
    // If in multiplayer game, immediately notify other players of death state
    if (this.gameEngine && this.gameEngine.networkManager && this.gameEngine.networkManager.isMultiplayer) {
      console.log("Sending death state to other players");
      
      // Force an immediate position update to broadcast death state
      if (this.gameEngine.networkManager.network && typeof this.gameEngine.networkManager.network.sendPlayerPosition === 'function') {
        this.gameEngine.networkManager.network.sendPlayerPosition();
        
        // Send multiple updates to ensure it's received
        setTimeout(() => {
          if (this.gameEngine && this.gameEngine.networkManager && 
              this.gameEngine.networkManager.network && 
              this.gameEngine.networkManager.isConnected) {
            this.gameEngine.networkManager.network.sendPlayerPosition();
          }
        }, 100);
        
        setTimeout(() => {
          if (this.gameEngine && this.gameEngine.networkManager && 
              this.gameEngine.networkManager.network && 
              this.gameEngine.networkManager.isConnected) {
            this.gameEngine.networkManager.network.sendPlayerPosition();
          }
        }, 300);
      }
    }
    
    // Signal the engine that the game is over
    if (this.gameEngine) {
      this.gameEngine.endGame();
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