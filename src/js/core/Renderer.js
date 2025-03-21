import * as THREE from 'three';
import { DoomEffect } from './DoomEffect';

/**
 * Handles rendering the scene
 */
export class Renderer {
  constructor(doomMode = true, resolution = 320) {
    console.log("Initializing renderer, doomMode:", doomMode);
    
    // Enable/disable Doom-like rendering mode
    this.doomMode = doomMode;
    
    // Create the WebGL renderer with different settings based on mode
    this.instance = new THREE.WebGLRenderer({
      antialias: !this.doomMode, // Disable antialiasing for Doom-like pixelated look
      alpha: false
    });
    
    // Setup shadow rendering
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Set initial size
    this.instance.setSize(window.innerWidth, window.innerHeight);
    
    // Set pixel ratio - limit it in Doom mode for pixelated look
    const pixelRatio = this.doomMode ? 1 : Math.min(window.devicePixelRatio, 2);
    this.instance.setPixelRatio(pixelRatio);
    
    // Access to DOM element
    this.domElement = this.instance.domElement;
    
    // Create Doom effect if enabled - use a try/catch to handle potential errors
    if (this.doomMode) {
      try {
        console.log("Creating DoomEffect with resolution:", resolution);
        this.doomEffect = new DoomEffect(resolution);
      } catch (error) {
        console.error("Error creating DoomEffect:", error);
        // Fall back to standard rendering if DoomEffect fails
        this.doomMode = false;
      }
    }
  }

  /**
   * Initialize renderer
   */
  init() {
    console.log("Initializing renderer");
    
    // Apply proper positioning to canvas element
    this.domElement.style.position = 'absolute';
    this.domElement.style.top = '0';
    this.domElement.style.left = '0';
    this.domElement.style.margin = '0';
    this.domElement.style.padding = '0';
    this.domElement.style.display = 'block';
    
    // Apply Doom-like CSS to the canvas in Doom mode
    if (this.doomMode) {
      this.domElement.style.imageRendering = 'pixelated';
      this.domElement.style.imageRendering = 'crisp-edges';
      
      // Optional scanlines effect via CSS
      this.addScanlines();
    }
  }

  /**
   * Create scanlines overlay for retro effect
   */
  addScanlines() {
    try {
      // Create scanlines element
      const scanlines = document.createElement('div');
      scanlines.className = 'scanlines';
      scanlines.style.position = 'absolute';
      scanlines.style.top = '0';
      scanlines.style.left = '0';
      scanlines.style.width = '100%';
      scanlines.style.height = '100%';
      scanlines.style.backgroundImage = 'linear-gradient(transparent 50%, rgba(0, 0, 0, 0.3) 50%)';
      scanlines.style.backgroundSize = '100% 4px';
      scanlines.style.pointerEvents = 'none';
      scanlines.style.zIndex = '1000';
      scanlines.style.opacity = '0.3';
      
      // Add to DOM right after canvas
      if (this.domElement.parentNode) {
        this.domElement.parentNode.insertBefore(scanlines, this.domElement.nextSibling);
      } else {
        console.warn("Canvas parent not available for scanlines");
      }
    } catch (error) {
      console.error("Error adding scanlines:", error);
    }
  }

  /**
   * Set renderer size
   */
  setSize(width, height) {
    this.instance.setSize(width, height);
    
    // Resize Doom effect if active
    if (this.doomMode && this.doomEffect) {
      try {
        this.doomEffect.setSize(width, height);
      } catch (error) {
        console.error("Error resizing DoomEffect:", error);
      }
    }
  }

  /**
   * Render the scene
   */
  render(scene) {
    try {
      if (this.doomMode && this.doomEffect) {
        // Use Doom-like effect rendering
        this.doomEffect.render(this.instance, scene.instance, scene.camera);
      } else {
        // Standard rendering
        this.instance.render(scene.instance, scene.camera);
      }
    } catch (error) {
      console.error("Error during rendering:", error);
      
      // Fall back to standard rendering if DoomEffect rendering fails
      if (this.doomMode) {
        console.log("Falling back to standard rendering");
        this.doomMode = false;
        this.instance.render(scene.instance, scene.camera);
      }
    }
  }
} 
 