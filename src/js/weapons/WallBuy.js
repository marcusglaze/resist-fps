import * as THREE from 'three';
import { Weapon, WeaponTypes } from './Weapon';

/**
 * WallBuy class for purchasing weapons from walls
 */
export class WallBuy {
  constructor(config = {}) {
    // Wall buy properties
    this.position = config.position || new THREE.Vector3(0, 1.5, 0);
    this.rotation = config.rotation || new THREE.Euler(0, 0, 0);
    this.weaponType = config.weaponType || WeaponTypes.SHOTGUN;
    this.cost = config.cost || this.weaponType.cost || 500;
    
    // Create the weapon instance
    this.weapon = new Weapon(this.weaponType);
    
    // Visual elements
    this.instance = new THREE.Group();
    this.outlinePass = null;
    this.isHighlighted = false;
    
    // Interaction
    this.isPlayerNearby = false;
    this.interactionDistance = 2.0;
    
    // UI elements
    this.infoPanel = null;
  }
  
  /**
   * Initialize the wall buy
   */
  init() {
    // Initialize weapon
    this.weapon.init();
    
    // Create wall mount
    this.createWallMount();
    
    // Position the weapon
    this.weapon.positionForWallMount(
      new THREE.Vector3(0, 0.1, 0.1),
      new THREE.Euler(-Math.PI / 4, 0, 0)
    );
    
    // Add weapon to instance
    this.instance.add(this.weapon.instance);
    
    // Position the entire wall buy
    this.instance.position.copy(this.position);
    this.instance.rotation.copy(this.rotation);
    
    // Add userData for raycasting
    this.instance.userData = { 
      wallBuy: true, 
      cost: this.cost,
      weaponName: this.weapon.name
    };
    
    // Create info panel
    this.createInfoPanel();
  }
  
  /**
   * Create the mount that the weapon sits on
   */
  createWallMount() {
    // Create a simple wall mount
    const mountGeometry = new THREE.BoxGeometry(0.8, 0.12, 0.05);
    const mountMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const mount = new THREE.Mesh(mountGeometry, mountMaterial);
    
    // Set Y position to center the mount
    mount.position.y = 0;
    
    // Add to instance
    this.instance.add(mount);
    
    // Add hooks or details
    const hookGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8);
    const hookMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    
    // Create two hooks
    const hook1 = new THREE.Mesh(hookGeometry, hookMaterial);
    hook1.position.set(0.2, 0.1, 0);
    hook1.rotation.x = Math.PI / 2;
    
    const hook2 = new THREE.Mesh(hookGeometry, hookMaterial);
    hook2.position.set(-0.2, 0.1, 0);
    hook2.rotation.x = Math.PI / 2;
    
    this.instance.add(hook1);
    this.instance.add(hook2);
  }
  
  /**
   * Create the info panel with weapon details and cost
   */
  createInfoPanel() {
    // Create container for info panel
    this.infoPanel = document.createElement('div');
    this.infoPanel.className = 'wall-buy-info';
    this.infoPanel.style.position = 'absolute';
    this.infoPanel.style.padding = '10px';
    this.infoPanel.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    this.infoPanel.style.color = 'white';
    this.infoPanel.style.borderRadius = '5px';
    this.infoPanel.style.fontFamily = 'Arial, sans-serif';
    this.infoPanel.style.fontSize = '14px';
    this.infoPanel.style.textAlign = 'center';
    this.infoPanel.style.width = '180px';
    this.infoPanel.style.display = 'none';
    this.infoPanel.style.zIndex = '100';
    this.infoPanel.style.pointerEvents = 'none';
    
    // Create weapon name
    const nameElement = document.createElement('div');
    nameElement.textContent = this.weapon.name;
    nameElement.style.fontSize = '18px';
    nameElement.style.fontWeight = 'bold';
    nameElement.style.marginBottom = '5px';
    
    // Create weapon description
    const descElement = document.createElement('div');
    descElement.textContent = this.weapon.description;
    descElement.style.fontSize = '12px';
    descElement.style.marginBottom = '10px';
    
    // Create cost element
    const costElement = document.createElement('div');
    costElement.textContent = `Cost: ${this.cost} points`;
    costElement.style.color = '#ffcc00';
    
    // Create key hint
    const hintElement = document.createElement('div');
    hintElement.textContent = 'Press F to Buy';
    hintElement.style.marginTop = '5px';
    hintElement.style.fontSize = '12px';
    hintElement.style.fontStyle = 'italic';
    
    // Add elements to panel
    this.infoPanel.appendChild(nameElement);
    this.infoPanel.appendChild(descElement);
    this.infoPanel.appendChild(costElement);
    this.infoPanel.appendChild(hintElement);
    
    // Add to document
    document.body.appendChild(this.infoPanel);
  }
  
  /**
   * Update the info panel position in screen space
   * @param {Camera} camera - The player's camera
   */
  updateInfoPanelPosition(camera) {
    if (!this.infoPanel || !this.isPlayerNearby) {
      return;
    }
    
    // Get world position of wall buy
    const wallBuyPosition = new THREE.Vector3();
    this.instance.getWorldPosition(wallBuyPosition);
    
    // Project to screen coordinates
    const screenPosition = wallBuyPosition.clone().project(camera);
    
    // Convert to CSS coordinates
    const x = (screenPosition.x * 0.5 + 0.5) * window.innerWidth;
    const y = (1 - (screenPosition.y * 0.5 + 0.5)) * window.innerHeight;
    
    // Position the panel above the wall buy
    this.infoPanel.style.left = `${x - 90}px`; // Center the 180px wide panel
    this.infoPanel.style.top = `${y - 120}px`; // Position above the wall buy
  }
  
  /**
   * Show/hide the info panel
   * @param {boolean} show - Whether to show the panel
   */
  showInfoPanel(show) {
    if (this.infoPanel) {
      this.infoPanel.style.display = show ? 'block' : 'none';
    }
  }
  
  /**
   * Check if player is near this wall buy
   * @param {THREE.Vector3} playerPosition - Current player position
   * @returns {boolean} True if player is within interaction distance
   */
  checkPlayerProximity(playerPosition) {
    // Get wall buy world position
    const wallBuyWorldPosition = new THREE.Vector3();
    this.instance.getWorldPosition(wallBuyWorldPosition);
    
    // Calculate distance to player
    const distance = wallBuyWorldPosition.distanceTo(playerPosition);
    
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
   * Attempt to purchase the weapon
   * @param {PlayerControls} player - The player attempting to purchase
   * @returns {boolean} True if purchase was successful
   */
  purchase(player) {
    // Check if player has enough points
    if (player.score < this.cost) {
      this.showInsufficientFundsMessage();
      return false;
    }
    
    // Deduct points
    player.score -= this.cost;
    player.updateScoreDisplay();
    
    // Create a new weapon instance for the player
    const newWeapon = new Weapon(this.weaponType);
    newWeapon.init();
    
    // Give weapon to player
    player.equipWeapon(newWeapon);
    
    // Show success message
    this.showPurchaseSuccessMessage();
    
    return true;
  }
  
  /**
   * Show a message when player has insufficient funds
   */
  showInsufficientFundsMessage() {
    const message = document.createElement('div');
    message.textContent = 'Not Enough Points!';
    message.style.position = 'absolute';
    message.style.top = '40%';
    message.style.left = '50%';
    message.style.transform = 'translate(-50%, -50%)';
    message.style.backgroundColor = 'rgba(255, 0, 0, 0.6)';
    message.style.color = 'white';
    message.style.padding = '10px 20px';
    message.style.borderRadius = '5px';
    message.style.fontFamily = 'Impact, fantasy';
    message.style.fontSize = '24px';
    message.style.zIndex = '1000';
    
    document.body.appendChild(message);
    
    // Remove after a short time
    setTimeout(() => {
      document.body.removeChild(message);
    }, 1500);
  }
  
  /**
   * Show a message when purchase is successful
   */
  showPurchaseSuccessMessage() {
    const message = document.createElement('div');
    message.textContent = `Purchased ${this.weapon.name}!`;
    message.style.position = 'absolute';
    message.style.top = '40%';
    message.style.left = '50%';
    message.style.transform = 'translate(-50%, -50%)';
    message.style.backgroundColor = 'rgba(0, 255, 0, 0.6)';
    message.style.color = 'white';
    message.style.padding = '10px 20px';
    message.style.borderRadius = '5px';
    message.style.fontFamily = 'Impact, fantasy';
    message.style.fontSize = '24px';
    message.style.zIndex = '1000';
    
    document.body.appendChild(message);
    
    // Remove after a short time
    setTimeout(() => {
      document.body.removeChild(message);
    }, 1500);
  }
  
  /**
   * Clean up when removing wall buy
   */
  dispose() {
    // Remove info panel from document
    if (this.infoPanel && document.body.contains(this.infoPanel)) {
      document.body.removeChild(this.infoPanel);
    }
  }
  
  /**
   * Handle player interaction with wall buy
   * @param {PlayerControls} player - The player attempting to interact
   * @returns {boolean} True if interaction was successful
   */
  onInteract(player) {
    console.log("Wall Buy onInteract called - attempting to purchase");
    return this.purchase(player);
  }
  
  /**
   * Reset the wall buy to its initial state
   */
  reset() {
    // Hide the info panel
    this.showInfoPanel(false);
    
    // Reset interaction state
    this.isPlayerNearby = false;
    
    // Any other state that needs to be reset
    console.log(`Wall buy ${this.weapon.name} reset to initial state`);
  }
} 
 
 
 
 
 