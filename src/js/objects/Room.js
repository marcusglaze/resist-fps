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
      zombieCounter: null
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
    
    // Add to document
    document.body.appendChild(interactionContainer);
    
    // Store reference
    this.uiElements.interactionText = interactionContainer;
    
    // Create status display
    this.createStatusDisplay();
  }

  /**
   * Create a status display for zombie count
   */
  createStatusDisplay() {
    // Create main container
    const statusContainer = document.createElement('div');
    statusContainer.className = 'status-display';
    statusContainer.style.position = 'absolute';
    statusContainer.style.top = '20px';
    statusContainer.style.right = '20px';
    statusContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    statusContainer.style.color = 'white';
    statusContainer.style.padding = '10px';
    statusContainer.style.borderRadius = '5px';
    statusContainer.style.fontFamily = 'Arial, sans-serif';
    statusContainer.style.fontSize = '14px';
    statusContainer.style.width = '200px';
    statusContainer.style.pointerEvents = 'none';
    
    // Create title
    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.style.fontSize = '16px';
    title.style.marginBottom = '10px';
    title.style.textAlign = 'center';
    title.textContent = 'SURVIVE THE ZOMBIES';
    statusContainer.appendChild(title);
    
    // Create zombie counter
    const zombieCounter = document.createElement('div');
    zombieCounter.style.marginBottom = '15px';
    zombieCounter.style.fontWeight = 'bold';
    zombieCounter.textContent = 'Zombies: 0';
    statusContainer.appendChild(zombieCounter);
    this.uiElements.zombieCounter = zombieCounter;
    
    // Add to document
    document.body.appendChild(statusContainer);
    
    // Store reference
    this.uiElements.statusDisplay = statusContainer;
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
   */
  checkMysteryBoxInteractions(player) {
    if (!this.mysteryBox || !player || !player.camera) return;
    
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
        // Check if player has enough points
        const hasEnoughPoints = player.score >= this.mysteryBox.cost;
        this.mysteryBox.showInfoPanel(hasEnoughPoints);
        
        // Update interaction text
        if (this.uiElements && this.uiElements.interactionText) {
          this.uiElements.interactionText.style.display = 'block';
          this.uiElements.interactionText.textContent = `Press F to open Mystery Box (${this.mysteryBox.cost.toLocaleString()} points)`;
          
          // Update style based on whether player can afford it
          if (hasEnoughPoints) {
            this.uiElements.interactionText.style.color = '#4FC3F7';
            this.uiElements.interactionText.style.textShadow = '0 0 8px rgba(79, 195, 247, 0.5)';
          } else {
            this.uiElements.interactionText.style.color = '#FF5252';
            this.uiElements.interactionText.style.textShadow = '0 0 8px rgba(255, 82, 82, 0.5)';
          }
        }
      } else {
        this.mysteryBox.hideInfoPanel();
        
        // Clear interaction text
        if (this.uiElements && this.uiElements.interactionText) {
          this.uiElements.interactionText.style.display = 'none';
        }
      }
    }
    
    // If player presses the interaction key and is nearby
    if (isNearby && player.inputController && player.inputController.keys.f) {
      // Reset the key to prevent multiple activations
      player.inputController.keys.f = false;
      
      // Attempt to open the mystery box
      this.mysteryBox.attemptOpen(player);
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
    
    // Check for wall buy interactions
    this.checkWallBuyInteractions();
    
    // Check for mystery box interactions
    this.checkMysteryBoxInteractions(this.player);
    
    // Update UI
    this.updateStatusDisplay();
  }
  
  /**
   * Check if player is near any wall buys for interaction
   */
  checkWallBuyInteractions() {
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
    
    // Show different interaction text for wall buy
    if (isNearWallBuy && nearestWallBuy && this.uiElements && this.uiElements.interactionText) {
      this.uiElements.interactionText.style.display = 'block';
      this.uiElements.interactionText.textContent = `Press F to buy ${nearestWallBuy.weapon?.name || 'Weapon'} (${nearestWallBuy.cost || '?'} points)`;
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
      if (this.uiElements && this.uiElements.interactionText) {
        this.uiElements.interactionText.style.display = 'block';
        this.uiElements.interactionText.textContent = 'Press F to board up window';
      }
      
      // Check for interaction key (F)
      if (this.player.isInteracting) {
        // Add a board to the window
        const boardAdded = nearestWindow.addBoard();
        
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
    } else if (!this.player.nearbyWallBuy && !this.nearbyMysteryBox) {
      // Only hide if not near a wall buy or mystery box
      if (this.uiElements && this.uiElements.interactionText) {
        this.uiElements.interactionText.style.display = 'none';
      }
    }
  }
  
  /**
   * Update the status display with current zombie information
   */
  updateStatusDisplay() {
    if (!this.uiElements) return;
    
    // Update zombie counter
    if (this.enemyManager && this.uiElements.zombieCounter) {
      this.uiElements.zombieCounter.textContent = `Zombies: ${this.enemyManager.enemies.length}`;
    }
  }
} 
 