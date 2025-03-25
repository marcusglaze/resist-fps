import * as THREE from 'three';

/**
 * Mobile touch controls for the game
 */
export class MobileControls {
  constructor(playerControls) {
    this.playerControls = playerControls;
    this.isMobile = this.detectMobileDevice();
    this.touchControls = {};
    this.joystickPosition = { x: 0, y: 0 };
    this.joystickRadius = 50;
    this.isDraggingJoystick = false;
    this.joystickStartPosition = { x: 0, y: 0 };
    this.isAiming = false;
    this.lastTouchPosition = { x: 0, y: 0 };
    this.touchStartTime = 0;
    this.isActive = false; // Controls not active by default
    
    // Initialize if on mobile
    if (this.isMobile) {
      this.init();
    }
  }
  
  /**
   * Detect if user is on a mobile device
   * @returns {boolean} True if mobile device is detected
   */
  detectMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
           (window.innerWidth <= 800 && window.innerHeight <= 900);
  }
  
  /**
   * Initialize mobile controls
   */
  init() {
    console.log("Initializing mobile controls");
    
    // Create control elements
    this.createJoystick();
    this.createActionButtons();
    
    // Add touch event listeners
    this.addTouchEventListeners();
    
    // Hide the controls initially (create them but don't show them yet)
    this.toggleControls(false);
    
    // Flag for initialization
    this.isInitialized = true;
  }
  
  /**
   * Create virtual joystick for movement
   */
  createJoystick() {
    // Create joystick container
    const joystickContainer = document.createElement('div');
    joystickContainer.className = 'joystick-container';
    joystickContainer.style.position = 'absolute';
    joystickContainer.style.left = '20px';
    joystickContainer.style.bottom = '20px';
    joystickContainer.style.width = '120px';
    joystickContainer.style.height = '120px';
    joystickContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
    joystickContainer.style.borderRadius = '60px';
    joystickContainer.style.zIndex = '1000';
    joystickContainer.style.touchAction = 'none';
    
    // Create joystick stick
    const joystick = document.createElement('div');
    joystick.className = 'joystick';
    joystick.style.position = 'absolute';
    joystick.style.left = '35px';
    joystick.style.top = '35px';
    joystick.style.width = '50px';
    joystick.style.height = '50px';
    joystick.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    joystick.style.borderRadius = '25px';
    joystick.style.zIndex = '1001';
    joystick.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
    joystick.style.touchAction = 'none';
    
    // Directional indicators
    const createDirectionalIndicator = (rotation, symbol) => {
      const indicator = document.createElement('div');
      indicator.style.position = 'absolute';
      indicator.style.width = '25px';
      indicator.style.height = '25px';
      indicator.style.display = 'flex';
      indicator.style.justifyContent = 'center';
      indicator.style.alignItems = 'center';
      indicator.style.color = 'white';
      indicator.style.fontSize = '20px';
      indicator.style.fontWeight = 'bold';
      indicator.textContent = symbol;
      
      // Position based on rotation
      const radius = 45;
      const angle = rotation * Math.PI / 180;
      indicator.style.left = `${60 + radius * Math.cos(angle) - 12.5}px`;
      indicator.style.top = `${60 + radius * Math.sin(angle) - 12.5}px`;
      
      return indicator;
    };
    
    // Add directional indicators
    joystickContainer.appendChild(createDirectionalIndicator(270, '↑')); // Up
    joystickContainer.appendChild(createDirectionalIndicator(90, '↓'));  // Down
    joystickContainer.appendChild(createDirectionalIndicator(180, '←')); // Left
    joystickContainer.appendChild(createDirectionalIndicator(0, '→'));   // Right
    
    // Add joystick to container
    joystickContainer.appendChild(joystick);
    
    // Add to document
    document.body.appendChild(joystickContainer);
    
    // Store references
    this.touchControls.joystickContainer = joystickContainer;
    this.touchControls.joystick = joystick;
    
    // Store joystick center position for calculations
    const rect = joystickContainer.getBoundingClientRect();
    this.joystickStartPosition = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    this.joystickPosition = { 
      x: this.joystickStartPosition.x, 
      y: this.joystickStartPosition.y 
    };
  }
  
  /**
   * Create action buttons (shoot, reload, interact)
   */
  createActionButtons() {
    // Create action buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'action-buttons-container';
    buttonContainer.style.position = 'absolute';
    buttonContainer.style.right = '20px';
    buttonContainer.style.bottom = '20px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '15px';
    buttonContainer.style.zIndex = '1000';
    
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
    
    // Create aim button (target icon)
    const aimButton = this.createActionButton('🎯', 'rgba(255, 255, 255, 0.7)');
    aimButton.style.position = 'absolute';
    aimButton.style.right = '120px';
    aimButton.style.bottom = '80px';
    
    // Create run button (sprint icon)
    const runButton = this.createActionButton('🏃', 'rgba(255, 255, 255, 0.7)');
    runButton.style.position = 'absolute';
    runButton.style.left = '150px';
    runButton.style.bottom = '20px';
    
    // Create weapon switch buttons
    const prevWeaponButton = this.createActionButton('◀', 'rgba(255, 255, 255, 0.7)');
    prevWeaponButton.style.position = 'absolute';
    prevWeaponButton.style.right = '150px';
    prevWeaponButton.style.top = '20px';
    
    const nextWeaponButton = this.createActionButton('▶', 'rgba(255, 255, 255, 0.7)');
    nextWeaponButton.style.position = 'absolute';
    nextWeaponButton.style.right = '80px';
    nextWeaponButton.style.top = '20px';
    
    // Add buttons to container
    buttonContainer.appendChild(shootButton);
    buttonContainer.appendChild(reloadButton);
    buttonContainer.appendChild(interactButton);
    document.body.appendChild(aimButton);
    document.body.appendChild(runButton);
    document.body.appendChild(prevWeaponButton);
    document.body.appendChild(nextWeaponButton);
    document.body.appendChild(buttonContainer);
    
    // Store references
    this.touchControls.buttonContainer = buttonContainer;
    this.touchControls.shootButton = shootButton;
    this.touchControls.reloadButton = reloadButton;
    this.touchControls.interactButton = interactButton;
    this.touchControls.aimButton = aimButton;
    this.touchControls.runButton = runButton;
    this.touchControls.prevWeaponButton = prevWeaponButton;
    this.touchControls.nextWeaponButton = nextWeaponButton;
  }
  
  /**
   * Create a single action button
   * @param {string} text - Button text
   * @param {string} color - Button background color
   * @returns {HTMLElement} The created button
   */
  createActionButton(text, color) {
    const button = document.createElement('div');
    button.className = 'action-button';
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
    button.style.fontSize = '24px';
    button.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
    button.style.userSelect = 'none';
    button.style.touchAction = 'none';
    
    return button;
  }
  
  /**
   * Add touch event listeners for mobile controls
   */
  addTouchEventListeners() {
    document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
    
    // Prevent default touch actions to avoid browser gestures
    document.addEventListener('touchstart', (e) => {
      if (e.target.closest('.joystick-container, .action-button, .action-buttons-container')) {
        e.preventDefault();
      }
    }, { passive: false });
  }
  
  /**
   * Handle touch start events
   * @param {TouchEvent} event - Touch event
   */
  handleTouchStart(event) {
    // Skip processing if controls are not active or game is paused
    if (!this.isActive || (this.playerControls.gameEngine && this.playerControls.gameEngine.isPaused)) {
      return;
    }
    
    event.preventDefault();
    
    // Check each touch point
    for (let i = 0; i < event.touches.length; i++) {
      const touch = event.touches[i];
      
      // Store touch start time for potential tap detection
      this.touchStartTime = Date.now();
      this.lastTouchPosition = { x: touch.clientX, y: touch.clientY };
      
      // Check if touching the joystick area
      if (this.isTouchingElement(touch, this.touchControls.joystickContainer)) {
        this.isDraggingJoystick = true;
        this.updateJoystickPosition(touch.clientX, touch.clientY);
      }
      
      // Check action buttons
      if (this.isTouchingElement(touch, this.touchControls.shootButton)) {
        this.playerControls.shooting = true;
        this.playerControls.shoot();
      }
      
      if (this.isTouchingElement(touch, this.touchControls.reloadButton)) {
        this.playerControls.reload();
      }
      
      if (this.isTouchingElement(touch, this.touchControls.interactButton)) {
        this.playerControls.isInteracting = true;
        if (this.playerControls.keys) {
          this.playerControls.keys.f = true;
        }
      }
      
      if (this.isTouchingElement(touch, this.touchControls.aimButton)) {
        this.isAiming = true;
      }
      
      if (this.isTouchingElement(touch, this.touchControls.runButton)) {
        this.playerControls.running = true;
      }
      
      if (this.isTouchingElement(touch, this.touchControls.prevWeaponButton)) {
        this.playerControls.prevWeapon();
      }
      
      if (this.isTouchingElement(touch, this.touchControls.nextWeaponButton)) {
        this.playerControls.nextWeapon();
      }
      
      // If not touching any control, it's for aiming
      if (!this.isTouchingAnyControl(touch) && !this.isAiming) {
        // Update camera rotation based on touch
        this.updateCameraRotation(touch.clientX, touch.clientY, true);
      }
    }
  }
  
  /**
   * Handle touch move events
   * @param {TouchEvent} event - Touch event
   */
  handleTouchMove(event) {
    // Skip processing if controls are not active or game is paused
    if (!this.isActive || (this.playerControls.gameEngine && this.playerControls.gameEngine.isPaused)) {
      return;
    }
    
    event.preventDefault();
    
    // Check each touch point
    for (let i = 0; i < event.touches.length; i++) {
      const touch = event.touches[i];
      
      // Update joystick if we're dragging it
      if (this.isDraggingJoystick) {
        const joystickTouch = this.findJoystickTouch(event.touches);
        if (joystickTouch) {
          this.updateJoystickPosition(joystickTouch.clientX, joystickTouch.clientY);
        }
      }
      
      // If aiming, update camera rotation
      if (this.isAiming || (!this.isTouchingAnyControl(touch) && !this.isDraggingJoystick)) {
        this.updateCameraRotation(touch.clientX, touch.clientY);
      }
      
      // Store last touch position
      this.lastTouchPosition = { x: touch.clientX, y: touch.clientY };
    }
  }
  
  /**
   * Handle touch end events
   * @param {TouchEvent} event - Touch event
   */
  handleTouchEnd(event) {
    // Skip processing if controls are not active or game is paused
    if (!this.isActive || (this.playerControls.gameEngine && this.playerControls.gameEngine.isPaused)) {
      return;
    }
    
    // If all touches are gone, reset joystick
    if (event.touches.length === 0) {
      this.resetJoystick();
      this.isDraggingJoystick = false;
      this.isAiming = false;
      
      // Reset movement
      this.playerControls.moveForward = false;
      this.playerControls.moveBackward = false;
      this.playerControls.moveLeft = false;
      this.playerControls.moveRight = false;
      this.playerControls.shooting = false;
      this.playerControls.running = false;
      
      // Reset key states
      if (this.playerControls.keys) {
        this.playerControls.keys.f = false;
      }
      
      // Stop weapon sound
      this.playerControls.stopWeaponSound();
      
      return;
    }
    
    // If some touches remain, check if we're still touching the joystick
    let stillTouchingJoystick = false;
    for (let i = 0; i < event.touches.length; i++) {
      if (this.isTouchingElement(event.touches[i], this.touchControls.joystickContainer)) {
        stillTouchingJoystick = true;
        break;
      }
    }
    
    if (!stillTouchingJoystick) {
      this.resetJoystick();
      this.isDraggingJoystick = false;
      
      // Reset movement
      this.playerControls.moveForward = false;
      this.playerControls.moveBackward = false;
      this.playerControls.moveLeft = false;
      this.playerControls.moveRight = false;
    }
    
    // Check if still shooting
    let stillShooting = false;
    for (let i = 0; i < event.touches.length; i++) {
      if (this.isTouchingElement(event.touches[i], this.touchControls.shootButton)) {
        stillShooting = true;
        break;
      }
    }
    
    if (!stillShooting) {
      this.playerControls.shooting = false;
      this.playerControls.stopWeaponSound();
    }
    
    // Check if still running
    let stillRunning = false;
    for (let i = 0; i < event.touches.length; i++) {
      if (this.isTouchingElement(event.touches[i], this.touchControls.runButton)) {
        stillRunning = true;
        break;
      }
    }
    
    if (!stillRunning) {
      this.playerControls.running = false;
    }
    
    // Check if still aiming
    let stillAiming = false;
    for (let i = 0; i < event.touches.length; i++) {
      if (this.isTouchingElement(event.touches[i], this.touchControls.aimButton)) {
        stillAiming = true;
        break;
      }
    }
    
    if (!stillAiming) {
      this.isAiming = false;
    }
    
    // Reset F key if needed
    let stillInteracting = false;
    for (let i = 0; i < event.touches.length; i++) {
      if (this.isTouchingElement(event.touches[i], this.touchControls.interactButton)) {
        stillInteracting = true;
        break;
      }
    }
    
    if (!stillInteracting && this.playerControls.keys) {
      this.playerControls.keys.f = false;
      this.playerControls.isInteracting = false;
    }
  }
  
  /**
   * Find the touch that's on the joystick
   * @param {TouchList} touches - List of current touches
   * @returns {Touch|null} The touch on the joystick or null
   */
  findJoystickTouch(touches) {
    for (let i = 0; i < touches.length; i++) {
      if (this.isTouchingElement(touches[i], this.touchControls.joystickContainer)) {
        return touches[i];
      }
    }
    return null;
  }
  
  /**
   * Update joystick position based on touch
   * @param {number} touchX - Touch X coordinate
   * @param {number} touchY - Touch Y coordinate
   */
  updateJoystickPosition(touchX, touchY) {
    // Get joystick container position
    const containerRect = this.touchControls.joystickContainer.getBoundingClientRect();
    const centerX = containerRect.left + containerRect.width / 2;
    const centerY = containerRect.top + containerRect.height / 2;
    
    // Calculate distance from center
    const deltaX = touchX - centerX;
    const deltaY = touchY - centerY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    
    // Normalize to joystick radius
    const maxRadius = containerRect.width / 2 - 10; // 10px margin
    const normalizedDistance = Math.min(distance, maxRadius);
    const angle = Math.atan2(deltaY, deltaX);
    
    // Calculate new position
    const newX = centerX + normalizedDistance * Math.cos(angle);
    const newY = centerY + normalizedDistance * Math.sin(angle);
    
    // Update joystick visual position
    this.touchControls.joystick.style.left = `${newX - containerRect.left - 25}px`;
    this.touchControls.joystick.style.top = `${newY - containerRect.top - 25}px`;
    
    // Update movement based on joystick position
    this.updateMovementFromJoystick(deltaX, deltaY, maxRadius);
  }
  
  /**
   * Reset joystick to center position
   */
  resetJoystick() {
    if (this.touchControls.joystick) {
      this.touchControls.joystick.style.left = '35px';
      this.touchControls.joystick.style.top = '35px';
    }
  }
  
  /**
   * Update player movement based on joystick position
   * @param {number} deltaX - X distance from center
   * @param {number} deltaY - Y distance from center
   * @param {number} maxRadius - Maximum joystick radius
   */
  updateMovementFromJoystick(deltaX, deltaY, maxRadius) {
    // Calculate normalized direction (-1 to 1 range)
    const dirX = deltaX / maxRadius;
    const dirY = deltaY / maxRadius;
    
    // Set movement flags based on joystick position
    // Use threshold to create dead zone in center
    const threshold = 0.3;
    
    // Reset all movement first
    this.playerControls.moveForward = false;
    this.playerControls.moveBackward = false;
    this.playerControls.moveLeft = false;
    this.playerControls.moveRight = false;
    
    // Set movement based on joystick position
    if (dirY < -threshold) {
      this.playerControls.moveForward = true;
    } else if (dirY > threshold) {
      this.playerControls.moveBackward = true;
    }
    
    if (dirX < -threshold) {
      this.playerControls.moveLeft = true;
    } else if (dirX > threshold) {
      this.playerControls.moveRight = true;
    }
  }
  
  /**
   * Update camera rotation based on touch movement
   * @param {number} touchX - Current touch X position
   * @param {number} touchY - Current touch Y position
   * @param {boolean} isStart - Whether this is the start of a touch
   */
  updateCameraRotation(touchX, touchY, isStart = false) {
    if (isStart) {
      this.lastTouchPosition = { x: touchX, y: touchY };
      return;
    }
    
    // Calculate movement delta
    const movementX = touchX - this.lastTouchPosition.x;
    const movementY = touchY - this.lastTouchPosition.y;
    
    // Update camera rotation - similar to mouse but with touch sensitivity adjustment
    const touchSensitivity = this.playerControls.mouseSensitivity * 0.5;
    this.playerControls.camera.rotation.y -= movementX * touchSensitivity;
    this.playerControls.camera.rotation.x -= movementY * touchSensitivity;
    
    // Limit vertical look angle
    this.playerControls.camera.rotation.x = Math.max(
      -Math.PI / 2, 
      Math.min(Math.PI / 2, this.playerControls.camera.rotation.x)
    );
  }
  
  /**
   * Check if a touch is intersecting with an element
   * @param {Touch} touch - The touch to check
   * @param {HTMLElement} element - The element to check against
   * @returns {boolean} True if the touch is on the element
   */
  isTouchingElement(touch, element) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    return (
      touch.clientX >= rect.left &&
      touch.clientX <= rect.right &&
      touch.clientY >= rect.top &&
      touch.clientY <= rect.bottom
    );
  }
  
  /**
   * Check if touch is on any control element
   * @param {Touch} touch - The touch to check
   * @returns {boolean} True if touching any control
   */
  isTouchingAnyControl(touch) {
    return (
      this.isTouchingElement(touch, this.touchControls.joystickContainer) ||
      this.isTouchingElement(touch, this.touchControls.buttonContainer) ||
      this.isTouchingElement(touch, this.touchControls.shootButton) ||
      this.isTouchingElement(touch, this.touchControls.reloadButton) ||
      this.isTouchingElement(touch, this.touchControls.interactButton) ||
      this.isTouchingElement(touch, this.touchControls.aimButton) ||
      this.isTouchingElement(touch, this.touchControls.runButton) ||
      this.isTouchingElement(touch, this.touchControls.prevWeaponButton) ||
      this.isTouchingElement(touch, this.touchControls.nextWeaponButton)
    );
  }
  
  /**
   * Show or hide mobile controls
   * @param {boolean} show - Whether to show or hide controls
   */
  toggleControls(show) {
    if (!this.isInitialized) return;
    
    const display = show ? 'block' : 'none';
    
    // Set display for all controls
    this.touchControls.joystickContainer.style.display = display;
    this.touchControls.buttonContainer.style.display = display;
    this.touchControls.aimButton.style.display = display;
    this.touchControls.runButton.style.display = display;
    this.touchControls.prevWeaponButton.style.display = display;
    this.touchControls.nextWeaponButton.style.display = display;
  }
  
  /**
   * Enable all mobile controls
   */
  show() {
    // Show the control elements
    this.toggleControls(true);
    
    // Enable controls processing
    this.isActive = true;
    
    console.log("Mobile controls enabled");
  }
  
  /**
   * Disable all mobile controls
   */
  hide() {
    // Hide the control elements
    this.toggleControls(false);
    
    // Disable controls processing
    this.isActive = false;
    
    // Reset states to prevent stuck input
    this.resetJoystick();
    this.isDraggingJoystick = false;
    this.isAiming = false;
    
    // Reset player control states
    if (this.playerControls) {
      this.playerControls.moveForward = false;
      this.playerControls.moveBackward = false;
      this.playerControls.moveLeft = false;
      this.playerControls.moveRight = false;
      this.playerControls.shooting = false;
      this.playerControls.running = false;
      
      // Reset key states
      if (this.playerControls.keys) {
        this.playerControls.keys.f = false;
      }
      
      // Stop weapon sound
      if (typeof this.playerControls.stopWeaponSound === 'function') {
        this.playerControls.stopWeaponSound();
      }
    }
    
    console.log("Mobile controls disabled");
  }
} 