import * as THREE from 'three';
import { Enemy } from './Enemy';

/**
 * Creates a crawling zombie variant that moves slower but is harder to hit
 */
export class CrawlingZombie extends Enemy {
  constructor(targetWindow) {
    super(targetWindow);
    
    // Override default enemy properties
    this.health = 30; // Less health than standard zombies
    this.maxHealth = 75;
    this.speed = 0.75; // Crawlers move slower (relative to base Enemy speed)
    this.attackRate = 1.5; // Slightly slower attack rate
    this.attackDamage = 7; // Slightly less damage
    this.playerDamage = 15; // Less damage to player
    this.attackRange = 0.6;
    
    // Crawling zombie is closer to the ground
    this.height = 0.7; // Lower height than standard zombie
    this.floorLevel = 0;
    
    // Different sound properties
    this.soundFrequency = 0.15; // Make crawling sounds slightly more often than base zombies
    
    // Override materials to make them distinct
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x3D3D2A, // Darker, muddy color
      roughness: 0.9,
      metalness: 0.1
    });
    
    this.eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xbbaa00, // Yellowish eyes
      emissive: 0xbbaa00,
      emissiveIntensity: 0.4
    });
  }
  
  /**
   * Override the enemy mesh creation to make a crawling zombie
   */
  createEnemyMesh() {
    // Torso - flatter and longer
    const bodyGeometry = new THREE.BoxGeometry(0.7, 0.4, 0.9);
    const body = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
    body.position.y = 0.2; // Lower to the ground
    body.castShadow = true;
    body.name = "crawlerBody";
    
    // Head - tilted up
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const head = new THREE.Mesh(headGeometry, this.bodyMaterial);
    head.position.set(0, 0.5, 0.3); // Positioned at front of torso, looking up
    head.castShadow = true;
    head.name = "crawlerHead";
    
    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    
    // Left eye
    const leftEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
    leftEye.position.set(-0.1, 0.55, 0.5);
    
    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
    rightEye.position.set(0.1, 0.55, 0.5);
    
    // Arms - reaching forward
    const armGeometry = new THREE.BoxGeometry(0.2, 0.15, 0.6);
    
    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, this.bodyMaterial);
    leftArm.position.set(-0.4, 0.15, 0.25);
    leftArm.rotation.y = -Math.PI / 8; // Angled slightly outward
    leftArm.castShadow = true;
    
    // Right arm
    const rightArm = new THREE.Mesh(armGeometry, this.bodyMaterial);
    rightArm.position.set(0.4, 0.15, 0.25);
    rightArm.rotation.y = Math.PI / 8; // Angled slightly outward
    rightArm.castShadow = true;
    
    // Legs - dragging behind
    const legGeometry = new THREE.BoxGeometry(0.22, 0.15, 0.7);
    
    // Left leg
    const leftLeg = new THREE.Mesh(legGeometry, this.bodyMaterial);
    leftLeg.position.set(-0.18, 0.1, -0.3);
    leftLeg.castShadow = true;
    
    // Right leg
    const rightLeg = new THREE.Mesh(legGeometry, this.bodyMaterial);
    rightLeg.position.set(0.18, 0.1, -0.3);
    rightLeg.castShadow = true;
    
    // Add all parts to the group
    this.instance.add(body);
    this.instance.add(head);
    this.instance.add(leftEye);
    this.instance.add(rightEye);
    this.instance.add(leftArm);
    this.instance.add(rightArm);
    this.instance.add(leftLeg);
    this.instance.add(rightLeg);
    
    // Store references to body parts for damage effects
    this.bodyParts = {
      body,
      head,
      leftEye,
      rightEye,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg
    };
    
    // Add crawling animation
    this.animateCrawling();
  }

  /**
   * Setup animation for crawling motion
   */
  animateCrawling() {
    // Store original positions of arms for animation
    this.originalArmPositions = {
      leftArm: this.bodyParts.leftArm.position.clone(),
      rightArm: this.bodyParts.rightArm.position.clone()
    };
    
    // Initialize animation time
    this.crawlAnimTime = Math.random() * Math.PI * 2; // Random start phase
  }
  
  /**
   * Update crawling animation
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateCrawlAnimation(deltaTime) {
    if (!this.bodyParts || this.isDead) return;
    
    // Update animation time
    this.crawlAnimTime += deltaTime * this.speed * 5;
    
    // Animate arms for crawling motion
    const leftArmPhase = Math.sin(this.crawlAnimTime);
    const rightArmPhase = Math.sin(this.crawlAnimTime + Math.PI); // Opposite phase
    
    // Apply vertical motion to arms to simulate crawling
    if (this.bodyParts.leftArm && this.originalArmPositions) {
      this.bodyParts.leftArm.position.z = this.originalArmPositions.leftArm.z + leftArmPhase * 0.15;
      this.bodyParts.leftArm.position.y = this.originalArmPositions.leftArm.y + Math.abs(leftArmPhase) * 0.07;
    }
    
    if (this.bodyParts.rightArm && this.originalArmPositions) {
      this.bodyParts.rightArm.position.z = this.originalArmPositions.rightArm.z + rightArmPhase * 0.15;
      this.bodyParts.rightArm.position.y = this.originalArmPositions.rightArm.y + Math.abs(rightArmPhase) * 0.07;
    }
    
    // Add slight body rock
    if (this.bodyParts.body) {
      this.bodyParts.body.rotation.z = Math.sin(this.crawlAnimTime) * 0.05;
    }
  }
  
  /**
   * Override the update method to add crawler-specific animations
   * @param {number} deltaTime - Time elapsed since last update
   */
  update(deltaTime) {
    // Call parent update method first
    super.update(deltaTime);
    
    // Update crawling animation
    this.updateCrawlAnimation(deltaTime);
  }
  
  /**
   * Override the health bar position to account for lower height
   */
  createHealthBar() {
    super.createHealthBar();
    
    // Reposition health bar for crawler's lower height
    if (this.healthBarContainer) {
      this.healthBarContainer.position.y = 0.8; // Lower than standard zombie
    }
  }
  
  /**
   * Override the attack effect position
   */
  createAttackEffect() {
    super.createAttackEffect();
    
    // Reposition attack effect for crawler's height
    if (this.attackEffect) {
      this.attackEffect.position.set(0, 0.5, 0.7);
    }
  }
  
  /**
   * Play attack animation with visual effect - modified for crawler
   */
  playAttackAnimation() {
    // Simple animation to move forward and back
    const originalPosition = this.instance.position.clone();
    
    // Calculate direction to target
    const targetPointOnGround = new THREE.Vector3(
      this.targetPosition.x,
      this.floorLevel,
      this.targetPosition.z
    );
    
    const direction = new THREE.Vector3().subVectors(
      targetPointOnGround,
      this.instance.position
    ).normalize();
    
    // Move forward less than standing zombie
    this.instance.position.x += direction.x * 0.2;
    this.instance.position.z += direction.z * 0.2;
    
    // Show attack effect
    if (this.attackEffect) {
      this.attackEffect.material.visible = true;
      this.attackAnimationTime = 0;
    }
    
    // Move back after 100ms
    setTimeout(() => {
      if (this.instance) {
        this.instance.position.copy(originalPosition);
      }
    }, 100);
  }
  
  /**
   * Play hit animation - modified for crawler
   */
  playHitAnimation() {
    // Flash body parts red
    if (!this.bodyParts) return;
    
    Object.values(this.bodyParts).forEach(part => {
      if (part && part.material) {
        // Store original color
        const originalColor = part.material.color.clone();
        const originalEmissive = part.material.emissive ? part.material.emissive.clone() : null;
        
        // Flash red
        part.material.color.set(0xff0000);
        if (part.material.emissive) {
          part.material.emissive.set(0xff0000);
          part.material.emissiveIntensity = 0.3;
        }
        
        // Reset after flash duration
        setTimeout(() => {
          if (part.material) {
            part.material.color.copy(originalColor);
            if (part.material.emissive && originalEmissive) {
              part.material.emissive.copy(originalEmissive);
              // Reset emissive intensity for eyes
              if (part === this.bodyParts.leftEye || part === this.bodyParts.rightEye) {
                part.material.emissiveIntensity = 0.4;
              } else {
                part.material.emissiveIntensity = 0;
              }
            }
          }
        }, 100);
      }
    });
  }
} 