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
    this.bodyDamage = config.bodyDamage || 30;
    this.headDamage = config.headDamage || 60;
    
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
    
    // 3D model
    this.instance = null;
    
    // State
    this.isReloading = false;
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
  }
  
  /**
   * Create a default model for the weapon
   */
  createDefaultModel() {
    // Create a simple placeholder model
    const geometry = new THREE.BoxGeometry(0.3, 0.2, 0.8);
    const material = new THREE.MeshStandardMaterial({ color: 0x333333 });
    this.instance = new THREE.Mesh(geometry, material);
    this.instance.userData = { weapon: true, name: this.name };
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
    
    // Calculate spread for this shot
    const actualSpread = this.calculateSpread();
    
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
    cost: 1000,
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
    cost: 2000,
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
 