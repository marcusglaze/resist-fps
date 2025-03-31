import * as THREE from 'three';
import { Enemy } from './Enemy';

/**
 * Creates a spitter zombie variant that climbs to the ceiling and shoots projectiles
 */
export class SpitterZombie extends Enemy {
  constructor(targetWindow) {
    super(targetWindow);
    
    // Override default enemy properties
    this.health = 70; // Less health than standard zombies
    this.maxHealth = 70;
    this.speed = 0.4 + Math.random() * 0.2; // Similar speed to crawlers (0.4-0.6)
    this.attackRate = 2.0; // Attack rate for projectiles
    this.attackDamage = 5; // Less damage per hit (damage is per projectile)
    this.playerDamage = 15; // Damage to player per projectile
    
    // Spitter-specific properties
    this.projectileSpeed = 5.0; // Speed of projectiles
    this.projectileSize = 0.15; // Size of projectile
    this.projectiles = []; // Array to track active projectiles
    this.onCeiling = false; // Whether zombie has reached ceiling
    this.ceilingHeight = 3.0; // Height of ceiling to climb to (slightly less than actual room height)
    this.hasEnteredRoom = false; // Whether the zombie has entered the room
    this.climbingSpeed = 0.8; // Speed of climbing
    this.lastProjectileTime = 0; // Time since last projectile was fired
    
    // Different sound properties
    this.soundFrequency = 0.14; // Make spitting sounds slightly more often than regular zombies
    
    // Override materials to make them distinct
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x3C8C38, // Greenish color
      roughness: 0.8,
      metalness: 0.2
    });
    
    this.eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff33, // Bright green eyes
      emissive: 0x00ff33,
      emissiveIntensity: 0.5
    });

    // Projectile material
    this.projectileMaterial = new THREE.MeshStandardMaterial({
      color: 0x22ff44, // Bright green projectile
      emissive: 0x22ff44,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.8
    });
  }
  
  /**
   * Override the enemy mesh creation to make a spitter zombie
   */
  createEnemyMesh() {
    // Torso - slightly thinner than standard zombie
    const bodyGeometry = new THREE.BoxGeometry(0.6, 0.7, 0.3);
    const body = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
    body.position.y = 0.9;
    body.castShadow = true;
    body.name = "spitterBody";
    
    // Head - slightly larger with expanded throat
    const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const head = new THREE.Mesh(headGeometry, this.bodyMaterial);
    head.position.set(0, 1.4, 0);
    head.castShadow = true;
    head.name = "spitterHead";
    
    // Eyes - more intense
    const eyeGeometry = new THREE.SphereGeometry(0.06, 8, 8);
    
    // Left eye
    const leftEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
    leftEye.position.set(-0.1, 1.45, 0.2);
    
    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
    rightEye.position.set(0.1, 1.45, 0.2);
    
    // Mouth - special feature for spitter
    const mouthGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    const mouth = new THREE.Mesh(mouthGeometry, this.projectileMaterial);
    mouth.position.set(0, 1.35, 0.25);
    mouth.scale.x = 1.5; // Make it oval-shaped
    mouth.scale.y = 0.7;
    
    // Arms - longer with claws for climbing
    const armGeometry = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    
    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, this.bodyMaterial);
    leftArm.position.set(-0.4, 0.9, 0);
    leftArm.rotation.z = -Math.PI / 6; // Angled outward
    leftArm.castShadow = true;
    
    // Left claw
    const leftClawGeometry = new THREE.ConeGeometry(0.06, 0.12, 4);
    const leftClaw = new THREE.Mesh(leftClawGeometry, this.bodyMaterial);
    leftClaw.position.set(-0.45, 0.6, 0);
    leftClaw.rotation.z = Math.PI; // Point downward
    
    // Right arm
    const rightArm = new THREE.Mesh(armGeometry, this.bodyMaterial);
    rightArm.position.set(0.4, 0.9, 0);
    rightArm.rotation.z = Math.PI / 6; // Angled outward
    rightArm.castShadow = true;
    
    // Right claw
    const rightClawGeometry = new THREE.ConeGeometry(0.06, 0.12, 4);
    const rightClaw = new THREE.Mesh(rightClawGeometry, this.bodyMaterial);
    rightClaw.position.set(0.45, 0.6, 0);
    rightClaw.rotation.z = Math.PI; // Point downward
    
    // Legs
    const legGeometry = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    
    // Left leg
    const leftLeg = new THREE.Mesh(legGeometry, this.bodyMaterial);
    leftLeg.position.set(-0.18, 0.3, 0);
    leftLeg.castShadow = true;
    
    // Right leg
    const rightLeg = new THREE.Mesh(legGeometry, this.bodyMaterial);
    rightLeg.position.set(0.18, 0.3, 0);
    rightLeg.castShadow = true;
    
    // Add all parts to the group
    this.instance.add(body);
    this.instance.add(head);
    this.instance.add(leftEye);
    this.instance.add(rightEye);
    this.instance.add(mouth);
    this.instance.add(leftArm);
    this.instance.add(rightArm);
    this.instance.add(leftClaw);
    this.instance.add(rightClaw);
    this.instance.add(leftLeg);
    this.instance.add(rightLeg);
    
    // Store references to body parts for damage effects
    this.bodyParts = {
      body,
      head,
      leftEye,
      rightEye,
      mouth,
      leftArm,
      rightArm,
      leftClaw,
      rightClaw,
      leftLeg,
      rightLeg
    };
    
    // Add climbing animation
    this.setupClimbingAnimation();
  }

  /**
   * Setup animation for climbing motion
   */
  setupClimbingAnimation() {
    // Store original positions of limbs for animation
    this.originalLimbPositions = {
      leftArm: this.bodyParts.leftArm.position.clone(),
      rightArm: this.bodyParts.rightArm.position.clone(),
      leftLeg: this.bodyParts.leftLeg.position.clone(),
      rightLeg: this.bodyParts.rightLeg.position.clone(),
      leftClaw: this.bodyParts.leftClaw.position.clone(),
      rightClaw: this.bodyParts.rightClaw.position.clone()
    };
    
    // Store original rotations
    this.originalLimbRotations = {
      leftArm: this.bodyParts.leftArm.rotation.clone(),
      rightArm: this.bodyParts.rightArm.rotation.clone(),
      leftLeg: this.bodyParts.leftLeg.rotation.clone(),
      rightLeg: this.bodyParts.rightLeg.rotation.clone(),
      leftClaw: this.bodyParts.leftClaw.rotation.clone(),
      rightClaw: this.bodyParts.rightClaw.rotation.clone()
    };
    
    // Initialize animation time
    this.climbAnimTime = Math.random() * Math.PI * 2; // Random start phase
  }
  
  /**
   * Update climbing animation
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateClimbingAnimation(deltaTime) {
    if (!this.bodyParts || this.isDead) return;
    
    // Update animation time
    this.climbAnimTime += deltaTime * this.speed * 5;
    
    // Animate limbs for climbing motion
    const leftPhase = Math.sin(this.climbAnimTime);
    const rightPhase = Math.sin(this.climbAnimTime + Math.PI); // Opposite phase
    
    // Apply limb animations
    if (this.bodyParts.leftArm && this.originalLimbPositions) {
      // Animate arms in climbing motion
      this.bodyParts.leftArm.rotation.x = leftPhase * 0.3;
      this.bodyParts.rightArm.rotation.x = rightPhase * 0.3;
      
      // Animate legs in climbing motion
      this.bodyParts.leftLeg.rotation.x = rightPhase * 0.3;
      this.bodyParts.rightLeg.rotation.x = leftPhase * 0.3;
      
      // Move claws with arms
      this.bodyParts.leftClaw.position.y = this.originalLimbPositions.leftClaw.y + leftPhase * 0.1;
      this.bodyParts.rightClaw.position.y = this.originalLimbPositions.rightClaw.y + rightPhase * 0.1;
    }
    
    // Subtle body movement
    if (this.bodyParts.body) {
      this.bodyParts.body.rotation.z = Math.sin(this.climbAnimTime) * 0.05;
    }
    
    // When on ceiling, make the head look around for targets
    if (this.onCeiling && this.bodyParts.head) {
      this.bodyParts.head.rotation.y = Math.sin(this.climbAnimTime * 0.5) * 0.5;
      
      // Make mouth "pulse" when about to spit
      if (this.bodyParts.mouth) {
        const currentTime = performance.now() / 1000;
        const timeSinceLastProjectile = currentTime - this.lastProjectileTime;
        
        // Pulse faster as we approach firing time
        if (timeSinceLastProjectile > (1 / this.attackRate) * 0.7) {
          this.bodyParts.mouth.scale.z = 1 + Math.sin(this.climbAnimTime * 5) * 0.3;
          this.bodyParts.mouth.material.emissiveIntensity = 0.7 + Math.sin(this.climbAnimTime * 5) * 0.3;
        } else {
          // Reset to normal
          this.bodyParts.mouth.scale.z = 1;
          this.bodyParts.mouth.material.emissiveIntensity = 0.7;
        }
      }
    }
  }
  
  /**
   * Override the update method to add spitter-specific behaviors
   * @param {number} deltaTime - Time elapsed since last update
   */
  update(deltaTime) {
    // If enemy manager is paused, don't update
    if (this.manager && this.manager.isPaused) {
      return;
    }
    
    // If enemy is dead, just update death animation
    if (this.isDead) {
      this.updateDeathAnimation(deltaTime);
      return;
    }
    
    // Make sure we have a scene reference (necessary for projectiles)
    if (!this.scene && this.manager && this.manager.scene) {
      this.scene = this.manager.scene;
      console.log("Spitter zombie: Set scene reference from manager");
    }
    
    // Update health bar to face camera
    this.updateHealthBarRotation();
    
    // Update attack animation if active
    if (this.attackEffect && this.attackEffect.material.visible) {
      this.updateAttackAnimation(deltaTime);
    }
    
    // Play zombie sounds periodically
    this.updateSoundEffects(deltaTime);
    
    // Update climbing animation
    this.updateClimbingAnimation(deltaTime);
    
    // Check if we've entered the room yet
    if (!this.hasEnteredRoom && this.targetWindow) {
      // If inside room already from parent class logic, mark as entered
      if (this.insideRoom) {
        this.hasEnteredRoom = true;
        console.log("Spitter zombie has entered the room!");
      } else {
        // Consider "entered" when we're close enough to the window
        if (this.instance && this.instance.position && this.targetWindow.position) {
          const distanceToWindow = this.instance.position.distanceTo(this.targetWindow.position);
          if (distanceToWindow < 2) {
            this.hasEnteredRoom = true;
            console.log("Spitter zombie has entered the room!");
          }
        }
      }
    }
    
    // If we've entered the room but not reached the ceiling, climb up
    if (this.hasEnteredRoom && !this.onCeiling && !this.isDead) {
      this.climbToCeiling(deltaTime);
      return; // Skip the parent update to override normal zombie behavior
    }
    
    // If we're on the ceiling, shoot projectiles at the player
    if (this.onCeiling && !this.isDead) {
      // Debug info
      if (!this.player) {
        console.log("Spitter zombie: No player reference for shooting");
      }
      if (!this.scene) {
        console.log("Spitter zombie: No scene reference for shooting");
      }
      
      this.tryShootProjectile();
      this.updateProjectiles(deltaTime);
      return; // Skip the parent update to override normal zombie behavior
    }
    
    // If not entered room yet, use parent class behavior (approach window, attack boards)
    if (!this.hasEnteredRoom) {
      // If inside room, move directly to climbing instead of parent class chase behavior
      if (this.insideRoom) {
        this.hasEnteredRoom = true;
      } else {
        // Use parent class behavior for approaching and attacking window
        if (this.targetWindow.boardsCount > 0) {
          this.attackWindow(deltaTime);
        } else {
          // Window has no boards, move inside
          this.moveTowardsWindow(deltaTime);
          
          // Check if reached the window
          const horizDistance = new THREE.Vector2(
            this.instance.position.x - this.targetPosition.x,
            this.instance.position.z - this.targetPosition.z
          ).length();
          
          if (horizDistance < 0.5) {
            this.enterRoom();
            this.hasEnteredRoom = true; // Mark as entered when we go through window
          }
        }
      }
    }
    
    // Update projectiles if any
    this.updateProjectiles(deltaTime);
  }
  
  /**
   * Climb to the ceiling
   * @param {number} deltaTime - Time elapsed since last update
   */
  climbToCeiling(deltaTime) {
    // Calculate movement for this frame
    const moveDistance = this.climbingSpeed * deltaTime;
    
    // Don't overshoot the ceiling
    if (this.instance.position.y + moveDistance >= this.ceilingHeight) {
      // Reached ceiling - snap to exact height
      this.instance.position.y = this.ceilingHeight;
      this.instance.rotation.x = Math.PI; // Fully inverted
      this.onCeiling = true;
      
      // Reposition health bar for ceiling position
      if (this.healthBarContainer) {
        this.healthBarContainer.position.y = -0.5; // Below when inverted
        this.healthBarContainer.rotation.x = Math.PI; // Flip it so it's readable
      }
      
      console.log("Spitter zombie has reached the ceiling! Y position:", this.instance.position.y);
    } else {
      // Still climbing - move upward
      this.instance.position.y += moveDistance;
      
      // Rotate to ceiling orientation
      if (this.instance.position.y > this.ceilingHeight * 0.5) {
        // Begin inverting as we get higher
        const progress = Math.min(1, (this.instance.position.y - this.ceilingHeight * 0.5) / (this.ceilingHeight * 0.5));
        this.instance.rotation.x = Math.PI * progress;
      }
    }
  }
  
  /**
   * Try to shoot a projectile at the player
   */
  tryShootProjectile() {
    // Only shoot if player exists and we're not dead
    if (!this.player || this.isDead) return;
    
    const currentTime = performance.now() / 1000;
    
    // Check if enough time has passed since last projectile
    if (currentTime - this.lastProjectileTime >= 1 / this.attackRate) {
      console.log("Spitter zombie: Attempting to shoot projectile");
      this.shootProjectile();
      this.lastProjectileTime = currentTime;
    }
  }
  
  /**
   * Create and shoot a projectile at the player
   */
  shootProjectile() {
    // Ensure player, scene, and required body parts exist
    if (!this.player) {
      console.log("Spitter zombie: Can't shoot - no player reference");
      return;
    }
    if (!this.scene) {
      console.log("Spitter zombie: Can't shoot - no scene reference");
      return;
    }
    if (!this.bodyParts || !this.bodyParts.mouth) {
      console.log("Spitter zombie: Can't shoot - no mouth reference");
      return;
    }
    
    // Play attack animation
    this.playAttackAnimation();
    
    // Create projectile
    const projectileGeometry = new THREE.SphereGeometry(this.projectileSize, 8, 8);
    const projectile = new THREE.Mesh(projectileGeometry, this.projectileMaterial);
    
    // Set user data for the projectile
    projectile.userData.isProjectile = true;
    projectile.userData.damage = this.playerDamage;
    projectile.userData.owner = this;
    
    // Position at mouth
    const mouthPosition = new THREE.Vector3();
    try {
      this.bodyParts.mouth.getWorldPosition(mouthPosition);
      console.log("Spitter zombie: Mouth position", mouthPosition);
    } catch (error) {
      console.error("Error getting mouth position:", error);
      // Fallback to zombie position if mouth position fails
      if (this.instance && this.instance.position) {
        mouthPosition.copy(this.instance.position);
        mouthPosition.y += this.onCeiling ? -0.5 : 1.35; // Adjust based on orientation
        console.log("Spitter zombie: Using fallback mouth position", mouthPosition);
      } else {
        // Can't shoot without a valid position
        console.log("Spitter zombie: Can't shoot - no valid position");
        return;
      }
    }
    projectile.position.copy(mouthPosition);
    
    // Calculate direction to player
    const playerPosition = new THREE.Vector3();
    try {
      // Safely get player position
      if (this.player.camera) {
        this.player.camera.getWorldPosition(playerPosition);
        console.log("Spitter zombie: Player position", playerPosition);
      } else if (this.player.position) {
        playerPosition.copy(this.player.position);
        console.log("Spitter zombie: Using fallback player position", playerPosition);
      } else {
        // Fallback to shooting downward if on ceiling, or forward if not
        playerPosition.copy(mouthPosition);
        playerPosition.y = this.onCeiling ? 0 : mouthPosition.y;
        playerPosition.z += 1; // Shoot forward a bit
        console.log("Spitter zombie: No player position - shooting in default direction");
      }
    } catch (error) {
      console.error("Error getting player position:", error);
      // Fallback to shooting downward if on ceiling, or forward if not
      playerPosition.copy(mouthPosition);
      playerPosition.y = this.onCeiling ? 0 : mouthPosition.y;
      playerPosition.z += 1; // Shoot forward a bit
    }
    
    // Direction from mouth to player
    const direction = new THREE.Vector3().subVectors(
      playerPosition,
      mouthPosition
    ).normalize();
    
    console.log("Spitter zombie: Shooting projectile in direction", direction);
    
    // Add projectile to scene
    this.scene.add(projectile);
    
    // Track projectile
    this.projectiles.push({
      mesh: projectile,
      direction: direction,
      speed: this.projectileSpeed,
      created: performance.now() / 1000
    });
    
    // Add a subtle flash effect
    this.createMuzzleFlash(mouthPosition);
    
    // Play sound effect if available
    if (this.player && this.player.audioListener) {
      // TODO: Add spitting sound
    }
  }
  
  /**
   * Update all projectiles
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateProjectiles(deltaTime) {
    if (!this.projectiles || !Array.isArray(this.projectiles)) {
      // If projectiles array is missing or not an array, initialize it
      this.projectiles = [];
      return;
    }
    
    const currentTime = performance.now() / 1000;
    const projectilesToRemove = [];
    
    // Update projectile positions
    for (let i = 0; i < this.projectiles.length; i++) {
      const projectile = this.projectiles[i];
      
      // Safety check - ensure projectile is valid
      if (!projectile || !projectile.mesh || !projectile.direction) {
        projectilesToRemove.push(i);
        continue;
      }
      
      try {
        // Move projectile
        projectile.mesh.position.x += projectile.direction.x * projectile.speed * deltaTime;
        projectile.mesh.position.y += projectile.direction.y * projectile.speed * deltaTime;
        projectile.mesh.position.z += projectile.direction.z * projectile.speed * deltaTime;
        
        // Add slight rotation for effect
        projectile.mesh.rotation.x += 2 * deltaTime;
        projectile.mesh.rotation.z += 3 * deltaTime;
      } catch (error) {
        console.error("Error updating projectile position:", error);
        projectilesToRemove.push(i);
        continue;
      }
      
      // Check for collision with player
      if (this.player) {
        try {
          const playerPosition = new THREE.Vector3();
          
          // Safely get player position
          if (this.player.camera && typeof this.player.camera.getWorldPosition === 'function') {
            this.player.camera.getWorldPosition(playerPosition);
            playerPosition.y -= 0.5; // Adjust to player body height
            
            // Log player and projectile positions for debugging
            // console.log("Player position:", playerPosition, "Projectile position:", projectile.mesh.position);
            
            // Increased hit radius and improve detection algorithm
            const distanceToPlayer = projectile.mesh.position.distanceTo(playerPosition);
            const hitRadius = 0.8; // Increased from 0.5 to make hitting easier
            
            // Apply damage when a hit is detected
            if (distanceToPlayer < hitRadius) {
              console.log("PROJECTILE HIT PLAYER! Distance:", distanceToPlayer);
              
              // Use the dedicated function to apply damage
              this.applyProjectileDamageToPlayer(projectile.mesh.position.clone());
              
              // Mark for removal
              projectilesToRemove.push(i);
              continue;
            }
          } else {
            // Fallback for collision if camera getWorldPosition is not available
            if (this.player.position) {
              const playerPos = this.player.position.clone();
              playerPos.y += 1.0; // Approximate player height
              
              const distanceToPlayer = projectile.mesh.position.distanceTo(playerPos);
              if (distanceToPlayer < 1.0) { // Larger radius for fallback
                // Use the dedicated function to apply damage
                this.applyProjectileDamageToPlayer(projectile.mesh.position.clone());
                
                projectilesToRemove.push(i);
                continue;
              }
            }
          }
        } catch (error) {
          console.error("Error checking projectile-player collision:", error);
        }
      }
      
      // Check for lifetime (remove after 3 seconds)
      if (currentTime - projectile.created > 3) {
        projectilesToRemove.push(i);
        continue;
      }
      
      // Check for collision with floor
      if (projectile.mesh.position.y < 0.1) {
        // Create splat effect
        try {
          this.createSplatEffect(projectile.mesh.position);
        } catch (error) {
          console.error("Error creating splat effect:", error);
        }
        projectilesToRemove.push(i);
        continue;
      }
    }
    
    // Remove projectiles (in reverse order to avoid index issues)
    for (let i = projectilesToRemove.length - 1; i >= 0; i--) {
      try {
        const index = projectilesToRemove[i];
        const projectile = this.projectiles[index];
        
        // Remove from scene
        if (projectile && projectile.mesh && this.scene) {
          this.scene.remove(projectile.mesh);
        }
        
        // Remove from array
        this.projectiles.splice(index, 1);
      } catch (error) {
        console.error("Error removing projectile:", error);
      }
    }
  }
  
  /**
   * Create muzzle flash effect when shooting
   * @param {THREE.Vector3} position - Position for the flash
   */
  createMuzzleFlash(position) {
    // Flash geometry
    const flashGeometry = new THREE.SphereGeometry(this.projectileSize * 1.5, 8, 8);
    const flashMaterial = new THREE.MeshBasicMaterial({
      color: 0x22ff44,
      transparent: true,
      opacity: 0.7
    });
    
    const flash = new THREE.Mesh(flashGeometry, flashMaterial);
    flash.position.copy(position);
    
    // Add to scene
    this.scene.add(flash);
    
    // Animate and remove
    let scale = 1;
    const animate = () => {
      scale += 0.2;
      flash.scale.set(scale, scale, scale);
      flash.material.opacity -= 0.1;
      
      if (flash.material.opacity > 0) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(flash);
      }
    };
    
    animate();
  }
  
  /**
   * Create splat effect when projectile hits floor
   * @param {THREE.Vector3} position - Position for the splat
   */
  createSplatEffect(position) {
    // Splat geometry (flat disc)
    const splatGeometry = new THREE.CircleGeometry(this.projectileSize * 3, 8);
    const splatMaterial = new THREE.MeshBasicMaterial({
      color: 0x22ff44,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    
    const splat = new THREE.Mesh(splatGeometry, splatMaterial);
    splat.position.copy(position);
    splat.position.y = 0.01; // Just above floor
    splat.rotation.x = -Math.PI / 2; // Flat on floor
    
    // Add to scene
    this.scene.add(splat);
    
    // Fade out and remove after 2 seconds
    setTimeout(() => {
      let opacity = 0.7;
      const fadeOut = setInterval(() => {
        opacity -= 0.05;
        splatMaterial.opacity = opacity;
        
        if (opacity <= 0) {
          clearInterval(fadeOut);
          this.scene.remove(splat);
        }
      }, 100);
    }, 2000);
  }
  
  /**
   * Override the health bar creation to adjust for ceiling position
   */
  createHealthBar() {
    super.createHealthBar();
    
    // Will be repositioned when climbing to ceiling
  }
  
  /**
   * Override play attack animation for projectile shooting
   */
  playAttackAnimation() {
    // Simple animation for spitting
    if (this.bodyParts.head && this.bodyParts.mouth) {
      // Store original scales
      const originalMouthScale = this.bodyParts.mouth.scale.clone();
      const originalHeadRotation = this.bodyParts.head.rotation.clone();
      
      // "Spit" animation
      this.bodyParts.mouth.scale.z = 1.5;
      this.bodyParts.head.rotation.x += 0.2;
      
      // Flash effect on mouth
      if (this.bodyParts.mouth.material) {
        const originalEmissive = this.bodyParts.mouth.material.emissiveIntensity;
        this.bodyParts.mouth.material.emissiveIntensity = 1.0;
        
        // Reset after short delay
        setTimeout(() => {
          if (this.bodyParts.mouth.material) {
            this.bodyParts.mouth.material.emissiveIntensity = originalEmissive;
          }
        }, 100);
      }
      
      // Reset after animation
      setTimeout(() => {
        if (this.bodyParts.mouth && this.bodyParts.head) {
          this.bodyParts.mouth.scale.copy(originalMouthScale);
          this.bodyParts.head.rotation.copy(originalHeadRotation);
        }
      }, 200);
    }
  }
  
  /**
   * Override die method to handle projectiles
   */
  die() {
    if (this.isDead) return; // Prevent multiple calls
    
    try {
      super.die();
    } catch (error) {
      console.error("Error in parent die method:", error);
      this.isDead = true; // Ensure isDead is set even if parent call fails
    }
    
    // Remove all projectiles
    if (this.projectiles && Array.isArray(this.projectiles) && this.projectiles.length > 0) {
      this.projectiles.forEach(projectile => {
        if (projectile && projectile.mesh && this.scene) {
          try {
            this.scene.remove(projectile.mesh);
          } catch (error) {
            console.error("Error removing projectile on death:", error);
          }
        }
      });
      this.projectiles = [];
    }
    
    // Fall from ceiling if on ceiling
    if (this.onCeiling && this.instance) {
      // Store reference to instance since 'this' might become invalid in timeout
      const zombieInstance = this.instance;
      const zombieScene = this.scene;
      
      try {
        // Remove ceiling rotation
        this.instance.rotation.x = 0;
        
        // Reset health bar orientation
        if (this.healthBarContainer) {
          this.healthBarContainer.position.y = 2;
          this.healthBarContainer.rotation.x = 0;
        }
        
        // Apply falling physics
        const gravity = 9.8;
        let fallTime = 0;
        let fallVelocity = 0;
        let startY = this.instance.position.y;
        
        // Falling animation
        const fallInterval = setInterval(() => {
          try {
            if (!zombieInstance || !zombieInstance.position) {
              clearInterval(fallInterval);
              return;
            }
            
            fallTime += 0.016; // ~60fps
            fallVelocity = gravity * fallTime;
            
            // Update position
            zombieInstance.position.y = startY - (0.5 * gravity * fallTime * fallTime);
            
            // Rotation as it falls
            zombieInstance.rotation.z += 0.1;
            
            // Stop when hitting ground
            if (zombieInstance.position.y <= 0.5) {
              zombieInstance.position.y = 0.5;
              clearInterval(fallInterval);
              
              // Create impact effect if still in scene
              if (zombieScene) {
                try {
                  this.createImpactEffect(zombieInstance.position);
                } catch (error) {
                  console.error("Error creating impact effect:", error);
                }
              }
            }
          } catch (error) {
            console.error("Error in falling animation:", error);
            clearInterval(fallInterval);
          }
        }, 16);
      } catch (error) {
        console.error("Error setting up falling animation:", error);
      }
    }
  }
  
  /**
   * Create impact effect when falling from ceiling
   * @param {THREE.Vector3} position - Position for the impact (optional)
   */
  createImpactEffect(position) {
    if (!this.scene) return;
    
    // Use provided position or instance position
    const impactPosition = position || (this.instance ? this.instance.position.clone() : new THREE.Vector3());
    
    // Impact dust particles
    const particleCount = 20;
    const particles = [];
    
    // Create particles
    for (let i = 0; i < particleCount; i++) {
      try {
        const particleGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const particleMaterial = new THREE.MeshBasicMaterial({
          color: 0x999999,
          transparent: true,
          opacity: 0.7
        });
        
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        
        // Position around impact point
        particle.position.copy(impactPosition);
        particle.position.y = 0.1;
        
        // Random offset
        particle.position.x += (Math.random() - 0.5) * 0.5;
        particle.position.z += (Math.random() - 0.5) * 0.5;
        
        // Random velocity
        const velocity = {
          x: (Math.random() - 0.5) * 2,
          y: Math.random() * 2,
          z: (Math.random() - 0.5) * 2
        };
        
        // Add to scene
        this.scene.add(particle);
        
        // Track particle
        particles.push({
          mesh: particle,
          velocity: velocity,
          lifeTime: 1 + Math.random()
        });
      } catch (error) {
        console.error("Error creating particle:", error);
      }
    }
    
    // Store scene reference to avoid 'this' context issues
    const scene = this.scene;
    
    // Animate particles
    let time = 0;
    const animateParticles = () => {
      try {
        time += 0.016; // ~60fps
        
        let allDone = true;
        
        particles.forEach(particle => {
          if (particle && particle.mesh && particle.lifeTime > 0) {
            allDone = false;
            
            // Update position
            particle.mesh.position.x += particle.velocity.x * 0.016;
            particle.mesh.position.y += particle.velocity.y * 0.016;
            particle.mesh.position.z += particle.velocity.z * 0.016;
            
            // Apply gravity
            particle.velocity.y -= 3 * 0.016;
            
            // Fade out
            particle.mesh.material.opacity = particle.lifeTime;
            
            // Update lifetime
            particle.lifeTime -= 0.016;
            
            // Remove if done
            if (particle.lifeTime <= 0 && scene) {
              scene.remove(particle.mesh);
            }
          }
        });
        
        if (!allDone) {
          requestAnimationFrame(animateParticles);
        }
      } catch (error) {
        console.error("Error in particle animation:", error);
        // Clean up any remaining particles
        if (scene) {
          particles.forEach(particle => {
            if (particle && particle.mesh) {
              try {
                scene.remove(particle.mesh);
              } catch (e) {}
            }
          });
        }
      }
    };
    
    try {
      animateParticles();
    } catch (error) {
      console.error("Error starting particle animation:", error);
    }
  }
  
  /**
   * Clean up resources when removed
   */
  cleanUp() {
    super.cleanUp();
    
    // Remove all projectiles
    if (this.projectiles.length > 0) {
      this.projectiles.forEach(projectile => {
        if (this.scene) {
          this.scene.remove(projectile.mesh);
        }
      });
      this.projectiles = [];
    }
  }

  /**
   * Override enterRoom method to immediately start climbing behavior
   */
  enterRoom() {
    super.enterRoom();
    
    // Mark as entered room for climbing behavior
    this.hasEnteredRoom = true;
    console.log("Spitter zombie has entered the room and will start climbing");
    
    // Reset y position to ensure we're on the floor
    this.instance.position.y = this.floorLevel;
  }

  /**
   * Apply damage to player from projectile hit
   * @param {THREE.Vector3} hitPosition - Position where the projectile hit
   */
  applyProjectileDamageToPlayer(hitPosition) {
    if (!this.player || typeof this.player.takeDamage !== 'function') {
      console.error("Cannot damage player - invalid player reference");
      return;
    }
    
    // Apply damage to player
    console.log(`Spitter zombie projectile hit player for ${this.playerDamage} damage!`);
    this.player.takeDamage(this.playerDamage);
    
    // Create visual effects at hit position
    if (hitPosition && this.scene) {
      // Splash effect
      const splashGeometry = new THREE.SphereGeometry(0.2, 8, 8);
      const splashMaterial = new THREE.MeshBasicMaterial({
        color: 0x22ff44, // Bright green
        transparent: true,
        opacity: 0.8
      });
      
      const splash = new THREE.Mesh(splashGeometry, splashMaterial);
      splash.position.copy(hitPosition);
      this.scene.add(splash);
      
      // Animate splash
      setTimeout(() => {
        let scale = 1;
        let opacity = 0.8;
        
        const animateSplash = () => {
          scale += 0.15;
          opacity -= 0.08;
          
          splash.scale.set(scale, scale, scale);
          splashMaterial.opacity = opacity;
          
          if (opacity > 0) {
            requestAnimationFrame(animateSplash);
          } else {
            this.scene.remove(splash);
          }
        };
        
        animateSplash();
      }, 0);
    }
  }
} 