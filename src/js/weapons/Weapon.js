import * as THREE from 'three';

/**
 * Weapon class for defining different weapons in the game
 */
export class Weapon {
  constructor(config = {}) {
    // Weapon properties with defaults
    this.name = config.name || 'Pistol';
    this.description = config.description || 'Standard sidearm';
    this.cost = config.cost || 500;
    
    // Damage properties
    this.bodyDamage = config.bodyDamage || 15;
    this.headDamage = config.headDamage || 30;
    
    // Firing properties
    this.cooldown = config.cooldown || 0.5; // Seconds between shots
    this.automatic = config.automatic || false; // Whether weapon can be held to fire
    this.magazineSize = config.magazineSize || 8;
    this.totalAmmo = config.totalAmmo || 40;
    this.currentAmmo = this.magazineSize;
    this.shotsPerBurst = config.shotsPerBurst || 1; // For burst weapons
    this.projectilesPerShot = config.projectilesPerShot || 1; // For shotguns
    this.spread = config.spread || 0.01; // Accuracy (lower is better)
    
    // Ammo system
    this.hasInfiniteAmmo = config.hasInfiniteAmmo || false;
    
    // Visual and audio properties
    this.modelPath = config.modelPath || null;
    this.soundPath = config.soundPath || null;
    this.muzzleFlash = config.muzzleFlash || false;
    this.reloadTime = config.reloadTime || 1.5;
    
    // Visual properties for mystery weapons
    this.customColor = config.customColor || null;
    this.quality = config.quality || null;
    
    // Flag for mystery box weapons
    this.isMysteryWeapon = config.isMysteryWeapon || false;
    
    // 3D model
    this.instance = null;
    
    // State
    this.isReloading = false;
    
    // Firing state tracking (to prevent disappearing weapon issue)
    this.isFiring = false;
    this.firingVisibilityTimeout = null;
    
    // Timing for cooldown
    this.lastFireTime = 0;
    
    // Store original color for restoration if needed
    if (this.customColor) {
      this.originalColor = {...this.customColor};
    }
  }
  
  /**
   * Initialize the weapon model
   */
  init() {
    // Create a default model if no path is provided
    if (!this.modelPath) {
      this.createDefaultModel();
    } else {
      // Load model from path (would need to implement this)
      this.loadModel();
    }
    
    // Set up position reset function for mystery weapons
    if (this.isMysteryWeapon) {
      this.resetPositionOnFire = this.createResetPositionFunction();
    }
  }
  
  /**
   * Create a default model for the weapon
   */
  createDefaultModel() {
    // Check if custom color is provided
    let weaponColor = 0x333333; // Default color
    let emissiveIntensity = 0;
    let metalness = 0.5;
    let roughness = 0.5;
    
    // If this is a mystery weapon, use its custom color
    if (this.customColor) {
      // Create THREE.Color from the RGB values
      weaponColor = new THREE.Color(
        this.customColor.r,
        this.customColor.g,
        this.customColor.b
      );
      
      // Add emissive properties for mystery weapons
      emissiveIntensity = 0.5;
      metalness = 0.8;
      roughness = 0.2;
    }
    
    // Create a material with the appropriate color
    const material = new THREE.MeshStandardMaterial({ 
      color: weaponColor,
      emissive: weaponColor,
      emissiveIntensity: emissiveIntensity,
      metalness: metalness,
      roughness: roughness
    });
    
    // Create a more detailed model for mystery weapons
    if (this.customColor) {
      // Create a weapon group
      this.instance = new THREE.Group();
      
      // Main body
      const bodyGeometry = new THREE.BoxGeometry(0.08, 0.15, 0.5);
      const bodyMesh = new THREE.Mesh(bodyGeometry, material);
      this.instance.add(bodyMesh);
      
      // Barrel
      const barrelGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8);
      const barrelMesh = new THREE.Mesh(barrelGeometry, material);
      barrelMesh.position.set(0, 0.05, 0.3);
      barrelMesh.rotation.x = Math.PI / 2;
      this.instance.add(barrelMesh);
      
      // Handle
      const handleGeometry = new THREE.BoxGeometry(0.06, 0.2, 0.08);
      const handleMesh = new THREE.Mesh(handleGeometry, material);
      handleMesh.position.set(0, -0.15, 0);
      this.instance.add(handleMesh);
      
      // Add scope for high quality weapons
      if (this.quality && this.quality > 0.7) {
        const scopeGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8);
        const scopeMesh = new THREE.Mesh(scopeGeometry, material);
        scopeMesh.position.set(0, 0.13, 0.1);
        scopeMesh.rotation.x = Math.PI / 2;
        this.instance.add(scopeMesh);
        
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
        this.instance.add(lensMesh);
      }
      
      // Add muzzle
      const muzzleGeometry = new THREE.CylinderGeometry(0.03, 0.02, 0.05, 8);
      const muzzleMesh = new THREE.Mesh(muzzleGeometry, material);
      muzzleMesh.position.set(0, 0.05, 0.6);
      muzzleMesh.rotation.x = Math.PI / 2;
      this.instance.add(muzzleMesh);
      
      // Set user data
      this.instance.userData = { weapon: true, name: this.name, isMysteryWeapon: true };
    } else {
      // Create a simple placeholder model for normal weapons
      const geometry = new THREE.BoxGeometry(0.3, 0.2, 0.8);
      this.instance = new THREE.Mesh(geometry, material);
      this.instance.userData = { weapon: true, name: this.name };
    }
  }
  
  /**
   * Load a model from a file path
   */
  loadModel() {
    // This would use the THREE.js loader to load a model
    console.log(`Loading model from ${this.modelPath}`);
    // For now, fallback to the default model
    this.createDefaultModel();
  }
  
  /**
   * Fire the weapon
   * @returns {Object} Firing data including damage, spread, etc.
   */
  fire() {
    // Check if we can fire
    if (this.currentAmmo <= 0 || this.isReloading) {
      return null;
    }
    
    // Reduce ammo
    this.currentAmmo--;
    
    // Update last fire time for cooldown tracking
    this.lastFireTime = Date.now();
    
    // Calculate spread for this shot
    const actualSpread = this.calculateSpread();
    
    // Ensure weapon is always visible during firing
    // This prevents mystery weapons from disappearing during rapid fire
    if (this.instance && this.isMysteryWeapon) {
      // Set a flag to indicate weapon is being fired (for debugging)
      this.isFiring = true;
      
      // Ensure the weapon's visibility is maintained
      this.instance.visible = true;
      
      // Make sure opacity is restored in case it was faded
      if (this.instance.children && this.instance.children.length > 0) {
        this.instance.children.forEach(child => {
          if (child.material && child.material.opacity !== undefined) {
            child.material.opacity = 1;
          }
        });
      }
      
      // Reset any potential position drift that might occur during rapid fire
      // This helps prevent the weapon from moving behind the camera
      if (this.resetPositionOnFire && typeof this.resetPositionOnFire === 'function') {
        this.resetPositionOnFire();
      }
      
      // Clear any existing timeout to avoid multiple
      if (this.firingVisibilityTimeout) {
        clearTimeout(this.firingVisibilityTimeout);
      }
      
      // Reset the firing flag after a short delay to prevent flicker
      this.firingVisibilityTimeout = setTimeout(() => {
        this.isFiring = false;
      }, 100);
    }
    
    // Return the firing data
    return {
      bodyDamage: this.bodyDamage,
      headDamage: this.headDamage,
      projectiles: this.projectilesPerShot,
      spread: actualSpread
    };
  }
  
  /**
   * Calculate the spread for this shot
   * @returns {number} The calculated spread
   */
  calculateSpread() {
    // Base spread
    return this.spread;
  }
  
  /**
   * Check if the weapon can shoot
   * @returns {boolean} Whether the weapon can shoot
   */
  canShoot() {
    // Check for active cooldown
    if (this.lastFireTime && ((Date.now() - this.lastFireTime) / 1000 < this.cooldown)) {
      return false;
    }
    
    // Check if we have ammo
    if (this.currentAmmo <= 0 && !this.hasInfiniteAmmo) {
      return false;
    }
    
    // Check if we're reloading
    if (this.isReloading) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Alias for fire() - for backward compatibility
   * @returns {Object} Firing data including damage, spread, etc.
   */
  shoot() {
    return this.fire();
  }
  
  /**
   * Reload the weapon
   * @returns {boolean} True if reload was started
   */
  reload() {
    // Can't reload if already reloading or if magazine is full
    if (this.isReloading || this.currentAmmo === this.magazineSize) {
      return false;
    }
    
    // If weapon has infinite ammo, just reload without consuming totalAmmo
    if (this.hasInfiniteAmmo) {
      this.isReloading = true;
      
      // After reload time, refill magazine completely
      setTimeout(() => {
        this.currentAmmo = this.magazineSize;
        this.isReloading = false;
      }, this.reloadTime * 1000);
      
      return true;
    }
    
    // For non-infinite weapons, check if any ammo is left
    if (this.totalAmmo <= 0) {
      return false;
    }
    
    // Start reloading
    this.isReloading = true;
    
    // Calculate how many bullets we can reload
    const neededAmmo = this.magazineSize - this.currentAmmo;
    const reloadAmount = Math.min(neededAmmo, this.totalAmmo);
    
    // After reload time, add ammo to current magazine
    setTimeout(() => {
      this.currentAmmo += reloadAmount;
      this.totalAmmo -= reloadAmount;
      this.isReloading = false;
    }, this.reloadTime * 1000);
    
    return true;
  }
  
  /**
   * Add ammo to the weapon's total
   * @param {number} amount - Amount of ammo to add
   */
  addAmmo(amount) {
    this.totalAmmo += amount;
  }
  
  /**
   * Position the weapon model for wall mounting
   * @param {THREE.Vector3} position - Position to mount the weapon
   * @param {THREE.Euler} rotation - Rotation for the mounted weapon
   */
  positionForWallMount(position, rotation) {
    if (this.instance) {
      this.instance.position.copy(position);
      this.instance.rotation.copy(rotation);
    }
  }
  
  /**
   * Create a function to reset weapon position during firing
   * This helps prevent the weapon from disappearing during rapid fire
   * @returns {Function} A function that resets the weapon position
   */
  createResetPositionFunction() {
    // Store original position and rotation once weapon is positioned by player
    let originalPosition = null;
    let originalRotation = null;
    
    // Return a function that will reset position when called
    return () => {
      if (!this.instance) return;
      
      // If we haven't stored original position yet, store current position
      // This assumes the weapon is properly positioned by the player system
      if (!originalPosition && this.instance.position) {
        originalPosition = this.instance.position.clone();
        if (this.instance.rotation) {
          originalRotation = this.instance.rotation.clone();
        }
        console.log("WEAPON: Stored original position for stabilization", originalPosition);
      }
      
      // If we have stored position and the current position seems too far off,
      // reset to the original position
      if (originalPosition && this.instance.position) {
        // Calculate distance from original position
        const distance = originalPosition.distanceTo(this.instance.position);
        
        // If distance is too large, reset position
        // This catches cases where the weapon might have moved too far from expected position
        if (distance > 1.0) {
          console.log("WEAPON: Resetting position due to drift", {
            current: this.instance.position.clone(),
            original: originalPosition,
            distance
          });
          this.instance.position.copy(originalPosition);
          
          if (originalRotation && this.instance.rotation) {
            this.instance.rotation.copy(originalRotation);
          }
        }
      }
    };
  }
  
  /**
   * Clean up resources when the weapon is removed
   */
  dispose() {
    // Clear any active timeouts
    if (this.firingVisibilityTimeout) {
      clearTimeout(this.firingVisibilityTimeout);
      this.firingVisibilityTimeout = null;
    }
    
    // Remove any event listeners or references that could cause memory leaks
    this.resetPositionOnFire = null;
    
    // Remove 3D model if it exists
    if (this.instance && this.instance.parent) {
      this.instance.parent.remove(this.instance);
    }
    
    // Clear references to allow garbage collection
    this.instance = null;
  }
}

/**
 * Define common weapon types
 */
export const WeaponTypes = {
  // Starting weapon
  PISTOL: {
    name: 'Pistol',
    description: 'Standard issue sidearm',
    cost: 0, // Free (starting weapon)
    bodyDamage: 20,
    headDamage: 30,
    cooldown: 0.2,
    magazineSize: 12,
    totalAmmo: 40,
    automatic: false,
    spread: 0.015,
    hasInfiniteAmmo: true // Pistol has infinite ammo
  },
  
  // Wall buy weapons
  SHOTGUN: {
    name: 'Shotgun',
    description: 'Close range devastation',
    cost: 2500,
    bodyDamage: 20, // Per pellet
    headDamage: 30, // Per pellet
    cooldown: 0.8,
    magazineSize: 8,
    totalAmmo: 32,
    automatic: false,
    projectilesPerShot: 8, // 8 pellets per shot
    spread: 0.07,
    hasInfiniteAmmo: false
  },
  
  ASSAULT_RIFLE: {
    name: 'Assault Rifle',
    description: 'Balanced firepower',
    cost: 5000,
    bodyDamage: 25,
    headDamage: 50,
    cooldown: 0.15,
    magazineSize: 30,
    totalAmmo: 150,
    automatic: true,
    spread: 0.02,
    hasInfiniteAmmo: false
  }
}; 
 
 
 
 
 