import * as THREE from 'three';
import { Weapon } from '../weapons/Weapon';

/**
 * MysteryBox class for random weapon rewards
 */
export class MysteryBox {
  constructor() {
    // Mystery box properties
    this.cost = 10000;
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
    
    // Player reference for weapon delivery
    this.playerToReceiveWeapon = null;
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
    
    // Main box
    const boxGeometry = new THREE.BoxGeometry(1, 0.8, 1);
    const boxMesh = new THREE.Mesh(boxGeometry, woodMaterial);
    boxMesh.position.set(0, 0.4, 0);
    boxGroup.add(boxMesh);
    
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
    
    // Add top edges
    const topY = 0.8;
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0, topY, -0.5 - edgeThickness/2));
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0, topY, 0.5 + edgeThickness/2));
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, -0.5 - edgeThickness/2, topY, 0, Math.PI/2));
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0.5 + edgeThickness/2, topY, 0, Math.PI/2));
    
    // Add bottom edges
    const bottomY = 0;
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0, bottomY, -0.5 - edgeThickness/2));
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0, bottomY, 0.5 + edgeThickness/2));
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, -0.5 - edgeThickness/2, bottomY, 0, Math.PI/2));
    boxGroup.add(createEdge(1 + edgeThickness, edgeThickness, edgeThickness, 0.5 + edgeThickness/2, bottomY, 0, Math.PI/2));
    
    // Add vertical edges
    const createVerticalEdge = (x, z) => {
      const edgeGeometry = new THREE.BoxGeometry(edgeThickness, 0.8, edgeThickness);
      const edge = new THREE.Mesh(edgeGeometry, metalTrimMaterial);
      edge.position.set(x, 0.4, z);
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
          symbol.position.set(0, 0.4, 0.501);
          break;
        case 'back':
          symbol.position.set(0, 0.4, -0.501);
          symbol.rotation.y = Math.PI;
          break;
        case 'left':
          symbol.position.set(-0.501, 0.4, 0);
          symbol.rotation.y = -Math.PI/2;
          break;
        case 'right':
          symbol.position.set(0.501, 0.4, 0);
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
    boxMesh.userData.isInteractive = true;
    boxMesh.userData.objectType = 'mysteryBox';
    
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
   * @param {number} deltaTime - Time since last frame
   */
  update(deltaTime) {
    // Update animation time
    this.time += deltaTime;
    
    // Create a more dramatic pulsing effect from dark to bright
    if (this.questionMark && this.questionMarkMaterial && !this.isOpening) {
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
    
    // Handle box opening animation if active
    if (this.isOpening) {
      this.boxOpeningTime += deltaTime;
      const progress = Math.min(this.boxOpeningTime / this.boxOpeningDuration, 1.0);
      
      // Animate box opening
      this.animateBoxOpening(progress);
      
      // Check if animation is complete
      if (progress >= 1.0 && !this.isGeneratingWeapon) {
        this.completeWeaponGeneration();
      }
    }
  }
  
  /**
   * Animate the box opening
   * @param {number} progress - Animation progress from 0 to 1
   */
  animateBoxOpening(progress) {
    if (!this.weaponFloating) {
      // Create a placeholder floating weapon on first animation frame
      this.createFloatingWeapon();
    }
    
    if (this.weaponFloating) {
      // Animate the weapon floating up from the box
      const height = Math.sin(progress * Math.PI) * 1.5;
      this.weaponFloating.position.y = 0.8 + height;
      
      // Rotate the weapon slowly
      this.weaponFloating.rotation.y += 0.03;
      
      // Scale the weapon for a "materializing" effect
      if (progress < 0.5) {
        // Scale up during first half
        const scale = progress * 2;
        this.weaponFloating.scale.set(scale, scale, scale);
      }
      
      // Add glowing effect that intensifies
      if (this.weaponFloating.children.length > 0) {
        this.weaponFloating.children.forEach(child => {
          if (child.material) {
            child.material.emissive = new THREE.Color(
              0.3 + progress * 0.7,
              0.3 + progress * 0.7,
              0.3 + progress * 0.7
            );
            child.material.emissiveIntensity = progress * 2;
          }
        });
      }
    }
    
    // Hide question mark during animation
    if (this.questionMark) {
      this.questionMark.visible = false;
    }
  }
  
  /**
   * Create a floating weapon above the box
   */
  createFloatingWeapon() {
    const weaponGroup = new THREE.Group();
    
    // Create a glowing placeholder weapon
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.4);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4fc3f7,
      emissive: 0x4fc3f7,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8
    });
    const weaponMesh = new THREE.Mesh(geometry, material);
    weaponGroup.add(weaponMesh);
    
    // Add details based on quality
    const quality = this.currentWeaponQuality;
    
    // Add more complex geometry for higher quality
    if (quality > 0.3) {
      // Add barrel
      const barrelGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8);
      const barrel = new THREE.Mesh(barrelGeometry, material);
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(0, 0, -0.1);
      weaponGroup.add(barrel);
      
      // Add scope for higher quality
      if (quality > 0.6) {
        const scopeGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8);
        const scope = new THREE.Mesh(scopeGeometry, material);
        scope.position.set(0, 0.07, 0);
        weaponGroup.add(scope);
      }
      
      // Add magazine
      const magGeometry = new THREE.BoxGeometry(0.04, 0.15, 0.06);
      const mag = new THREE.Mesh(magGeometry, material);
      mag.position.set(0, -0.12, 0);
      weaponGroup.add(mag);
    }
    
    // Position at the top of the box
    weaponGroup.position.set(0, 0.8, 0);
    weaponGroup.scale.set(0, 0, 0); // Start invisible
    
    // Add to scene
    this.instance.add(weaponGroup);
    this.weaponFloating = weaponGroup;
  }
  
  /**
   * Complete the weapon generation and give it to the player
   */
  completeWeaponGeneration() {
    if (!this.playerToReceiveWeapon) return;
    
    console.log("Generating mystery box weapon with quality:", this.currentWeaponQuality);
    
    // Create a weapon based on quality
    const weapon = this.generateAIWeapon(this.currentWeaponQuality);
    
    // Give the weapon to the player
    this.playerToReceiveWeapon.equipWeapon(weapon);
    
    // Show success message
    this.showWeaponObtainedMessage(weapon.name);
    
    // Clean up
    this.resetBoxState();
  }
  
  /**
   * Generate a random AI weapon with properties based on quality
   * @param {number} quality - Quality value from 0 to 1
   * @returns {Weapon} - The generated weapon
   */
  generateAIWeapon(quality) {
    // Scale quality for better distribution (emphasize middle range)
    const scaledQuality = Math.pow(quality, 0.7);
    
    // Generate wacky weapon name
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
    
    // Generate weapon description
    const adjectives = ["devastating", "extraordinary", "unstable", "powerful", "advanced", "experimental", "mysterious", "anomalous"];
    const descriptions = ["weapon", "technology", "prototype", "armament", "creation", "invention"];
    const effects = ["disintegrates targets", "warps reality", "freezes time", "opens dimensions", "unleashes chaos", "bends physics"];
    
    const description = `An ${adjectives[Math.floor(Math.random() * adjectives.length)]} ${descriptions[Math.floor(Math.random() * descriptions.length)]} that ${effects[Math.floor(Math.random() * effects.length)]}.`;
    
    // Generate weapon stats based on quality
    const damage = Math.floor(20 + (scaledQuality * 80)); // 20-100 damage
    const headDamage = Math.floor(damage * (1.5 + scaledQuality)); // 1.5x to 2.5x multiplier
    
    // Higher quality = faster fire rate (lower cooldown)
    const cooldown = Math.max(0.05, 0.5 - (scaledQuality * 0.45)); // 0.5 to 0.05 seconds
    
    // Higher quality = larger magazine
    const magazineSize = Math.floor(8 + (scaledQuality * 92)); // 8 to 100 rounds
    
    // Higher quality = more ammo
    const totalAmmo = Math.floor(magazineSize * (2 + (scaledQuality * 8))); // 2x to 10x magazine size
    
    // Higher quality = more bullets per shot (for shotgun-like weapons)
    const projectilesPerShot = Math.floor(1 + (scaledQuality * scaledQuality * 15)); // 1 to 16 projectiles
    
    // Higher quality = better accuracy (lower spread)
    const spread = Math.max(0.001, 0.1 - (scaledQuality * 0.099)); // 0.1 to 0.001
    
    // Configure weapon based on random features and quality
    const weaponConfig = {
      name: name,
      description: description,
      cost: 0, // Mystery box weapons are free once obtained
      bodyDamage: damage,
      headDamage: headDamage,
      cooldown: cooldown,
      magazineSize: magazineSize,
      totalAmmo: totalAmmo,
      automatic: scaledQuality > 0.4, // Higher quality = automatic firing
      projectilesPerShot: projectilesPerShot,
      spread: spread,
      hasInfiniteAmmo: scaledQuality > 0.9, // Only the best quality weapons get infinite ammo
      isMysteryWeapon: true
    };
    
    // Create the weapon
    const weapon = new Weapon(weaponConfig);
    console.log("Created AI weapon:", name, "with quality:", scaledQuality);
    
    return weapon;
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
    
    // Show question mark again
    if (this.questionMark) {
      this.questionMark.visible = true;
    }
    
    // Clear player reference
    this.playerToReceiveWeapon = null;
  }
  
  /**
   * Show a message when the player obtains a weapon
   * @param {string} weaponName - Name of the weapon obtained
   */
  showWeaponObtainedMessage(weaponName) {
    const messageContainer = document.createElement('div');
    messageContainer.style.position = 'absolute';
    messageContainer.style.top = '30%';
    messageContainer.style.left = '50%';
    messageContainer.style.transform = 'translateX(-50%)';
    messageContainer.style.padding = '20px 40px';
    messageContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    messageContainer.style.color = '#4FC3F7';
    messageContainer.style.fontFamily = 'Arial, sans-serif';
    messageContainer.style.fontSize = '28px';
    messageContainer.style.fontWeight = 'bold';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.zIndex = '2000';
    messageContainer.style.textAlign = 'center';
    messageContainer.style.boxShadow = '0 0 30px rgba(79, 195, 247, 0.7)';
    messageContainer.style.border = '3px solid #4FC3F7';
    messageContainer.style.animation = 'weaponReveal 3s forwards';
    
    // Add weapon name with special styling
    messageContainer.innerHTML = `
      <div style="font-size: 22px; margin-bottom: 10px; color: #B39DDB;">You obtained</div>
      <div style="font-size: 32px; margin: 15px 0; color: #FFEB3B; text-shadow: 0 0 10px rgba(255, 235, 59, 0.7);">${weaponName}</div>
      <div style="font-size: 18px; color: #E0E0E0;">Press Tab to view your weapons</div>
    `;
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes weaponReveal {
        0% { opacity: 0; transform: translate(-50%, -30px); }
        10% { opacity: 1; transform: translate(-50%, 0); }
        80% { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -30px); }
      }
    `;
    document.head.appendChild(style);
    
    // Add to document and remove after animation completes
    document.body.appendChild(messageContainer);
    setTimeout(() => {
      document.body.removeChild(messageContainer);
    }, 3000);
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
    // Check if the box is already being opened
    if (this.isOpening) {
      console.log('Mystery box is already being opened');
      return false;
    }
    
    // Check if player has enough points
    if (player.score < this.cost) {
      console.log(`Player doesn't have enough points (${player.score}/${this.cost})`);
      
      // Show insufficient funds message
      this.showInsufficientFundsMessage();
      
      return false;
    }
    
    // Deduct points
    player.removePoints(this.cost);
    console.log(`Deducted ${this.cost} points from player. Remaining: ${player.score}`);
    
    // Capture current brightness for weapon quality
    const currentQuality = this.currentWeaponQuality;
    console.log(`Mystery box opened with quality: ${currentQuality}`);
    
    // Store player reference for weapon delivery
    this.playerToReceiveWeapon = player;
    
    // Start the box opening animation
    this.isOpening = true;
    this.boxOpeningTime = 0;
    
    // Show opening message
    this.showOpeningMessage();
    
    return true;
  }
  
  /**
   * Show a message when player has insufficient funds
   */
  showInsufficientFundsMessage() {
    const messageContainer = document.createElement('div');
    messageContainer.style.position = 'absolute';
    messageContainer.style.top = '30%';
    messageContainer.style.left = '50%';
    messageContainer.style.transform = 'translateX(-50%)';
    messageContainer.style.padding = '15px 30px';
    messageContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    messageContainer.style.color = '#FF5252';
    messageContainer.style.fontFamily = 'Arial, sans-serif';
    messageContainer.style.fontSize = '24px';
    messageContainer.style.fontWeight = 'bold';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.zIndex = '2000';
    messageContainer.style.textAlign = 'center';
    messageContainer.style.boxShadow = '0 0 20px rgba(255, 82, 82, 0.5)';
    messageContainer.style.border = '2px solid #FF5252';
    messageContainer.style.animation = 'fadeInOut 2s forwards';
    messageContainer.textContent = 'Not enough points!';
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%, -20px); }
        15% { opacity: 1; transform: translate(-50%, 0); }
        75% { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -20px); }
      }
    `;
    document.head.appendChild(style);
    
    // Add to document and remove after animation completes
    document.body.appendChild(messageContainer);
    setTimeout(() => {
      document.body.removeChild(messageContainer);
    }, 2000);
  }
  
  /**
   * Show a message when the box is being opened
   */
  showOpeningMessage() {
    const messageContainer = document.createElement('div');
    messageContainer.style.position = 'absolute';
    messageContainer.style.top = '30%';
    messageContainer.style.left = '50%';
    messageContainer.style.transform = 'translateX(-50%)';
    messageContainer.style.padding = '15px 30px';
    messageContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    messageContainer.style.color = '#4FC3F7';
    messageContainer.style.fontFamily = 'Arial, sans-serif';
    messageContainer.style.fontSize = '24px';
    messageContainer.style.fontWeight = 'bold';
    messageContainer.style.borderRadius = '8px';
    messageContainer.style.zIndex = '2000';
    messageContainer.style.textAlign = 'center';
    messageContainer.style.boxShadow = '0 0 20px rgba(79, 195, 247, 0.5)';
    messageContainer.style.border = '2px solid #4FC3F7';
    messageContainer.style.animation = 'fadeInOut 2s forwards';
    messageContainer.textContent = 'Opening Mystery Box...';
    
    // Add to document and remove after animation completes
    document.body.appendChild(messageContainer);
    setTimeout(() => {
      document.body.removeChild(messageContainer);
    }, 2000);
  }
  
  /**
   * Clean up resources when removing mystery box
   */
  dispose() {
    // Remove info panel from document
    if (this.infoPanel && document.body.contains(this.infoPanel)) {
      document.body.removeChild(this.infoPanel);
    }
  }
} 
 