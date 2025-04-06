import * as THREE from 'three';

/**
 * Creates a window object for the room that can be boarded up
 */
export class Window {
  constructor(width = 2, height = 1.5) {
    this.width = width;
    this.height = height;
    this.depth = 0.05; // Make depth very small to avoid extending into room
    
    // Group to hold window parts
    this.instance = new THREE.Group();
    
    // Window state
    this.isOpen = true;
    this.boardsCount = 0;
    this.maxBoards = 6;
    this.boards = [];
    
    // Board health settings
    this.boardMaxHealth = 30;
    this.boardHealths = []; // Track health of each board
    
    // Materials
    this.frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c4033, // Brown
      roughness: 0.7,
      metalness: 0.3
    });
    
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      roughness: 0,
      metalness: 0.1,
      transmission: 0.9, // Glass is transparent
      transparent: true,
      opacity: 0.3,
      envMapIntensity: 1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });
    
    this.boardMaterial = new THREE.MeshStandardMaterial({
      color: 0xD2956E, // Brightened from saddle brown to a lighter tan/wood color
      roughness: 0.8, // Reduced from 1.0 for more light reflection
      metalness: 0.1, // Slightly increased from 0.0
      map: this.createWoodTexture()
    });
    
    // Damaged board materials (different stages)
    this.damagedBoardMaterials = [
      // Light damage (66-99% health)
      new THREE.MeshStandardMaterial({
        color: 0xD2956E, // Brightened color
        roughness: 0.8,
        metalness: 0.1,
        map: this.createWoodTexture(0.2) // 20% damage
      }),
      // Medium damage (33-66% health)
      new THREE.MeshStandardMaterial({
        color: 0xD2956E, // Brightened color
        roughness: 0.8,
        metalness: 0.1,
        map: this.createWoodTexture(0.5) // 50% damage
      }),
      // Heavy damage (1-33% health)
      new THREE.MeshStandardMaterial({
        color: 0xC67F55, // Slightly darker than the others but still bright
        roughness: 0.9,
        metalness: 0.1,
        map: this.createWoodTexture(0.8) // 80% damage
      }),
    ];
    
    // Interaction
    this.isPlayerNearby = false;
    this.interactionDistance = 2.0;
  }

  /**
   * Initialize window and its parts
   */
  init() {
    // Clear any existing elements
    while(this.instance.children.length > 0) { 
      this.instance.remove(this.instance.children[0]); 
    }
    
    // Set userData to identify this as a window for raycasting
    this.instance.userData = { window: true, isPassable: false };
    
    this.createFrame();
    
    // For open windows, don't add glass
    if (!this.isOpen) {
      this.createGlass();
    }
    
    // Add boarding ability
    this.createBoardPlaceholders();
  }

  /**
   * Create a simple wood texture procedurally with optional damage
   * @param {number} damageAmount - How damaged the wood looks (0-1)
   */
  createWoodTexture(damageAmount = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    
    // Brighter base wood color
    context.fillStyle = '#D2956E'; // Brightened from #8B4513
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add wood grain with brighter color
    context.strokeStyle = '#A06840'; // Brightened from #704214
    context.lineWidth = 3;
    
    for (let i = 0; i < 20; i++) {
      const y = Math.random() * canvas.height;
      context.beginPath();
      context.moveTo(0, y);
      
      // Create wavy lines for wood grain
      for (let x = 0; x < canvas.width; x += 20) {
        const waveHeight = Math.random() * 10 - 5;
        context.lineTo(x, y + waveHeight);
      }
      
      context.stroke();
    }
    
    // Add some knots with brighter colors
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const radius = Math.random() * 10 + 5;
      
      context.fillStyle = '#B07A50'; // Brightened from #5D3A1A
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      
      context.strokeStyle = '#8A5A35'; // Brightened from #4A2E15
      context.lineWidth = 1;
      context.beginPath();
      context.arc(x, y, radius + 2, 0, Math.PI * 2);
      context.stroke();
    }
    
    // Add damage to the wood (cracks and holes)
    if (damageAmount > 0) {
      // Draw cracks
      context.strokeStyle = '#000000';
      context.lineWidth = 2;
      
      const crackCount = Math.floor(damageAmount * 10) + 3;
      for (let i = 0; i < crackCount; i++) {
        const startX = Math.random() * canvas.width;
        const startY = Math.random() * canvas.height;
        
        context.beginPath();
        context.moveTo(startX, startY);
        
        // Create jagged crack line
        let x = startX;
        let y = startY;
        const crackLength = Math.random() * 60 + 30;
        const steps = Math.floor(crackLength / 5);
        
        for (let j = 0; j < steps; j++) {
          x += (Math.random() * 10) - 5;
          y += (Math.random() * 10) - 5;
          context.lineTo(x, y);
        }
        
        context.stroke();
      }
      
      // Draw holes
      if (damageAmount > 0.4) {
        const holeCount = Math.floor(damageAmount * 5);
        for (let i = 0; i < holeCount; i++) {
          const x = Math.random() * canvas.width;
          const y = Math.random() * canvas.height;
          const radius = Math.random() * 5 + (damageAmount * 10);
          
          context.fillStyle = '#000000';
          context.beginPath();
          context.arc(x, y, radius, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    return texture;
  }

  /**
   * Create the window frame
   */
  createFrame() {
    // Frame dimensions
    const frameThickness = 0.1;
    
    // Create the frame as a single rectangle with a hole
    const shape = new THREE.Shape();
    
    // Outer rectangle
    const frameWidth = this.width + frameThickness * 2;
    const frameHeight = this.height + frameThickness * 2;
    shape.moveTo(-frameWidth/2, -frameHeight/2);
    shape.lineTo(frameWidth/2, -frameHeight/2);
    shape.lineTo(frameWidth/2, frameHeight/2);
    shape.lineTo(-frameWidth/2, frameHeight/2);
    shape.lineTo(-frameWidth/2, -frameHeight/2);
    
    // Inner hole (window opening)
    const hole = new THREE.Path();
    hole.moveTo(-this.width/2, -this.height/2);
    hole.lineTo(this.width/2, -this.height/2);
    hole.lineTo(this.width/2, this.height/2);
    hole.lineTo(-this.width/2, this.height/2);
    hole.lineTo(-this.width/2, -this.height/2);
    shape.holes.push(hole);
    
    // Create geometry from shape
    const frameGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: this.depth,
      bevelEnabled: false
    });
    
    // Create mesh
    const frame = new THREE.Mesh(frameGeometry, this.frameMaterial);
    
    // Adjust position
    frame.position.z = -this.depth / 2;
    
    // Add to group
    frame.userData = { window: true, isFramePart: true };
    frame.castShadow = true;
    frame.receiveShadow = true;
    this.instance.add(frame);
    
    // Add cross beams
    this.createCrossBeams();
  }
  
  /**
   * Create window cross beams
   */
  createCrossBeams() {
    const frameThickness = 0.1;
    
    // Horizontal beam
    const horizontalGeometry = new THREE.BoxGeometry(this.width, frameThickness, this.depth);
    const horizontalBeam = new THREE.Mesh(horizontalGeometry, this.frameMaterial);
    horizontalBeam.position.set(0, 0, 0);
    horizontalBeam.userData = { window: true, isFramePart: true };
    horizontalBeam.castShadow = true;
    this.instance.add(horizontalBeam);
    
    // Vertical beam
    const verticalGeometry = new THREE.BoxGeometry(frameThickness, this.height, this.depth);
    const verticalBeam = new THREE.Mesh(verticalGeometry, this.frameMaterial);
    verticalBeam.position.set(0, 0, 0);
    verticalBeam.userData = { window: true, isFramePart: true };
    verticalBeam.castShadow = true;
    this.instance.add(verticalBeam);
  }

  /**
   * Create the glass panes
   */
  createGlass() {
    // Frame thickness for offset
    const frameThickness = 0.1;
    const paneWidth = (this.width - frameThickness) / 2;
    const paneHeight = (this.height - frameThickness) / 2;
    const glassThickness = 0.02;
    
    // Create four glass panes (divided by the cross beams)
    
    // Top left pane
    this.createGlassPane(
      paneWidth,
      paneHeight,
      glassThickness,
      -paneWidth / 2 - frameThickness / 2,
      paneHeight / 2 + frameThickness / 2,
      0
    );
    
    // Top right pane
    this.createGlassPane(
      paneWidth,
      paneHeight,
      glassThickness,
      paneWidth / 2 + frameThickness / 2,
      paneHeight / 2 + frameThickness / 2,
      0
    );
    
    // Bottom left pane
    this.createGlassPane(
      paneWidth,
      paneHeight,
      glassThickness,
      -paneWidth / 2 - frameThickness / 2,
      -paneHeight / 2 - frameThickness / 2,
      0
    );
    
    // Bottom right pane
    this.createGlassPane(
      paneWidth,
      paneHeight,
      glassThickness,
      paneWidth / 2 + frameThickness / 2,
      -paneHeight / 2 - frameThickness / 2,
      0
    );
  }

  /**
   * Create a glass pane
   */
  createGlassPane(width, height, depth, x, y, z) {
    const glassGeometry = new THREE.BoxGeometry(width, height, depth);
    const glass = new THREE.Mesh(glassGeometry, this.glassMaterial);
    
    glass.position.set(x, y, z);
    glass.userData = { window: true, isGlass: true };
    
    this.instance.add(glass);
  }

  /**
   * Create placeholders for boards
   */
  createBoardPlaceholders() {
    // Array to store board positions
    this.boardPositions = [];
    
    // Create board positions
    const boardWidth = this.width * 0.9;
    const boardHeight = 0.2;
    const boardDepth = 0.05;
    const boardSpacing = this.height / (this.maxBoards + 1);
    
    // Calculate positions for all possible boards
    for (let i = 0; i < this.maxBoards; i++) {
      // Alternate angle slightly for more realistic appearance
      const angle = (Math.random() * 0.2) - 0.1;
      
      this.boardPositions.push({
        position: new THREE.Vector3(
          0,
          -this.height / 2 + boardSpacing * (i + 1),
          this.depth / 2
        ),
        size: {
          width: boardWidth,
          height: boardHeight,
          depth: boardDepth
        },
        rotation: angle
      });
    }
  }

  /**
   * Add a board to the window
   * @returns {boolean} True if board was added, false if window is already fully boarded
   */
  addBoard() {
    if (this.boardsCount >= this.maxBoards || !this.isOpen) {
      return false;
    }
    
    // Create a new board
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(this.width * 0.9, 0.2, 0.05),
      this.boardMaterial
    );
    
    // Position the board in the window
    const spacing = this.height / (this.maxBoards + 1);
    const offset = (this.boardsCount + 1) * spacing - this.height / 2;
    
    board.position.set(0, offset, 0);
    
    // Add slight rotation for visual interest
    board.rotation.z = (Math.random() - 0.5) * 0.05;
    
    // Add board to container
    this.instance.add(board);
    this.boards.push(board);
    this.boardsCount++;
    
    // Initialize board health
    this.boardHealths.push(this.boardMaxHealth);
    
    return true;
  }

  /**
   * Client-side variant that also notifies host
   * @param {NetworkManager} networkManager - Reference to the network manager
   */
  clientAddBoard(networkManager) {
    if (!networkManager || !networkManager.network) {
      console.warn("Cannot add board as client: no network manager");
      return false;
    }
    
    // Check if windowIndex is set
    if (this.windowIndex === undefined) {
      console.error("Window missing windowIndex! Cannot sync with host.");
      console.error("Window details:", {
        boardsCount: this.boardsCount,
        isOpen: this.isOpen,
        position: this.instance ? [
          this.instance.position.x,
          this.instance.position.y,
          this.instance.position.z
        ] : 'No instance'
      });
      return false;
    }
    
    // First add the board locally
    const success = this.addBoard();
    
    if (success) {
      // Then send the action to the host
      console.log(`Client adding board to window ${this.windowIndex}, current count: ${this.boardsCount}`);
      
      // Make sure we have the right action type and data
      networkManager.network.sendPlayerAction('addWindowBoard', {
        windowIndex: this.windowIndex,
        boardsCount: this.boardsCount,
        boardHealths: [...this.boardHealths], // Send a copy to avoid reference issues
        timestamp: Date.now()  // Add timestamp to ensure uniqueness
      });
      
      // Force multiple notifications to ensure it gets through
      setTimeout(() => {
        if (networkManager && networkManager.network) {
          console.log(`Sending backup window board notification for window ${this.windowIndex}`);
          networkManager.network.sendPlayerAction('addWindowBoard', {
            windowIndex: this.windowIndex,
            boardsCount: this.boardsCount,
            boardHealths: [...this.boardHealths],
            timestamp: Date.now() + 1  // Different timestamp
          });
        }
      }, 100);
      
      return true;
    } else {
      console.log(`Failed to add board to window ${this.windowIndex} (already at max: ${this.maxBoards})`);
      return false;
    }
  }
  
  /**
   * Client-side variant for removing a board that also notifies host
   * @param {NetworkManager} networkManager - Reference to the network manager
   */
  clientRemoveBoard(networkManager) {
    if (!networkManager || !networkManager.network) {
      console.warn("Cannot remove board as client: no network manager");
      return false;
    }
    
    // First remove the board locally
    const success = this.removeBoard();
    
    if (success) {
      // Then send the action to the host
      console.log("Client removing board from window, notifying host");
      networkManager.network.sendPlayerAction('removeWindowBoard', {
        windowIndex: this.windowIndex,
        boardsCount: this.boardsCount,
        boardHealths: this.boardHealths
      });
      
      return true;
    }
    
    return false;
  }
  
  /**
   * Client-side variant for damaging a board that also notifies host
   * @param {number} damage - Amount of damage to apply
   * @param {NetworkManager} networkManager - Reference to the network manager
   */
  clientDamageBoard(damage, networkManager) {
    if (!networkManager || !networkManager.network) {
      console.warn("Cannot damage board as client: no network manager");
      return false;
    }
    
    // First damage the board locally
    const result = this.damageBoard(damage);
    
    // Then send the action to the host
    console.log("Client damaging window board, notifying host");
    networkManager.network.sendPlayerAction('damageWindowBoard', {
      windowIndex: this.windowIndex,
      boardsCount: this.boardsCount,
      boardHealths: this.boardHealths,
      boardsRemoved: result.boardsRemoved
    });
    
    return result;
  }

  /**
   * Apply damage to top board
   * @param {number} damage - Amount of damage to apply
   * @returns {boolean} True if any board was damaged, false if no boards
   */
  damageBoard(damage) {
    if (this.boardsCount <= 0) {
      return false;
    }
    
    // Get last (top) board and apply damage
    const boardIndex = this.boardsCount - 1;
    this.boardHealths[boardIndex] -= damage;
    
    // Update the board appearance based on health
    this.updateBoardAppearance(boardIndex);
    
    // Check if board is destroyed
    if (this.boardHealths[boardIndex] <= 0) {
      // Remove the board
      this.removeBoard();
    }
    
    // Return success
    return true;
  }

  /**
   * Update a board's appearance based on its current health
   * @param {number} boardIndex - Index of the board to update
   */
  updateBoardAppearance(boardIndex) {
    if (boardIndex < 0 || boardIndex >= this.boardsCount) return;
    
    const board = this.boards[boardIndex];
    const health = this.boardHealths[boardIndex];
    const healthPercent = health / this.boardMaxHealth;
    
    // Determine which damage level to use
    if (healthPercent > 0.66) {
      // Light damage
      board.material = this.damagedBoardMaterials[0];
    } else if (healthPercent > 0.33) {
      // Medium damage
      board.material = this.damagedBoardMaterials[1];
    } else {
      // Heavy damage
      board.material = this.damagedBoardMaterials[2];
    }
    
    // Add slight rotation/position change to show damage
    const damageAmount = 1 - healthPercent;
    board.rotation.z += (Math.random() * 0.05 - 0.025) * damageAmount;
    board.position.y += (Math.random() * 0.02 - 0.01) * damageAmount;
  }

  /**
   * Remove a board from the window
   * @returns {boolean} True if board was removed, false if window has no boards
   */
  removeBoard() {
    if (this.boardsCount <= 0) {
      return false;
    }
    
    // Get last board and remove it
    const board = this.boards.pop();
    this.instance.remove(board);
    this.boardHealths.pop();
    this.boardsCount--;
    
    // Return success
    return true;
  }

  /**
   * Check if player is near this window
   * @param {THREE.Vector3} playerPosition - Current player position
   * @returns {boolean} True if player is within interaction distance
   */
  checkPlayerProximity(playerPosition) {
    // Get window world position
    const windowWorldPosition = new THREE.Vector3();
    this.instance.getWorldPosition(windowWorldPosition);
    
    // Calculate distance to player
    const distance = windowWorldPosition.distanceTo(playerPosition);
    
    // Update state
    this.isPlayerNearby = distance < this.interactionDistance;
    
    return this.isPlayerNearby;
  }

  /**
   * Check if window is fully boarded
   * @returns {boolean} True if window has maximum number of boards
   */
  isFullyBoarded() {
    return this.boardsCount >= this.maxBoards;
  }

  /**
   * Get boarding status as a percentage
   * @returns {number} Percentage of completion (0-100)
   */
  getBoardingPercentage() {
    return (this.boardsCount / this.maxBoards) * 100;
  }

  /**
   * Reset the window to its initial state
   */
  reset() {
    console.log("Resetting window to initial state");
    
    // Clear all existing boards
    this.boards.forEach(board => {
      // Remove each board from the window instance
      if (this.instance.children.includes(board)) {
        this.instance.remove(board);
      }
    });
    
    // Reset arrays and counters
    this.boards = [];
    this.boardHealths = [];
    this.boardsCount = 0;
    
    // Reset window state
    this.isOpen = true;
    
    // Re-initialize the window
    this.init();
  }
} 
 
 
 