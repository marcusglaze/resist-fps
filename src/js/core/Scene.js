import * as THREE from 'three';
import { Room } from '../objects/Room';

/**
 * Manages the Three.js scene and camera
 */
export class Scene {
  constructor(debugMode = false, doomMode = true) {
    // Debug mode
    this.debugMode = debugMode;
    
    // Doom mode for retro aesthetics
    this.doomMode = doomMode;
    
    // Create scene
    this.instance = new THREE.Scene();
    
    // Darker background in Doom mode
    if (this.doomMode) {
      this.instance.background = new THREE.Color(0x150505); // Very dark red for doom-like aesthetic
      
      // Add fog for Doom-like depth effect
      this.instance.fog = new THREE.FogExp2(0x000000, 0.12);
    } else {
      this.instance.background = new THREE.Color(0x87CEEB); // Sky blue for normal mode
    }
    
    // Create camera with more Doom-like FOV
    const fov = this.doomMode ? 85 : 75; // Higher FOV in Doom mode
    this.camera = new THREE.PerspectiveCamera(
      fov, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    
    // Set initial camera position
    this.camera.position.set(0, 1.7, 0); // Eye level for an average person
    
    // Configure lighting based on mode
    if (this.doomMode) {
      // Doom-like lighting (dimmer ambient, harsher directional)
      this.ambientLight = new THREE.AmbientLight(0x222222, 0.6);
      this.directionalLight = new THREE.DirectionalLight(0xffaa44, 1.0); // More orangish light
    } else {
      // Standard lighting
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    }
    
    this.directionalLight.position.set(10, 10, 10);
    this.directionalLight.castShadow = true;
    
    // Shadow map settings
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 50;
    this.directionalLight.shadow.camera.left = -10;
    this.directionalLight.shadow.camera.right = 10;
    this.directionalLight.shadow.camera.top = 10;
    this.directionalLight.shadow.camera.bottom = -10;
    
    // Create point lights for more dynamic lighting in Doom mode
    if (this.doomMode) {
      this.createDoomLights();
    }
    
    // Room (pass debug mode)
    this.room = new Room(this.debugMode);
  }

  /**
   * Create additional lights for Doom-like atmosphere
   */
  createDoomLights() {
    // Create flickering red point light for atmosphere
    this.redLight = new THREE.PointLight(0xff0000, 0.8, 15);
    this.redLight.position.set(0, 2, 0);
    
    // Create a second blue light on the opposite side
    this.blueLight = new THREE.PointLight(0x0000ff, 0.5, 10);
    this.blueLight.position.set(0, 2, -5);
    
    // Make lights flicker over time
    this.flickerTime = 0;
  }
  
  /**
   * Update flickering lights for Doom atmosphere
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateDoomLights(deltaTime) {
    if (!this.doomMode || !this.redLight || !this.blueLight) return;
    
    // Update flicker time
    this.flickerTime += deltaTime;
    
    // Calculate flicker intensity using noise
    const redFlicker = 0.7 + 0.3 * Math.sin(this.flickerTime * 10) * Math.sin(this.flickerTime * 7.3);
    const blueFlicker = 0.6 + 0.4 * Math.sin(this.flickerTime * 5.3 + 1.4) * Math.sin(this.flickerTime * 6.1);
    
    // Apply flicker
    this.redLight.intensity = redFlicker;
    this.blueLight.intensity = blueFlicker * 0.4;
  }

  /**
   * Initialize scene and add objects
   */
  init() {
    // Add lights
    this.instance.add(this.ambientLight);
    this.instance.add(this.directionalLight);
    
    // Add doom-specific lights
    if (this.doomMode && this.redLight && this.blueLight) {
      this.instance.add(this.redLight);
      this.instance.add(this.blueLight);
    }
    
    // Initialize and add room
    this.room.init();
    this.instance.add(this.room.instance);
    
    // Disable enemy spawning initially (will be enabled when game starts)
    if (this.room.enemyManager) {
      this.room.enemyManager.toggleSpawning(false);
    }
  }
  
  /**
   * Update scene logic
   * @param {number} deltaTime - Time elapsed since last update
   */
  update(deltaTime) {
    // Update doom lights if enabled
    if (this.doomMode) {
      this.updateDoomLights(deltaTime);
    }
  }

  /**
   * Get the Three.js scene instance
   */
  get() {
    return this.instance;
  }
} 