import * as THREE from 'three';
import { Enemy } from './Enemy';

/**
 * Creates a runner zombie variant that moves much faster but has less health
 */
export class RunnerZombie extends Enemy {
  constructor(targetWindow) {
    super(targetWindow);
    
    // Override default enemy properties
    this.health = 60; // Less health than standard zombies
    this.maxHealth = 60;
    this.speed = 1.2 + Math.random() * 0.6; // Much faster than standard zombies (1.2-1.8)
    this.attackRate = 3.0; // Faster attack rate
    this.attackDamage = 8; // Standard damage
    this.playerDamage = 20; // Similar damage to player
    
    // Runner zombie is taller and leaner
    this.height = 1.8; // Slightly taller than standard zombie
    this.floorLevel = 0;
    
    // Different sound properties
    this.soundFrequency = 0.12; // Slightly more frequent sounds than base zombies
    
    // Override materials to make them distinct
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x722222, // Reddish tint
      roughness: 0.7,
      metalness: 0.1
    });
    
    this.eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xff3300, // Bright orange-red eyes
      emissive: 0xff3300,
      emissiveIntensity: 0.5
    });
  }
  
  /**
   * Override the enemy mesh creation to make a runner zombie
   */
  createEnemyMesh() {
    // Torso - leaner
    const bodyGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.3);
    const body = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
    body.position.y = 0.9;
    body.castShadow = true;
    body.name = "runnerBody";
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const head = new THREE.Mesh(headGeometry, this.bodyMaterial);
    head.position.set(0, 1.45, 0); // Higher up
    head.castShadow = true;
    head.name = "runnerHead";
    
    // Eyes - more intense
    const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    
    // Left eye
    const leftEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
    leftEye.position.set(-0.1, 1.45, 0.2);
    leftEye.scale.z = 1.3; // Elongated eyes
    
    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
    rightEye.position.set(0.1, 1.45, 0.2);
    rightEye.scale.z = 1.3; // Elongated eyes
    
    // Arms - positioned for running
    const armGeometry = new THREE.BoxGeometry(0.15, 0.5, 0.15);
    
    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, this.bodyMaterial);
    leftArm.position.set(-0.35, 0.9, 0);
    leftArm.rotation.x = Math.PI / 6; // Positioned for running
    leftArm.castShadow = true;
    
    // Right arm
    const rightArm = new THREE.Mesh(armGeometry, this.bodyMaterial);
    rightArm.position.set(0.35, 0.9, 0);
    rightArm.rotation.x = -Math.PI / 6; // Positioned for running, opposite phase
    rightArm.castShadow = true;
    
    // Legs - longer for running
    const legGeometry = new THREE.BoxGeometry(0.18, 0.7, 0.18);
    
    // Left leg
    const leftLeg = new THREE.Mesh(legGeometry, this.bodyMaterial);
    leftLeg.position.set(-0.18, 0.35, 0);
    leftLeg.castShadow = true;
    
    // Right leg
    const rightLeg = new THREE.Mesh(legGeometry, this.bodyMaterial);
    rightLeg.position.set(0.18, 0.35, 0);
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
    
    // Add running animation
    this.setupRunningAnimation();
  }

  /**
   * Setup animation for running motion
   */
  setupRunningAnimation() {
    // Store original positions of limbs for animation
    this.originalLimbPositions = {
      leftArm: this.bodyParts.leftArm.position.clone(),
      rightArm: this.bodyParts.rightArm.position.clone(),
      leftLeg: this.bodyParts.leftLeg.position.clone(),
      rightLeg: this.bodyParts.rightLeg.position.clone()
    };
    
    // Store original rotations
    this.originalLimbRotations = {
      leftArm: this.bodyParts.leftArm.rotation.clone(),
      rightArm: this.bodyParts.rightArm.rotation.clone(),
      leftLeg: this.bodyParts.leftLeg.rotation.clone(),
      rightLeg: this.bodyParts.rightLeg.rotation.clone()
    };
    
    // Initialize animation time
    this.runAnimTime = Math.random() * Math.PI * 2; // Random start phase
  }
  
  /**
   * Update running animation
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateRunningAnimation(deltaTime) {
    if (!this.bodyParts || this.isDead) return;
    
    // Update animation time - faster for running
    this.runAnimTime += deltaTime * this.speed * 8;
    
    // Animate arms and legs for running motion
    const leftPhase = Math.sin(this.runAnimTime);
    const rightPhase = Math.sin(this.runAnimTime + Math.PI); // Opposite phase
    
    // Apply arm swing animation
    if (this.bodyParts.leftArm && this.originalLimbRotations) {
      this.bodyParts.leftArm.rotation.x = this.originalLimbRotations.leftArm.x + leftPhase * 0.8;
    }
    
    if (this.bodyParts.rightArm && this.originalLimbRotations) {
      this.bodyParts.rightArm.rotation.x = this.originalLimbRotations.rightArm.x + rightPhase * 0.8;
    }
    
    // Apply leg swing animation
    if (this.bodyParts.leftLeg && this.originalLimbRotations) {
      this.bodyParts.leftLeg.rotation.x = leftPhase * 0.6;
      this.bodyParts.leftLeg.position.z = this.originalLimbPositions.leftLeg.z + leftPhase * 0.2;
    }
    
    if (this.bodyParts.rightLeg && this.originalLimbRotations) {
      this.bodyParts.rightLeg.rotation.x = rightPhase * 0.6;
      this.bodyParts.rightLeg.position.z = this.originalLimbPositions.rightLeg.z + rightPhase * 0.2;
    }
    
    // Add body bob for running motion
    if (this.bodyParts.body) {
      this.bodyParts.body.position.y = 0.9 + Math.abs(Math.sin(this.runAnimTime * 2)) * 0.08;
    }
    
    // Add head tilt
    if (this.bodyParts.head) {
      this.bodyParts.head.rotation.z = Math.sin(this.runAnimTime) * 0.1;
    }
  }
  
  /**
   * Override the update method to add runner-specific animations
   * @param {number} deltaTime - Time elapsed since last update
   */
  update(deltaTime) {
    // Call parent update method first
    super.update(deltaTime);
    
    // Update running animation
    this.updateRunningAnimation(deltaTime);
  }
  
  /**
   * Override the health bar color
   */
  updateHealthBar() {
    super.updateHealthBar();
    
    // Give the runner a distinct health bar color
    if (this.healthBar && this.health > 0) {
      // Override color to be more reddish regardless of health
      this.healthBar.material.color.set(0xff3333);
    }
  }
  
  /**
   * Override the attack effect for faster animation
   */
  playAttackAnimation() {
    // Faster and more aggressive attack animation
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
    
    // Lunge forward more aggressively
    this.instance.position.x += direction.x * 0.5;
    this.instance.position.z += direction.z * 0.5;
    
    // Show attack effect
    if (this.attackEffect) {
      this.attackEffect.material.visible = true;
      this.attackAnimationTime = 0;
      
      // Make attack effect more intense for runner
      this.attackEffect.material.opacity = 0.8;
    }
    
    // Move back after a shorter time
    setTimeout(() => {
      if (this.instance) {
        this.instance.position.copy(originalPosition);
      }
    }, 80); // Faster than standard zombie
  }
  
  /**
   * Play hit animation for runner - flash differently
   */
  playHitAnimation() {
    // Flash body parts red with higher intensity
    if (!this.bodyParts) return;
    
    Object.values(this.bodyParts).forEach(part => {
      if (part && part.material) {
        // Store original color
        const originalColor = part.material.color.clone();
        const originalEmissive = part.material.emissive ? part.material.emissive.clone() : null;
        
        // Flash bright red
        part.material.color.set(0xff0000);
        if (part.material.emissive) {
          part.material.emissive.set(0xff0000);
          part.material.emissiveIntensity = 0.5; // Higher intensity
        }
        
        // Reset after shorter flash duration
        setTimeout(() => {
          if (part.material) {
            part.material.color.copy(originalColor);
            if (part.material.emissive && originalEmissive) {
              part.material.emissive.copy(originalEmissive);
              // Reset emissive intensity for eyes
              if (part === this.bodyParts.leftEye || part === this.bodyParts.rightEye) {
                part.material.emissiveIntensity = 0.5;
              } else {
                part.material.emissiveIntensity = 0;
              }
            }
          }
        }, 80); // Shorter flash
      }
    });
    
    // Add a slight recoil effect for runners
    if (this.instance && this.targetPosition) {
      const direction = new THREE.Vector3().subVectors(
        this.instance.position,
        new THREE.Vector3(this.targetPosition.x, this.instance.position.y, this.targetPosition.z)
      ).normalize().multiplyScalar(0.1);
      
      // Apply small knockback
      const originalPosition = this.instance.position.clone();
      this.instance.position.add(direction);
      
      // Return to position
      setTimeout(() => {
        if (this.instance) {
          this.instance.position.copy(originalPosition);
        }
      }, 100);
    }
  }
} 