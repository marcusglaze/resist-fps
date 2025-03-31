import * as THREE from 'three';
import nipplejs from 'nipplejs';

/**
 * Mobile touch controls for the game
 */
export class MobileControls {
  constructor(playerControls) {
    this.playerControls = playerControls;
    // Get a reference to the game engine from player controls
    this.gameEngine = playerControls.gameEngine;
    this.isMobile = this.detectMobileDevice();
    this.touchControls = {};
    this.isActive = false;
    this.isInitialized = false;
    this.joystickManager = null;
    
    // Sensitivity settings for aim control
    this.aimSensitivity = {
      horizontal: 0.008, // Increased from 0.004 (was 0.002 * 2.0)
      vertical: 0.007    // Slightly lower than horizontal for better control
    };
    
    // Touch tracking for aim control - supporting multiple aim touches
    this.touchTracking = {
      aimTouches: {}, // Map of touch IDs to their tracking data
      activeTouchCount: 0,
      // Add throttling for performance optimization
      lastProcessTime: 0,
      throttleInterval: 10 // Process touch moves at most every 10ms
    };
    
    console.log("MobileControls constructor called, isMobile:", this.isMobile);
    
    // Initialize if on mobile
    if (this.isMobile) {
      // Don't initialize immediately - wait until show() is called
      // This avoids creating DOM elements prematurely
    }
  }
  
  /**
   * Detect if user is on a mobile device
   * @returns {boolean} True if mobile device is detected
   */
  detectMobileDevice() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           (window.innerWidth <= 800 && window.innerHeight <= 900);
    console.log("Mobile device detection:", isMobile, window.innerWidth, window.innerHeight);
    return isMobile;
  }
  
  /**
   * Initialize mobile controls
   */
  init() {
    if (this.isInitialized) {
      console.log("Mobile controls already initialized");
      return;
    }
    
    console.log("Initializing mobile controls");
    
    // Remove any existing controls (in case of reinit)
    this.removeExistingControls();
    
    // Create control elements
    this.createJoystick();
    this.createActionButtons();
    
    // Add document-level touch event listeners for aiming
    this.setupGlobalTouchHandling();
    
    // Flag for initialization
    this.isInitialized = true;
    
    console.log("Mobile controls initialization complete");
  }
  
  /**
   * Remove any existing control elements from the DOM
   */
  removeExistingControls() {
    // Remove joystick container if it exists
    const existingJoystick = document.getElementById('joystick-zone');
    if (existingJoystick) {
      existingJoystick.remove();
    }
    
    // Remove action buttons container if it exists
    const existingButtons = document.querySelector('.action-buttons-container');
    if (existingButtons) {
      existingButtons.remove();
    }
    
    // Remove any individual buttons that might be outside the container
    document.querySelectorAll('.mobile-control-button').forEach(btn => btn.remove());
    
    // Remove the global aim touch handlers
    this.removeGlobalTouchHandling();
    
    // Destroy nipplejs instance if it exists
    if (this.joystickManager) {
      this.joystickManager.destroy();
      this.joystickManager = null;
    }
  }
  
  /**
   * Create virtual joystick for movement using nipplejs
   */
  createJoystick() {
    console.log("Creating joystick with nipplejs");
    
    // Create joystick container
    const joystickContainer = document.createElement('div');
    joystickContainer.id = 'joystick-zone';
    joystickContainer.style.position = 'fixed';
    joystickContainer.style.left = '25px';
    joystickContainer.style.bottom = '25px';
    joystickContainer.style.width = '195px';  // Increased from 150px to 195px (30% larger)
    joystickContainer.style.height = '195px'; // Increased from 150px to 195px (30% larger)
    joystickContainer.style.zIndex = '2500';
    joystickContainer.style.borderRadius = '50%';
    joystickContainer.style.opacity = '0.8';
    joystickContainer.style.background = 'rgba(50, 50, 50, 0.2)'; // Light background to see the joystick zone
    joystickContainer.style.border = '1px solid rgba(255, 255, 255, 0.2)'; // Subtle border to see the bounds
    joystickContainer.dataset.control = 'joystick'; // Add data attribute for identification
    
    // Add to document
    document.body.appendChild(joystickContainer);
    
    // Store reference
    this.touchControls.joystickContainer = joystickContainer;
    
    try {
      // Initialize nipplejs
      this.joystickManager = nipplejs.create({
        zone: joystickContainer,
        mode: 'static',
        position: { left: '97px', bottom: '97px' }, // Adjusted from 75px to 97px to center in the larger container
        color: 'white',
        size: 130, // Increased from 100 to 130 (30% larger)
        restOpacity: 0.8,
        fadeTime: 100,
        multitouch: true, // Enable multi-touch for joystick
        catchDistance: 150 // Added catch distance to improve responsiveness for touches near the joystick
      });
      
      // Add event listeners
      this.joystickManager.on('move', (evt, data) => {
        // Calculate movement vector from joystick input
        if (data.vector) {
          // Apply movement to player controls
          if (this.playerControls) {
            this.playerControls.applyMobileMovement(data.vector.x, -data.vector.y);
          }
        }
      });
      
      this.joystickManager.on('end', () => {
        // Reset movement when joystick is released
        if (this.playerControls) {
          this.playerControls.applyMobileMovement(0, 0);
        }
      });
      
      console.log("Nipplejs joystick created successfully");
    } catch (error) {
      console.error("Error creating nipplejs joystick:", error);
    }
  }
  
  /**
   * Create action buttons (shoot, reload, interact)
   */
  createActionButtons() {
    // Create action buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'action-buttons-container';
    buttonContainer.style.position = 'fixed';
    buttonContainer.style.right = '20px';
    buttonContainer.style.bottom = '20px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '15px';
    buttonContainer.style.zIndex = '2500';
    buttonContainer.dataset.control = 'buttons'; // Add data attribute for identification
    
    // Create shoot button
    const shootButton = this.createActionButton('SHOOT', '#ff3333');
    shootButton.style.width = '80px';
    shootButton.style.height = '80px';
    shootButton.style.borderRadius = '40px';
    shootButton.style.fontSize = '16px';
    
    // Create reload button
    const reloadButton = this.createActionButton('R', '#3399ff');
    
    // Create interact button
    const interactButton = this.createActionButton('F', '#33cc33');
    
    // Add to container
    buttonContainer.appendChild(shootButton);
    buttonContainer.appendChild(reloadButton);
    buttonContainer.appendChild(interactButton);
    document.body.appendChild(buttonContainer);
    
    // Store references
    this.touchControls.buttonContainer = buttonContainer;
    this.touchControls.shootButton = shootButton;
    this.touchControls.reloadButton = reloadButton;
    this.touchControls.interactButton = interactButton;
    
    // Add event listeners for the buttons using multiple event types for better reliability
    
    // Shoot button - handle with both touch and mouse events for better reliability
    const handleShootStart = (event) => {
    event.preventDefault();
      event.stopPropagation();
      
      // Log for debugging
      console.log("Shoot button pressed");
      
      // Make sure audio is unlocked
      if (this.playerControls && typeof this.playerControls.unlockAudio === 'function') {
        this.playerControls.unlockAudio();
      }
      
      if (this.playerControls) {
        // Set shooting flag
        this.playerControls.shooting = true;
        
        // Also directly call shoot if the method exists
        if (typeof this.playerControls.shoot === 'function') {
        this.playerControls.shoot();
        }
      }
    };
    
    const handleShootEnd = (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      // Log for debugging
      console.log("Shoot button released");
      
      if (this.playerControls) {
        this.playerControls.shooting = false;
      }
    };
    
    // Add multiple event types for better mobile compatibility
    shootButton.addEventListener('touchstart', handleShootStart, { passive: false });
    shootButton.addEventListener('mousedown', handleShootStart);
    shootButton.addEventListener('touchend', handleShootEnd, { passive: false });
    shootButton.addEventListener('mouseup', handleShootEnd);
    
    // Reload button - handle with multiple event types
    const handleReloadStart = (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      // Log for debugging
      console.log("Reload button pressed");
      
      // Make sure audio is unlocked
      if (this.playerControls && typeof this.playerControls.unlockAudio === 'function') {
        this.playerControls.unlockAudio();
      }
      
      if (this.playerControls) {
        // If reload method exists, call it directly
        if (typeof this.playerControls.reload === 'function') {
          this.playerControls.reload();
        } else if (this.playerControls.keys) {
          // Fallback to key press
          this.playerControls.keys.r = true;
          
          // Reset key after a short delay
          setTimeout(() => {
            if (this.playerControls && this.playerControls.keys) {
              this.playerControls.keys.r = false;
            }
          }, 100);
        } else {
          console.warn("Reload function not available on player controls");
        }
      }
    };
    
    // Add multiple event types for better mobile compatibility
    reloadButton.addEventListener('touchstart', handleReloadStart, { passive: false });
    reloadButton.addEventListener('mousedown', handleReloadStart);
    
    // Interact button - with multiple event types
    const handleInteractStart = (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      // Log for debugging
      console.log("Interact button pressed");
      
      // Make sure audio is unlocked
      if (this.playerControls && typeof this.playerControls.unlockAudio === 'function') {
        this.playerControls.unlockAudio();
      }
      
      if (this.playerControls) {
        if (this.playerControls.keys) {
          this.playerControls.keys.f = true;
        }
        this.playerControls.isInteracting = true;
      }
    };
    
    const handleInteractEnd = (event) => {
    event.preventDefault();
      event.stopPropagation();
      
      // Log for debugging
      console.log("Interact button released");
      
      if (this.playerControls) {
        if (this.playerControls.keys) {
          this.playerControls.keys.f = false;
        }
        this.playerControls.isInteracting = false;
      }
    };
    
    // Add multiple event types for better mobile compatibility
    interactButton.addEventListener('touchstart', handleInteractStart, { passive: false });
    interactButton.addEventListener('mousedown', handleInteractStart);
    interactButton.addEventListener('touchend', handleInteractEnd, { passive: false });
    interactButton.addEventListener('mouseup', handleInteractEnd);
    
    // Make buttons more visually distinct and touchable on mobile
    this.makeButtonsMobileReady();
  }
  
  /**
   * Make buttons more mobile-friendly with better visual feedback
   */
  makeButtonsMobileReady() {
    const buttons = [
      this.touchControls.shootButton,
      this.touchControls.reloadButton,
      this.touchControls.interactButton
    ];
    
    buttons.forEach(button => {
      if (!button) return;
      
      // Add active state visual feedback
      button.addEventListener('touchstart', () => {
        button.style.transform = 'scale(0.95)';
        button.style.opacity = '0.9';
      });
      
      button.addEventListener('touchend', () => {
        button.style.transform = 'scale(1)';
        button.style.opacity = '1';
      });
      
      // Add hover effects for visual feedback
      button.addEventListener('mouseover', () => {
        button.style.transform = 'scale(1.05)';
        button.style.opacity = '0.9';
      });
      
      button.addEventListener('mouseout', () => {
        button.style.transform = 'scale(1)';
        button.style.opacity = '1';
      });
      
      // Improve touch target size
      button.style.minWidth = '60px';
      button.style.minHeight = '60px';
    });
    
    // Make shoot button larger and more prominent
    if (this.touchControls.shootButton) {
      this.touchControls.shootButton.style.boxShadow = '0 0 15px rgba(255, 51, 51, 0.7)';
    }
  }
  
  /**
   * Set up global touch handling for aiming
   * This allows any touch outside of control areas to move the aim reticle
   */
  setupGlobalTouchHandling() {
    // Bind methods to this instance
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    
    // Add document-level touch event listeners
    document.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    document.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    document.addEventListener('touchcancel', this.handleTouchEnd, { passive: false });
  }
  
  /**
   * Remove global touch handlers
   */
  removeGlobalTouchHandling() {
    if (this.handleTouchStart) {
      document.removeEventListener('touchstart', this.handleTouchStart);
      document.removeEventListener('touchmove', this.handleTouchMove);
      document.removeEventListener('touchend', this.handleTouchEnd);
      document.removeEventListener('touchcancel', this.handleTouchEnd);
    }
  }
  
  /**
   * Handle touch start events for aiming
   * @param {TouchEvent} event Touch event
   */
  handleTouchStart(event) {
    // Skip if not active
    if (!this.isActive) return;
    
    // Unlock audio on touch
    if (this.playerControls && typeof this.playerControls.unlockAudio === 'function') {
      this.playerControls.unlockAudio();
    }
    
    // Process all new touches
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      
      // Skip touches on control elements
      if (this.isTouchingControl(touch)) continue;
      
      // Prevent default for this touch to avoid browser handling
      event.preventDefault();
      
      // Start tracking this touch for aim control
      this.touchTracking.aimTouches[touch.identifier] = {
        lastX: touch.clientX,
        lastY: touch.clientY
      };
      
      this.touchTracking.activeTouchCount++;
    }
  }
  
  /**
   * Handle touch move events for aiming
   * @param {TouchEvent} event Touch event
   */
  handleTouchMove(event) {
    // Skip if not active
    if (!this.isActive) return;
    
    // Performance optimization: Throttle touch move processing
    const now = performance.now();
    if (now - this.touchTracking.lastProcessTime < this.touchTracking.throttleInterval) {
      event.preventDefault(); // Still prevent default
      return;
    }
    this.touchTracking.lastProcessTime = now;
    
    let aimingInProgress = false;
    
    // Process all moving touches
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const touchId = touch.identifier;
      
      // Skip touches we're not tracking for aiming
      if (!this.touchTracking.aimTouches[touchId]) continue;
      
      // Mark that we're processing an aim touch
      aimingInProgress = true;
      
      // Get the tracking data for this touch
      const tracking = this.touchTracking.aimTouches[touchId];
      
      // Calculate delta movement - floor to integers for better performance
      const deltaX = Math.floor(touch.clientX - tracking.lastX);
      const deltaY = Math.floor(touch.clientY - tracking.lastY);
      
      // Skip tiny movements (reduces calculations for small jitters)
      if (deltaX === 0 && deltaY === 0) continue;
      
      // Update camera rotation if player controls exist
      if (this.playerControls && this.playerControls.camera) {
        // Apply horizontal rotation with increased sensitivity
        this.playerControls.camera.rotation.y -= deltaX * this.aimSensitivity.horizontal;
        
        // Apply vertical rotation with increased sensitivity - inverted for natural feel
        const verticalRotation = this.playerControls.camera.rotation.x - deltaY * this.aimSensitivity.vertical;
        const MAX_VERTICAL_ANGLE = Math.PI / 2 - 0.1;
        this.playerControls.camera.rotation.x = Math.max(
          -MAX_VERTICAL_ANGLE,
          Math.min(MAX_VERTICAL_ANGLE, verticalRotation)
        );
      }
      
      // Update last touch position
      tracking.lastX = touch.clientX;
      tracking.lastY = touch.clientY;
    }
    
    // Prevent default only if we processed aim touches
    if (aimingInProgress) {
      event.preventDefault();
    }
  }
  
  /**
   * Handle touch end events for aiming
   * @param {TouchEvent} event Touch event
   */
  handleTouchEnd(event) {
    // Skip if not active
    if (!this.isActive) return;
    
    // Process all ended touches
    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      const touchId = touch.identifier;
      
      // Skip touches we're not tracking for aiming
      if (!this.touchTracking.aimTouches[touchId]) continue;
      
      // Remove this touch from tracking
      delete this.touchTracking.aimTouches[touchId];
      this.touchTracking.activeTouchCount--;
    }
  }
  
  /**
   * Check if a touch is targeting a control element
   * @param {Touch} touch The touch object to check
   * @returns {boolean} True if touching a control element
   */
  isTouchingControl(touch) {
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Check if the touch is on a control element
    if (element) {
      // Check for data-control attribute
      if (element.dataset.control || element.closest('[data-control]')) {
        return true;
      }
      
      // Check for nipplejs elements
      if (element.classList.contains('nipple') || 
          element.closest('.nipple') || 
          element.closest('#joystick-zone')) {
        return true;
      }
      
      // Check for action buttons
      if (element.classList.contains('action-button') || 
          element.closest('.action-button') || 
          element.closest('.action-buttons-container')) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Create a single action button
   * @param {string} text Button text
   * @param {string} color Button color
   * @returns {HTMLElement} Button element
   */
  createActionButton(text, color) {
    const button = document.createElement('div');
    button.className = 'action-button mobile-control-button';
    button.textContent = text;
    button.style.width = '60px';
    button.style.height = '60px';
    button.style.backgroundColor = color;
    button.style.borderRadius = '30px';
    button.style.display = 'flex';
    button.style.justifyContent = 'center';
    button.style.alignItems = 'center';
    button.style.color = 'white';
    button.style.fontWeight = 'bold';
    button.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
    button.style.userSelect = 'none';
    button.style.border = '2px solid rgba(255, 255, 255, 0.7)';
    button.style.fontSize = '14px';
    button.style.touchAction = 'none'; // Disable browser handling of touches
    button.dataset.control = 'button'; // Add data attribute for identification
    return button;
  }
  
  /**
   * Toggle controls visibility
   * @param {boolean} show Whether to show or hide controls
   */
  toggleControls(show) {
    console.log("Toggling mobile controls:", show);
    
    // Initialize controls if showing for the first time
    if (show && !this.isInitialized) {
      this.init();
    }
    
    this.isActive = show;
    
    // Set visibility for all control elements
    Object.values(this.touchControls).forEach(element => {
      if (element && element.style) {
        element.style.display = show ? 'flex' : 'none';
      }
    });
    
    // Special handling for joystick container
    if (this.touchControls.joystickContainer) {
      this.touchControls.joystickContainer.style.display = show ? 'block' : 'none';
    }
    
    // Ensure nipplejs is properly managed
    if (this.joystickManager) {
      if (!show) {
        // Reset player movement when hiding controls
        if (this.playerControls) {
          this.playerControls.applyMobileMovement(0, 0);
        }
      }
    }
    
    // Reset touch tracking when hiding
    if (!show) {
      this.touchTracking.aimTouches = {};
      this.touchTracking.activeTouchCount = 0;
    }
  }

  /**
   * Show the controls
   */
  show() {
    // Try to unlock audio right when controls are shown
    if (this.playerControls && typeof this.playerControls.unlockAudio === 'function') {
      console.log("Attempting to unlock audio when showing mobile controls");
      this.playerControls.unlockAudio();
    }
    
    this.toggleControls(true);
  }

  /**
   * Hide the controls
   */
  hide() {
    this.toggleControls(false);
  }
} 