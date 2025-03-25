import * as THREE from 'three';
import { Weapon } from '../weapons/Weapon';

/**
 * MysteryBox class for random weapon rewards
 */
export class MysteryBox {
  constructor() {
    // Mystery box properties
    this.cost = 1000; // Reduced from 10000 to 1000 for easier testing
    this.isActive = true;
    
    // Visual elements
    this.instance = new THREE.Group();
    this.questionMark = null;
    this.glowIntensity = 0;
    this.glowDirection = 1; // 1 for increasing, -1 for decreasing
    
    // Interaction
    this.isPlayerNearby = false;
    this.interactionDistance = 3.0;
    
    // UI elements
    this.infoPanel = null;
    
    // Animation
    this.time = 0;
    
    // AI weapon generation
    this.isGeneratingWeapon = false;
    this.currentWeaponQuality = 0.5; // 0-1 scale, updated based on question mark brightness
    this.weaponPrompt = ""; // Will be used to store the AI prompt for the weapon
    
    // Box opening state
    this.isOpening = false;
    this.boxOpeningTime = 0;
    this.boxOpeningDuration = 3.0; // seconds
    this.weaponFloating = null; // Stores the floating weapon mesh
    
    // New properties for enhanced box opening
    this.boxLid = null; // Reference to the box lid for animation
    this.boxOpenAngle = 0; // Current angle of the box lid (0 = closed, PI/2 = fully open)
    this.boxSoundPlaying = false; // Flag to track if the box sound is playing
    this.boxSound = null; // Reference to the audio element
    this.weaponFloatingHeight = 0; // Current height of the floating weapon
    this.weaponDisplayTime = 0; // Time the weapon has been displayed
    this.weaponDisplayDuration = 5.0; // How long the player has to pick up the weapon (5 seconds)
    this.boxState = 'closed'; // 'closed', 'opening', 'open', 'closing'
    this.weaponReady = false; // Whether the weapon is ready to be picked up
    
    // Player reference for weapon delivery
    this.playerToReceiveWeapon = null;
    
    // New properties for hold-to-buy and weapon pickup flow
    this.isOpen = false; // Whether the box is currently open
    this.hasWeaponAvailable = false; // Whether there's a weapon available to pick up
    this.weaponTimeoutId = null; // For tracking the 10-second timer
    
    // New properties for audio handling
    this.audioDisabled = false; // Flag to disable audio if an error occurs
  }
  
  /**
   * Initialize the mystery box
   * @param {Scene} scene - The scene to add the mystery box to
   * @param {Vector3} position - Position to place the mystery box
   */
  init(scene, position) {
    // Create the main instance group
    this.instance = new THREE.Group();
    this.instance.position.copy(position);
    
    // Create the box and its components
    const box = this.createBox();
    this.instance.add(box);
    
    // Create the question mark
    this.createQuestionMark();
    
    // Add to scene
    scene.add(this.instance);
    
    // Create info panel for interaction
    this.createInfoPanel();
    
    // Setup interaction state
    this.isNearby = false;
    this.isOpening = false;
    this.glowDirection = 1;
    this.glowIntensity = 0.5;
    
    // Initialize animation time
    this.time = 0;
    
    // Ensure box is closed initially
    this.boxState = 'closed';
    if (this.boxLid) {
      this.boxLid.rotation.x = 0;
      this.boxLid.position.y = 0.8;
      this.boxLid.position.z = 0;
    }
    
    console.log(`Mystery Box initialized at position ${position.x}, ${position.y}, ${position.z}`);
    
    return this;
  }
  
  /**
   * Create the mystery box
   */
  createBox() {
    // Create a group for the box
    const boxGroup = new THREE.Group();
    
    // Create box materials with more interesting look
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x5D4037,
      roughness: 0.7,
      metalness: 0.1,
      bumpScale: 0.02
    });
    
    const metalTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0xB39DDB,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0x7E57C2,
      emissiveIntensity: 0.2
    });
    
    // Main box (base)
    const baseGeometry = new THREE.BoxGeometry(1, 0.7, 1);
    const baseMesh = new THREE.Mesh(baseGeometry, woodMaterial);
    baseMesh.position.set(0, 0.35, 0);
    boxGroup.add(baseMesh);
    
    // Create lid/top for the box that will open
    const lidGeometry = new THREE.BoxGeometry(1, 0.1, 1);
    const lidMesh = new THREE.Mesh(lidGeometry, woodMaterial);
    lidMesh.position.set(0, 0.8, 0); // Position at the top of the box
    
    // Add lid to box group
    boxGroup.add(lidMesh);
    
    // Store reference to lid for animation
    this.boxLid = lidMesh;
    
    // Ensure lid is closed (redundant but just to be sure)
    lidMesh.rotation.x = 0;
    
    // Add decorative metal trim on edges
    const edgeThickness = 0.05;
    
    // Horizontal edges (top)
    const createEdge = (length, height, depth, x, y, z, rotationY = 0) => {
      const edgeGeometry = new THREE.BoxGeometry(length, height, depth);
      const edge = new THREE.Mesh(edgeGeometry, metalTrimMaterial);
      edge.position.set(x, y, z);
      edge.rotation.y = rotationY;
      return edge;
    };
    
    // Add top edges to the lid
    const topY = 0.8;
    const topEdgeFront = createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0, topY, 0.5 + edgeThickness/2);
    const topEdgeBack = createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0, topY, -0.5 - edgeThickness/2);
    const topEdgeLeft = createEdge(1 + edgeThickness, edgeThickness, edgeThickness, -0.5 - edgeThickness/2, topY, 0, Math.PI/2);
    const topEdgeRight = createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0.5 + edgeThickness/2, topY, 0, Math.PI/2);
    
    // Add edges to lid for animation
    this.boxLid.add(topEdgeFront);
    this.boxLid.add(topEdgeBack);
    this.boxLid.add(topEdgeLeft);
    this.boxLid.add(topEdgeRight);
    
    // Add bottom edges to the base
    const bottomY = 0;
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0, bottomY, -0.5 - edgeThickness/2));
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0, bottomY, 0.5 + edgeThickness/2));
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, -0.5 - edgeThickness/2, bottomY, 0, Math.PI/2));
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0.5 + edgeThickness/2, bottomY, 0, Math.PI/2));
    
    // Add vertical edges
    const createVerticalEdge = (x, z) => {
      const edgeGeometry = new THREE.BoxGeometry(edgeThickness, 0.7, edgeThickness);
      const edge = new THREE.Mesh(edgeGeometry, metalTrimMaterial);
      edge.position.set(x, 0.35, z);
      return edge;
    };
    
    boxGroup.add(createVerticalEdge(-0.5 - edgeThickness/2, -0.5 - edgeThickness/2));
    boxGroup.add(createVerticalEdge(-0.5 - edgeThickness/2, 0.5 + edgeThickness/2));
    boxGroup.add(createVerticalEdge(0.5 + edgeThickness/2, -0.5 - edgeThickness/2));
    boxGroup.add(createVerticalEdge(0.5 + edgeThickness/2, 0.5 + edgeThickness/2));
    
    // Add mysterious symbols on the sides
    const addSymbol = (side, rotation) => {
      const symbolGeometry = new THREE.PlaneGeometry(0.6, 0.6);
      const symbolMaterial = new THREE.MeshStandardMaterial({
        color: 0x7E57C2,
        emissive: 0x7E57C2,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      });
      
      const symbol = new THREE.Mesh(symbolGeometry, symbolMaterial);
      
      switch(side) {
        case 'front':
          symbol.position.set(0, 0.35, 0.351);
          break;
        case 'back':
          symbol.position.set(0, 0.35, -0.351);
          symbol.rotation.y = Math.PI;
          break;
        case 'left':
          symbol.position.set(-0.351, 0.35, 0);
          symbol.rotation.y = -Math.PI/2;
          break;
        case 'right':
          symbol.position.set(0.351, 0.35, 0);
          symbol.rotation.y = Math.PI/2;
          break;
      }
      
      if (rotation) {
        symbol.rotation.z = rotation;
      }
      
      boxGroup.add(symbol);
    };
    
    addSymbol('front');
    addSymbol('back', Math.PI/4);
    addSymbol('left', -Math.PI/4);
    addSymbol('right', Math.PI/6);
    
    // Add a base/pedestal for the box
    const pedestalGeometry = new THREE.CylinderGeometry(0.7, 0.8, 0.2, 8);
    const pedestalMaterial = new THREE.MeshStandardMaterial({
      color: 0x37474F,
      roughness: 0.8,
      metalness: 0.2
    });
    const pedestal = new THREE.Mesh(pedestalGeometry, pedestalMaterial);
    pedestal.position.set(0, -0.1, 0);
    boxGroup.add(pedestal);
    
    // Set userData for raycasting
    baseMesh.userData.isInteractive = true;
    baseMesh.userData.objectType = 'mysteryBox';
    
    return boxGroup;
  }
  
  /**
   * Create the glowing question mark
   */
  createQuestionMark() {
    // Create a flat question mark on top of the box
    const questionMarkGroup = new THREE.Group();
    
    // Create material for the question mark with ability to go dark
    const questionMarkMaterial = new THREE.MeshStandardMaterial({
      color: 0x4fc3f7,
      emissive: 0x4fc3f7,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.8
    });
    
    // Create a plane for the question mark to sit on
    const planeGeometry = new THREE.PlaneGeometry(0.8, 0.8);
    const plane = new THREE.Mesh(
      planeGeometry,
      new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.5,
        metalness: 0.2,
        transparent: true,
        opacity: 0.7
      })
    );
    plane.rotation.x = -Math.PI / 2; // Flat on top of box
    plane.position.y = 0.81; // Just above the box top
    questionMarkGroup.add(plane);
    
    // Create a custom question mark shape on the plane
    const questionMark = new THREE.Group();
    
    // Create the curved part of the question mark
    const curveRadius = 0.12;
    const curve = new THREE.TorusGeometry(curveRadius, 0.025, 16, 32, Math.PI);
    const curveMesh = new THREE.Mesh(curve, questionMarkMaterial);
    curveMesh.rotation.x = Math.PI / 2; // Rotate to be flat
    curveMesh.rotation.z = Math.PI;
    curveMesh.position.set(0, 0.01, 0.1); // Position forward on the plane
    questionMark.add(curveMesh);
    
    // Create the stem of the question mark
    const stemGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.15, 16);
    const stemMesh = new THREE.Mesh(stemGeometry, questionMarkMaterial);
    stemMesh.rotation.x = Math.PI / 2; // Rotate to be flat
    stemMesh.position.set(0.065, 0.01, 0); // Position in the middle
    questionMark.add(stemMesh);
    
    // Create the top horizontal part
    const topGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.12, 16);
    const topMesh = new THREE.Mesh(topGeometry, questionMarkMaterial);
    topMesh.rotation.x = Math.PI / 2; // Rotate to be flat
    topMesh.rotation.z = Math.PI / 2; // Orient horizontally
    topMesh.position.set(-0.06, 0.01, 0.2); // Position at top
    questionMark.add(topMesh);
    
    // Create the dot at the bottom
    const dotGeometry = new THREE.SphereGeometry(0.03, 16, 16);
    const dotMesh = new THREE.Mesh(dotGeometry, questionMarkMaterial);
    dotMesh.position.set(0, 0.01, -0.2); // Position at bottom
    questionMark.add(dotMesh);
    
    // Add question mark to the plane
    questionMark.position.y = 0.02; // Slightly above the plane
    questionMarkGroup.add(questionMark);
    
    // Add point light that will pulse
    const pointLight = new THREE.PointLight(0x4fc3f7, 2, 2);
    pointLight.position.set(0, 0.9, 0); // Just above the question mark
    this.instance.add(pointLight);
    
    // Add glow effect
    const glowGeometry = new THREE.CircleGeometry(0.4, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x4fc3f7,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.rotation.x = -Math.PI / 2; // Flat on top of box
    glowMesh.position.y = 0.82; // Just above the plane
    questionMarkGroup.add(glowMesh);
    
    // Add to instance
    this.instance.add(questionMarkGroup);
    
    // Store references for animation
    this.questionMark = questionMark;
    this.questionMarkLight = pointLight;
    this.questionMarkGlow = glowMesh;
    this.questionMarkMaterial = questionMarkMaterial;
  }
  
  /**
   * Create the info panel that displays cost and interaction info
   */
  createInfoPanel() {
    // Create container for the info panel
    const infoPanel = document.createElement('div');
    infoPanel.className = 'mystery-box-info';
    infoPanel.style.position = 'absolute';
    infoPanel.style.bottom = '20%';
    infoPanel.style.left = '50%';
    infoPanel.style.transform = 'translateX(-50%)';
    infoPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    infoPanel.style.color = '#ffffff';
    infoPanel.style.padding = '15px 25px';
    infoPanel.style.borderRadius = '8px';
    infoPanel.style.fontFamily = 'Arial, sans-serif';
    infoPanel.style.textAlign = 'center';
    infoPanel.style.display = 'none';
    infoPanel.style.zIndex = '1000';
    infoPanel.style.backdropFilter = 'blur(5px)';
    infoPanel.style.border = '2px solid #7E57C2';
    infoPanel.style.boxShadow = '0 0 15px rgba(126, 87, 194, 0.5)';
    
    // Create cost display with icon
    const costContainer = document.createElement('div');
    costContainer.style.marginBottom = '10px';
    costContainer.style.display = 'flex';
    costContainer.style.alignItems = 'center';
    costContainer.style.justifyContent = 'center';
    
    const costLabel = document.createElement('span');
    costLabel.textContent = 'Mystery Box: ';
    costLabel.style.marginRight = '10px';
    costLabel.style.fontSize = '18px';
    costLabel.style.fontWeight = 'bold';
    costLabel.style.color = '#B39DDB';
    
    const costValue = document.createElement('span');
    costValue.textContent = `${this.cost.toLocaleString()} points`;
    costValue.style.fontSize = '18px';
    costValue.style.fontWeight = 'bold';
    costValue.style.color = '#4FC3F7';
    
    costContainer.appendChild(costLabel);
    costContainer.appendChild(costValue);
    
    // Create interaction instruction
    const instruction = document.createElement('div');
    instruction.textContent = 'Press F to open';
    instruction.style.fontSize = '16px';
    instruction.style.color = '#E0E0E0';
    
    // Assemble the panel
    infoPanel.appendChild(costContainer);
    infoPanel.appendChild(instruction);
    
    // Add to document
    document.body.appendChild(infoPanel);
    
    // Store reference
    this.infoPanel = infoPanel;
  }
  
  /**
   * Update the mystery box
   * @param {number} deltaTime - Time elapsed since last update
   * @param {Camera} camera - The player's camera for UI positioning
   */
  update(deltaTime, camera) {
    // Update animation time
    this.time += deltaTime;
    
    // Update box based on current state
    switch (this.boxState) {
      case 'opening':
        this.updateBoxOpening(deltaTime);
        break;
      case 'open':
        this.updateBoxOpen(deltaTime);
        break;
      case 'closing':
        this.updateBoxClosing(deltaTime);
        break;
      case 'closed':
      default:
        this.updateBoxClosed(deltaTime);
        break;
    }
    
    // Update info panel position if visible
    if (this.isPlayerNearby) {
      this.updateInfoPanelPosition(camera);
    }
  }
  
  /**
   * Update the box opening animation
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateBoxOpening(deltaTime) {
    // Update box opening time
    this.boxOpeningTime += deltaTime;
    
    // Calculate progress of the opening animation (0 to 1)
    const openProgress = Math.min(this.boxOpeningTime / this.boxOpeningDuration, 1.0);
    
    // Animate box lid opening
    if (this.boxLid) {
      // Calculate lid rotation angle based on easing function (0 to PI/2)
      this.boxOpenAngle = (Math.PI / 2) * this.easeOutBack(openProgress);
      
      // Apply rotation to the lid (rotate around back edge)
      this.boxLid.rotation.x = -this.boxOpenAngle;
      
      // Move lid pivot point to the back edge
      this.boxLid.position.z = -0.5 + (Math.sin(this.boxOpenAngle) * 0.05);
      this.boxLid.position.y = 0.8 - 0.05 * (1 - Math.cos(this.boxOpenAngle));
    }
    
    // Hide question mark during opening
    if (this.questionMark) {
      this.questionMark.visible = false;
    }
    
    // Play sound if not already playing
    if (!this.boxSoundPlaying) {
      this.playBoxSound();
    }
    
    // Check if opening animation is complete
    if (openProgress >= 1.0) {
      this.boxState = 'open';
      this.createFloatingWeapon();
      
      // When sound ends (7 seconds), the weapon should be ready
      setTimeout(() => {
        this.weaponReady = true;
      }, 7000);
    }
  }
  
  /**
   * Update the box open state (when lid is fully open)
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateBoxOpen(deltaTime) {
    // Update weapon display time if weapon is ready
    if (this.weaponReady) {
      this.weaponDisplayTime += deltaTime;
      
      // Visual indication of time remaining
      if (this.weaponFloating) {
        // Keep weapon fully visible and elevated for most of the duration
        // Only start lowering in the last 0.5 seconds
        const timeRatio = Math.min(this.weaponDisplayTime / 10.0, 1.0); // Fixed 10-second duration
        
        // Set fixed height - fully elevated for the entire duration
        const startHeight = 1.2; // Height above box
        let currentHeight = startHeight;
        
        // Add a floating/hovering animation to make the weapon more noticeable
        currentHeight += Math.sin(this.time * 2) * 0.05;
        this.weaponFloating.rotation.y += deltaTime * 0.5; // Slow rotation for emphasis
        
        // Update weapon position
        this.weaponFloating.position.y = currentHeight;
        
        // Only start closing the lid in the last half second
        if (this.boxLid && timeRatio > 0.95) {
          // Map 0.95-1.0 to 0-1 for the closing animation (last half second)
          const closingProgress = (timeRatio - 0.95) * 20; // 20 = 1/0.05
          this.boxLid.rotation.x = -(Math.PI/2) * (1 - (closingProgress * 0.2)); // Close by up to 20%
        }
      }
      
      // If display time is up, hide the weapon and close box
      if (this.weaponDisplayTime >= 10.0 && this.hasWeaponAvailable) {
        this.hideWeapon();
        this.hasWeaponAvailable = false;
        this.isOpen = false;
        this.boxState = 'closing';
      }
    }
    
    // If creating a weapon, handle process
    if (this.isGeneratingWeapon && !this.weaponReady) {
      // Track time for weapon generation (using quality for dramatic effect)
      this.weaponGenerationTime += deltaTime;
      
      // Make weapon generation take longer based on quality
      const generationDuration = 1.5 + (this.currentWeaponQuality * 2); // 1.5 to 3.5 seconds based on quality
      
      // Only show weapon after generation is complete
      if (this.weaponGenerationTime >= generationDuration) {
        // Create the weapon if not already created
        if (!this.weaponFloating) {
          this.createFloatingWeapon();
        }
        
        // Mark weapon as ready for pickup
        this.weaponReady = true;
        this.hasWeaponAvailable = true;
        this.weaponDisplayTime = 0;
      }
    }
  }
  
  /**
   * Update the box closing animation
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateBoxClosing(deltaTime) {
    // Update box closing time
    this.boxOpeningTime += deltaTime;
    
    // Calculate progress of the closing animation (0 to 1)
    const closeProgress = Math.min(this.boxOpeningTime / (this.boxOpeningDuration * 0.7), 1.0); // Close faster than open
    
    // Animate box lid closing
    if (this.boxLid) {
      // Calculate lid rotation angle based on easing function (PI/2 to 0)
      this.boxOpenAngle = (Math.PI / 2) * (1 - this.easeInBack(closeProgress));
      
      // Apply rotation to the lid
      this.boxLid.rotation.x = -this.boxOpenAngle;
      
      // Move lid pivot point back
      this.boxLid.position.z = -0.5 + (Math.sin(this.boxOpenAngle) * 0.05);
      this.boxLid.position.y = 0.8 - 0.05 * (1 - Math.cos(this.boxOpenAngle));
    }
    
    // Animate weapon going back into box
    if (this.weaponFloating) {
      // Move the weapon down into the box
      const weaponY = 1.2 - closeProgress * 0.8;
      this.weaponFloating.position.y = weaponY;
      
      // Fade out the weapon
      if (this.weaponFloating.children.length > 0) {
        this.weaponFloating.children.forEach(child => {
          if (child.material && child.material.opacity !== undefined) {
            child.material.opacity = 1 - closeProgress;
          }
        });
      }
    }
    
    // Check if closing animation is complete
    if (closeProgress >= 1.0) {
      this.resetBoxState();
    }
  }
  
  /**
   * Easing function for smoother animations (ease out back)
   * @param {number} t - Progress from 0 to 1
   * @returns {number} Eased value
   */
  easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  
  /**
   * Easing function for smoother animations (ease in back)
   * @param {number} t - Progress from 0 to 1
   * @returns {number} Eased value
   */
  easeInBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  }
  
  /**
   * Play the mystery box sound
   */
  playBoxSound() {
    // Skip audio if already flagged as having an error
    if (this.audioDisabled) {
      return;
    }
    
    try {
      // Create audio element if it doesn't exist
      if (!this.boxSound) {
        this.boxSound = new Audio('/audio/mystery-box-buy.wav');
        this.boxSound.volume = 0.8;
        
        // Add error handler to prevent future attempts if file is missing
        this.boxSound.onerror = () => {
          console.warn("Mystery box sound file not found. Audio disabled.");
          this.audioDisabled = true;
        };
      }
      
      // Only play if audio is loaded
      if (this.boxSound.readyState > 0) {
        this.boxSound.currentTime = 0;
        this.boxSound.play().catch(error => {
          console.warn("Could not play mystery box sound:", error);
          this.audioDisabled = true;
        });
        this.boxSoundPlaying = true;
        
        // Reset the flag when the sound finishes
        this.boxSound.onended = () => {
          this.boxSoundPlaying = false;
        };
      }
    } catch (error) {
      console.warn("Error with mystery box sound:", error);
      this.audioDisabled = true;
    }
  }
  
  /**
   * Create a floating weapon above the mystery box
   */
  createFloatingWeapon() {
    // Create a random weapon based on quality
    const weaponType = this.generateAIWeapon(this.currentWeaponQuality);
    
    // Save weapon type for player delivery
    this.weaponToGive = weaponType;
    
    // Create a visual representation of the weapon
    const weaponMesh = this.createWeaponMesh(weaponType);
    
    // Position above the box
    weaponMesh.position.set(0, 1.2, 0); // Start higher
    
    // Make weapon immediately visible
    weaponMesh.visible = true;
    
    // Add weapon mesh to scene
    this.instance.add(weaponMesh);
    
    // Store reference
    this.weaponFloating = weaponMesh;
    
    // Add a spotlight to highlight the weapon
    const spotlight = new THREE.SpotLight(0x4fc3f7, 2, 3, Math.PI / 6, 0.5, 1);
    spotlight.position.set(0, 2, 0);
    spotlight.target = weaponMesh;
    this.instance.add(spotlight);
    this.weaponSpotlight = spotlight;
    
    // Add a glowing effect around the weapon
    const glowGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x4fc3f7,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    weaponMesh.add(glowMesh);
    this.weaponGlow = glowMesh;
    
    // Log that weapon was created
    console.log("MYSTERY BOX - Created floating weapon:", weaponType.name);
  }
  
  /**
   * Complete the weapon generation and give to player
   * @returns {boolean} Whether the weapon was successfully given
   */
  completeWeaponGeneration() {
    // Reset states
    this.isGeneratingWeapon = false;
    this.weaponGenerationTime = 0;
    this.weaponReady = false;
    
    // Check if there's a player to receive weapon
    if (!this.playerToReceiveWeapon) {
      console.error('No player to receive weapon');
      return false;
    }
    
    // Get the weapon type
    const weaponType = this.weaponToGive;
    
    console.log("Attempting to give weapon to player:", weaponType);
    
    // Give the weapon to the player - check for multiple possible method names
    if (this.playerToReceiveWeapon) {
      let success = false;
      
      // First try giveWeapon method
      if (typeof this.playerToReceiveWeapon.giveWeapon === 'function') {
        try {
          this.playerToReceiveWeapon.giveWeapon(weaponType);
          console.log(`Gave weapon: ${weaponType.name} to player using giveWeapon method`);
          success = true;
        } catch (error) {
          console.error("Error using giveWeapon method:", error);
        }
      }
      // Then try equipWeapon method
      else if (typeof this.playerToReceiveWeapon.equipWeapon === 'function') {
        try {
          this.playerToReceiveWeapon.equipWeapon(weaponType);
          console.log(`Gave weapon: ${weaponType.name} to player using equipWeapon method`);
          success = true;
        } catch (error) {
          console.error("Error using equipWeapon method:", error);
        }
      }
      
      if (success) {
        // Remove the floating weapon
        if (this.weaponFloating) {
          this.instance.remove(this.weaponFloating);
          this.weaponFloating = null;
        }
        
        // Remove spotlight
        if (this.weaponSpotlight) {
          this.instance.remove(this.weaponSpotlight);
          this.weaponSpotlight = null;
        }
        
        // Reset player reference
        this.playerToReceiveWeapon = null;
        
        return true;
      } else {
        console.error("Failed to give weapon to player. No suitable method found.");
      }
    }
    
    return false;
  }
  
  /**
   * Hide the weapon display from the mystery box
   */
  hideWeapon() {
    // Remove the floating weapon from the scene
    if (this.weaponFloating) {
      this.instance.remove(this.weaponFloating);
      this.weaponFloating = null;
    }
    
    // Remove spotlight
    if (this.weaponSpotlight) {
      this.instance.remove(this.weaponSpotlight);
      this.weaponSpotlight = null;
    }
    
    // Update state
    this.hasWeaponAvailable = false;
    this.weaponReady = false;
    
    // Close the box
    this.boxState = 'closing';
  }
  
  /**
   * Take the weapon from the mystery box
   * @param {Player} player - The player taking the weapon
   * @returns {boolean} Whether the weapon was successfully taken
   */
  takeWeapon(player) {
    // Check if there's a weapon available to take
    if (!this.isOpen || !this.hasWeaponAvailable || !this.weaponReady) {
      console.log('No weapon available to take');
      return false;
    }
    
    // Store reference to weapon type first
    const weaponType = this.weaponToGive;
    
    // Detailed debugging information
    console.log("MYSTERY BOX - Attempting to take weapon:", weaponType);
    console.log("MYSTERY BOX - Weapon visual properties:", {
      customColor: weaponType.customColor,
      quality: weaponType.quality
    });
    console.log("MYSTERY BOX - Player object:", player);
    
    // Create a proper weapon instance with all required methods
    const weaponInstance = new Weapon(weaponType);
    weaponInstance.init(); // Initialize the weapon to ensure it has all methods
    
    console.log("MYSTERY BOX - Created fully initialized weapon instance");
    
    // Try to give the weapon to the player via equipWeapon method
    let success = false;
    
    if (typeof player.equipWeapon === 'function') {
      try {
        // Use the proper weapon instance rather than just the type
        player.equipWeapon(weaponInstance);
        console.log("MYSTERY BOX - Successfully equipped weapon using equipWeapon");
        success = true;
      } catch (error) {
        console.error("MYSTERY BOX - Error using equipWeapon:", error);
      }
    } else {
      console.error("MYSTERY BOX - Player does not have equipWeapon method");
    }
    
    // Remove the floating weapon
    if (this.weaponFloating) {
      this.instance.remove(this.weaponFloating);
      this.weaponFloating = null;
    }
    
    // Remove spotlight
    if (this.weaponSpotlight) {
      this.instance.remove(this.weaponSpotlight);
      this.weaponSpotlight = null;
    }
    
    // Update state
    this.hasWeaponAvailable = false;
    this.isOpen = false;
    
    // Start closing the box
    this.boxState = 'closing';
    
    // Play pickup sound
    this.playPickupSound();
    
    // Log final outcome
    if (success) {
      console.log("MYSTERY BOX - Successfully gave player the weapon:", weaponType.name);
    } else {
      console.error("MYSTERY BOX - FAILED to give weapon to player. No suitable method found.");
    }
    
    return success;
  }
  
  /**
   * Play a sound when weapon is picked up
   */
  playPickupSound() {
    // Skip audio if already flagged as having an error
    if (this.audioDisabled) {
      return;
    }
    
    try {
      // Create audio element if it doesn't exist
      if (!this.pickupSound) {
        this.pickupSound = new Audio('/audio/weapon-pickup.wav');
        this.pickupSound.volume = 0.6;
        
        // Add error handler to prevent future attempts if file is missing
        this.pickupSound.onerror = () => {
          console.warn("Weapon pickup sound file not found. Audio disabled.");
          this.audioDisabled = true;
        };
      }
      
      // Only play if audio is loaded
      if (this.pickupSound.readyState > 0) {
        this.pickupSound.currentTime = 0;
        this.pickupSound.play().catch(error => {
          console.warn("Could not play weapon pickup sound:", error);
          this.audioDisabled = true;
        });
      }
    } catch (error) {
      console.warn("Error with weapon pickup sound:", error);
      this.audioDisabled = true;
    }
  }
  
  /**
   * Reset the box state after weapon generation
   */
  resetBoxState() {
    // Remove floating weapon
    if (this.weaponFloating) {
      this.instance.remove(this.weaponFloating);
      this.weaponFloating = null;
    }
    
    // Reset animation state
    this.isOpening = false;
    this.isGeneratingWeapon = false;
    this.boxOpeningTime = 0;
    this.weaponDisplayTime = 0;
    this.boxState = 'closed';
    this.weaponReady = false;
    
    // Reset box lid position and rotation
    if (this.boxLid) {
      this.boxLid.rotation.x = 0;
      this.boxLid.position.y = 0.8;
      this.boxLid.position.z = 0;
    }
    
    // Show question mark again
    if (this.questionMark) {
      this.questionMark.visible = true;
    }
    
    // Clear player reference
    this.playerToReceiveWeapon = null;
  }
  
  /**
   * Update the info panel position in screen space
   * @param {Camera} camera - The player's camera
   */
  updateInfoPanelPosition(camera) {
    if (!this.infoPanel || !this.isPlayerNearby) {
      return;
    }
    
    // Get world position of mystery box
    const boxPosition = new THREE.Vector3();
    this.instance.getWorldPosition(boxPosition);
    boxPosition.y += 1.5; // Position above the box
    
    // Project to screen coordinates
    const screenPosition = boxPosition.clone().project(camera);
    
    // Convert to CSS coordinates
    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = (1 - (screenPosition.y * 0.5 + 0.5)) * window.innerHeight;
    
    // Position the panel above the mystery box
    this.infoPanel.style.left = `${x - 125}px`; // Center the panel
    this.infoPanel.style.top = `${y - 150}px`; // Position above the box
  }
  
  /**
   * Show the info panel
   * @param {boolean} hasEnoughPoints - Whether the player has enough points to use the box
   */
  showInfoPanel(hasEnoughPoints = true) {
    if (!this.infoPanel) return;
    
    // Position the panel in the center bottom of the screen
    this.infoPanel.style.display = 'block';
    
    // Update styling based on whether player can afford it
    const costElement = this.infoPanel.querySelector('span:last-child');
    if (costElement) {
      if (hasEnoughPoints) {
        costElement.style.color = '#4FC3F7';
        costElement.style.textShadow = '0 0 8px rgba(79, 195, 247, 0.5)';
      } else {
        costElement.style.color = '#FF5252';
        costElement.style.textShadow = '0 0 8px rgba(255, 82, 82, 0.5)';
      }
    }
    
    // Update instruction text based on affordability
    const instruction = this.infoPanel.querySelector('div:last-child');
    if (instruction) {
      if (hasEnoughPoints) {
        instruction.textContent = 'Press F to open';
        instruction.style.color = '#E0E0E0';
      } else {
        instruction.textContent = 'Not enough points!';
        instruction.style.color = '#FF5252';
      }
    }
  }
  
  /**
   * Hide the info panel
   */
  hideInfoPanel() {
    if (this.infoPanel) {
      this.infoPanel.style.display = 'none';
    }
  }
  
  /**
   * Check if player is near this mystery box
   * @param {THREE.Vector3} playerPosition - Current player position
   * @returns {boolean} True if player is within interaction distance
   */
  checkPlayerProximity(playerPosition) {
    // Get box world position
    const boxWorldPosition = new THREE.Vector3();
    this.instance.getWorldPosition(boxWorldPosition);
    
    // Calculate distance to player
    const distance = boxWorldPosition.distanceTo(playerPosition);
    
    // Update state
    const wasNearby = this.isPlayerNearby;
    this.isPlayerNearby = distance < this.interactionDistance;
    
    // Show/hide info panel if state changed
    if (wasNearby !== this.isPlayerNearby) {
      this.showInfoPanel(this.isPlayerNearby);
    }
    
    return this.isPlayerNearby;
  }
  
  /**
   * Attempt to open the mystery box
   * @param {Player} player - The player attempting to open the box
   * @returns {boolean} Whether the box was successfully opened
   */
  attemptOpen(player) {
    // If the box is already open, don't allow another open
    if (this.isOpen) {
      console.log('Mystery box is already open');
      return false;
    }
    
    // Check if the box is already being opened or open
    if (this.boxState !== 'closed') {
      console.log('Mystery box is already being opened or open');
      return false;
    }
    
    // Check if player has enough points
    if (player.score < this.cost) {
      console.log(`Player doesn't have enough points (${player.score}/${this.cost})`);
      return false;
    }
    
    // Deduct points
    player.removePoints(this.cost);
    console.log(`Deducted ${this.cost} points from player. Remaining: ${player.score}`);
    
    // Capture current brightness for weapon quality
    this.currentWeaponQuality = Math.max(0.3, this.currentWeaponQuality);
    console.log(`Mystery box opened with quality: ${this.currentWeaponQuality}`);
    
    // Store player reference for weapon delivery
    this.playerToReceiveWeapon = player;
    
    // Start the box opening animation
    this.boxState = 'opening';
    this.boxOpeningTime = 0;
    this.weaponDisplayTime = 0;
    this.weaponReady = false;
    this.weaponGenerationTime = 0; 
    this.isGeneratingWeapon = true;
    
    // Update state flags
    this.isOpen = true;
    this.hasWeaponAvailable = false; // Will be set to true when weapon is ready
    
    return true;
  }
  
  /**
   * Clean up resources when removing mystery box
   */
  dispose() {
    // Remove info panel from document
    if (this.infoPanel && document.body.contains(this.infoPanel)) {
      document.body.removeChild(this.infoPanel);
    }
    
    // Clear any active timeouts
    if (this.weaponTimeoutId) {
      clearTimeout(this.weaponTimeoutId);
      this.weaponTimeoutId = null;
    }
  }
  
  /**
   * Create a visual representation of a weapon
   * @param {WeaponType} weaponType - The type of weapon to create
   * @returns {THREE.Group} The weapon mesh
   */
  createWeaponMesh(weaponType) {
    const weaponGroup = new THREE.Group();
    
    // Create a more detailed weapon model
    const gunBody = new THREE.Group();
    
    // Gun body color based on weapon quality (stored in currentWeaponQuality)
    const quality = this.currentWeaponQuality;
    const bodyColor = new THREE.Color(
      0.2 + quality * 0.8, 
      0.4 + quality * 0.6,
      0.6 + quality * 0.4
    );
    
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: bodyColor,
      emissive: bodyColor.clone().multiplyScalar(0.5),
      emissiveIntensity: 0.8,
      metalness: 0.8,
      roughness: 0.2
    });
    
    // Main body
    const bodyGeometry = new THREE.BoxGeometry(0.08, 0.15, 0.5);
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    gunBody.add(bodyMesh);
    
    // Barrel
    const barrelGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8);
    const barrelMesh = new THREE.Mesh(barrelGeometry, bodyMaterial);
    barrelMesh.position.set(0, 0.05, 0.3);
    barrelMesh.rotation.x = Math.PI / 2;
    gunBody.add(barrelMesh);
    
    // Handle
    const handleGeometry = new THREE.BoxGeometry(0.06, 0.2, 0.08);
    const handleMesh = new THREE.Mesh(handleGeometry, bodyMaterial);
    handleMesh.position.set(0, -0.15, 0);
    gunBody.add(handleMesh);
    
    // Add scope for high quality weapons
    if (quality > 0.7) {
      const scopeGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8);
      const scopeMesh = new THREE.Mesh(scopeGeometry, bodyMaterial);
      scopeMesh.position.set(0, 0.13, 0.1);
      scopeMesh.rotation.x = Math.PI / 2;
      gunBody.add(scopeMesh);
      
      // Scope lens
      const lensGeometry = new THREE.CircleGeometry(0.02, 8);
      const lensMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 1
      });
      const lensMesh = new THREE.Mesh(lensGeometry, lensMaterial);
      lensMesh.position.set(0, 0.13, 0.18);
      lensMesh.rotation.y = Math.PI / 2;
      gunBody.add(lensMesh);
    }
    
    // Add muzzle
    const muzzleGeometry = new THREE.CylinderGeometry(0.03, 0.02, 0.05, 8);
    const muzzleMesh = new THREE.Mesh(muzzleGeometry, bodyMaterial);
    muzzleMesh.position.set(0, 0.05, 0.6);
    muzzleMesh.rotation.x = Math.PI / 2;
    gunBody.add(muzzleMesh);
    
    // Add to weapon group
    weaponGroup.add(gunBody);
    
    return weaponGroup;
  }
  
  /**
   * Generate a random AI weapon with properties based on quality
   * @param {number} quality - Quality value from 0 to 1
   * @returns {Object} The generated weapon type
   */
  generateAIWeapon(quality) {
    // Scale quality for better distribution (emphasize middle range)
    const scaledQuality = Math.pow(quality, 0.7);
    
    // Generate weapon name
    const prefixes = ["Quantum", "Hyper", "Omni", "Void", "Flux", "Nano", "Plasma", "Astral", "Cosmic", "Vortex"];
    const types = ["Blaster", "Cannon", "Pulser", "Decimator", "Annihilator", "Disruptor", "Rifle", "Launcher", "Beamer", "Shredder"];
    const suffixes = ["of Doom", "X9000", "Prime", "Elite", "Mk IV", "Ultra", "Omega", "Infinity", "Matrix", "Nexus"];
    
    // Use quality to determine complexity of name
    let name = "";
    if (scaledQuality < 0.3) {
      // Simple name for low quality
      name = `${types[Math.floor(Math.random() * types.length)]}`;
    } else if (scaledQuality < 0.7) {
      // Two-part name for medium quality
      name = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${types[Math.floor(Math.random() * types.length)]}`;
    } else {
      // Three-part name for high quality
      name = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${types[Math.floor(Math.random() * types.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
    }
    
    // Generate weapon stats based on quality
    const bodyDamage = Math.floor(20 + (scaledQuality * 80)); // 20-100 damage
    const headDamage = Math.floor(bodyDamage * (1.5 + scaledQuality)); // 1.5x to 2.5x multiplier
    
    // Higher quality = faster fire rate (lower cooldown)
    const cooldown = Math.max(0.05, 0.5 - (scaledQuality * 0.45)); // 0.5 to 0.05 seconds
    
    // Higher quality = larger magazine
    const magazineSize = Math.floor(8 + (scaledQuality * 92)); // 8 to 100 rounds
    
    // Higher quality = more ammo
    const totalAmmo = Math.floor(magazineSize * (2 + (scaledQuality * 8))); // 2x to 10x magazine size
    
    // Calculate color values for the weapon based on quality
    const colorR = 0.2 + scaledQuality * 0.8;
    const colorG = 0.4 + scaledQuality * 0.6;
    const colorB = 0.6 + scaledQuality * 0.4;
    
    // Configure weapon type based on random features and quality
    const weaponType = {
      name: name,
      description: `Mystery Box special weapon`,
      cost: 0, // Mystery box weapons are free once obtained
      bodyDamage: bodyDamage,
      headDamage: headDamage,
      cooldown: cooldown,
      magazineSize: magazineSize,
      totalAmmo: totalAmmo,
      currentAmmo: magazineSize, // Start with a full magazine
      automatic: scaledQuality > 0.4, // Higher quality = automatic firing
      
      // Essential weapon properties for gameplay
      spread: 0.02, // Reasonable spread for most weapons
      projectilesPerShot: Math.max(1, Math.floor(scaledQuality * 3)), // 1-3 projectiles based on quality
      shotsPerBurst: 1, // Standard single shot
      reloadTime: Math.max(0.5, 2.0 - scaledQuality), // 0.5-2.0 seconds based on quality
      hasInfiniteAmmo: scaledQuality > 0.9, // Only the best quality weapons get infinite ammo
      
      // Visual properties for maintaining appearance
      customColor: {
        r: colorR,
        g: colorG,
        b: colorB
      },
      quality: scaledQuality, // Store the weapon quality for visual effects
      
      // Metadata
      isMysteryWeapon: true,
      soundPath: '/audio/gun-shot.wav', // Default sound path
      muzzleFlash: true, // Enable muzzle flash for all weapons
    };
    
    console.log("MYSTERY BOX - Created weapon:", name, "with quality:", scaledQuality.toFixed(2), "and properties:", weaponType);
    
    return weaponType;
  }
  
  /**
   * Update the box closed state
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateBoxClosed(deltaTime) {
    // Create a more dramatic pulsing effect from dark to bright
    if (this.questionMark && this.questionMarkMaterial) {
      // Calculate pulsing value - more pronounced between very dark and bright
      const pulseValue = (Math.sin(this.time * 2) + 1) / 2; // 0 to 1 range
      
      // Store current brightness for weapon quality calculation
      this.currentWeaponQuality = pulseValue;
      
      // Apply to question mark material - go from almost black to bright blue
      this.questionMark.children.forEach(child => {
        if (child.material) {
          // Adjust emissive intensity to go from very dark to bright
          child.material.emissiveIntensity = pulseValue * 2; // 0 to 2 range
          
          // Change color from dark to bright
          const colorIntensity = 0.2 + pulseValue * 0.8;
          child.material.color.setRGB(
            0.1 * colorIntensity, 
            0.6 * colorIntensity, 
            0.9 * colorIntensity
          );
        }
      });
      
      // Update the point light intensity - more dramatic from off to very bright
      if (this.questionMarkLight) {
        this.questionMarkLight.intensity = pulseValue * 5; // 0 to 5 range
        
        // Light color goes from dark purple to bright blue
        const lightColor = new THREE.Color(
          0.3 + pulseValue * 0.2,
          0.5 + pulseValue * 0.3,
          0.7 + pulseValue * 0.3
        );
        this.questionMarkLight.color = lightColor;
      }
      
      // Update the glow effect
      if (this.questionMarkGlow) {
        // Opacity pulses with the question mark
        this.questionMarkGlow.material.opacity = 0.05 + pulseValue * 0.3;
        
        // Slowly rotate the glow for additional effect
        this.questionMarkGlow.rotation.y += deltaTime * 0.2;
      }
    }
  }
  
  /**
   * Reset the mystery box to its initial state
   */
  reset() {
    console.log("Resetting Mystery Box");
    
    // Reset all state flags
    this.isActive = true;
    this.isPlayerNearby = false;
    this.isGeneratingWeapon = false;
    this.isOpening = false;
    this.boxOpeningTime = 0;
    this.weaponDisplayTime = 0;
    this.boxSoundPlaying = false;
    this.weaponReady = false;
    
    // Reset box state
    this.boxState = 'closed';
    this.isOpen = false;
    this.hasWeaponAvailable = false;
    
    // Remove any floating weapon
    if (this.weaponFloating) {
      this.instance.remove(this.weaponFloating);
      this.weaponFloating = null;
    }
    
    // Reset box lid position and rotation
    if (this.boxLid) {
      this.boxLid.rotation.x = 0;
      this.boxLid.position.y = 0.8;
      this.boxLid.position.z = 0;
    }
    
    // Show question mark again
    if (this.questionMark) {
      this.questionMark.visible = true;
    }
    
    // Reset floating weapon height
    this.weaponFloatingHeight = 0;
    
    // Clear player reference
    this.playerToReceiveWeapon = null;
    
    // Reset quality and time
    this.currentWeaponQuality = 0.5;
    this.time = 0;
    
    // Hide info panel if it exists
    this.hideInfoPanel();
  }
} 
 
 
 
 
 