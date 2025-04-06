import * as THREE from 'three';

/**
 * Creates a basic enemy that can attack windows
 */
export class Enemy {
  constructor(targetWindow) {
    this.targetWindow = targetWindow;
    this.health = 100;
    this.maxHealth = 100;
    this.speed = 0.5 + Math.random() * 1.0; // Random speed between 0.5 and 1.5
    this.attackRate = 2; // 2 attacks per second
    this.attackDamage = 10; // 10 damage per attack (3 hits to destroy a board)
    this.lastAttackTime = 0;
    this.playerDamage = 25; // Damage to player on hit
    this.attackCooldown = 1; // seconds between attacks on player
    this.lastPlayerAttackTime = 0;
    
    // Assign a unique ID for network synchronization
    this.id = `enemy_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
    // Default state
    this.state = 'idle';
    // Enemy type for network synchronization
    this.type = 'standard';
    // Movement status
    this.isMoving = false;
    this.isAttacking = false;
    
    // Sound properties
    this.soundFrequency = 0.1; // Sound frequency in Hz (once every 10 seconds)
    this.nextSoundTime = Math.random() * (1 / this.soundFrequency); // Randomize initial sound time
    this.lastSoundTime = 0;
    
    // Enemy mesh
    this.instance = new THREE.Group();
    
    // Enemy position
    this.position = new THREE.Vector3();
    this.insideRoom = false;
    
    // Target window world position
    this.targetPosition = new THREE.Vector3();
    
    // Player reference (will be set later)
    this.player = null;
    
    // Enemy dimensions
    this.height = 1.7; // Same height as player for consistency
    this.floorLevel = 0; // Floor y-coordinate
    
    // Enemy materials
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x2D572C, // Dark green
      roughness: 0.8,
      metalness: 0.2
    });
    
    this.eyeMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000, // Red
      emissive: 0xff0000,
      emissiveIntensity: 0.5
    });
    
    // Attack visual effect
    this.attackEffect = null;
    this.attackAnimationTime = 0;
    
    // Death state
    this.isDead = false;
    this.deathAnimationTime = 0;
    
    // Points tracking for score system
    this.pointsAwarded = false;
    
    // Health bar
    this.healthBar = null;
    this.healthBarContainer = null;
  }

  /**
   * Set player reference
   * @param {PlayerControls} player - The player to chase
   */
  setPlayer(player) {
    this.player = player;
  }

  /**
   * Initialize enemy
   */
  init() {
    console.log("ENEMY: Initializing enemy with ID:", this.id);
    
    this.createEnemyMesh();
    this.updateTargetPosition();
    this.positionOutsideWindow();
    this.createAttackEffect();
    this.createHealthBar();
    
    // Set type for userData
    this.instance.userData.type = 'zombie';
    
    // Set direct reference to the enemy object
    this.instance.userData.enemy = this;
    
    // Set enemy reference in children (for raycasting)
    this.instance.traverse((child) => {
      if (child.isMesh) {
        child.userData.type = 'zombie';
        child.userData.enemy = this;
        console.log(`ENEMY: Set userData for mesh "${child.name}"`);
      }
    });
    
    console.log("ENEMY: Initialization complete, userData check:", {
      instanceHasUserData: !!this.instance.userData,
      typeSet: this.instance.userData.type,
      enemyReferenceSet: !!this.instance.userData.enemy
    });
  }

  /**
   * Create the enemy mesh
   */
  createEnemyMesh() {
    // Body
    const bodyGeometry = new THREE.BoxGeometry(0.7, 1.7, 0.5);
    const body = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
    body.position.y = 0.85; // Half height
    body.castShadow = true;
    body.name = "zombieBody";
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.3, 16, 16);
    const head = new THREE.Mesh(headGeometry, this.bodyMaterial);
    head.position.y = 1.85; // Above body
    head.castShadow = true;
    head.name = "zombieHead";
    
    // Eyes
    const eyeGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    
    // Left eye
    const leftEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
    leftEye.position.set(-0.12, 1.9, 0.25);
    
    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, this.eyeMaterial);
    rightEye.position.set(0.12, 1.9, 0.25);
    
    // Arms
    const armGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    
    // Left arm
    const leftArm = new THREE.Mesh(armGeometry, this.bodyMaterial);
    leftArm.position.set(-0.45, 1.0, 0);
    leftArm.castShadow = true;
    
    // Right arm
    const rightArm = new THREE.Mesh(armGeometry, this.bodyMaterial);
    rightArm.position.set(0.45, 1.0, 0);
    rightArm.castShadow = true;
    
    // Legs
    const legGeometry = new THREE.BoxGeometry(0.25, 0.8, 0.25);
    
    // Left leg
    const leftLeg = new THREE.Mesh(legGeometry, this.bodyMaterial);
    leftLeg.position.set(-0.2, 0.4, 0);
    leftLeg.castShadow = true;
    
    // Right leg
    const rightLeg = new THREE.Mesh(legGeometry, this.bodyMaterial);
    rightLeg.position.set(0.2, 0.4, 0);
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
  }

  /**
   * Create a health bar above the enemy
   */
  createHealthBar() {
    // Create health bar container
    const healthBarContainer = new THREE.Group();
    
    // Create background bar
    const backgroundGeometry = new THREE.PlaneGeometry(1, 0.1);
    const backgroundMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5
    });
    const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
    
    // Create health bar
    const healthBarGeometry = new THREE.PlaneGeometry(1, 0.1);
    const healthBarMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide
    });
    const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
    
    // Position slightly in front of background
    healthBar.position.z = 0.01;
    
    // Center health bar pivot on left side
    healthBar.geometry.translate(0.5, 0, 0);
    
    // Add to container
    healthBarContainer.add(background);
    healthBarContainer.add(healthBar);
    
    // Position above enemy
    healthBarContainer.position.set(0, 2.3, 0);
    
    // Make health bar always face camera
    healthBarContainer.rotation.x = -Math.PI / 2;
    
    // Add to instance
    this.instance.add(healthBarContainer);
    
    // Store references
    this.healthBarContainer = healthBarContainer;
    this.healthBar = healthBar;
    
    // Update health bar scale based on health
    this.updateHealthBar();
  }

  /**
   * Update health bar scale based on current health
   */
  updateHealthBar() {
    if (this.healthBar) {
      // Scale health bar based on health percentage
      const healthPercent = this.health / this.maxHealth;
      this.healthBar.scale.x = Math.max(0, healthPercent);
      
      // Update color based on health
      if (healthPercent > 0.6) {
        this.healthBar.material.color.setHex(0x00ff00); // Green
      } else if (healthPercent > 0.3) {
        this.healthBar.material.color.setHex(0xffff00); // Yellow
      } else {
        this.healthBar.material.color.setHex(0xff0000); // Red
      }
    }
  }

  /**
   * Create attack effect visual (for damaging boards)
   */
  createAttackEffect() {
    // Create a cone for attack effect
    const effectGeometry = new THREE.ConeGeometry(0.2, 0.5, 8);
    const effectMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.7,
      visible: false // Initially hidden
    });
    
    this.attackEffect = new THREE.Mesh(effectGeometry, effectMaterial);
    this.attackEffect.position.set(0, 1.5, 0.7); // Position in front of zombie
    this.attackEffect.rotation.x = Math.PI / 2; // Point forward
    
    this.instance.add(this.attackEffect);
  }

  /**
   * Update the target window position
   */
  updateTargetPosition() {
    // Get the target window's world position
    this.targetWindow.instance.getWorldPosition(this.targetPosition);
  }

  /**
   * Position the enemy outside the targeted window
   */
  positionOutsideWindow() {
    // Get window position and rotation
    const worldPosition = this.targetPosition.clone();
    const worldRotation = this.targetWindow.instance.rotation.clone();
    
    // Create an offset vector (3 units outside the window)
    const offset = new THREE.Vector3(0, 0, 3);
    
    // Apply the window's rotation to the offset
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), worldRotation.y);
    
    // Apply the offset to the window position
    worldPosition.add(offset);
    
    // Ensure enemy is on the ground (y=0)
    worldPosition.y = this.floorLevel;
    
    // Set enemy position
    this.instance.position.copy(worldPosition);
    
    // Make enemy face the window
    this.instance.lookAt(new THREE.Vector3(
      this.targetPosition.x, 
      this.floorLevel, // Look straight ahead, not up at the window
      this.targetPosition.z
    ));
  }

  /**
   * Update enemy logic
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
    
    // Update health bar to face camera
    this.updateHealthBarRotation();
    
    // Update attack animation if active
    if (this.attackEffect && this.attackEffect.material && this.attackEffect.material.visible) {
      this.updateAttackAnimation(deltaTime);
    }
    
    // Play zombie sounds periodically
    this.updateSoundEffects(deltaTime);
    
    // If inside room, chase the player
    if (this.insideRoom) {
      // Check if we have a player reference before chasing
      if (this.player) {
        // If local player is dead, check for remote players to target
        if (this.player.isDead) {
          // Try to find alive remote players (if we're the host)
          let foundLivingTarget = false;
          let targetPosition = null;
          
          // Look for network manager to find remote players
          if (this.manager && this.manager.gameEngine && 
              this.manager.gameEngine.networkManager && 
              this.manager.gameEngine.networkManager.remotePlayers) {
            
            const remotePlayers = this.manager.gameEngine.networkManager.remotePlayers;
            
            // Find any living remote player to target
            remotePlayers.forEach(player => {
              if (!player.isDead && player.position) {
                foundLivingTarget = true;
                targetPosition = player.position;
              }
            });
          }
          
          // Either chase remote players or move randomly if none alive
          if (foundLivingTarget && targetPosition) {
            // Only log occasionally to reduce spam
            if (Math.random() < 0.005) { // 0.5% chance per frame
              console.log(`Zombie: Targeting remote player`);
            }
            
            // Calculate direction to player (only on x and z axes)
            const direction = new THREE.Vector3(
              targetPosition.x - this.instance.position.x,
              0, // Keep y movement flat
              targetPosition.z - this.instance.position.z
            ).normalize();
            
            // Move towards player
            const step = this.speed * deltaTime;
            this.instance.position.x += direction.x * step;
            this.instance.position.z += direction.z * step;
            
            // Ensure y position is at floor level
            this.instance.position.y = this.floorLevel;
            
            // Look at target
            this.instance.lookAt(new THREE.Vector3(
              targetPosition.x,
              this.floorLevel,
              targetPosition.z
            ));
            
            // Enforce room boundaries
            this.enforceRoomBoundaries();
            
            // Try to attack if close enough
            const distSquared = Math.pow(this.instance.position.x - targetPosition.x, 2) + 
                               Math.pow(this.instance.position.z - targetPosition.z, 2);
            
            if (distSquared < Math.pow(this.attackRange, 2)) {
              // Attack the remote player - this updates animation and sends network event
              const currentTime = performance.now() / 1000;
              if (currentTime - this.lastAttackTime >= 1 / this.attackRate) {
                this.lastAttackTime = currentTime;
                this.playAttackAnimation();
              }
            }
          } else {
            // No players to target, move randomly
            this.moveRandomly(deltaTime);
          }
        } else {
          // Normal behavior - chase player if we can
          this.chasePlayer(deltaTime);
          this.tryAttackPlayer();
        }
      } else {
        // No player reference, just move randomly
        this.moveRandomly(deltaTime);
      }
      return;
    }
    
    // If window is boarded, attack it
    if (this.targetWindow && this.targetWindow.boardsCount > 0) {
      this.attackWindow(deltaTime);
    } else if (this.targetWindow) {
      // Window has no boards, move inside
      this.moveTowardsWindow(deltaTime);
      
      // Check if reached the window
      const horizDistance = new THREE.Vector2(
        this.instance.position.x - this.targetPosition.x,
        this.instance.position.z - this.targetPosition.z
      ).length();
      
      if (horizDistance < 0.5) {
        this.enterRoom();
      }
    } else {
      // No target window, move randomly
      this.moveRandomly(deltaTime);
    }
  }

  /**
   * Update health bar to face the camera
   */
  updateHealthBarRotation() {
    if (this.healthBarContainer && this.player) {
      // Get direction to player's camera
      const direction = new THREE.Vector3().subVectors(
        this.player.camera.position,
        this.instance.position
      ).normalize();
      
      // Get rotation to face player
      const rotationMatrix = new THREE.Matrix4();
      rotationMatrix.lookAt(
        new THREE.Vector3(0, 0, 0),
        direction,
        new THREE.Vector3(0, 1, 0)
      );
      
      // Apply rotation to health bar container
      const quaternion = new THREE.Quaternion();
      quaternion.setFromRotationMatrix(rotationMatrix);
      
      // Adjust rotation for the health bar (which is a horizontal plane)
      this.healthBarContainer.setRotationFromQuaternion(quaternion);
      this.healthBarContainer.rotation.x = -Math.PI / 2;
    }
  }

  /**
   * Move towards the window
   * @param {number} deltaTime - Time elapsed since last update
   */
  moveTowardsWindow(deltaTime) {
    // Calculate direction to window (only on x and z axes)
    const targetPointOnGround = new THREE.Vector3(
      this.targetPosition.x,
      this.floorLevel,
      this.targetPosition.z
    );
    
    const direction = new THREE.Vector3().subVectors(
      targetPointOnGround,
      this.instance.position
    ).normalize();
    
    // Move towards window
    const step = this.speed * deltaTime;
    this.instance.position.x += direction.x * step;
    this.instance.position.z += direction.z * step;
    
    // Ensure y position is at floor level
    this.instance.position.y = this.floorLevel;
    
    // Look at target (on ground level)
    this.instance.lookAt(targetPointOnGround);
  }

  /**
   * Attack the window to damage boards
   * @param {number} deltaTime - Time elapsed since last update
   */
  attackWindow(deltaTime) {
    // Check if can attack based on attack rate
    const currentTime = performance.now() / 1000; // Convert to seconds
    if (currentTime - this.lastAttackTime >= 1 / this.attackRate) {
      // Get current board health before attack
      const boardIndex = this.targetWindow.boardsCount - 1;
      const currentBoardHealth = boardIndex >= 0 ? this.targetWindow.boardHealths[boardIndex] : 0;
      
      // Apply damage to the board
      if (this.targetWindow.damageBoard(this.attackDamage)) {
        // Update last attack time
        this.lastAttackTime = currentTime;
        
        // Play attack animation
        this.playAttackAnimation();
        
        // Check if the board was broken (removed) by this attack
        const newBoardIndex = this.targetWindow.boardsCount - 1;
        
        // If board count changed or new top board is different from previous, a board was broken
        const boardWasRemoved = 
          (boardIndex >= 0 && newBoardIndex < boardIndex) || 
          (currentBoardHealth > 0 && currentBoardHealth <= this.attackDamage);
        
        // Only play sound when a board is completely broken
        if (boardWasRemoved && this.player && typeof this.player.playWindowBoardBreakingSound === 'function') {
          this.player.playWindowBoardBreakingSound();
        }
      }
    }
  }

  /**
   * Play attack animation with visual effect
   */
  playAttackAnimation() {
    // Simple animation to move forward and back
    const originalPosition = this.instance.position.clone();
    
    // Calculate direction to window (on xz plane)
    const targetPointOnGround = new THREE.Vector3(
      this.targetPosition.x,
      this.floorLevel,
      this.targetPosition.z
    );
    
    const direction = new THREE.Vector3().subVectors(
      targetPointOnGround,
      this.instance.position
    ).normalize();
    
    // Move forward
    this.instance.position.x += direction.x * 0.3;
    this.instance.position.z += direction.z * 0.3;
    
    // Show attack effect
    this.attackEffect.material.visible = true;
    this.attackAnimationTime = 0;
    
    // Move back after 100ms
    setTimeout(() => {
      if (this.instance) {
        this.instance.position.copy(originalPosition);
      }
    }, 100);
  }

  /**
   * Update attack animation
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateAttackAnimation(deltaTime) {
    this.attackAnimationTime += deltaTime;
    
    // Hide attack effect after 0.2 seconds
    if (this.attackAnimationTime > 0.2) {
      this.attackEffect.material.visible = false;
    }
  }

  /**
   * Enter the room when window is unboarded
   */
  enterRoom() {
    this.insideRoom = true;
    
    // Position just inside the window
    const roomCenter = new THREE.Vector3(0, this.floorLevel, 0);
    
    // Calculate direction to center (on xz plane)
    const direction = new THREE.Vector3().subVectors(
      roomCenter,
      new THREE.Vector3(this.targetPosition.x, this.floorLevel, this.targetPosition.z)
    ).normalize();
    
    // Position just inside the window
    this.instance.position.x = this.targetPosition.x + direction.x * 2;
    this.instance.position.y = this.floorLevel;
    this.instance.position.z = this.targetPosition.z + direction.z * 2;
    
    // If we have a player reference, immediately look at the player
    if (this.player) {
      this.lookAtPlayer();
    } else {
      // Otherwise face the center of the room
      this.instance.lookAt(roomCenter);
    }
  }

  /**
   * Make the enemy look at the player
   */
  lookAtPlayer() {
    if (!this.player) return;
    
    // Get player position at ground level
    const playerPos = new THREE.Vector3(
      this.player.camera.position.x,
      this.floorLevel,
      this.player.camera.position.z
    );
    
    // Look at player
    this.instance.lookAt(playerPos);
  }

  /**
   * Chase the player
   * @param {number} deltaTime - Time elapsed since last update
   */
  chasePlayer(deltaTime) {
    // Check if we have a player reference
    if (!this.player) {
      this.moveRandomly(deltaTime);
      return;
    }
    
    // Default to chasing local player
    let closestPlayerPos = new THREE.Vector3(
      this.player.camera.position.x,
      this.floorLevel,
      this.player.camera.position.z
    );
    
    let closestDistance = this.instance.position.distanceTo(closestPlayerPos);
    let targetingRemotePlayer = false;
    let localPlayerIsDead = this.player.isDead;
    
    // Check for remote players via NetworkManager if we have access to game engine
    if (this.manager && this.manager.gameEngine && 
        this.manager.gameEngine.networkManager && 
        this.manager.gameEngine.networkManager.remotePlayers) {
      
      const remotePlayers = this.manager.gameEngine.networkManager.remotePlayers;
      
      // Only log if we actually have remote players to check
      if (remotePlayers.size > 0 && localPlayerIsDead) {
        console.log(`Checking ${remotePlayers.size} remote players for closest target. Local player dead: ${localPlayerIsDead}`);
      }
      
      // Loop through remote players to find the closest one that's alive
      remotePlayers.forEach((remotePlayer, playerId) => {
        // Skip dead remote players
        if (remotePlayer.isDead) {
          return;
        }
        
        if (remotePlayer.position) {
          const remotePlayerPos = new THREE.Vector3(
            remotePlayer.position.x,
            this.floorLevel,
            remotePlayer.position.z
          );
          
          const distance = this.instance.position.distanceTo(remotePlayerPos);
          
          // Prioritize remote players if local player is dead
          // OR if the remote player is simply closer
          if ((localPlayerIsDead && !remotePlayer.isDead) || distance < closestDistance) {
            closestPlayerPos = remotePlayerPos;
            closestDistance = distance;
            targetingRemotePlayer = true;
            
            if (localPlayerIsDead) {
              console.log(`Targeting living remote player ${playerId} at distance ${distance.toFixed(2)}`);
            }
          }
        }
      });
    }
    
    // If local player is dead and we didn't find any living remote players, move randomly
    if (localPlayerIsDead && !targetingRemotePlayer) {
      this.moveRandomly(deltaTime);
      return;
    }
    
    // Calculate direction to closest player (only on x and z axes)
    const direction = new THREE.Vector3().subVectors(
      closestPlayerPos,
      this.instance.position
    ).normalize();
    
    // Move towards closest player
    const step = this.speed * deltaTime;
    this.instance.position.x += direction.x * step;
    this.instance.position.z += direction.z * step;
    
    // Ensure y position is at floor level
    this.instance.position.y = this.floorLevel;
    
    // Look at closest player
    this.instance.lookAt(closestPlayerPos);
    
    // Keep inside room boundaries
    this.enforceRoomBoundaries();
  }

  /**
   * Try to attack player if in range
   */
  tryAttackPlayer() {
    // Check if we have a player reference
    if (!this.player) return;
    
    // Check cooldown
    const currentTime = performance.now() / 1000;
    if (currentTime - this.lastPlayerAttackTime < this.attackCooldown) {
      return;
    }
    
    // Start with local player
    let playerToAttack = this.player;
    let closestPlayerPos = new THREE.Vector3(
      this.player.camera.position.x,
      this.floorLevel,
      this.player.camera.position.z
    );
    
    let closestDistance = this.instance.position.distanceTo(closestPlayerPos);
    let foundCloserPlayer = false;
    let localPlayerIsDead = this.player.isDead;
    
    // Check for remote players via NetworkManager if we have access to game engine
    if (this.manager && this.manager.gameEngine && 
        this.manager.gameEngine.networkManager && 
        this.manager.gameEngine.networkManager.remotePlayers) {
      
      const remotePlayers = this.manager.gameEngine.networkManager.remotePlayers;
      
      // Loop through remote players to find the closest one that's alive
      remotePlayers.forEach((remotePlayer) => {
        // Skip dead remote players
        if (remotePlayer.isDead) {
          return;
        }
        
        if (remotePlayer.position) {
          const remotePlayerPos = new THREE.Vector3(
            remotePlayer.position.x,
            this.floorLevel,
            remotePlayer.position.z
          );
          
          const distance = this.instance.position.distanceTo(remotePlayerPos);
          
          // Prioritize remote players if local player is dead
          // OR if the remote player is simply closer
          if ((localPlayerIsDead && !remotePlayer.isDead) || distance < closestDistance) {
            closestPlayerPos = remotePlayerPos;
            closestDistance = distance;
            foundCloserPlayer = true;
          }
        }
      });
    }
    
    // If local player is dead and we didn't find any living remote players, don't attack
    if (localPlayerIsDead && !foundCloserPlayer) {
      return;
    }
    
    // Attack if close enough (1.5 units)
    if (closestDistance < 1.5) {
      // Apply damage to player only if it's the local player and they're not dead
      // (damage to remote players is handled by their own game instances)
      if (!foundCloserPlayer && !localPlayerIsDead) {
        this.player.takeDamage(this.playerDamage);
      }
      
      // Update last attack time
      this.lastPlayerAttackTime = currentTime;
      
      // Play attack animation
      this.playAttackAnimation();
    }
  }

  /**
   * Move randomly inside the room (fallback behavior if no player)
   * @param {number} deltaTime - Time elapsed since last update
   */
  moveRandomly(deltaTime) {
    // Simple random movement inside room
    const step = this.speed * 0.5 * deltaTime;
    
    // Random changes in direction
    if (Math.random() < 0.05) {
      this.instance.rotation.y += (Math.random() - 0.5) * Math.PI / 2;
    }
    
    // Move forward in facing direction
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.instance.quaternion);
    this.instance.position.x += direction.x * step;
    this.instance.position.z += direction.z * step;
    
    // Ensure y position is at floor level
    this.instance.position.y = this.floorLevel;
    
    // Keep inside room boundaries
    this.enforceRoomBoundaries();
  }

  /**
   * Enforce room boundaries to keep zombies inside the room
   */
  enforceRoomBoundaries() {
    const roomSize = 5; // Half of room width/depth
    
    if (Math.abs(this.instance.position.x) > roomSize - 1) {
      this.instance.position.x = Math.sign(this.instance.position.x) * (roomSize - 1);
      
      // If chasing player, don't turn around
      if (!this.player) {
        this.instance.rotation.y += Math.PI; // Turn around
      }
    }
    
    if (Math.abs(this.instance.position.z) > roomSize - 1) {
      this.instance.position.z = Math.sign(this.instance.position.z) * (roomSize - 1);
      
      // If chasing player, don't turn around
      if (!this.player) {
        this.instance.rotation.y += Math.PI; // Turn around
      }
    }
  }

  /**
   * Apply damage to the enemy
   * @param {number} damage - Amount of damage to apply
   */
  takeDamage(damage) {
    // Reduce health by damage amount
    this.health = Math.max(0, this.health - damage);
    
    // Update health bar
    this.updateHealthBar();
    
    // Play hit animation
    this.playHitAnimation();
    
    // Check if enemy is dead
    if (this.health <= 0 && !this.isDead) {
      this.die();
    }
  }

  /**
   * Play hit animation when taking damage
   */
  playHitAnimation() {
    // Flash body red
    const originalColors = [];
    
    // Store original colors and set to red
    Object.values(this.bodyParts).forEach(part => {
      if (part.material) {
        originalColors.push({
          part: part,
          color: part.material.color.clone()
        });
        
        // Set to red
        part.material.color.setHex(0xff0000);
      }
    });
    
    // Reset colors after 100ms
    setTimeout(() => {
      originalColors.forEach(item => {
        item.part.material.color.copy(item.color);
      });
    }, 100);
  }

  /**
   * Handle enemy death
   */
  die() {
    this.isDead = true;
    this.deathAnimationTime = 0;
    
    // Hide health bar
    if (this.healthBarContainer) {
      this.healthBarContainer.visible = false;
    }
    
    // Start death animation
    this.startDeathAnimation();
  }

  /**
   * Start death animation
   */
  startDeathAnimation() {
    // Change material to show dead state
    const deadMaterial = new THREE.MeshStandardMaterial({
      color: 0x555555, // Grayed out
      roughness: 1.0,
      metalness: 0.0,
      transparent: true,
      opacity: 1.0
    });
    
    // Apply to all body parts
    Object.values(this.bodyParts).forEach(part => {
      if (part.material) {
        part.material = deadMaterial.clone();
      }
    });
    
    // Fall to the ground
    this.instance.rotation.x = 0;
    this.instance.rotation.z = 0;
    
    // Randomly choose left/right fall direction
    this.fallDirection = Math.random() > 0.5 ? 1 : -1;
  }

  /**
   * Update death animation
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateDeathAnimation(deltaTime) {
    this.deathAnimationTime += deltaTime;
    
    // Fall over during first second
    if (this.deathAnimationTime < 1) {
      // Rotate to fall over
      this.instance.rotation.z += this.fallDirection * deltaTime * Math.PI / 2;
      
      // Limit rotation to 90 degrees
      if (Math.abs(this.instance.rotation.z) > Math.PI / 2) {
        this.instance.rotation.z = this.fallDirection * Math.PI / 2;
      }
    } 
    // Fade out after 2 seconds
    else if (this.deathAnimationTime > 2) {
      // Fade out
      const fadeAmount = Math.min(1, (this.deathAnimationTime - 2) / 2);
      
      // Apply to all body parts
      Object.values(this.bodyParts).forEach(part => {
        if (part.material && part.material.opacity) {
          part.material.opacity = 1 - fadeAmount;
        }
      });
      
      // Remove when fully faded
      if (fadeAmount >= 1) {
        this.remove();
      }
    }
  }

  /**
   * Remove enemy from scene
   */
  remove() {
    // Signal that this enemy can be removed from enemy manager
    this.markedForRemoval = true;
    
    // Hide instance
    this.instance.visible = false;
  }

  /**
   * Set target window
   * @param {Window} window - The window to target
   */
  setTargetWindow(window) {
    this.targetWindow = window;
    this.updateTargetPosition();
    this.positionOutsideWindow();
  }

  /**
   * Update sound effects based on timing
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateSoundEffects(deltaTime) {
    // Only play sounds if we have a player reference with audio capabilities
    if (!this.player || typeof this.player.playRandomZombieSound !== 'function') {
      return;
    }
    
    // Update sound timer
    this.lastSoundTime += deltaTime;
    
    // Check if it's time to play a sound
    if (this.lastSoundTime >= this.nextSoundTime) {
      // Get zombie position for potential spatial audio
      const zombiePosition = this.instance.position.clone();
      
      // Play a random zombie sound
      this.player.playRandomZombieSound(zombiePosition);
      
      // Reset sound timer with slight randomization
      this.lastSoundTime = 0;
      
      // Set next sound time with some variation (between 0.8 and 1.2 times the base frequency)
      const variation = 0.8 + Math.random() * 0.4;
      this.nextSoundTime = (1 / this.soundFrequency) * variation;
    }
  }

  /**
   * Make the enemy start moving (for animations and state sync)
   */
  startMoving() {
    this.isMoving = true;
    this.state = 'moving';
  }
  
  /**
   * Make the enemy start attacking (for animations and state sync)
   */
  startAttacking() {
    this.isAttacking = true;
    this.state = 'attacking';
    this.playAttackAnimation();
  }

  /**
   * Apply damage to the enemy (client version that also notifies the host)
   * This can be used when the client shoots a zombie, allowing for local feedback
   * while still keeping the host in control of the authoritative state
   * 
   * @param {number} damage - Amount of damage to apply
   * @param {boolean} isHeadshot - Whether this was a headshot
   * @param {NetworkManager} networkManager - Reference to network manager
   * @returns {number} The enemy's health after applying damage
   */
  clientTakeDamage(damage, isHeadshot, networkManager) {
    console.log("ENEMY: clientTakeDamage called with damage:", damage, "headshot:", isHeadshot);
    
    if (!damage || damage <= 0) {
      console.warn("ENEMY: Invalid damage value:", damage);
      return this.health;
    }
    
    // Save the original health for logging
    const originalHealth = this.health;
    
    // First apply damage locally for immediate feedback
    this.takeDamage(damage);
    console.log(`ENEMY: Local damage applied, health reduced from ${originalHealth} to ${this.health}`);
    
    // Record the pending action time to prevent host overrides
    this.lastDamageTime = Date.now();
    
    // Then notify the host if in multiplayer mode
    if (networkManager && networkManager.network && !networkManager.isHost) {
      console.log(`NETWORK: Client applying ${damage} damage to enemy ${this.id}, isHeadshot=${isHeadshot}, notifying host`);
      
      // Create action data with all necessary information
      const actionData = {
        enemyId: this.id,
        damage: damage,
        isHeadshot: isHeadshot,
        originalHealth: originalHealth,
        newHealth: this.health,
        isDead: this.health <= 0,
        timestamp: this.lastDamageTime
      };
      
      // Send with reliable delivery
      const actionId = networkManager.network.sendPlayerAction('damageEnemy', actionData);
      
      // Log the action ID and current health after applying local damage
      if (actionId) {
        console.log(`NETWORK: Sent damage action ${actionId} for enemy ${this.id}, local health now: ${this.health}`);
        
        // Store this action in the enemy for reference (optional)
        this.pendingDamageActions = this.pendingDamageActions || [];
        this.pendingDamageActions.push({
          actionId: actionId,
          timestamp: this.lastDamageTime,
          damage: damage,
          newHealth: this.health
        });
        
        // Limit the pending actions list to avoid memory growth
        if (this.pendingDamageActions.length > 10) {
          this.pendingDamageActions.shift(); // Remove oldest action
        }
      } else {
        console.warn(`NETWORK: Failed to send damage action for enemy ${this.id}`);
      }
    } else {
      console.warn("Not sending damage to host - network not available or client is host");
    }
    
    // Return local health for immediate feedback
    return this.health;
  }
} 