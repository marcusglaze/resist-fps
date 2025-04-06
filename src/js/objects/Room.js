import * as THREE from 'three';
import { Window } from './Window';
import { EnemyManager } from './EnemyManager';
import { WallBuy } from '../weapons/WallBuy';
import { WeaponTypes } from '../weapons/Weapon';
import { MysteryBox } from './MysteryBox';

/**
 * Creates a 3D room with windows
 */
export class Room {
  constructor(debugMode = false) {
    // Room dimensions
    this.width = 10;
    this.height = 3;
    this.depth = 10;
    
    // Debug mode flag
    this.debugMode = debugMode;
    
    // Group to hold all room elements
    this.instance = new THREE.Group();
    
    // Materials
    this.wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5f5f5, // Off-white
      roughness: 0.8,
      metalness: 0.2
    });
    
    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x725f4c, // Wood brown
      roughness: 0.9,
      metalness: 0.1
    });
    
    this.ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, // White
      roughness: 0.95,
      metalness: 0.1
    });
    
    // Debug material
    this.debugMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      wireframe: true,
      transparent: true,
      opacity: 0.5
    });
    
    // Windows
    this.windows = [];
    
    // Window positions (middle of each wall)
    this.windowPositions = [
      { x: 0, y: 1.5, z: this.depth / 2, rotation: 0 },              // North
      { x: this.width / 2, y: 1.5, z: 0, rotation: Math.PI / 2 },    // East
      { x: 0, y: 1.5, z: -this.depth / 2, rotation: Math.PI },       // South
      { x: -this.width / 2, y: 1.5, z: 0, rotation: -Math.PI / 2 }   // West
    ];
    
    // Window dimensions
    this.windowWidth = 2;
    this.windowHeight = 1.5;
    
    // Wall thickness
    this.wallThickness = 0.1;
    
    // Player reference (will be set later)
    this.player = null;
    
    // UI elements
    this.uiElements = {
      interactionText: null,
      statusDisplay: null,
      zombieCounter: null,
      holdProgressBar: null
    };
    
    // Enemy manager
    this.enemyManager = null;
    
    // Window directions for display
    this.windowDirections = ['North', 'East', 'South', 'West'];
    
    // Wall buys
    this.wallBuys = [];
    
    // Mystery box
    this.mysteryBox = null;
    this.nearbyMysteryBox = null;
    
    // Hold to buy mechanic
    this.fKeyHoldStartTime = 0;
    this.fKeyHoldDuration = 0.25; // Reduced to 0.25 seconds (250ms) for a quicker interaction
    this.isHoldingF = false;
    this.holdInteractionType = null; // 'mysteryBox' or 'wallBuy'
    this.nearbyWallBuyRef = null; // Reference to nearby wall buy
  }

  /**
   * Initialize room and objects
   */
  init() {
    // Clear any existing elements
    while(this.instance.children.length > 0) { 
      this.instance.remove(this.instance.children[0]); 
    }
    
    // Create basic room elements
    this.createFloor();
    this.createCeiling();
    this.createWalls();
    this.createWindows();
    
    // Add wall buys for weapons
    this.createWallBuys();
    
    // Create mystery box
    this.createMysteryBox();
    
    // Add collision visualization if debug mode is on
    if (this.debugMode) {
      this.createCollisionVisualization();
    }
    
    // Create UI elements for interaction
    this.createUIElements();
    
    // Initialize enemy manager
    this.enemyManager = new EnemyManager(this.instance, this.windows);
    this.enemyManager.init();
    
    // Set game engine reference if available (through the player's gameEngine reference)
    if (this.player && this.player.gameEngine) {
      this.enemyManager.setGameEngine(this.player.gameEngine);
    }
    
    // Log for debugging
    console.log(`Room initialized with ${this.instance.children.length} objects`);
  }

  /**
   * Set player reference for interaction checks
   * @param {PlayerControls} player - The player controller
   */
  setPlayer(player) {
    this.player = player;
    
    // Also set player reference in enemy manager
    if (this.enemyManager) {
      this.enemyManager.setPlayer(player);
      
      // Set game engine reference to the enemy manager
      if (player.gameEngine) {
        this.enemyManager.setGameEngine(player.gameEngine);
      }
    }
  }

  /**
   * Create the floor
   */
  createFloor() {
    const floorGeometry = new THREE.PlaneGeometry(this.width, this.depth);
    const floor = new THREE.Mesh(floorGeometry, this.floorMaterial);
    
    // Rotate and position
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    
    // Enable shadows
    floor.receiveShadow = true;
    
    // Add metadata for identification
    floor.userData = { isFloor: true };
    
    this.instance.add(floor);
  }

  /**
   * Create the ceiling
   */
  createCeiling() {
    const ceilingGeometry = new THREE.PlaneGeometry(this.width, this.depth);
    const ceiling = new THREE.Mesh(ceilingGeometry, this.ceilingMaterial);
    
    // Rotate and position
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = this.height;
    
    // Enable shadows
    ceiling.receiveShadow = true;
    
    // Add metadata for identification
    ceiling.userData = { isCeiling: true };
    
    this.instance.add(ceiling);
  }

  /**
   * Create walls with window cutouts
   */
  createWalls() {
    // Create each wall
    this.createNorthWall();
    this.createEastWall();
    this.createSouthWall();
    this.createWestWall();
  }
  
  /**
   * Create the north wall (Z+)
   */
  createNorthWall() {
    const windowWidth = this.windowWidth;
    const windowHeight = this.windowHeight;
    const wallWidth = this.width;
    const wallHeight = this.height;
    const wallDepth = this.wallThickness;
    
    // Create wall group
    const wallGroup = new THREE.Group();
    wallGroup.position.set(0, this.height / 2, this.depth / 2);
    wallGroup.userData = { isWall: true, direction: 'north' };
    
    // Left section
    const leftWidth = (wallWidth / 2) - (windowWidth / 2);
    const leftGeometry = new THREE.BoxGeometry(leftWidth, wallHeight, wallDepth);
    const leftSection = new THREE.Mesh(leftGeometry, this.wallMaterial);
    leftSection.position.set(-wallWidth / 4 - windowWidth / 4, 0, 0);
    leftSection.userData = { isWall: true };
    leftSection.castShadow = true;
    leftSection.receiveShadow = true;
    wallGroup.add(leftSection);
    
    // Right section
    const rightWidth = (wallWidth / 2) - (windowWidth / 2);
    const rightGeometry = new THREE.BoxGeometry(rightWidth, wallHeight, wallDepth);
    const rightSection = new THREE.Mesh(rightGeometry, this.wallMaterial);
    rightSection.position.set(wallWidth / 4 + windowWidth / 4, 0, 0);
    rightSection.userData = { isWall: true };
    rightSection.castShadow = true;
    rightSection.receiveShadow = true;
    wallGroup.add(rightSection);
    
    // Top section
    const topHeight = (wallHeight / 2) - (windowHeight / 2);
    const topGeometry = new THREE.BoxGeometry(windowWidth, topHeight, wallDepth);
    const topSection = new THREE.Mesh(topGeometry, this.wallMaterial);
    topSection.position.set(0, wallHeight / 4 + windowHeight / 4, 0);
    topSection.userData = { isWall: true };
    topSection.castShadow = true;
    topSection.receiveShadow = true;
    wallGroup.add(topSection);
    
    // Bottom section
    const bottomHeight = (wallHeight / 2) - (windowHeight / 2);
    const bottomGeometry = new THREE.BoxGeometry(windowWidth, bottomHeight, wallDepth);
    const bottomSection = new THREE.Mesh(bottomGeometry, this.wallMaterial);
    bottomSection.position.set(0, -wallHeight / 4 - windowHeight / 4, 0);
    bottomSection.userData = { isWall: true };
    bottomSection.castShadow = true;
    bottomSection.receiveShadow = true;
    wallGroup.add(bottomSection);
    
    this.instance.add(wallGroup);
  }
  
  /**
   * Create the east wall (X+)
   */
  createEastWall() {
    const windowWidth = this.windowWidth;
    const windowHeight = this.windowHeight;
    const wallWidth = this.depth;
    const wallHeight = this.height;
    const wallDepth = this.wallThickness;
    
    // Create wall group
    const wallGroup = new THREE.Group();
    wallGroup.position.set(this.width / 2, this.height / 2, 0);
    wallGroup.rotation.y = Math.PI / 2;
    wallGroup.userData = { isWall: true, direction: 'east' };
    
    // Left section (front in Z- direction)
    const leftWidth = (wallWidth / 2) - (windowWidth / 2);
    const leftGeometry = new THREE.BoxGeometry(leftWidth, wallHeight, wallDepth);
    const leftSection = new THREE.Mesh(leftGeometry, this.wallMaterial);
    leftSection.position.set(-wallWidth / 4 - windowWidth / 4, 0, 0);
    leftSection.userData = { isWall: true };
    leftSection.castShadow = true;
    leftSection.receiveShadow = true;
    wallGroup.add(leftSection);
    
    // Right section (back in Z+ direction)
    const rightWidth = (wallWidth / 2) - (windowWidth / 2);
    const rightGeometry = new THREE.BoxGeometry(rightWidth, wallHeight, wallDepth);
    const rightSection = new THREE.Mesh(rightGeometry, this.wallMaterial);
    rightSection.position.set(wallWidth / 4 + windowWidth / 4, 0, 0);
    rightSection.userData = { isWall: true };
    rightSection.castShadow = true;
    rightSection.receiveShadow = true;
    wallGroup.add(rightSection);
    
    // Top section
    const topHeight = (wallHeight / 2) - (windowHeight / 2);
    const topGeometry = new THREE.BoxGeometry(windowWidth, topHeight, wallDepth);
    const topSection = new THREE.Mesh(topGeometry, this.wallMaterial);
    topSection.position.set(0, wallHeight / 4 + windowHeight / 4, 0);
    topSection.userData = { isWall: true };
    topSection.castShadow = true;
    topSection.receiveShadow = true;
    wallGroup.add(topSection);
    
    // Bottom section
    const bottomHeight = (wallHeight / 2) - (windowHeight / 2);
    const bottomGeometry = new THREE.BoxGeometry(windowWidth, bottomHeight, wallDepth);
    const bottomSection = new THREE.Mesh(bottomGeometry, this.wallMaterial);
    bottomSection.position.set(0, -wallHeight / 4 - windowHeight / 4, 0);
    bottomSection.userData = { isWall: true };
    bottomSection.castShadow = true;
    bottomSection.receiveShadow = true;
    wallGroup.add(bottomSection);
    
    this.instance.add(wallGroup);
  }
  
  /**
   * Create the south wall (Z-)
   */
  createSouthWall() {
    const windowWidth = this.windowWidth;
    const windowHeight = this.windowHeight;
    const wallWidth = this.width;
    const wallHeight = this.height;
    const wallDepth = this.wallThickness;
    
    // Create wall group
    const wallGroup = new THREE.Group();
    wallGroup.position.set(0, this.height / 2, -this.depth / 2);
    wallGroup.rotation.y = Math.PI;
    wallGroup.userData = { isWall: true, direction: 'south' };
    
    // Left section
    const leftWidth = (wallWidth / 2) - (windowWidth / 2);
    const leftGeometry = new THREE.BoxGeometry(leftWidth, wallHeight, wallDepth);
    const leftSection = new THREE.Mesh(leftGeometry, this.wallMaterial);
    leftSection.position.set(-wallWidth / 4 - windowWidth / 4, 0, 0);
    leftSection.userData = { isWall: true };
    leftSection.castShadow = true;
    leftSection.receiveShadow = true;
    wallGroup.add(leftSection);
    
    // Right section
    const rightWidth = (wallWidth / 2) - (windowWidth / 2);
    const rightGeometry = new THREE.BoxGeometry(rightWidth, wallHeight, wallDepth);
    const rightSection = new THREE.Mesh(rightGeometry, this.wallMaterial);
    rightSection.position.set(wallWidth / 4 + windowWidth / 4, 0, 0);
    rightSection.userData = { isWall: true };
    rightSection.castShadow = true;
    rightSection.receiveShadow = true;
    wallGroup.add(rightSection);
    
    // Top section
    const topHeight = (wallHeight / 2) - (windowHeight / 2);
    const topGeometry = new THREE.BoxGeometry(windowWidth, topHeight, wallDepth);
    const topSection = new THREE.Mesh(topGeometry, this.wallMaterial);
    topSection.position.set(0, wallHeight / 4 + windowHeight / 4, 0);
    topSection.userData = { isWall: true };
    topSection.castShadow = true;
    topSection.receiveShadow = true;
    wallGroup.add(topSection);
    
    // Bottom section
    const bottomHeight = (wallHeight / 2) - (windowHeight / 2);
    const bottomGeometry = new THREE.BoxGeometry(windowWidth, bottomHeight, wallDepth);
    const bottomSection = new THREE.Mesh(bottomGeometry, this.wallMaterial);
    bottomSection.position.set(0, -wallHeight / 4 - windowHeight / 4, 0);
    bottomSection.userData = { isWall: true };
    bottomSection.castShadow = true;
    bottomSection.receiveShadow = true;
    wallGroup.add(bottomSection);
    
    this.instance.add(wallGroup);
  }
  
  /**
   * Create the west wall (X-)
   */
  createWestWall() {
    const windowWidth = this.windowWidth;
    const windowHeight = this.windowHeight;
    const wallWidth = this.depth;
    const wallHeight = this.height;
    const wallDepth = this.wallThickness;
    
    // Create wall group
    const wallGroup = new THREE.Group();
    wallGroup.position.set(-this.width / 2, this.height / 2, 0);
    wallGroup.rotation.y = -Math.PI / 2;
    wallGroup.userData = { isWall: true, direction: 'west' };
    
    // Left section (back in Z+ direction)
    const leftWidth = (wallWidth / 2) - (windowWidth / 2);
    const leftGeometry = new THREE.BoxGeometry(leftWidth, wallHeight, wallDepth);
    const leftSection = new THREE.Mesh(leftGeometry, this.wallMaterial);
    leftSection.position.set(-wallWidth / 4 - windowWidth / 4, 0, 0);
    leftSection.userData = { isWall: true };
    leftSection.castShadow = true;
    leftSection.receiveShadow = true;
    wallGroup.add(leftSection);
    
    // Right section (front in Z- direction)
    const rightWidth = (wallWidth / 2) - (windowWidth / 2);
    const rightGeometry = new THREE.BoxGeometry(rightWidth, wallHeight, wallDepth);
    const rightSection = new THREE.Mesh(rightGeometry, this.wallMaterial);
    rightSection.position.set(wallWidth / 4 + windowWidth / 4, 0, 0);
    rightSection.userData = { isWall: true };
    rightSection.castShadow = true;
    rightSection.receiveShadow = true;
    wallGroup.add(rightSection);
    
    // Top section
    const topHeight = (wallHeight / 2) - (windowHeight / 2);
    const topGeometry = new THREE.BoxGeometry(windowWidth, topHeight, wallDepth);
    const topSection = new THREE.Mesh(topGeometry, this.wallMaterial);
    topSection.position.set(0, wallHeight / 4 + windowHeight / 4, 0);
    topSection.userData = { isWall: true };
    topSection.castShadow = true;
    topSection.receiveShadow = true;
    wallGroup.add(topSection);
    
    // Bottom section
    const bottomHeight = (wallHeight / 2) - (windowHeight / 2);
    const bottomGeometry = new THREE.BoxGeometry(windowWidth, bottomHeight, wallDepth);
    const bottomSection = new THREE.Mesh(bottomGeometry, this.wallMaterial);
    bottomSection.position.set(0, -wallHeight / 4 - windowHeight / 4, 0);
    bottomSection.userData = { isWall: true };
    bottomSection.castShadow = true;
    bottomSection.receiveShadow = true;
    wallGroup.add(bottomSection);
    
    this.instance.add(wallGroup);
  }

  /**
   * Create windows for the room
   */
  createWindows() {
    this.windows = []; // Clear existing windows
    
    this.windowPositions.forEach((pos, index) => {
      const window = new Window(this.windowWidth, this.windowHeight); // Width and height of window
      window.init();
      
      // Set window index for network synchronization
      window.windowIndex = index;
      
      // Position and rotate window
      window.instance.position.set(pos.x, pos.y, pos.z);
      window.instance.rotation.y = pos.rotation;
      
      // Add window to the room group
      this.instance.add(window.instance);
      this.windows.push(window);
    });
  }

  /**
   * Create visualization for collision boundaries
   */
  createCollisionVisualization() {
    const playerRadius = 0.5; // Same as in PlayerControls.js
    const buffer = playerRadius + this.wallThickness;
    
    // Create a box showing the collision boundaries
    const boundaryWidth = this.width - buffer * 2;
    const boundaryDepth = this.depth - buffer * 2;
    const boundaryHeight = this.height;
    
    const boundaryGeometry = new THREE.BoxGeometry(
      boundaryWidth, 
      boundaryHeight, 
      boundaryDepth
    );
    
    const boundary = new THREE.Mesh(boundaryGeometry, this.debugMaterial);
    boundary.position.set(0, boundaryHeight / 2, 0);
    
    this.instance.add(boundary);
  }

  /**
   * Create UI elements for interactions
   */
  createUIElements() {
    // Create a container for text elements
    const interactionContainer = document.createElement('div');
    interactionContainer.className = 'interaction-prompt';
    interactionContainer.style.position = 'absolute';
    interactionContainer.style.bottom = '50px';
    interactionContainer.style.left = '50%';
    interactionContainer.style.transform = 'translateX(-50%)';
    interactionContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    interactionContainer.style.color = 'white';
    interactionContainer.style.padding = '10px 20px';
    interactionContainer.style.borderRadius = '5px';
    interactionContainer.style.fontFamily = 'Arial, sans-serif';
    interactionContainer.style.fontSize = '18px';
    interactionContainer.style.display = 'none';
    interactionContainer.style.pointerEvents = 'none';
    
    // Create interaction text
    const interactionText = document.createElement('div');
    interactionText.id = 'interaction-text';
    interactionText.textContent = 'Press F to board up window';
    
    // Add to container
    interactionContainer.appendChild(interactionText);
    
    // Create hold progress bar
    const holdProgressContainer = document.createElement('div');
    holdProgressContainer.style.marginTop = '10px';
    holdProgressContainer.style.width = '100%';
    holdProgressContainer.style.height = '8px'; // Increased from 5px to 8px for better visibility
    holdProgressContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
    holdProgressContainer.style.borderRadius = '4px';
    holdProgressContainer.style.display = 'none';
    
    const holdProgressBar = document.createElement('div');
    holdProgressBar.style.width = '0%';
    holdProgressBar.style.height = '100%';
    holdProgressBar.style.background = 'linear-gradient(to right, #4FC3F7, #2196F3)'; // Blue gradient
    holdProgressBar.style.borderRadius = '4px';
    holdProgressBar.style.transition = 'width 0.1s linear';
    holdProgressBar.style.boxShadow = '0 0 5px rgba(79, 195, 247, 0.7)'; // Add a glow effect
    
    holdProgressContainer.appendChild(holdProgressBar);
    interactionContainer.appendChild(holdProgressContainer);
    
    // Add to document
    document.body.appendChild(interactionContainer);
    
    // Store references
    this.uiElements.interactionText = interactionContainer;
    this.uiElements.holdProgressBar = {
      container: holdProgressContainer,
      bar: holdProgressBar
    };
    
    // Create status display
    this.createStatusDisplay();
  }

  /**
   * Create a status display for zombie count
   */
  createStatusDisplay() {
    // Status display has been disabled as requested
    // This method is kept as a placeholder in case functionality needs to be restored
    
    // Initialize uiElements.zombieCounter as null to prevent errors in other methods
    this.uiElements.zombieCounter = null;
    this.uiElements.statusDisplay = null;
  }

  /**
   * Create wall buys for weapons
   */
  createWallBuys() {
    // Define wall buy positions
    const wallBuyConfigs = [
      // Shotgun on North wall
      {
        position: new THREE.Vector3(2.5, 1.5, this.depth / 2 - 0.1),
        rotation: new THREE.Euler(0, Math.PI, 0),
        weaponType: WeaponTypes.SHOTGUN
      },
      // Assault Rifle on South wall
      {
        position: new THREE.Vector3(-2.5, 1.5, -this.depth / 2 + 0.1),
        rotation: new THREE.Euler(0, 0, 0),
        weaponType: WeaponTypes.ASSAULT_RIFLE
      }
    ];
    
    // Create each wall buy
    wallBuyConfigs.forEach(config => {
      const wallBuy = new WallBuy(config);
      wallBuy.init();
      
      // Add to scene
      this.instance.add(wallBuy.instance);
      
      // Track wall buys
      this.wallBuys.push(wallBuy);
    });
  }

  /**
   * Create a mystery box in the corner of the room
   */
  createMysteryBox() {
    // Position in the southeast corner of the room (away from wall buys)
    // The current wall buys are on North wall (2.5, 1.5, depth/2) and South wall (-2.5, 1.5, -depth/2)
    const position = new THREE.Vector3(
      this.width / 2 - 1.5, // X - near east wall
      0,                    // Y - on the floor
      -this.depth / 2 + 1.5  // Z - near south wall
    );
    
    // Create the mystery box
    this.mysteryBox = new MysteryBox();
    this.mysteryBox.init(this.instance, position);
    
    console.log("Mystery box added to room at southeast corner");
  }

  /**
   * Check for mystery box interactions
   * @param {Player} player - The player to check interactions for
   * @param {number} deltaTime - Time since last frame
   */
  checkMysteryBoxInteractions(player, deltaTime) {
    if (!this.mysteryBox || !player || !player.camera) {
      return;
    }
    
    // Get player position using the camera
    const playerPosition = player.camera.position.clone();
    
    // Ensure mystery box instance exists
    if (!this.mysteryBox.instance || !this.mysteryBox.instance.position) {
      console.warn('Mystery box does not have a valid position.');
      return;
    }
    
    const boxPosition = this.mysteryBox.instance.position.clone();
    
    // Calculate distance (only consider x and z coordinates)
    const distance = new THREE.Vector2(
      playerPosition.x - boxPosition.x,
      playerPosition.z - boxPosition.z
    ).length();
    
    // Check if player is within range
    const isNearby = distance < 3;
    
    // Update the mystery box interaction state
    if (isNearby !== this.nearbyMysteryBox) {
      this.nearbyMysteryBox = isNearby;
      
      // Show/hide info panel based on proximity
      if (isNearby) {
        // Only show info if the box is not currently open
        if (!this.mysteryBox.isOpen) {
          // Check if player has enough points
          const hasEnoughPoints = player.score >= this.mysteryBox.cost;
          
          // Update interaction text only if the box is not open
          if (this.uiElements && this.uiElements.interactionText && !this.mysteryBox.isOpen) {
            this.uiElements.interactionText.style.display = 'block';
            this.uiElements.interactionText.textContent = `HOLD F to open Mystery Box (${this.mysteryBox.cost.toLocaleString()} points)`;
            
            // Update style based on whether player can afford it
            if (hasEnoughPoints) {
              this.uiElements.interactionText.style.color = '#4FC3F7';
              this.uiElements.interactionText.style.textShadow = '0 0 8px rgba(79, 195, 247, 0.5)';
            } else {
              this.uiElements.interactionText.style.color = '#FF5252';
              this.uiElements.interactionText.style.textShadow = '0 0 8px rgba(255, 82, 82, 0.5)';
            }
          }
        } 
        // If box is open and a weapon is available, show pickup message
        else if (this.mysteryBox.isOpen && this.mysteryBox.hasWeaponAvailable) {
          if (this.uiElements && this.uiElements.interactionText) {
            this.uiElements.interactionText.style.display = 'block';
            this.uiElements.interactionText.textContent = `Press F to take weapon`;
            this.uiElements.interactionText.style.color = '#4FC3F7';
            this.uiElements.interactionText.style.textShadow = '0 0 8px rgba(79, 195, 247, 0.5)';
          }
        }
      } else {
        // If no longer nearby, reset holding state for mystery box
        if (this.holdInteractionType === 'mysteryBox') {
          this.resetHoldInteraction();
        }
        
        // Clear interaction text if not near a wall buy
        if (!this.nearbyWallBuyRef && this.uiElements && this.uiElements.interactionText) {
          this.uiElements.interactionText.style.display = 'none';
        }
      }
    }
    
    // Handle interactions with the Mystery Box
    if (isNearby) {
      // Different handling based on whether the box is open or not
      if (!this.mysteryBox.isOpen) {
        // Box is closed - use hold mechanic to open
        // Check if F key is currently pressed (not just a single tap)
        const fKeyPressed = player.keys && player.keys.f;
        
        // Start tracking hold when F is pressed
        if (fKeyPressed && !this.isHoldingF) {
          this.isHoldingF = true;
          this.fKeyHoldStartTime = performance.now() / 1000; // Convert to seconds
          this.holdInteractionType = 'mysteryBox';
          
          // Show progress bar
          if (this.uiElements && this.uiElements.holdProgressBar) {
            this.uiElements.holdProgressBar.container.style.display = 'block';
            this.uiElements.holdProgressBar.bar.style.width = '0%';
          }
        }
        
        // Update hold progress if actively holding
        if (this.isHoldingF && fKeyPressed && this.holdInteractionType === 'mysteryBox') {
          const currentTime = performance.now() / 1000;
          const holdDuration = currentTime - this.fKeyHoldStartTime;
          
          // Calculate progress (0 to 1)
          const holdProgress = Math.min(holdDuration / this.fKeyHoldDuration, 1.0);
          
          // Update progress bar
          if (this.uiElements && this.uiElements.holdProgressBar) {
            this.uiElements.holdProgressBar.bar.style.width = `${holdProgress * 100}%`;
          }
          
          // Check if hold is complete
          if (holdProgress >= 1.0) {
            // Check if player has enough points and box is not already open
            if (player.score >= this.mysteryBox.cost && !this.mysteryBox.isOpen) {
              // Attempt to open the mystery box
              const result = this.mysteryBox.attemptOpen(player);
              
              if (result) {
                // Set a 10-second timer for the weapon to be available
                this.mysteryBox.weaponTimeoutId = setTimeout(() => {
                  if (this.mysteryBox.hasWeaponAvailable) {
                    this.mysteryBox.hideWeapon();
                    this.mysteryBox.hasWeaponAvailable = false;
                    this.mysteryBox.isOpen = false;
                    
                    // Update interaction text if player is still nearby
                    if (this.nearbyMysteryBox && this.uiElements && this.uiElements.interactionText) {
                      const hasEnoughPoints = player.score >= this.mysteryBox.cost;
                      this.uiElements.interactionText.textContent = `HOLD F to open Mystery Box (${this.mysteryBox.cost.toLocaleString()} points)`;
                      
                      if (hasEnoughPoints) {
                        this.uiElements.interactionText.style.color = '#4FC3F7';
                      } else {
                        this.uiElements.interactionText.style.color = '#FF5252';
                      }
                    }
                  }
                }, 10000); // 10 seconds
              }
            }
            
            // Reset holding state
            this.resetHoldInteraction();
          }
        }
        
        // If key is released, reset the hold
        if (this.isHoldingF && !fKeyPressed && this.holdInteractionType === 'mysteryBox') {
          this.resetHoldInteraction();
        }
      }
      // Box is open and has a weapon available - use simple press to pick up
      else if (this.mysteryBox.isOpen && this.mysteryBox.hasWeaponAvailable && this.mysteryBox.weaponReady) {
        // Check for interaction using both isInteracting and keys.f (for one-press interaction)
        const isPickingUp = player.isInteracting || (player.keys && player.keys.f && !this.isHoldingF);
        
        if (isPickingUp) {
          console.log("MYSTERY BOX - Detected F press, attempting to take weapon");
          
          // Take the weapon with a simple press
          const weaponTaken = this.mysteryBox.takeWeapon(player);
          
          if (weaponTaken) {
            console.log("MYSTERY BOX - Weapon successfully taken by player");
            
            // Clear the timeout since the weapon was taken
            if (this.mysteryBox.weaponTimeoutId) {
              clearTimeout(this.mysteryBox.weaponTimeoutId);
              this.mysteryBox.weaponTimeoutId = null;
            }
            
            // Reset box state
            this.mysteryBox.isOpen = false;
            this.mysteryBox.hasWeaponAvailable = false;
            
            // Update interaction text if still nearby
            if (this.nearbyMysteryBox && this.uiElements && this.uiElements.interactionText) {
              const hasEnoughPoints = player.score >= this.mysteryBox.cost;
              this.uiElements.interactionText.textContent = `HOLD F to open Mystery Box (${this.mysteryBox.cost.toLocaleString()} points)`;
              
              if (hasEnoughPoints) {
                this.uiElements.interactionText.style.color = '#4FC3F7';
              } else {
                this.uiElements.interactionText.style.color = '#FF5252';
              }
            }
          } else {
            console.error("MYSTERY BOX - Failed to take weapon");
          }
          
          // Reset interaction state
          player.isInteracting = false;
          if (player.keys) {
            player.keys.f = false;
          }
        }
      }
    }
  }

  /**
   * Reset hold interaction state
   */
  resetHoldInteraction() {
    this.isHoldingF = false;
    this.fKeyHoldStartTime = 0;
    this.holdInteractionType = null;
    
    // Hide progress bar
    if (this.uiElements && this.uiElements.holdProgressBar) {
      this.uiElements.holdProgressBar.container.style.display = 'none';
      this.uiElements.holdProgressBar.bar.style.width = '0%';
      this.uiElements.holdProgressBar.bar.style.boxShadow = '0 0 5px rgba(79, 195, 247, 0.7)';
    }
    
    // Reset text scale
    if (this.uiElements && this.uiElements.interactionText) {
      this.uiElements.interactionText.style.transform = 'scale(1)';
    }
  }

  /**
   * Check if player is near any wall buys for interaction
   * @param {number} deltaTime - Time since last frame
   */
  checkWallBuyInteractions(deltaTime) {
    if (!this.player || !this.wallBuys || !this.player.camera) return;
    
    let isNearWallBuy = false;
    let nearestWallBuy = null;
    
    // Check each wall buy for proximity
    this.wallBuys.forEach(wallBuy => {
      if (wallBuy && typeof wallBuy.checkPlayerProximity === 'function') {
        // Use the same approach as in checkWindowInteractions
        if (wallBuy.checkPlayerProximity(this.player.camera.position)) {
          isNearWallBuy = true;
          nearestWallBuy = wallBuy;
          
          // Update wall buy's info panel position
          if (typeof wallBuy.updateInfoPanelPosition === 'function') {
            wallBuy.updateInfoPanelPosition(this.player.camera);
          }
        }
      }
    });
    
    // Update player's reference to the nearest wall buy
    if (typeof this.player.setNearbyWallBuy === 'function') {
      this.player.setNearbyWallBuy(nearestWallBuy);
    }
    
    // Store reference to nearest wall buy
    const wasNearWallBuy = this.nearbyWallBuyRef !== null;
    this.nearbyWallBuyRef = nearestWallBuy;
    
    // Show different interaction text for wall buy
    if (isNearWallBuy && nearestWallBuy && this.uiElements && this.uiElements.interactionText) {
      // Only update text if not already set (prevent flickering if already showing this)
      if (!wasNearWallBuy || this.uiElements.interactionText.textContent.indexOf('HOLD F to buy') === -1) {
        this.uiElements.interactionText.style.display = 'block';
        this.uiElements.interactionText.textContent = `HOLD F to buy ${nearestWallBuy.weapon?.name || 'Weapon'} (${nearestWallBuy.cost || '?'} points)`;
      }
    } else {
      // If we're no longer near a wall buy but we were holding F for it, reset
      if (!isNearWallBuy && this.holdInteractionType === 'wallBuy') {
        this.resetHoldInteraction();
      }
    }
    
    // Handle F key hold for Wall Buy
    if (isNearWallBuy && nearestWallBuy) {
      const player = this.player;
      // Check if F key is currently pressed (not just a single tap)
      const fKeyPressed = player.keys && player.keys.f;
      
      // Start tracking hold when F is pressed
      if (fKeyPressed && !this.isHoldingF) {
        this.isHoldingF = true;
        this.fKeyHoldStartTime = performance.now() / 1000; // Convert to seconds
        this.holdInteractionType = 'wallBuy';
        
        // Show progress bar
        if (this.uiElements && this.uiElements.holdProgressBar) {
          this.uiElements.holdProgressBar.container.style.display = 'block';
          this.uiElements.holdProgressBar.bar.style.width = '0%';
        }
        
        console.log("Started holding F near Wall Buy");
      } 
      // Check if F is released
      else if (!fKeyPressed && this.isHoldingF && this.holdInteractionType === 'wallBuy') {
        this.resetHoldInteraction();
        console.log("Released F before completing Wall Buy purchase");
      }
      // Update hold progress - ONLY if still holding F key
      else if (fKeyPressed && this.isHoldingF && this.holdInteractionType === 'wallBuy') {
        const currentTime = performance.now() / 1000;
        const holdTime = currentTime - this.fKeyHoldStartTime;
        const holdProgress = Math.min(holdTime / this.fKeyHoldDuration, 1.0);
        
        // Update progress bar
        if (this.uiElements && this.uiElements.holdProgressBar) {
          this.uiElements.holdProgressBar.bar.style.width = `${holdProgress * 100}%`;
          
          // Add pulse effect when close to completion
          if (holdProgress > 0.7) {
            this.uiElements.holdProgressBar.bar.style.boxShadow = '0 0 10px rgba(79, 195, 247, 0.9)';
          }
        }
        
        // Add text pulse feedback as hold progresses
        if (this.uiElements && this.uiElements.interactionText) {
          // Make text pulse as you get closer
          const scale = 1.0 + (holdProgress * 0.1);
          this.uiElements.interactionText.style.transform = `scale(${scale})`;
        }
        
        // Check if hold is complete
        if (holdProgress >= 1.0) {
          console.log("Completed holding F for Wall Buy");
          
          // Trigger wall buy purchase if player has enough points
          if (player.score >= nearestWallBuy.cost) {
            // Attempt to buy the weapon
            nearestWallBuy.onInteract(player);
            console.log(`Wall Buy purchase completed for ${nearestWallBuy.weapon?.name || 'Weapon'}`);
          } else {
            console.log("Not enough points to buy weapon");
          }
          
          // Reset holding state
          this.resetHoldInteraction();
        }
      }
    }
  }

  /**
   * Check if player is near any windows for interaction
   */
  checkWindowInteractions() {
    if (!this.player || !this.windows) return;
    
    let isNearWindow = false;
    let nearestWindow = null;
    
    // Check each window for proximity
    this.windows.forEach(window => {
      if (window.checkPlayerProximity(this.player.camera.position)) {
        isNearWindow = true;
        nearestWindow = window;
      }
    });
    
    // Show/hide interaction prompt
    if (isNearWindow && nearestWindow && !nearestWindow.isFullyBoarded()) {
      // Only show window interaction prompt if not holding F for something else
      if (!this.isHoldingF) {
        if (this.uiElements && this.uiElements.interactionText) {
          this.uiElements.interactionText.style.display = 'block';
          this.uiElements.interactionText.textContent = 'Press F to board up window';
          
          // Reset any hold progress indicators
          if (this.uiElements.holdProgressBar) {
            this.uiElements.holdProgressBar.container.style.display = 'none';
          }
        }
      }
      
      // For window boarding, we'll keep the quick press interaction
      if (this.player.isInteracting && !this.isHoldingF) {
        console.log("WINDOW: Player is interacting with window", nearestWindow.windowIndex);
        
        // Add detailed debug logs for the network manager chain
        console.log("DEBUG: this.gameEngine exists?", !!this.gameEngine);
        if (this.gameEngine) {
          console.log("DEBUG: this.gameEngine.networkManager exists?", !!this.gameEngine.networkManager);
          
          if (this.gameEngine.networkManager) {
            console.log("DEBUG: isHost property:", this.gameEngine.networkManager.isHost);
            console.log("DEBUG: isMultiplayer property:", this.gameEngine.networkManager.isMultiplayer);
            console.log("DEBUG: network property exists?", !!this.gameEngine.networkManager.network);
          }
        }
        
        // Check if we're in a multiplayer game as a client
        const isClient = this.gameEngine && 
                         this.gameEngine.networkManager && 
                         !this.gameEngine.networkManager.isHost &&
                         this.gameEngine.networkManager.isMultiplayer;
        
        console.log("WINDOW: Player is a client?", isClient);
        
        let boardAdded = false;
        
        // Use client-side version if we're a client in multiplayer
        if (isClient) {
          console.log("WINDOW: Client is boarding window, using client-side method");
          boardAdded = nearestWindow.clientAddBoard(this.gameEngine.networkManager);
          console.log("WINDOW: Client-side board add result:", boardAdded);
        } else {
          // Otherwise use regular version for host or singleplayer
          console.log("WINDOW: Host/singleplayer is boarding window, using regular method");
          boardAdded = nearestWindow.addBoard();
          console.log("WINDOW: Regular board add result:", boardAdded);
        }
        
        // If board was successfully added, award points to the player
        if (boardAdded && this.player && typeof this.player.addPoints === 'function') {
          // Award 20 points for boarding up a window
          this.player.addPoints(20, false, false);
          
          // Play window board add sound
          if (typeof this.player.playWindowBoardAddSound === 'function') {
            this.player.playWindowBoardAddSound();
          }
        }
        
        // Reset interaction state
        this.player.isInteracting = false;
      }
    } else if (!this.nearbyWallBuyRef && !this.nearbyMysteryBox && !this.isHoldingF) {
      // Only hide if not near a wall buy or mystery box and not currently holding F
      if (this.uiElements && this.uiElements.interactionText) {
        this.uiElements.interactionText.style.display = 'none';
      }
    }
  }

  /**
   * Update the room's state
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    // Skip if no player reference
    if (!this.player) {
      return;
    }
    
    // Update enemy manager
    if (this.enemyManager) {
      this.enemyManager.update(deltaTime);
    }
    
    // Update wall buys
    if (this.wallBuys) {
      this.wallBuys.forEach(wallBuy => {
        // Only call update if it exists
        if (wallBuy && typeof wallBuy.update === 'function') {
          wallBuy.update(deltaTime);
        }
      });
    }
    
    // Update mystery box
    if (this.mysteryBox) {
      this.mysteryBox.update(deltaTime);
    }
    
    // Check for window interactions
    this.checkWindowInteractions();
    
    // Check for wall buy interactions (pass deltaTime)
    this.checkWallBuyInteractions(deltaTime);
    
    // Check for mystery box interactions (pass deltaTime)
    this.checkMysteryBoxInteractions(this.player, deltaTime);
    
    // Reset the player's isInteracting flag to prevent unwanted interactions on the next frame
    if (this.player.isInteracting) {
      this.player.isInteracting = false;
    }
    
    // Update UI
    this.updateStatusDisplay();
  }
  
  /**
   * Update the status display with current zombie information
   */
  updateStatusDisplay() {
    // Status display updates have been disabled as requested
    // This method is kept as a placeholder in case functionality needs to be restored
  }

  /**
   * Reset all windows to their initial state
   */
  resetWindows() {
    console.log("Resetting all windows");
    
    // Repair all windows to their initial state
    if (this.windows && this.windows.length > 0) {
      this.windows.forEach(window => {
        // Fully repair each window
        if (typeof window.repair === 'function') {
          // Repair to maximum boards
          while (window.boardsCount < window.maxBoards) {
            window.repair();
          }
        }
        
        // Reset any other window state if needed
        if (typeof window.reset === 'function') {
          window.reset();
        }
      });
      
      console.log(`${this.windows.length} windows reset to fully repaired state`);
    }
  }

  /**
   * Reset the entire room to its initial state
   * This is called when restarting the game
   */
  resetRoom() {
    console.log("Resetting entire room to initial state");
    
    // Reset all windows
    this.resetWindows();
    
    // Reset mystery box if it exists
    if (this.mysteryBox && typeof this.mysteryBox.reset === 'function') {
      this.mysteryBox.reset();
    }
    
    // Reset enemy manager
    if (this.enemyManager) {
      this.enemyManager.clearEnemies();
      this.enemyManager.currentRound = 0;
      this.enemyManager.zombiesRemaining = 0;
      this.enemyManager.roundActive = false;
    }
    
    // Reset any other room state as needed
    // Reset wall buys
    if (this.wallBuys && this.wallBuys.length > 0) {
      this.wallBuys.forEach(wallBuy => {
        if (typeof wallBuy.reset === 'function') {
          wallBuy.reset();
        }
      });
    }
    
    // Reset UI elements
    if (this.uiElements && this.uiElements.interactionText) {
      this.uiElements.interactionText.style.display = 'none';
    }
    
    if (this.uiElements && this.uiElements.holdProgressBar) {
      this.uiElements.holdProgressBar.container.style.display = 'none';
      this.uiElements.holdProgressBar.bar.style.width = '0%';
    }
    
    // Reset interaction states
    this.isHoldingF = false;
    this.holdInteractionType = null;
    this.nearbyWallBuyRef = null;
    this.nearbyMysteryBox = false;
    
    console.log("Room reset completed");
  }

  /**
   * Set game engine reference
   * @param {Engine} gameEngine - Reference to the game engine
   */
  setGameEngine(gameEngine) {
    if (!gameEngine) {
      console.warn("Cannot set null game engine reference");
      return;
    }
    
    console.log("Setting game engine reference in Room");
    this.gameEngine = gameEngine;
    
    // Log network manager details if available
    if (gameEngine.networkManager) {
      console.log("Room received network manager with settings:", {
        gameMode: gameEngine.networkManager.gameMode,
        isMultiplayer: gameEngine.networkManager.isMultiplayer,
        isHost: gameEngine.networkManager.isHost,
        isConnected: gameEngine.networkManager.isConnected
      });
    } else {
      console.log("Room: No network manager in game engine");
    }
    
    // Set game engine reference for enemy manager
    if (this.enemyManager) {
      this.enemyManager.setGameEngine(gameEngine);
    }
  }
} 
 
 
 
 
 