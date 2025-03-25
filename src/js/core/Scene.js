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
      
      // Add fog for Doom-like depth effect - reduced fog intensity for brightness
      this.instance.fog = new THREE.FogExp2(0x000000, 0.03); // Further reduced fog intensity for better visibility
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
      // Doom-like lighting with increased ambient brightness
      this.ambientLight = new THREE.AmbientLight(0x777777, 1.8); // Increased ambient light intensity from 1.3 to 1.8
      this.directionalLight = new THREE.DirectionalLight(0xffaa44, 1.8); // Increased directional light intensity from 1.4 to 1.8
    } else {
      // Standard lighting
      this.ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    }
    
    this.directionalLight.position.set(10, 10, 10);
    // Only cast shadows in non-doom mode
    this.directionalLight.castShadow = !this.doomMode;
    
    // Shadow map settings (only used in non-doom mode)
    if (!this.doomMode) {
      this.directionalLight.shadow.mapSize.width = 2048;
      this.directionalLight.shadow.mapSize.height = 2048;
      this.directionalLight.shadow.camera.near = 0.5;
      this.directionalLight.shadow.camera.far = 50;
      this.directionalLight.shadow.camera.left = -10;
      this.directionalLight.shadow.camera.right = 10;
      this.directionalLight.shadow.camera.top = 10;
      this.directionalLight.shadow.camera.bottom = -10;
    }
    
    // Create point lights for more dynamic lighting in Doom mode
    if (this.doomMode) {
      this.createDoomLights();
    }
    
    // Room (pass debug mode)
    this.room = new Room(this.debugMode);
  }

  /**
   * Create additional lights for Doom-like atmosphere with more color variety
   */
  createDoomLights() {
    // Create flickering red point light with higher intensity
    this.redLight = new THREE.PointLight(0xff0000, 1.8, 25); // Increased from 1.4 to 1.8
    this.redLight.position.set(0, 2, 0);
    
    // Create blue light with higher intensity
    this.blueLight = new THREE.PointLight(0x4444ff, 1.6, 20); // Increased from 1.2 to 1.6
    this.blueLight.position.set(0, 2, -5);
    
    // Add central white light for overall brightness
    this.whiteLight = new THREE.PointLight(0xffffff, 1.3, 30); // Increased from 0.9 to 1.3
    this.whiteLight.position.set(0, 5, 0);
    
    // Add a green light in one corner of the room
    this.greenLight = new THREE.PointLight(0x00ff44, 1.4, 18); // Increased from 1.0 to 1.4
    this.greenLight.position.set(-8, 2, -8);
    
    // Add a purple light in another corner
    this.purpleLight = new THREE.PointLight(0xaa44ff, 1.6, 18); // Increased from 1.2 to 1.6
    this.purpleLight.position.set(8, 2, 8);
    
    // Add a yellow light in a third corner
    this.yellowLight = new THREE.PointLight(0xffdd00, 1.5, 18); // Increased from 1.1 to 1.5
    this.yellowLight.position.set(-8, 2, 8);
    
    // Add a cyan light in the fourth corner
    this.cyanLight = new THREE.PointLight(0x00ddff, 1.4, 18); // Increased from 1.0 to 1.4
    this.cyanLight.position.set(8, 2, -8);
    
    // Add an orange light above the room for warmth
    this.orangeLight = new THREE.PointLight(0xff6600, 1.2, 25); // Increased from 0.8 to 1.2
    this.orangeLight.position.set(0, 6, 0);
    
    // Make lights flicker over time
    this.flickerTime = 0;
  }
  
  /**
   * Update flickering lights for Doom atmosphere
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateDoomLights(deltaTime) {
    if (!this.doomMode) return;
    
    // Update flicker time
    this.flickerTime += deltaTime;
    
    // Calculate different flicker patterns for each light
    const time = this.flickerTime;
    
    // Apply flicker to main lights if they exist
    if (this.redLight) {
      const redFlicker = 1.5 + 0.3 * Math.sin(time * 10) * Math.sin(time * 7.3); // Base increased from 1.1 to 1.5
      this.redLight.intensity = redFlicker;
    }
    
    if (this.blueLight) {
      const blueFlicker = 1.3 + 0.4 * Math.sin(time * 5.3 + 1.4) * Math.sin(time * 6.1); // Base increased from 0.9 to 1.3
      this.blueLight.intensity = blueFlicker * 0.8;
    }
    
    if (this.whiteLight) {
      const whiteFlicker = 1.2 + 0.2 * Math.sin(time * 3.7); // Base increased from 0.8 to 1.2
      this.whiteLight.intensity = whiteFlicker;
    }
    
    // Apply flicker to corner lights with different patterns
    if (this.greenLight) {
      const greenFlicker = 1.3 + 0.5 * (Math.sin(time * 4.3) * 0.5 + 0.5); // Base increased from 0.9 to 1.3
      this.greenLight.intensity = greenFlicker;
    }
    
    if (this.purpleLight) {
      const purpleFlicker = 1.4 + 0.4 * (Math.sin(time * 6.7 + 2.1) * 0.5 + 0.5); // Base increased from 1.0 to 1.4
      this.purpleLight.intensity = purpleFlicker;
    }
    
    if (this.yellowLight) {
      const yellowFlicker = 1.3 + 0.3 * (Math.sin(time * 5.5 + 1.5) * 0.5 + 0.5); // Base increased from 0.9 to 1.3
      this.yellowLight.intensity = yellowFlicker;
    }
    
    if (this.cyanLight) {
      const cyanFlicker = 1.2 + 0.4 * (Math.sin(time * 7.1 + 3.2) * 0.5 + 0.5); // Base increased from 0.8 to 1.2
      this.cyanLight.intensity = cyanFlicker;
    }
    
    if (this.orangeLight) {
      const orangeFlicker = 1.1 + 0.3 * (Math.sin(time * 2.8 + 1.0) * 0.5 + 0.5); // Base increased from 0.7 to 1.1
      this.orangeLight.intensity = orangeFlicker;
    }
  }

  /**
   * Initialize scene and add objects
   */
  init() {
    // Add lights
    this.instance.add(this.ambientLight);
    this.instance.add(this.directionalLight);
    
    // Add doom-specific lights
    if (this.doomMode) {
      // Add all colored lights to the scene
      const doomLights = [
        this.redLight, 
        this.blueLight, 
        this.whiteLight,
        this.greenLight,
        this.purpleLight,
        this.yellowLight,
        this.cyanLight,
        this.orangeLight
      ];
      
      doomLights.forEach(light => {
        if (light) this.instance.add(light);
      });
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
   * Update scene and its children
   * @param {number} deltaTime - The time elapsed since the last update
   */
  update(deltaTime) {
    // Update the room
    if (this.room) {
      this.room.update(deltaTime);
    }
    
    // Update Doom lights with flickering
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

  /**
   * Set Doom mode on or off
   * @param {boolean} enabled - Whether Doom mode should be enabled
   */
  setDoomMode(enabled) {
    if (this.doomMode === enabled) return;
    
    console.log(`Setting Doom mode to: ${enabled}`);
    this.doomMode = enabled;
    
    // Update scene background
    if (this.doomMode) {
      this.instance.background = new THREE.Color(0x150505); // Very dark red for doom-like aesthetic
      this.instance.fog = new THREE.FogExp2(0x000000, 0.03); // Add fog for Doom effect
    } else {
      this.instance.background = new THREE.Color(0x87CEEB); // Sky blue for normal mode
      this.instance.fog = null; // Remove fog
    }
    
    // Update camera FOV
    const fov = this.doomMode ? 85 : 75;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    
    // Update lighting
    if (this.doomMode) {
      // Doom-like lighting
      this.ambientLight.color.set(0x777777);
      this.ambientLight.intensity = 1.8;
      this.directionalLight.color.set(0xffaa44);
      this.directionalLight.intensity = 1.8;
    } else {
      // Standard lighting
      this.ambientLight.color.set(0xffffff);
      this.ambientLight.intensity = 0.5;
      this.directionalLight.color.set(0xffffff);
      this.directionalLight.intensity = 0.8;
    }
    
    // Update room doomMode if room exists
    if (this.room && typeof this.room.setDoomMode === 'function') {
      this.room.setDoomMode(this.doomMode);
    }
  }
} 