import * as THREE from 'three';
import { Enemy } from './Enemy';
import { CrawlingZombie } from './CrawlingZombie';
import { RunnerZombie } from './RunnerZombie';
import { SpitterZombie } from './SpitterZombie';

/**
 * Manages enemies in the game
 */
export class EnemyManager {
  constructor(scene, windows) {
    this.scene = scene;
    this.windows = windows;
    this.enemies = [];
    this.gameEngine = null; // Reference to game engine for network access
    
    // Round-based game settings
    this.currentRound = 0;
    this.zombiesRemaining = 0;
    this.zombiesSpawned = 0;
    this.roundActive = false;
    this.roundChangeDelay = 3; // seconds between rounds (reduced from 5)
    this.roundStartDelay = 2; // seconds before zombies start spawning in a new round (reduced from 3)
    this.timeSinceLastRound = 0;
    this.roundStartTime = 0;
    
    // Round state debugging and recovery
    this.lastStateCheck = 0;
    this.stateCheckInterval = 5; // Check every 5 seconds
    
    // Enemy settings that scale with rounds
    this.baseMaxEnemies = 7; // Reduced from 8
    this.maxEnemies = this.baseMaxEnemies;
    this.baseZombiesPerRound = 8; // Reduced from 10
    this.baseSpawnRate = 0.2; // Reduced from 0.25
    this.spawnRate = this.baseSpawnRate;
    this.lastSpawnTime = 0;
    
    this.isPaused = false;
    this.spawnEnabled = false; // Start with spawning disabled until first round
    
    // Player reference (will be set later)
    this.player = null;
    
    // Kill counter
    this.killCount = 0;
    this.killDisplay = null;
    
    // Round display
    this.roundDisplay = null;
  }

  /**
   * Set game engine reference
   * @param {Engine} gameEngine - Reference to the game engine
   */
  setGameEngine(gameEngine) {
    console.log("Setting game engine reference in EnemyManager");
    this.gameEngine = gameEngine;
    
    // Log network manager status if available
    if (gameEngine.networkManager) {
      console.log("EnemyManager received network manager with settings:", {
        gameMode: gameEngine.networkManager.gameMode,
        isMultiplayer: gameEngine.networkManager.isMultiplayer,
        isHost: gameEngine.networkManager.isHost
      });
    } else {
      console.log("EnemyManager: No network manager in game engine");
    }
    
    // Update reference for existing enemies
    this.enemies.forEach(enemy => {
      enemy.gameEngine = gameEngine;
    });
  }

  /**
   * Set player reference
   * @param {PlayerControls} player - Player to be chased by zombies
   */
  setPlayer(player) {
    this.player = player;
    
    // Update player reference for all existing enemies
    this.enemies.forEach(enemy => {
      enemy.setPlayer(this.player);
    });
  }

  /**
   * Initialize the enemy manager
   */
  init() {
    // Initialize time trackers
    this.lastSpawnTime = performance.now() / 1000;
    this.timeSinceLastRound = 0;
    
    // Create UI displays
    this.createKillDisplay();
    this.createRoundDisplay();
  }

  /**
   * Create kill counter display
   */
  createKillDisplay() {
    // Remove any existing kill counter
    const existingKillCounter = document.querySelector('.kill-counter');
    if (existingKillCounter) {
      document.body.removeChild(existingKillCounter);
    }

    // Create container for kill counter
    const killContainer = document.createElement('div');
    killContainer.className = 'kill-counter';
    killContainer.style.position = 'absolute';
    killContainer.style.top = '20px';
    killContainer.style.left = '20px';
    killContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    killContainer.style.color = 'white';
    killContainer.style.padding = '10px';
    killContainer.style.borderRadius = '5px';
    killContainer.style.fontFamily = 'Arial, sans-serif';
    killContainer.style.fontSize = '16px';
    killContainer.style.fontWeight = 'bold';
    killContainer.style.pointerEvents = 'none';
    killContainer.textContent = 'Kills: 0';
    killContainer.style.zIndex = '5'; // Ensure proper layer order
    
    // Add to document
    document.body.appendChild(killContainer);
    
    // Store reference
    this.killDisplay = killContainer;
  }

  /**
   * Create round display
   */
  createRoundDisplay() {
    // Remove any existing round display
    const existingRoundDisplay = document.querySelector('.round-display');
    if (existingRoundDisplay) {
      document.body.removeChild(existingRoundDisplay);
    }

    // Create container for round counter
    const roundContainer = document.createElement('div');
    roundContainer.className = 'round-display';
    roundContainer.style.position = 'absolute';
    roundContainer.style.top = '20px';
    roundContainer.style.right = '20px';
    roundContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    roundContainer.style.color = 'white';
    roundContainer.style.padding = '10px';
    roundContainer.style.borderRadius = '5px';
    roundContainer.style.fontFamily = 'Arial, sans-serif';
    roundContainer.style.fontSize = '16px';
    roundContainer.style.fontWeight = 'bold';
    roundContainer.style.pointerEvents = 'none';
    roundContainer.textContent = 'Round: 0';
    roundContainer.style.zIndex = '5'; // Ensure proper layer order
    
    // Add to document
    document.body.appendChild(roundContainer);
    
    // Store reference
    this.roundDisplay = roundContainer;
  }

  /**
   * Update all enemies
   * @param {number} deltaTime - Time elapsed since last update
   */
  update(deltaTime) {
    // Skip if paused - but add special handling for multiplayer case or forced updates
    if (this.isPaused && !this.forceContinueUpdates) {
      // In multiplayer, override the pause if there are living remote players
      let hasLivingRemotePlayers = false;
      
      if (this.player && this.player.isDead && this.gameEngine && this.gameEngine.networkManager) {
        const remotePlayers = this.gameEngine.networkManager.remotePlayers;
        if (remotePlayers && remotePlayers.size > 0) {
          remotePlayers.forEach(player => {
            if (!player.isDead) {
              hasLivingRemotePlayers = true;
            }
          });
        }
      }
      
      // If we're paused but there are living remote players, allow updates to continue
      if (!hasLivingRemotePlayers) {
        return; // Truly paused - no living players at all
      } else {
        console.log("EnemyManager is technically paused, but continuing updates for living remote players");
      }
    }
  
    // Force a network game state broadcast if we're forcing updates
    if (this.forceContinueUpdates && this.gameEngine && this.gameEngine.networkManager 
        && this.gameEngine.networkManager.network) {
      if (!this._lastForceBroadcastTime || (Date.now() - this._lastForceBroadcastTime > 1000)) {
        console.log("EnemyManager: Forcing a game state broadcast for remote players");
        this.gameEngine.networkManager.network.broadcastGameState(true);
        this._lastForceBroadcastTime = Date.now();
      }
    }
    
    // Check for enemy spawn
    this.checkEnemySpawn(deltaTime);
    
    // Update round state
    this.updateRoundState(deltaTime);
    
    // Update round timer
    this.updateRoundTimer(deltaTime);
    
    // Check consistency of round state
    this.checkRoundStateConsistency();
    
    // Check if there are living remote players when the host player is dead
    let hasLivingRemotePlayers = false;
    
    if (this.player && this.player.isDead && this.gameEngine && this.gameEngine.networkManager) {
      const remotePlayers = this.gameEngine.networkManager.remotePlayers;
      if (remotePlayers && remotePlayers.size > 0) {
        remotePlayers.forEach(player => {
          if (!player.isDead) {
            hasLivingRemotePlayers = true;
          }
        });
      }
      
      if (hasLivingRemotePlayers) {
        console.log("HOST PLAYER DEAD BUT REMOTE PLAYERS ALIVE: CONTINUING ENEMY UPDATES");
      }
    }
    
    // Flag to force enemies to continue updating
    const shouldForceUpdate = hasLivingRemotePlayers || this.forceContinueUpdates;
    
    // Update all existing enemies
    this.enemies.forEach(enemy => {
      // Update if:
      // 1. Enemy is flagged to force continue
      // 2. Host player is alive
      // 3. Host player is dead but there are living remote players
      // 4. We're forcing updates from the engine
      if (enemy._forceContinueUpdating || 
          (enemy.player === this.player && !this.player.isDead) ||
          shouldForceUpdate) {
        
        // Flag the enemy to continue updating regardless of local player state
        if (shouldForceUpdate) {
          enemy._forceContinueUpdating = true;
        }
        
        // Ensure enemy has correct player reference
        if (!enemy.player && this.player) {
          enemy.setPlayer(this.player);
        }
        
        // Update the enemy
        enemy.update(deltaTime);
      }
    });
    
    // Remove dead enemies that have completed their death animation
    this.removeDeadEnemies();
  }
  
  /**
   * Check round state consistency and check for host death condition
   */
  checkRoundStateConsistency() {
    const currentTime = performance.now() / 1000;
    
    // Only check periodically
    if (currentTime - this.lastStateCheck < this.stateCheckInterval) {
      return;
    }
    
    this.lastStateCheck = currentTime;
    
    // Check if host player is dead but there are living remote players
    const isHostDead = this.player && this.player.isDead;
    let hasLivingRemotePlayers = false;
    
    // Only check for remote players if we have access to the network manager
    if (this.gameEngine && this.gameEngine.networkManager) {
      const networkManager = this.gameEngine.networkManager;
      
      // Check if there are any remote players that are not dead
      if (networkManager.remotePlayers && networkManager.remotePlayers.size > 0) {
        networkManager.remotePlayers.forEach(remotePlayer => {
          if (!remotePlayer.isDead) {
            hasLivingRemotePlayers = true;
          }
        });
        
        if (hasLivingRemotePlayers && isHostDead) {
          console.log("CRITICAL: Host player is dead, but there are living remote players. Forcing enemies to continue.");
          
          // Force active state on enemies that might be stuck
          this.enemies.forEach(enemy => {
            if (enemy.state === 'idle' || !enemy.state) {
              enemy.state = 'moving';
              if (typeof enemy.startMoving === 'function') {
                enemy.startMoving();
              }
            }
            
            // Make sure enemies are forced to update regardless of player state
            enemy._forceContinueUpdating = true;
          });
          
          // Also ensure the gameEngine's P2PNetwork knows to keep broadcasting state
          if (this.gameEngine.networkManager.network) {
            // Force a broadcast to ensure everyone has the latest state
            this.gameEngine.networkManager.network.broadcastGameState(true);
          }
        }
      }
    }
    
    // Detect stuck round (no zombies left but round not ending)
    if (this.roundActive && this.zombiesRemaining <= 0 && this.enemies.length === 0) {
      console.warn("Detected stuck round - forcing round end");
      this.endRound();
      return;
    }
    
    // Detect stuck between rounds
    if (!this.roundActive && this.currentRound > 0 && this.timeSinceLastRound > this.roundChangeDelay * 2) {
      console.warn("Detected stuck between rounds - forcing next round");
      this.startNextRound();
      return;
    }
    
    // Detect stuck in round 1 with no zombies
    if (this.currentRound === 1 && this.zombiesRemaining <= 0 && this.enemies.length === 0) {
      console.warn("Detected stuck in round 1 - forcing round reset");
      
      // Force reset to working state
      this.roundActive = false;
      this.timeSinceLastRound = this.roundChangeDelay - 1; // Almost ready for next round
      
      // Update UI
      this.updateRoundDisplay(`Next Round in: 1`);
      
      return;
    }
  }
  
  /**
   * Update round state (handle transitions)
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateRoundState(deltaTime) {
    // Update time since last round
    this.timeSinceLastRound += deltaTime;
    
    // Check if we should start a new round
    if (!this.roundActive && this.timeSinceLastRound > this.roundChangeDelay) {
      // Check for living players before starting new round
      const isHostPlayerDead = this.player && this.player.isDead;
      let hasLivingRemotePlayers = false;
      
      // If host player is dead, check for living remote players
      if (isHostPlayerDead && this.gameEngine && this.gameEngine.networkManager) {
        const remotePlayers = this.gameEngine.networkManager.remotePlayers;
        if (remotePlayers && remotePlayers.size > 0) {
          remotePlayers.forEach(player => {
            if (!player.isDead) {
              hasLivingRemotePlayers = true;
            }
          });
        }
      }
      
      // Start next round if host player is alive OR there are living remote players
      if (!isHostPlayerDead || hasLivingRemotePlayers) {
        this.startNextRound();
      } else {
        console.log("Not starting new round - no living players");
      }
    }
    
    // Check if round is complete
    if (this.roundActive && this.zombiesRemaining <= 0 && this.enemies.length === 0) {
      this.endRound();
    }
  }
  
  /**
   * End the current round
   */
  endRound() {
    if (!this.roundActive) {
      console.log("Warning: Attempted to end round that was not active");
      return;
    }

    this.roundActive = false;
    this.spawnEnabled = false;
    this.timeSinceLastRound = 0;
    
    // Show round complete message
    this.showRoundCompleteMessage();
    
    console.log(`Round ${this.currentRound} completed`);
    
    // Safety mechanism - force next round if timer gets stuck
    // This ensures a new round starts even if something goes wrong
    this.safetyTimer = setTimeout(() => {
      if (!this.roundActive && this.currentRound > 0) {
        console.log("Safety timer triggered to start next round");
        this.startNextRound();
      }
    }, (this.roundChangeDelay + 1) * 1000);
  }
  
  /**
   * Start the next round
   */
  startNextRound() {
    // Clear any pending safety timer
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
  
    this.currentRound++;
    this.roundActive = true;
    this.timeSinceLastRound = 0;
    this.roundStartTime = performance.now() / 1000;
    
    // Calculate zombies for this round with more gradual scaling
    // Old formula: baseZombiesPerRound + (round-1) * 5 + Math.floor(round/4) * 6
    // New formula: baseZombiesPerRound + (round-1) * 3 + Math.floor(round/5) * 4
    const baseZombies = this.baseZombiesPerRound + (this.currentRound - 1) * 3; // Reduced from 5
    const bonusZombies = Math.floor(this.currentRound / 5) * 4; // Reduced from round/4 * 6
    
    // Apply spawnRateMultiplier to determine final zombie count
    const rawZombieCount = baseZombies + bonusZombies;
    this.zombiesRemaining = Math.max(5, Math.round(rawZombieCount * (this.spawnRateMultiplier || 1.0)));
    this.zombiesSpawned = 0;
    
    // Update max concurrent enemies with more gradual scaling
    // Old formula: baseMaxEnemies + Math.floor(round/2) + Math.floor(round/4)
    // New formula: baseMaxEnemies + Math.floor(round/3) + Math.floor(round/6)
    const baseMaxIncrease = Math.floor(this.currentRound / 3); // Reduced from round/2
    const bonusMaxIncrease = Math.floor(this.currentRound / 6); // Reduced from round/4
    
    // Calculate max enemies with multiplier
    const rawMaxEnemies = this.baseMaxEnemies + baseMaxIncrease + bonusMaxIncrease;
    this.maxEnemies = Math.max(3, Math.ceil(rawMaxEnemies * (this.spawnRateMultiplier || 1.0)));
    
    // Update spawn rate with more gradual scaling
    // Old formula: baseSpawnRate * (1 + round/4)
    // New formula: baseSpawnRate * (1 + round/6)
    this.spawnRate = this.baseSpawnRate * (1 + this.currentRound / 6); // Reduced from round/4
    
    // Apply multiplier for final spawn rate
    this.spawnRate *= (this.spawnRateMultiplier || 1.0);
    
    // Special mechanic for rounds 5, 10, 15, etc: burst spawning
    // Only enable in later rounds to give players more time to prepare
    if (this.currentRound % 5 === 0 && this.currentRound > 5) { // Only start at round 10 instead of 5
      // For milestone rounds, add a burst mechanic
      console.log(`Milestone round ${this.currentRound}: Enabling burst spawning!`);
      this.performBurstSpawn();
    }
    
    // Reset last spawn time so we don't wait too long for the first zombie
    this.lastSpawnTime = performance.now() / 1000 - (1 / this.spawnRate);
    
    // Enable spawning
    this.spawnEnabled = true;
    
    // Update round display
    this.updateRoundDisplay(`Round: ${this.currentRound}`);
    
    // Announce the new round
    this.showRoundStartMessage();
    
    console.log(`Round ${this.currentRound} started with ${this.zombiesRemaining} zombies, max concurrent: ${this.maxEnemies}, spawn rate: ${this.spawnRate.toFixed(2)}/sec`);
    
    // Force a zombie to spawn after the start delay to make sure rounds progress
    setTimeout(() => {
      if (this.roundActive && this.enemies.length === 0 && this.zombiesRemaining > 0) {
        console.log("Forcing initial zombie spawn for new round");
        const enemy = this.forceSpawnEnemy();
        if (enemy) {
          this.zombiesSpawned++;
          this.zombiesRemaining--;
        }
      }
    }, (this.roundStartDelay + 0.5) * 1000);
  }
  
  /**
   * Perform a burst spawn of multiple enemies at once
   */
  performBurstSpawn() {
    // Number of zombies to spawn in the burst - reduced count
    const burstCount = Math.min(4, Math.ceil(this.maxEnemies / 3)); // Reduced from 6 and maxEnemies/2
    
    // Give players a longer warning period
    const warningDelay = 5; // 5 seconds warning
    const spawnDelay = this.roundStartDelay + warningDelay;
    
    // Show a warning message to the player immediately
    this.showBurstWarningMessage();
    
    // Schedule a burst spawn after an extended delay
    setTimeout(() => {
      // Only proceed if the round is still active
      if (this.roundActive && this.zombiesRemaining > 0) {
        console.log(`Performing burst spawn of ${burstCount} zombies!`);
        
        // Show another warning message right before the spawn
        this.showBurstWarningMessage();
        
        // Flash the screen red as a final warning
        this.createScreenFlash('#ff0000');
        
        // Spawn fewer zombies at once
        for (let i = 0; i < burstCount; i++) {
          if (this.zombiesRemaining > 0) {
            const enemy = this.forceSpawnEnemy();
            if (enemy) {
              this.zombiesSpawned++;
              this.zombiesRemaining--;
              
              // Make burst zombies slightly tougher but less than before
              enemy.health *= 1.1; // Reduced from 1.2
              enemy.maxHealth = enemy.health;
              enemy.updateHealthBar();
              
              // Give them a distinctive color to warn players
              const burstMaterial = new THREE.MeshStandardMaterial({
                color: 0xCE2029, // Bright red that's more noticeable
                roughness: 0.8,
                metalness: 0.5 // More metallic for better visibility
              });
              
              // Apply the material to body parts properly
              enemy.instance.traverse((child) => {
                if (child.isMesh) {
                  // Store the original material if needed
                  if (!child.userData.originalMaterial) {
                    child.userData.originalMaterial = child.material;
                  }
                  
                  // Apply burst material to all mesh parts
                  // Create a unique instance of the material for each part
                  child.material = burstMaterial.clone();
                  
                  // For the head, we can make it slightly different if desired
                  if (child.name === "zombieHead") {
                    child.material.color.setHex(0x990000); // Slightly darker red for head
                  }
                }
              });
            }
          }
        }
      }
    }, spawnDelay * 1000);
  }

  /**
   * Show a warning message for burst spawns
   */
  showBurstWarningMessage() {
    // Create warning message element
    const warningMessage = document.createElement('div');
    warningMessage.textContent = 'WARNING: MULTIPLE ZOMBIES DETECTED!';
    warningMessage.style.position = 'absolute';
    warningMessage.style.top = '30%';
    warningMessage.style.left = '50%';
    warningMessage.style.transform = 'translate(-50%, -50%)';
    warningMessage.style.color = '#ff0000';
    warningMessage.style.fontFamily = 'Impact, fantasy';
    warningMessage.style.fontSize = '28px';
    warningMessage.style.fontWeight = 'bold';
    warningMessage.style.textAlign = 'center';
    warningMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    warningMessage.style.padding = '20px';
    warningMessage.style.borderRadius = '10px';
    warningMessage.style.zIndex = '1000';
    warningMessage.style.animation = 'pulse 0.5s infinite alternate';
    
    // Add pulsing animation style
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        from { opacity: 0.7; transform: translate(-50%, -50%) scale(1); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
      }
    `;
    document.head.appendChild(style);
    
    // Add to DOM
    document.body.appendChild(warningMessage);
    
    // Remove after 3 seconds
    setTimeout(() => {
      warningMessage.style.opacity = '0';
      warningMessage.style.transition = 'opacity 1s';
      
      // Remove from DOM after fade out
      setTimeout(() => {
        document.body.removeChild(warningMessage);
      }, 1000);
    }, 3000);
  }
  
  /**
   * Update the round display text
   * @param {string} text - Text to display
   */
  updateRoundDisplay(text) {
    if (this.roundDisplay) {
      this.roundDisplay.textContent = text;
      
      // Visual intensity increases with round number
      if (this.currentRound > 5) {
        // Increase text size and change color based on round
        const fontSize = Math.min(24, 16 + Math.floor(this.currentRound / 3));
        this.roundDisplay.style.fontSize = `${fontSize}px`;
        
        // Color gets more intense with rounds
        if (this.currentRound > 10) {
          this.roundDisplay.style.color = '#ff0000'; // Bright red
          this.roundDisplay.style.textShadow = '0 0 5px #ff0000';
        } else if (this.currentRound > 5) {
          this.roundDisplay.style.color = '#ff4400'; // Orange-red
        }
      }
    }
  }
  
  /**
   * Show round start message
   */
  showRoundStartMessage() {
    // Create dynamic message based on round number
    let message = `Round ${this.currentRound}`;
    let subtitle = '';
    
    // Add more dramatic messages for higher rounds
    if (this.currentRound >= 15) {
      const highRoundMessages = [
        "NIGHTMARE MODE",
        "HELL ON EARTH",
        "DEATH AWAITS",
        "NO ESCAPE",
        "THE HORDE COMES"
      ];
      subtitle = highRoundMessages[Math.floor(Math.random() * highRoundMessages.length)];
    } else if (this.currentRound >= 10) {
      const hardRoundMessages = [
        "THEY'RE GETTING STRONGER",
        "THE DEAD MARCH FORWARD",
        "CAN YOU SURVIVE?",
        "THE END DRAWS NEAR"
      ];
      subtitle = hardRoundMessages[Math.floor(Math.random() * hardRoundMessages.length)];
    } else if (this.currentRound >= 5) {
      const mediumRoundMessages = [
        "FIGHT HARDER",
        "THEY KEEP COMING",
        "STAND YOUR GROUND",
        "DON'T GIVE UP"
      ];
      subtitle = mediumRoundMessages[Math.floor(Math.random() * mediumRoundMessages.length)];
    }
    
    // Display the round announcement with title and subtitle
    this.showRoundAnnouncement(message, subtitle);
  }
  
  /**
   * Show round complete message
   */
  showRoundCompleteMessage() {
    // Create element for round complete message
    let message = `Round ${this.currentRound} Complete`;
    let subtitle = '';
    
    // Add different messages based on round completion
    if (this.currentRound >= 15) {
      const highRoundMessages = [
        "BUT HELL ISN'T FINISHED WITH YOU",
        "THE NIGHTMARE CONTINUES",
        "BRIEF RESPITE FROM DEATH",
        "THEY WILL RETURN STRONGER"
      ];
      subtitle = highRoundMessages[Math.floor(Math.random() * highRoundMessages.length)];
    } else if (this.currentRound >= 10) {
      const hardRoundMessages = [
        "PREPARE FOR WORSE",
        "THEY'LL BE BACK",
        "REINFORCE THE WINDOWS",
        "CATCH YOUR BREATH WHILE YOU CAN"
      ];
      subtitle = hardRoundMessages[Math.floor(Math.random() * hardRoundMessages.length)];
    } else if (this.currentRound >= 5) {
      const mediumRoundMessages = [
        "MORE COMING SOON",
        "GET READY",
        "BRIEF RESPITE",
        "THEY'RE REGROUPING"
      ];
      subtitle = mediumRoundMessages[Math.floor(Math.random() * mediumRoundMessages.length)];
    } else {
      subtitle = "Get ready for the next wave";
    }
    
    // Display the round announcement
    this.showRoundAnnouncement(message, subtitle, true);
  }

  /**
   * Show dramatic round announcement
   * @param {string} title - Main announcement text
   * @param {string} subtitle - Secondary text (optional)
   * @param {boolean} isComplete - Whether this is a round completion message
   */
  showRoundAnnouncement(title, subtitle = '', isComplete = false) {
    // Create container for the announcement
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '40%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.textAlign = 'center';
    container.style.zIndex = '1000';
    container.style.width = '100%';
    container.style.pointerEvents = 'none';
    
    // Create title element
    const titleElement = document.createElement('div');
    titleElement.textContent = title;
    titleElement.style.fontFamily = 'Impact, fantasy';
    titleElement.style.fontSize = '48px';
    
    // Set different styling based on whether it's a round start or complete message
    if (isComplete) {
      titleElement.style.color = '#00ff00'; // Green for completion
      titleElement.style.textShadow = '0 0 10px #00ff00, 0 0 20px #006600';
    } else {
      // Scale color intensity with round number
      if (this.currentRound >= 15) {
        titleElement.style.color = '#ff0000'; // Bright red for high rounds
        titleElement.style.textShadow = '0 0 10px #ff0000, 0 0 20px #990000';
        titleElement.style.fontSize = '56px'; // Bigger for higher rounds
      } else if (this.currentRound >= 10) {
        titleElement.style.color = '#ff4400'; // Orange-red for medium-high rounds
        titleElement.style.textShadow = '0 0 10px #ff4400';
        titleElement.style.fontSize = '52px';
      } else if (this.currentRound >= 5) {
        titleElement.style.color = '#ff6600'; // Orange for medium rounds
        titleElement.style.textShadow = '0 0 5px #ff6600';
      } else {
        titleElement.style.color = '#ffffff'; // White for early rounds
        titleElement.style.textShadow = '0 0 5px #ff0000';
      }
    }
    
    container.appendChild(titleElement);
    
    // Create subtitle element if provided
    if (subtitle) {
      const subtitleElement = document.createElement('div');
      subtitleElement.textContent = subtitle;
      subtitleElement.style.fontFamily = 'Impact, fantasy';
      subtitleElement.style.fontSize = '24px';
      subtitleElement.style.color = '#ffffff';
      subtitleElement.style.marginTop = '10px';
      subtitleElement.style.textShadow = '0 0 5px #000000';
      container.appendChild(subtitleElement);
    }
    
    // Add animation
    container.style.opacity = '0';
    container.style.transition = 'all 0.5s';
    
    // Add to document
    document.body.appendChild(container);
    
    // Trigger animation
    setTimeout(() => {
      container.style.opacity = '1';
      titleElement.style.transform = 'scale(1.1)';
      titleElement.style.transition = 'transform 0.3s';
    }, 100);
    
    // For intense rounds, add screen flash effect
    if (this.currentRound >= 10 && !isComplete) {
      this.createScreenFlash(isComplete ? '#00ff00' : '#ff0000');
    }
    
    // Remove after delay
    setTimeout(() => {
      container.style.opacity = '0';
      container.style.transform = 'translate(-50%, -60%)';
      
      // Remove from DOM after fade out
      setTimeout(() => {
        if (document.body.contains(container)) {
          document.body.removeChild(container);
        }
      }, 1000);
    }, 3000);
  }
  
  /**
   * Create brief screen flash effect
   * @param {string} color - Color of the flash
   */
  createScreenFlash(color = '#ff0000') {
    // Create flash element
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.backgroundColor = color;
    flash.style.opacity = '0.3';
    flash.style.zIndex = '999';
    flash.style.pointerEvents = 'none';
    
    // Add to document
    document.body.appendChild(flash);
    
    // Fade out
    flash.style.transition = 'opacity 0.5s';
    
    // Start fade out
    setTimeout(() => {
      flash.style.opacity = '0';
      
      // Remove after fade
      setTimeout(() => {
        if (document.body.contains(flash)) {
          document.body.removeChild(flash);
        }
      }, 500);
    }, 100);
  }

  /**
   * Check if we should spawn new enemies
   * @param {number} deltaTime - Time elapsed since last update
   */
  checkEnemySpawn(deltaTime) {
    // Only check if round is active and there are zombies to spawn
    if (this.roundActive && this.zombiesRemaining > 0) {
      // Only spawn after the initial delay
      const currentTime = performance.now() / 1000;
      if (currentTime - this.roundStartTime >= this.roundStartDelay) {
        this.trySpawnEnemy();
        
        // If there are no enemies but we have zombies left to spawn,
        // force a spawn after waiting for a bit (potential fix for stuck zombies)
        if (this.enemies.length === 0 && currentTime - this.lastSpawnTime > 5) {
          const enemy = this.forceSpawnEnemy();
          if (enemy) {
            this.zombiesSpawned++;
            this.zombiesRemaining--;
            this.lastSpawnTime = currentTime;
          }
        }
      }
    }
  }
  
  /**
   * Update the round timer and UI
   * @param {number} deltaTime - Time elapsed since last update
   */
  updateRoundTimer(deltaTime) {
    // Update the round timer if the round is not active
    if (!this.roundActive && this.currentRound > 0) {
      // Calculate time left until next round
      const timeLeft = Math.max(0, this.roundChangeDelay - this.timeSinceLastRound);
      const roundsLeft = Math.ceil(timeLeft);
      
      // Update the round timer UI
      this.updateRoundDisplay(`Next Round in: ${roundsLeft}`);
    }
  }

  /**
   * Try to spawn a new enemy based on spawn rate
   */
  trySpawnEnemy() {
    if (!this.spawnEnabled) {
      return;
    }
    
    // Check if we can spawn based on max concurrent enemies
    if (this.enemies.length >= this.maxEnemies) {
      return;
    }
    
    // Check if we have zombies left to spawn for this round
    if (this.zombiesRemaining <= 0) {
      return;
    }
    
    // Check if we can spawn based on time
    const currentTime = performance.now() / 1000;
    if (currentTime - this.lastSpawnTime >= 1 / this.spawnRate) {
      // In later rounds, we might spawn multiple enemies at once
      let enemiesToSpawn = 1;
      
      // After round 3, there's a chance to spawn multiple zombies at once
      if (this.currentRound > 3) { // Changed from 2 to 3 to delay multi-spawns
        // Calculate chance of multi-spawn (increases with rounds)
        const multiSpawnChance = Math.min(0.6, 0.12 + (this.currentRound * 0.025)); // Reduced from 0.7, 0.15, and 0.03
        
        if (Math.random() < multiSpawnChance) {
          // Determine how many to spawn (scales with round)
          const maxMultiSpawn = Math.min(
            5, // Never more than 5 at once (increased from 3)
            Math.floor(this.currentRound / 4) + 1 // 1 extra zombie per 4 rounds (changed from 5)
          );
          
          enemiesToSpawn = Math.min(
            maxMultiSpawn,
            this.zombiesRemaining, // Don't spawn more than we have left
            this.maxEnemies - this.enemies.length // Don't exceed max concurrent enemies
          );
          
          if (enemiesToSpawn > 1) {
            console.log(`Multi-spawn triggered! Spawning ${enemiesToSpawn} zombies at once.`);
          }
        }
      }
      
      // Spawn the calculated number of enemies
      for (let i = 0; i < enemiesToSpawn; i++) {
        const enemy = this.spawnEnemy();
        
        if (enemy) {
          // Only update spawn time on first enemy to maintain overall spawn rate
          if (i === 0) {
            this.lastSpawnTime = currentTime;
          }
          
          this.zombiesSpawned++;
          this.zombiesRemaining--;
          
          // If we've spawned all remaining zombies, exit loop
          if (this.zombiesRemaining <= 0) {
            break;
          }
        }
      }
    }
  }

  /**
   * Force spawn a new enemy even if at max enemies
   * @param {Window} targetWindow - Optional specific window to target
   * @returns {Enemy} The spawned enemy or null if error
   */
  forceSpawnEnemy(targetWindow) {
    // Safety check
    if (!this.windows || this.windows.length === 0) {
      return null;
    }
    
    try {
      // Use provided target window or pick a random window
      if (!targetWindow) {
        const randomWindowIndex = Math.floor(Math.random() * this.windows.length);
        targetWindow = this.windows[randomWindowIndex];
      }
      
      if (!targetWindow) {
        return null;
      }
      
      // Determine enemy type based on probabilities that change with rounds
      // The higher the round, the more special zombies appear
      
      // Crawler chance increases with rounds (up to 35%)
      const crawlerChance = Math.min(0.35, 0.05 + (this.currentRound * 0.02)); // Increased scaling
      
      // Runner chance increases with rounds (up to 30%)
      const runnerChance = Math.min(0.30, 0.03 + (this.currentRound * 0.025)); // Increased scaling
      
      // Spitter chance increases with rounds (up to 25%)
      const spitterChance = Math.min(0.25, 0.02 + (this.currentRound * 0.02)); // Increased scaling
      
      // Random value to determine enemy type
      const rand = Math.random();
      
      let enemy;
      let enemyType = "standard";
      
      // Create the appropriate enemy type
      if (rand < crawlerChance) {
        // Spawn a crawler
        enemy = new CrawlingZombie(targetWindow);
        enemyType = "crawler";
      } else if (rand < crawlerChance + runnerChance) {
        // Spawn a runner
        enemy = new RunnerZombie(targetWindow);
        enemyType = "runner";
      } else if (rand < crawlerChance + runnerChance + spitterChance) {
        // Spawn a spitter
        enemy = new SpitterZombie(targetWindow);
        enemyType = "spitter";
      } else {
        // Spawn a standard zombie
        enemy = new Enemy(targetWindow);
      }
      
      // Make sure the enemy has an ID for network synchronization
      if (!enemy.id) {
        enemy.id = `enemy_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
      }
      
      // Set state property for synchronized animations
      enemy.state = 'idle';
      
      enemy.init();
      enemy.positionOutsideWindow();
      
      // Set manager reference for pausing
      enemy.manager = this;
      
      // Set game engine reference if available
      if (this.gameEngine) {
        enemy.gameEngine = this.gameEngine;
      }
      
      // Set player reference if available
      if (this.player) {
        enemy.setPlayer(this.player);
      }
      
      // Add to scene
      if (this.scene) {
        if (typeof this.scene.add === 'function') {
          this.scene.add(enemy.instance);
        } else if (this.scene.instance && typeof this.scene.instance.add === 'function') {
          this.scene.instance.add(enemy.instance);
        } else {
          return null;
        }
      } else {
        return null;
      }
      
      // Add to tracking array
      this.enemies.push(enemy);
      
      // Log special enemy types if in debug mode
      if (this.currentRound > 1 && enemyType !== "standard") {
        console.log(`Spawned a ${enemyType} zombie!`);
      }
      
      // Apply round-based scaling based on enemy type with less aggressive scaling
      if (enemyType === "standard") {
        // Standard zombie scaling - more gradual increase
        const baseSpeed = 0.5;
        const roundSpeedBonus = this.currentRound * 0.04; // Reduced from 0.07
        const milestoneSpeedBonus = Math.floor(this.currentRound / 6) * 0.08; // Reduced from round/5 * 0.1
        enemy.speed = baseSpeed + roundSpeedBonus + milestoneSpeedBonus;
        
        // Lower cap on speed
        enemy.speed = Math.min(enemy.speed, 2.0); // Reduced from 2.5
        
        // Health scaling - more gradual increase
        const baseHealth = 80; // Reduced from 100
        const roundHealthBonus = this.currentRound * 3; // Reduced from 5
        const milestoneHealthBonus = Math.floor(this.currentRound / 4) * 10; // Reduced from round/3 * 20
        enemy.health = baseHealth + roundHealthBonus + milestoneHealthBonus;
        
        // Attack scaling - more gradual increase
        const baseAttack = 20; // Reduced from 25
        const roundAttackBonus = this.currentRound * 1; // Reduced from 2
        const milestoneAttackBonus = Math.floor(this.currentRound / 4) * 3; // Reduced from round/3 * 5
        enemy.playerDamage = Math.min(60, baseAttack + roundAttackBonus + milestoneAttackBonus); // Reduced cap from 75
      } 
      else if (enemyType === "crawler") {
        // Crawler zombie scaling - slower speed increase
        const baseSpeed = 0.3;
        const roundSpeedBonus = this.currentRound * 0.02; // Reduced from 0.04
        enemy.speed = baseSpeed + roundSpeedBonus;
        
        // Lower cap on crawler speed
        enemy.speed = Math.min(enemy.speed, 1.2); // Reduced from 1.5
        
        // Health scaling - more gradual increase
        const baseHealth = 65; // Reduced from 75
        const roundHealthBonus = this.currentRound * 2; // Reduced from 4
        const milestoneHealthBonus = Math.floor(this.currentRound / 5) * 8; // Reduced from round/4 * 15
        enemy.health = baseHealth + roundHealthBonus + milestoneHealthBonus;
        
        // Attack scaling - more gradual increase
        const baseAttack = 12; // Reduced from 15
        const roundAttackBonus = this.currentRound * 0.8; // Reduced from 1.5
        const milestoneAttackBonus = Math.floor(this.currentRound / 5) * 2; // Reduced from round/4 * 4
        enemy.playerDamage = Math.min(45, baseAttack + roundAttackBonus + milestoneAttackBonus); // Reduced cap from 60
      }
      else if (enemyType === "runner") {
        // Runner zombie scaling - more gradual increase
        const baseSpeed = 1.0; // Reduced from 1.2
        const roundSpeedBonus = this.currentRound * 0.05; // Reduced from 0.08
        enemy.speed = baseSpeed + roundSpeedBonus;
        
        // Lower cap on runner speed
        enemy.speed = Math.min(enemy.speed, 2.2); // Reduced from 3.0
        
        // Health scaling - more gradual increase
        const baseHealth = 50; // Reduced from 60
        const roundHealthBonus = this.currentRound * 1.5; // Reduced from 3
        const milestoneHealthBonus = Math.floor(this.currentRound / 6) * 6; // Reduced from round/5 * 10
        enemy.health = baseHealth + roundHealthBonus + milestoneHealthBonus;
        
        // Attack scaling - more gradual increase
        const baseAttack = 18; // Reduced from 20
        const roundAttackBonus = this.currentRound * 1; // Reduced from 2
        const milestoneAttackBonus = Math.floor(this.currentRound / 4) * 3; // Reduced from round/3 * 5
        enemy.playerDamage = Math.min(55, baseAttack + roundAttackBonus + milestoneAttackBonus); // Reduced cap from 70
      }
      else if (enemyType === "spitter") {
        // Spitter zombie scaling - more gradual increase
        const baseSpeed = 0.35; // Reduced from 0.4
        const roundSpeedBonus = this.currentRound * 0.02; // Reduced from 0.03
        enemy.speed = baseSpeed + roundSpeedBonus;
        
        // Lower cap on spitter speed
        enemy.speed = Math.min(enemy.speed, 1.0); // Reduced from 1.2
        
        // Health scaling - more gradual increase
        const baseHealth = 60; // Reduced from 70
        const roundHealthBonus = this.currentRound * 2; // Reduced from 3.5
        const milestoneHealthBonus = Math.floor(this.currentRound / 5) * 7; // Reduced from round/4 * 12
        enemy.health = baseHealth + roundHealthBonus + milestoneHealthBonus;
        
        // Projectile damage scaling - more gradual increase
        const baseAttack = 12; // Reduced from 15
        const roundAttackBonus = this.currentRound * 1.5; // Reduced from 2.5
        const milestoneAttackBonus = Math.floor(this.currentRound / 4) * 5; // Reduced from round/3 * 8
        enemy.playerDamage = Math.min(50, baseAttack + roundAttackBonus + milestoneAttackBonus); // Reduced cap from 80
        
        // Increase projectile speed in later rounds - more gradual increase
        if (enemy.projectileSpeed) {
          enemy.projectileSpeed = 4.0 + (this.currentRound * 0.1); // Reduced from 5.0 + round * 0.2
          enemy.projectileSpeed = Math.min(enemy.projectileSpeed, 7.0); // Reduced cap from 10.0
        }
        
        // Increase attack rate in later rounds - start later and scale more gradually
        if (this.currentRound > 9) { // Start at round 10 instead of 8
          enemy.attackRate = Math.min(2.8, 2.0 + (this.currentRound * 0.06)); // Reduced from 3.5 max and 0.1 scaling
        }
      }
      
      // Apply the health multiplier to the final health
      if (this.healthMultiplier !== undefined) {
        enemy.health *= this.healthMultiplier;
        enemy.maxHealth = enemy.health;
      }
      
      // Apply the speed multiplier to the final speed
      if (this.speedMultiplier !== undefined) {
        enemy.speed *= this.speedMultiplier;
      }
      
      return enemy;
    } catch (error) {
      console.error("Error in forceSpawnEnemy:", error);
      return null;
    }
  }

  /**
   * Attempt to spawn a new enemy if conditions are right
   * @param {number} x - Optional specific x position
   * @param {number} y - Optional specific y position
   * @param {number} z - Optional specific z position
   * @param {string} id - Optional specific enemy ID for network sync
   * @returns {Enemy} The spawned enemy or null if conditions not met
   */
  spawnEnemy(x, y, z, id) {
    // Skip if spawning is disabled or we're at max enemies
    if (!this.spawnEnabled || this.enemies.length >= this.maxEnemies) {
      return null;
    }
    
    // Skip if no zombies left to spawn
    if (this.zombiesRemaining <= 0) {
      return null;
    }
    
    // Safety check
    if (!this.windows || this.windows.length === 0) {
      console.error("No windows available for enemy spawn!");
      return null;
    }
    
    try {
      // Find best window for zombie to target
      const targetWindow = this.findBestWindowTarget();
      
      if (!targetWindow) {
        console.error("No valid target window found for enemy spawn!");
        return null;
      }
      
      // Force spawn the enemy
      const enemy = this.forceSpawnEnemy(targetWindow);
      
      // If enemy creation was successful and we have specified position/ID, set them
      if (enemy) {
        // If x, y, z are provided, position the enemy there
        if (x !== undefined && y !== undefined && z !== undefined) {
          enemy.instance.position.set(x, y, z);
        }
        
        // If an ID is provided, set it (for network synchronization)
        if (id) {
          enemy.id = id;
        }
      }
      
      return enemy;
    } catch (error) {
      console.error("Error spawning enemy:", error);
      return null;
    }
  }

  /**
   * Find the best window for a new zombie to target
   * @returns {Window} The selected target window
   */
  findBestWindowTarget() {
    try {
      // Safety check
      if (!this.windows || !Array.isArray(this.windows) || this.windows.length === 0) {
        console.error("Invalid windows array:", this.windows);
        return null;
      }
      
      // Sort windows by boarding level (least boarded first)
      const sortedWindows = [...this.windows].sort((a, b) => {
        return a.boardsCount - b.boardsCount;
      });
      
      // If there's only one window, just return it
      if (sortedWindows.length === 1) {
        return sortedWindows[0];
      }
      
      // Simplified selection - just pick randomly from the available windows
      const randomIndex = Math.floor(Math.random() * sortedWindows.length);
      return sortedWindows[randomIndex];
    } catch (error) {
      console.error("Error in findBestWindowTarget:", error);
      return null;
    }
  }

  /**
   * Remove dead enemies from the scene and array
   */
  removeDeadEnemies() {
    // Find all enemies marked for removal
    const deadEnemies = this.enemies.filter(enemy => enemy.markedForRemoval);
    
    if (deadEnemies.length > 0) {
      // Update kill count
      this.killCount += deadEnemies.length;
      this.updateKillDisplay();
      
      // Log for debugging round completion
      console.log(`Removed ${deadEnemies.length} dead enemies. Remaining: ${this.enemies.length - deadEnemies.length}, Zombies left to spawn: ${this.zombiesRemaining}`);
      
      // Award points for any zombie deaths not already counted (e.g., bleed out after being shot)
      if (this.player && typeof this.player.addPoints === 'function') {
        // Get dead enemies that died but weren't directly killed by the player's shot
        // (the player already gets points directly when they kill with a shot)
        const bleedOutEnemies = deadEnemies.filter(enemy => 
          enemy.isDead && 
          !enemy.pointsAwarded // We need to track if points were already awarded
        );
        
        if (bleedOutEnemies.length > 0) {
          // Award 25 points per zombie that bled out
          bleedOutEnemies.forEach(enemy => {
            this.player.addPoints(25, true, false);
            enemy.pointsAwarded = true;
          });
        }
      }
      
      // Remove from scene
      deadEnemies.forEach(enemy => {
        if (this.scene) {
          if (typeof this.scene.remove === 'function') {
            this.scene.remove(enemy.instance);
          } else if (this.scene.instance && typeof this.scene.instance.remove === 'function') {
            this.scene.instance.remove(enemy.instance);
          }
        }
      });
      
      // Remove from array
      this.enemies = this.enemies.filter(enemy => !enemy.markedForRemoval);
      
      // Check if this was the last enemy and no more to spawn
      if (this.enemies.length === 0 && this.zombiesRemaining <= 0 && this.roundActive) {
        console.log("Last enemy removed - ending round");
        this.endRound();
      }
    }
  }

  /**
   * Update the kill counter display
   */
  updateKillDisplay() {
    if (this.killDisplay) {
      this.killDisplay.textContent = `Kills: ${this.killCount}`;
    }
  }

  /**
   * Toggle enemy spawning
   * @param {boolean} enable - Whether to enable spawning
   */
  toggleSpawning(enable) {
    this.spawnEnabled = enable;
    
    // If enabling spawning, start the first round
    if (enable && this.currentRound === 0) {
      this.startNextRound();
    }
  }

  /**
   * Pause/unpause all enemy movement
   * @param {boolean} isPaused - Whether to pause enemies
   */
  setPaused(isPaused) {
    // Log state change
    console.log(`EnemyManager: Setting paused state to ${isPaused}`);
    
    // Check if we're in multiplayer with living remote players
    let hasLivingRemotePlayers = false;
    if (this.gameEngine && this.gameEngine.networkManager) {
      const networkManager = this.gameEngine.networkManager;
      
      if (networkManager.remotePlayers && networkManager.remotePlayers.size > 0) {
        networkManager.remotePlayers.forEach(player => {
          if (!player.isDead) {
            hasLivingRemotePlayers = true;
          }
        });
      }
    }
    
    // In multiplayer, if we're pausing but there are living remote players
    if (isPaused && hasLivingRemotePlayers && this.gameEngine && this.gameEngine.networkManager) {
      console.log("EnemyManager: Not fully pausing because there are living remote players");
      
      // Ensure game state continues to broadcast
      if (this.gameEngine.networkManager.network && 
          this.gameEngine.networkManager.network.broadcastGameState) {
        console.log("EnemyManager: Forcing a game state broadcast to keep remote clients updated");
        this.gameEngine.networkManager.network.broadcastGameState(true);
      }
    }
    
    // Set the pause state
    this.isPaused = isPaused;
  }

  /**
   * Remove all enemies
   */
  clearEnemies() {
    // Remove all enemies from scene
    this.enemies.forEach(enemy => {
      if (this.scene) {
        if (typeof this.scene.remove === 'function') {
          this.scene.remove(enemy.instance);
        } else if (this.scene.instance && typeof this.scene.instance.remove === 'function') {
          this.scene.instance.remove(enemy.instance);
        }
      }
    });
    
    // Clear array
    this.enemies = [];
  }

  /**
   * Despawn all enemies with death animations
   */
  despawnAllEnemies() {
    console.log("Despawning all enemies");
    
    // Make all enemies die, which will trigger their death animations
    this.enemies.forEach(enemy => {
      if (!enemy.isDead) {
        enemy.die();
        
        // Force remove after a short delay to avoid waiting for full death animation
        setTimeout(() => {
          enemy.remove();
        }, 500);
      }
    });
    
    // Force clear after a brief delay to ensure all are removed
    setTimeout(() => {
      this.clearEnemies();
    }, 600);
  }
} 
 
 
 
 