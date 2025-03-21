import * as THREE from 'three';

/**
 * Post-processing effect to create a Doom-like pixelated retro look
 */
export class DoomEffect {
  constructor(resolution = 256) {
    console.log("Creating DoomEffect with resolution:", resolution);
    
    // Make sure resolution is a power of 2 for better compatibility
    this.resolution = this.nearestPowerOfTwo(resolution);
    console.log("Adjusted resolution to:", this.resolution);
    
    try {
      // Create a lower-resolution render target
      this.renderTarget = new THREE.WebGLRenderTarget(
        this.resolution, 
        this.resolution, 
        {
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          format: THREE.RGBAFormat,
          stencilBuffer: false,
          depthBuffer: true
        }
      );
      
      // Create a scene for post-processing
      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      
      // Create simpler Doom-style shader (reducing complexity to help with compatibility)
      this.material = new THREE.ShaderMaterial({
        vertexShader: this.getVertexShader(),
        fragmentShader: this.getFragmentShader(),
        uniforms: {
          tDiffuse: { value: null },
          resolution: { value: this.resolution },
          pixelSize: { value: 4.0 } // Control pixelation amount
        }
      });
      
      // Create full-screen quad for post-processing
      this.quad = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        this.material
      );
      this.scene.add(this.quad);
      
      console.log("DoomEffect initialized successfully");
    } catch (error) {
      console.error("Error during DoomEffect initialization:", error);
      throw error; // Re-throw to be caught by renderer
    }
  }
  
  /**
   * Find the nearest power of 2 to ensure compatibility
   */
  nearestPowerOfTwo(value) {
    return Math.pow(2, Math.round(Math.log(value) / Math.log(2)));
  }
  
  /**
   * Resize the render target
   */
  setSize(width, height) {
    try {
      // Keep aspect ratio but use lower resolution
      const aspect = width / height;
      const targetHeight = this.resolution;
      const targetWidth = Math.round(targetHeight * aspect);
      
      this.renderTarget.setSize(targetWidth, targetHeight);
      console.log("Resized render target to:", targetWidth, "x", targetHeight);
    } catch (error) {
      console.error("Error resizing render target:", error);
      throw error;
    }
  }
  
  /**
   * Render the scene with the Doom-like effect
   */
  render(renderer, scene, camera) {
    try {
      if (!scene || !camera) {
        console.error("Invalid scene or camera for DoomEffect");
        return;
      }
      
      // First render the scene to a low-resolution texture
      const oldRenderTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(this.renderTarget);
      renderer.clear();
      renderer.render(scene, camera);
      
      // Now render the processed texture to the screen
      this.material.uniforms.tDiffuse.value = this.renderTarget.texture;
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(this.scene, this.camera);
      
      // Restore original render target
      renderer.setRenderTarget(oldRenderTarget);
    } catch (error) {
      console.error("Error in DoomEffect render:", error);
      throw error;
    }
  }
  
  /**
   * Get vertex shader for post-processing
   */
  getVertexShader() {
    return `
      varying vec2 vUv;
      
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
  }
  
  /**
   * Get fragment shader for Doom-like post-processing
   * This is a simplified version that should work on more devices
   */
  getFragmentShader() {
    return `
      uniform sampler2D tDiffuse;
      uniform float resolution;
      uniform float pixelSize;
      varying vec2 vUv;
      
      void main() {
        // Pixelate by snapping UV coordinates to a lower resolution grid
        float dx = pixelSize * (1.0 / resolution);
        float dy = pixelSize * (1.0 / resolution);
        vec2 pixelatedUV = vec2(
          dx * floor(vUv.x / dx),
          dy * floor(vUv.y / dy)
        );
        
        // Sample the texture with pixelated coordinates
        vec4 texel = texture2D(tDiffuse, pixelatedUV);
        
        // Apply a simple contrast enhancement for more Doom-like look
        texel.rgb = clamp(texel.rgb * 1.2 - 0.1, 0.0, 1.0);
        
        // Add slight vignette effect for retro feel
        float vignette = 1.0 - smoothstep(0.4, 1.0, length(vUv - 0.5) * 1.5);
        texel.rgb *= vignette;
        
        gl_FragColor = texel;
      }
    `;
  }
} 
 