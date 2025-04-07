/**
 * NetworkManager class
 * Manages multiplayer sessions and coordinates network activities
 */
import * as THREE from 'three';
import { P2PNetwork } from './P2PNetwork.js';
import { Enemy } from '../objects/Enemy.js';
import { CrawlingZombie } from '../objects/CrawlingZombie.js';
import { RunnerZombie } from '../objects/RunnerZombie.js';
import { SpitterZombie } from '../objects/SpitterZombie.js';

export class NetworkManager {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.network = null;
    this.gameMode = 'singleplayer'; // 'singleplayer', 'host', or 'client'
    this.remotePlayers = new Map(); // Map of player IDs to player objects
    this.playerModels = new Map(); // Map of player IDs to their 3D models
    this.hostId = null;
    this.isHost = false;
    this.isConnected = false;
    this.isMultiplayer = false;
    this.lastPositionUpdate = 0;
    this.positionUpdateInterval = 50; // Reduced from 100ms for smoother updates
    this.connectionStatusElement = null;
    
    // For server list feature
    this.serverListUpdateInterval = null;
    this.serverName = "Game Server #" + Math.floor(Math.random() * 1000);
    this.serverUniqueId = null;
    this.serverListApiUrl = '/api/servers';
    this.isServerRegistered = false;
  }
  
  /**
   * Initialize the network manager
   */
  init() {
    console.log("*** Initializing NetworkManager ***");
    console.log("Current state: gameMode:", this.gameMode, "isHost:", this.isHost, "isMultiplayer:", this.isMultiplayer);
    this.createStatusElement();
    
    // Log a clear message to confirm this is being called
    console.log("NetworkManager initialization complete - you should see this message in the console");
  }
  
  /**
   * Start a singleplayer game
   */
  startSingleplayer() {
    console.log("Starting singleplayer game");
    this.gameMode = 'singleplayer';
    this.isMultiplayer = false;
    
    // Disconnect any existing network
    if (this.network) {
      this.network.disconnect();
      this.network = null;
    }
    
    // Reset remote player data
    this.remotePlayers.clear();
    this.cleanupPlayerModels();
    
    this.updateConnectionStatus('Singleplayer');
    
    // Start the game
    this.gameEngine.startGame();
  }
  
  /**
   * Start a multiplayer game as the host
   */
  async startHosting() {
    console.log("Starting as host");
    this.gameMode = 'host';
    this.isMultiplayer = true;
    this.isHost = true;
    
    this.updateConnectionStatus('Setting up host...');
    
    // Create new network if needed
    if (!this.network) {
      this.network = new P2PNetwork(this.gameEngine);
      this.setupNetworkCallbacks();
    }
    
    // Initialize as host
    try {
      const hostId = await this.network.initHost();
      this.hostId = hostId;
      this.isConnected = true;
      
      // Register this server in the server list
      await this.registerServer(hostId);
      
      // Start the game immediately - don't wait for clients
      console.log("Starting the game as a host");
      this.gameEngine.startGame();
      
      // Start game state updates
      this.network.startGameStateUpdates();
      
      // Important: Only start sending position updates AFTER the connection is established
      // This fixes the "Connection is not open" error
      setTimeout(() => {
        // Starting position updates with a slight delay to ensure connection is ready
      this.startPositionUpdates();
        console.log("Started sending position updates after host connection established");
      }, 1000); // 1 second delay to ensure connection is fully established
      
      this.updateConnectionStatus(`Hosting (ID: ${this.truncateId(hostId)})`);
    } catch (err) {
      console.error("Failed to start hosting:", err);
      this.updateConnectionStatus('Failed to start hosting');
      this.showErrorDialog("Failed to start hosting: " + err.message);
    }
  }
  
  /**
   * Join a multiplayer game with the given host ID
   * @param {string} hostId - The host ID to join
   */
  async joinGame(hostId) {
    if (!hostId) {
      // Show server list instead of join dialog
      this.showServerListDialog();
      return;
    }
    
    console.log("*** JOINING GAME ***");
    console.log("Joining game with host ID:", hostId);
    console.log("Network settings before joining:", {
      gameMode: this.gameMode,
      isMultiplayer: this.isMultiplayer,
      isHost: this.isHost
    });
    
    // No loading screen - removed to prevent issues where it remains visible
    
    this.gameMode = 'client';
    this.isMultiplayer = true;
    this.isHost = false;
    this.hostId = hostId;
    this.hostDeclaredGameOver = false; // Track if host considered game over
    
    console.log("Network settings after update:", {
      gameMode: this.gameMode,
      isMultiplayer: this.isMultiplayer,
      isHost: this.isHost
    });
    
    this.updateConnectionStatus('Connecting...');
    
    // Create new network if needed
    if (!this.network) {
      console.log("Creating new P2PNetwork instance for client");
      this.network = new P2PNetwork(this.gameEngine);
      this.setupNetworkCallbacks();
    }
    
    // Join the game
    try {
      await this.network.joinGame(hostId);
      this.isConnected = true;
      
      console.log("Successfully connected to host, client mode activated");
      console.log("Final network settings:", {
        gameMode: this.gameMode,
        isMultiplayer: this.isMultiplayer,
        isHost: this.isHost,
        isConnected: this.isConnected
      });
      
      // Pre-initialize sound effects before starting game
      // This fixes the sound effect bug on client join
      if (this.gameEngine.soundManager) {
        console.log("Pre-loading sound effects for client");
        await this.gameEngine.soundManager.preloadSounds();
      }
      
      // Start the game on the client side
      console.log("Starting the game as a client");
      this.gameEngine.startGame();
      
      // Start position updates as soon as connected
      this.startPositionUpdates();
      
      this.updateConnectionStatus(`Connected to ${this.truncateId(hostId)}`);
    } catch (err) {
      console.error("Failed to join game:", err);
      this.updateConnectionStatus('Failed to connect');
      this.showErrorDialog("Failed to join game: " + err.message);
    }
  }
  
  /**
   * Set up network callbacks
   */
  setupNetworkCallbacks() {
    if (!this.network) return;
    
    // Handle player joined
    this.network.onPlayerJoined = (playerId) => {
      console.log(`Player joined: ${playerId}`);
      this.addRemotePlayer(playerId);
      
      // Update UI to show connected players
      this.updateConnectionStatus(this.getConnectionStatusText());
    };
    
    // Handle player left
    this.network.onPlayerLeft = (playerId) => {
      console.log(`Player left: ${playerId}`);
      this.removeRemotePlayer(playerId);
      
      // Update UI to show connected players
      this.updateConnectionStatus(this.getConnectionStatusText());
    };
    
    // Handle game state updates (for clients)
    this.network.onGameStateUpdate = (state) => {
      this.updateGameState(state);
    };
    
    // Handle errors
    this.network.onError = (err) => {
      console.error("Network error:", err);
      this.updateConnectionStatus('Network error');
      this.showErrorDialog("Network error: " + err.message);
    };
  }
  
  /**
   * Start sending position updates
   */
  startPositionUpdates() {
    // Clear any existing interval first to prevent duplicates
    if (this._positionUpdateInterval) {
      clearInterval(this._positionUpdateInterval);
    }
    
    // Lower the interval for more frequent updates
    this.positionUpdateInterval = 25; // Reduced from 50ms for smoother updates
    
    this._positionUpdateInterval = setInterval(() => {
      if (!this.isConnected || !this.network) {
        console.log("Position updates stopping - no longer connected");
        clearInterval(this._positionUpdateInterval);
        this._positionUpdateInterval = null;
        return;
      }
      
      // Ensure we have a reference to the player controls
      if (!this.gameEngine || !this.gameEngine.controls) {
        return;
      }
      
      const now = Date.now();
      
      // Get weapon information if available
      let weaponInfo = null;
      if (this.gameEngine.weaponManager && this.gameEngine.weaponManager.currentWeapon) {
        weaponInfo = {
          type: this.gameEngine.weaponManager.currentWeapon.type || 'PISTOL',
          isReloading: this.gameEngine.weaponManager.isReloading || false,
          isFiring: this.gameEngine.weaponManager.isFiring || false
        };
      }
      
      // Always include current health and death state
      const playerInfo = {
        health: this.gameEngine.controls.health || 100,
        isDead: this.gameEngine.controls.isDead || false
      };
      
      // Log major state changes (especially death state)
      if (this._lastSentIsDead !== playerInfo.isDead) {
        console.log(`Player death state changed: isDead=${playerInfo.isDead}`);
        this._lastSentIsDead = playerInfo.isDead;
      }
      
      // Send position updates even if we're dead (to ensure death state is synced)
      this.network.sendPlayerPosition(weaponInfo);
      this.lastPositionUpdate = now;
      
    }, this.positionUpdateInterval);
    
    console.log("Position updates started with interval:", this.positionUpdateInterval);
  }
  
  /**
   * Update the game state with data from the host
   * @param {Object} state - The game state object
   */
  updateGameState(state) {
    if (!this.isConnected || this.isHost) return;
    
    // Update remote player positions
    if (state.playerPositions) {
      Object.entries(state.playerPositions).forEach(([playerId, position]) => {
        if (playerId !== this.network.clientId) {
          this.updateRemotePlayerPosition(playerId, position);
          
          // If this is the host player and they're dead, log it to help with debugging
          if (playerId === this.network.hostId && position.isDead) {
            console.log("Host player is dead, but continuing to process game state updates");
          }
        }
      });
    }
    
    // Update game status (pause, game over, etc.)
    if (state.gameStatus) {
      this.updateGameStatus(state.gameStatus);
    }
    
    // Update enemy state if needed (for client-side visualization)
    if (state.enemies && this.gameEngine.scene && this.gameEngine.scene.room && 
        this.gameEngine.scene.room.enemyManager) {
      
      const enemyManager = this.gameEngine.scene.room.enemyManager;
      
      // Enhanced enemy synchronization
      if (Array.isArray(state.enemies)) {
        console.log(`Syncing ${state.enemies.length} enemies from host`);
        
        // If host has no enemies, clear client enemies
        if (state.enemies.length === 0 && enemyManager.enemies.length > 0) {
          console.log("Host has no enemies, clearing client enemies");
          enemyManager.despawnAllEnemies();
          return;
        }
        
        // If client has no enemies but host does, force a spawn on the client
        if (enemyManager.enemies.length === 0 && state.enemies.length > 0) {
          console.log("Spawning initial enemies from host data");
          
          // Spawn missing enemies
          state.enemies.forEach(enemyData => {
            // Only create if we don't already have this enemy
            if (!enemyManager.enemies.some(e => e.id === enemyData.id)) {
              this.spawnEnemyFromData(enemyData, enemyManager);
            }
          });
        } else {
          // Update positions and states of existing enemies
          state.enemies.forEach(enemyData => {
            const enemy = enemyManager.enemies.find(e => e.id === enemyData.id);
            if (enemy && enemy.instance) {
              // Update position
              enemy.instance.position.set(
                enemyData.position.x,
                enemyData.position.y,
                enemyData.position.z
              );
              
              // Update health and state
              enemy.health = enemyData.health;
              enemy.state = enemyData.state;
              enemy.insideRoom = enemyData.insideRoom || enemy.insideRoom;
              
              // Make sure enemy retains its functionality, especially if host is dead
              if (!enemy.active && enemy.state !== 'dying') {
                enemy.active = true;
              }
              
              // Ensure enemies are properly moving/animated based on state
              if (enemyData.state === 'moving' && enemy.state !== 'moving') {
                if (typeof enemy.startMoving === 'function') enemy.startMoving();
              } else if (enemyData.state === 'attacking' && enemy.state !== 'attacking') {
                if (typeof enemy.startAttacking === 'function') enemy.startAttacking();
              } else if (enemyData.state === 'dying' && enemy.state !== 'dying') {
                if (typeof enemy.die === 'function') enemy.die();
              }
            } else {
              // Enemy doesn't exist on client, create it
              console.log(`Creating missing enemy ${enemyData.id} from host data`);
              this.spawnEnemyFromData(enemyData, enemyManager);
            }
          });
          
          // Remove enemies that don't exist on host anymore
          const enemiesToRemove = enemyManager.enemies.filter(enemy => 
            !state.enemies.some(e => e.id === enemy.id)
          );
          
          if (enemiesToRemove.length > 0) {
            console.log(`Removing ${enemiesToRemove.length} enemies that don't exist on host`);
            enemiesToRemove.forEach(enemy => {
              if (enemy.instance) {
                if (typeof enemy.die === 'function') {
                  enemy.die();
                  // Force remove after a short delay
                  setTimeout(() => {
                    if (enemy.instance && this.gameEngine.scene.instance && typeof this.gameEngine.scene.instance.remove === 'function') {
                      this.gameEngine.scene.instance.remove(enemy.instance);
                    }
                  }, 500);
                } else {
                  if (this.gameEngine.scene.instance && typeof this.gameEngine.scene.instance.remove === 'function') {
                    this.gameEngine.scene.instance.remove(enemy.instance);
                  }
                }
              }
            });
            
            // Update enemies array
            enemyManager.enemies = enemyManager.enemies.filter(enemy => 
              state.enemies.some(e => e.id === enemy.id)
            );
          }
        }
      }
    }
    
    // Update round info
    if (state.round && this.gameEngine.scene && this.gameEngine.scene.room && 
        this.gameEngine.scene.room.enemyManager) {
      const enemyManager = this.gameEngine.scene.room.enemyManager;
      enemyManager.currentRound = state.round.round;
      enemyManager.zombiesRemaining = state.round.zombiesRemaining;
      enemyManager.roundActive = state.round.roundActive;
      
      // Update UI elements for round info
      if (this.gameEngine.uiManager) {
        this.gameEngine.uiManager.updateRoundInfo(
          state.round.round, 
          state.round.zombiesRemaining
        );
      }
      
      // If round active state changed, handle round transitions
      if (enemyManager.roundActive !== state.round.roundActive) {
        if (state.round.roundActive) {
          console.log(`Client syncing: Round ${state.round.round} started`);
          // Host started a new round, sync it
          enemyManager.roundActive = true;
        } else {
          console.log(`Client syncing: Round ${state.round.round} ended`);
          // Host ended a round, sync it
          enemyManager.roundActive = false;
        }
      }
    }
    
    // Update window states if necessary
    if (state.windows && this.gameEngine.scene && this.gameEngine.scene.room) {
      const room = this.gameEngine.scene.room;
      if (Array.isArray(room.windows) && Array.isArray(state.windows)) {
        console.log(`Updating window states from host data: Host sent ${state.windows.length} windows, local has ${room.windows.length}`);
        
        state.windows.forEach((windowData, index) => {
          // Ensure window exists at this index
          if (index >= room.windows.length) {
            console.error(`Window index ${index} out of bounds (local has ${room.windows.length} windows)`);
            return;
          }
          
          if (room.windows[index]) {
            const window = room.windows[index];
            
            // Set windowIndex if not already set
            if (window.windowIndex === undefined) {
              console.log(`Setting missing windowIndex ${index} on window`);
              window.windowIndex = index;
            }
            
            // Use the updateFromHostData method if available to respect pending actions
            if (typeof window.updateFromHostData === 'function') {
              window.updateFromHostData(windowData);
            } else {
              // Otherwise fallback to manual update
              if (windowData.isOpen && !window.isOpen) {
                console.log(`Window ${index} is now open (broken)`);
                window.breakWindow();
              }
              
              // Update board count - Add or remove boards to match host state
              if (window.boardsCount !== windowData.boardsCount) {
                console.log(`Syncing window ${index} boards: local=${window.boardsCount}, host=${windowData.boardsCount}`);
                
                // If we have fewer boards than the host, add boards
                while (window.boardsCount < windowData.boardsCount) {
                  console.log(`Adding board ${window.boardsCount + 1} to window ${index}`);
                  window.addBoard();
                }
                
                // If we have more boards than the host, remove boards
                while (window.boardsCount > windowData.boardsCount) {
                  console.log(`Removing board ${window.boardsCount} from window ${index}`);
                  window.removeBoard();
                }
              }
              
              // Update board health values if provided
              if (Array.isArray(windowData.health) && window.boardHealths) {
                // Make sure arrays have same length
                const oldHealths = [...window.boardHealths];
                window.boardHealths = windowData.health.slice(0, window.boardsCount);
                
                console.log(`Updated window ${index} board health: ${JSON.stringify(oldHealths)} -> ${JSON.stringify(window.boardHealths)}`);
                
                // Update board appearance based on health
                window.boardHealths.forEach((health, boardIndex) => {
                  if (window.updateBoardAppearance) {
                    window.updateBoardAppearance(boardIndex);
                  }
                });
              }
            }
          } else {
            console.error(`Window at index ${index} is null or undefined`);
          }
        });
      } else {
        console.error("Cannot update windows: arrays not available", {
          roomWindows: Array.isArray(room.windows),
          stateWindows: Array.isArray(state.windows)
        });
      }
    } else {
      console.warn("Missing data for window updates:", {
        stateWindows: !!state.windows,
        scene: !!this.gameEngine.scene,
        room: !!(this.gameEngine.scene && this.gameEngine.scene.room)
      });
    }
  }
  
  /**
   * Spawn an enemy from network data
   * @param {Object} enemyData - The enemy data
   * @param {EnemyManager} enemyManager - The enemy manager
   */
  spawnEnemyFromData(enemyData, enemyManager) {
    if (!this.gameEngine.scene || !this.gameEngine.scene.room) return;
    
    try {
      const room = this.gameEngine.scene.room;
      let targetWindow = null;
      
      // Get target window if provided
      if (enemyData.targetWindow && typeof enemyData.targetWindow.index === 'number') {
        const windowIndex = enemyData.targetWindow.index;
        if (windowIndex >= 0 && windowIndex < room.windows.length) {
          targetWindow = room.windows[windowIndex];
        }
      }
      
      // If no target window found, use a random one
      if (!targetWindow && room.windows && room.windows.length > 0) {
        const randomIndex = Math.floor(Math.random() * room.windows.length);
        targetWindow = room.windows[randomIndex];
      }
      
      if (!targetWindow) {
        console.error("No target window available for enemy spawn");
        return;
      }
      
      // Create appropriate enemy type based on received data
      let enemy;
      switch (enemyData.type) {
        case 'crawler':
          enemy = new CrawlingZombie(targetWindow);
          break;
        case 'runner':
          enemy = new RunnerZombie(targetWindow);
          break;
        case 'spitter':
          enemy = new SpitterZombie(targetWindow);
          break;
        default:
          enemy = new Enemy(targetWindow);
          break;
      }
      
      // Set the ID to match the host
      enemy.id = enemyData.id;
      
      // Initialize the enemy
      enemy.init();
      
      // Set position
      if (enemyData.position && enemy.instance) {
        enemy.instance.position.set(
          enemyData.position.x,
          enemyData.position.y,
          enemyData.position.z
        );
      }
      
      // Set state properties
      enemy.health = enemyData.health;
      enemy.state = enemyData.state;
      enemy.insideRoom = enemyData.insideRoom || false;
      
      // Set manager reference
      enemy.manager = enemyManager;
      
      // Set game engine reference directly
      enemy.gameEngine = this.gameEngine;
      
      // Set player reference if available
      if (enemyManager.player) {
        enemy.setPlayer(enemyManager.player);
      }
      
      // Use the correct THREE.js scene instance
      // The actual THREE.js scene is at this.gameEngine.scene.instance, not this.gameEngine.scene
      if (this.gameEngine.scene.instance && typeof this.gameEngine.scene.instance.add === 'function') {
        // Add to scene using the correct scene instance
        this.gameEngine.scene.instance.add(enemy.instance);
      } else {
        console.warn("Cannot add enemy to scene - scene.instance.add is not available");
        
        // Try alternative ways to add the enemy
        if (room && room.instance && typeof room.instance.add === 'function') {
          room.instance.add(enemy.instance);
        } else {
          console.error("Could not add enemy to any available scene object");
          // Don't add enemy to tracking array if we couldn't add it to the scene
          return null;
        }
      }
      
      // Add to tracking array
      enemyManager.enemies.push(enemy);
      
      return enemy;
    } catch (error) {
      console.error("Error spawning enemy from network data:", error);
      return null;
    }
  }
  
  /**
   * Add a remote player to the game
   * @param {string} playerId - The ID of the player to add
   */
  addRemotePlayer(playerId) {
    if (this.remotePlayers.has(playerId)) return;
    
    console.log(`Adding remote player: ${playerId}`);
    
    // Add to the map of remote players
    this.remotePlayers.set(playerId, {
      id: playerId,
      position: { x: 0, y: 0, z: 0, rotationY: 0 },
      lastUpdate: Date.now()
    });
    
    // Create a 3D model for the remote player
    this.createRemotePlayerModel(playerId);
  }
  
  /**
   * Create a 3D model for a remote player
   * @param {string} playerId - The ID of the player
   */
  createRemotePlayerModel(playerId) {
    if (!this.gameEngine.scene) return;
    
    console.log(`Creating visible model for remote player ${playerId}`);
    
    // Create a more visible and recognizable player model
    const playerGroup = new THREE.Group();
    
    // Body - taller and more visible blue color
    const bodyGeometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
    const bodyMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x1E90FF, // Dodger blue - more vibrant and visible
      transparent: true,
      opacity: 0.8
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.9; // Center the body vertically
    playerGroup.add(body);
    
    // Head
    const headGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0x4169E1 }); // Royal blue for head
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 2.0; // Position the head on top of the body
    playerGroup.add(head);
    
    // Gun/weapon (just for visual identification)
    const gunGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.5);
    const gunMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
    const gun = new THREE.Mesh(gunGeometry, gunMaterial);
    gun.position.set(0.3, 1.2, 0.3); // Position to the side like holding a gun
    gun.userData.type = 'gun'; // Mark this as a gun for later reference
    playerGroup.add(gun);
    
    // Add player name label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'Bold 24px Arial';
    context.fillStyle = '#FFFFFF';
    context.textAlign = 'center';
    context.fillText(`Player ${playerId.substring(0, 5)}`, canvas.width / 2, canvas.height / 2);
    
    const labelTexture = new THREE.CanvasTexture(canvas);
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      side: THREE.DoubleSide
    });
    const labelGeometry = new THREE.PlaneGeometry(1, 0.25);
    const label = new THREE.Mesh(labelGeometry, labelMaterial);
    label.position.y = 2.4; // Position above the head
    label.rotation.y = Math.PI; // Face the label toward the player (billboarding)
    playerGroup.add(label);
    
    // Set initial position - make it slightly higher so it doesn't clip into the ground
    playerGroup.position.set(0, 0.1, 0);
    
    // Add to the scene using the correct scene instance
    if (this.gameEngine.scene.instance && typeof this.gameEngine.scene.instance.add === 'function') {
      this.gameEngine.scene.instance.add(playerGroup);
    } else {
      console.warn("Cannot add player model to scene - scene.instance.add is not available");
      return;
    }
    
    // Store the model
    this.playerModels.set(playerId, playerGroup);
    
    // Set up a simple animation to make the player model more noticeable
    const bobAnimation = () => {
      const model = this.playerModels.get(playerId);
      if (model) {
        // Small floating/bobbing animation
        model.position.y = 0.1 + Math.sin(Date.now() * 0.002) * 0.05;
        
        // Make the label always face the camera (billboarding)
        const label = model.children.find(child => child.geometry && child.geometry.type === 'PlaneGeometry');
        if (label && this.gameEngine.controls && this.gameEngine.controls.camera) {
          label.lookAt(this.gameEngine.controls.camera.position);
        }
      }
      
      // Continue animation if player still exists
      if (this.playerModels.has(playerId)) {
        requestAnimationFrame(bobAnimation);
      }
    };
    
    // Start the animation
    bobAnimation();
  }
  
  /**
   * Update a remote player's position
   * @param {string} playerId - The ID of the player to update
   * @param {Object} position - The new position data
   */
  updateRemotePlayerPosition(playerId, position) {
    // Get the player data
    let playerData = this.remotePlayers.get(playerId);
    
    // If this is a new player, add them
    if (!playerData) {
      this.addRemotePlayer(playerId);
      playerData = this.remotePlayers.get(playerId);
    }
    
    // Check for significant position changes (to detect teleporting or other issues)
    if (playerData.position && position.x !== undefined) {
      const distance = Math.sqrt(
        Math.pow(position.x - playerData.position.x, 2) +
        Math.pow(position.y - playerData.position.y, 2) +
        Math.pow(position.z - playerData.position.z, 2)
      );
      
      // Log larger movements to help with debugging
      if (distance > 10) {
        console.log(`Large player movement detected for ${playerId}: ${distance.toFixed(2)} units`);
      }
    }
    
    // Update the player's position and weapon info
    playerData.position = position;
    playerData.lastUpdate = Date.now();
    
    // Update health and status if provided
    if (position.health !== undefined) {
      playerData.health = position.health;
    }
    
    // Track death state changes explicitly with logging
    if (position.isDead !== undefined) {
      const wasDeadBefore = playerData.isDead;
      playerData.isDead = position.isDead;
      
      // Log state changes
      if (wasDeadBefore !== position.isDead) {
        console.log(`Remote player ${playerId} death state changed: isDead=${position.isDead}`);
        
        // If player was dead but is now alive, ensure health is reset to full
        if (wasDeadBefore && !position.isDead) {
          console.log(`Remote player ${playerId} respawned, resetting health to 100`);
          playerData.health = 100;
          
          // Publish debug message to confirm respawn
          if (this.gameEngine && this.gameEngine.ui && typeof this.gameEngine.ui.showDebugMessage === 'function') {
            this.gameEngine.ui.showDebugMessage(`Player ${playerId} respawned`, 3000);
          }
        }
      }
      
      // If the player just died, update their model to show death state
      if (position.isDead && !playerData.wasDeadLastUpdate) {
        console.log(`Player ${playerId} died, updating visual state`);
        this.updatePlayerDeathState(playerId, true);
      } else if (!position.isDead && playerData.wasDeadLastUpdate) {
        // Player was respawned
        console.log(`Player ${playerId} respawned, updating visual state`);
        this.updatePlayerDeathState(playerId, false);
      }
      
      playerData.wasDeadLastUpdate = position.isDead;
    }
    
    // Save weapon info if provided
    if (position.weapon) {
      playerData.weapon = position.weapon;
    }
    
    // Update the player's model
    const model = this.playerModels.get(playerId);
    if (model) {
      // Update position and rotation
      model.position.set(position.x, position.y, position.z);
      model.rotation.y = position.rotationY;
      
      // If player was recently respawned, double-check that the visual state is correct
      if (playerData.wasDeadLastUpdate === false && playerData.isDead === false) {
        // Ensure the player is visually shown as alive
        this.updatePlayerDeathState(playerId, false);
      }
      
      // Update weapon visualization if weapon info is available
      if (position.weapon && position.weapon.type) {
        // Find the gun mesh
        const gun = model.children.find(child => child.userData && child.userData.type === 'gun');
        if (gun) {
          // Update gun appearance based on weapon type
          switch (position.weapon.type) {
            case 'ASSAULT_RIFLE':
              gun.scale.set(0.1, 0.1, 0.8); // Longer for rifle
              break;
            case 'SHOTGUN':
              gun.scale.set(0.12, 0.12, 0.6); // Thicker for shotgun
              break;
            default: // PISTOL
              gun.scale.set(0.1, 0.1, 0.5); // Default size
          }
          
          // Show firing effect if the player is firing
          if (position.weapon.isFiring) {
            if (!gun.userData.muzzleFlash) {
              // Create muzzle flash if it doesn't exist
              const muzzleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
              const muzzleMaterial = new THREE.MeshBasicMaterial({ 
                color: 0xffff00,
                transparent: true,
                opacity: 0.8
              });
              const muzzleFlash = new THREE.Mesh(muzzleGeometry, muzzleMaterial);
              muzzleFlash.position.z = gun.scale.z + 0.1; // Position at end of gun
              gun.add(muzzleFlash);
              gun.userData.muzzleFlash = muzzleFlash;
              
              // Hide after a short time
              setTimeout(() => {
                if (gun.userData.muzzleFlash) {
                  gun.userData.muzzleFlash.visible = false;
                }
              }, 100);
            } else {
              // Make existing muzzle flash visible
              gun.userData.muzzleFlash.visible = true;
              
              // Hide after a short time
              setTimeout(() => {
                if (gun.userData.muzzleFlash) {
                  gun.userData.muzzleFlash.visible = false;
                }
              }, 100);
            }
          }
        }
      }
    }
    
    // Update any enemies targeting this player
    this.updateEnemyTargeting(playerId, position, playerData.isDead);
  }
  
  /**
   * Update enemies to correctly target players at their new positions
   * @param {string} playerId - The ID of the player
   * @param {Object} position - The player's position
   * @param {boolean} isDead - Whether the player is dead
   */
  updateEnemyTargeting(playerId, position, isDead) {
    if (!this.gameEngine || !this.gameEngine.scene || 
        !this.gameEngine.scene.room || !this.gameEngine.scene.room.enemyManager) {
      return;
    }
    
    // Only update if we're the host (since the host handles enemy AI)
    if (!this.isHost) return;
    
    const enemyManager = this.gameEngine.scene.room.enemyManager;
    const enemies = enemyManager.enemies;
    
    // If no enemies, nothing to update
    if (!enemies || enemies.length === 0) return;
    
    // If player is dead, enemies should not target them
    if (isDead) {
      // First, identify any enemies targeting this player
      const enemiesToReroute = enemies.filter(enemy => 
        enemy.targetPlayer && enemy.targetPlayer.id === playerId
      );
      
      if (enemiesToReroute.length > 0) {
        console.log(`Player ${playerId} is dead, redirecting ${enemiesToReroute.length} enemies`);
        
        // Find a list of living players to target instead
        const potentialTargets = [];
        
        // Add host if alive
        if (this.gameEngine.controls && !this.gameEngine.controls.isDead) {
          potentialTargets.push({
            id: this.network.hostId,
            position: {
              x: this.gameEngine.controls.camera.position.x,
              y: this.gameEngine.controls.camera.position.y,
              z: this.gameEngine.controls.camera.position.z
            }
          });
        }
        
        // Add any living remote players
        this.remotePlayers.forEach((player, id) => {
          if (!player.isDead && player.position) {
            potentialTargets.push({
              id: id,
              position: player.position
            });
          }
        });
        
        // Redirect each enemy to a living target or to a window
        enemiesToReroute.forEach(enemy => {
          enemy.targetPlayer = null;  // Clear current target

          if (potentialTargets.length > 0) {
            // Randomly select a living player to target
            const randomIndex = Math.floor(Math.random() * potentialTargets.length);
            const newTarget = potentialTargets[randomIndex];
            
            console.log(`Redirecting enemy ${enemy.id} to player ${newTarget.id}`);
            
            // Assign new target player and position
            enemy.targetPlayer = { id: newTarget.id };
            enemy.targetPosition = {
              x: newTarget.position.x,
              y: newTarget.position.y,
              z: newTarget.position.z
            };
            
            // Force enemy to move to the new target
            if (typeof enemy.startMoving === 'function') {
              enemy.startMoving();
            }
          } else if (this.gameEngine.scene.room.windows && 
                    this.gameEngine.scene.room.windows.length > 0) {
            // If no living players, target a window instead
            const randomWindowIndex = Math.floor(Math.random() * this.gameEngine.scene.room.windows.length);
            enemy.targetWindow = this.gameEngine.scene.room.windows[randomWindowIndex];
            
            // Reset target position to window position
            if (enemy.targetWindow && enemy.targetWindow.instance) {
              enemy.targetPosition = {
                x: enemy.targetWindow.instance.position.x,
                y: enemy.targetWindow.instance.position.y,
                z: enemy.targetWindow.instance.position.z
              };
            }
            
            // Force enemy to move to the window
            if (typeof enemy.startMoving === 'function') {
              enemy.startMoving();
            }
          }
        });
      }
      return;
    }
    
    // Update position for enemies targeting this player
    let updatedCount = 0;
    enemies.forEach(enemy => {
      if (enemy.targetPlayer && enemy.targetPlayer.id === playerId) {
        // Update the target position for this enemy
        enemy.targetPosition = {
          x: position.x,
          y: position.y,
          z: position.z
        };
        
        // Ensure enemy is in moving state if not already
        if (enemy.state !== 'moving' && typeof enemy.startMoving === 'function') {
          enemy.startMoving();
        }
        
        updatedCount++;
      }
    });
    
    // Log if multiple enemies were updated
    if (updatedCount > 0) {
      console.log(`Updated targeting for ${updatedCount} enemies tracking player ${playerId}`);
    }
  }
  
  /**
   * Update a player's death state visual representation
   * @param {string} playerId - The ID of the player
   * @param {boolean} isDead - Whether the player is dead
   */
  updatePlayerDeathState(playerId, isDead) {
    // Check if this is a state change
    const playerData = this.remotePlayers.get(playerId);
    const wasDeadBefore = playerData ? playerData.isDead : false;
    
    // Update player data
    if (playerData) {
      playerData.isDead = isDead;
    }
    
    // If no state change, no need to update visuals
    if (wasDeadBefore === isDead) {
      console.log(`Player ${playerId} death state unchanged: ${isDead}`);
      return;
    }
    
    console.log(`Updating player ${playerId} death state: ${isDead}`);
    
    if (isDead) {
      console.log(`Player ${playerId} died - playing death animation`);
      
      // Get the player model
      const model = this.playerModels.get(playerId);
      if (model) {
        // Play death animation
        if (model.userData && model.userData.animations) {
          const deathAnim = model.userData.animations.find(anim => anim.name === 'death');
          if (deathAnim) {
            deathAnim.reset();
            deathAnim.play();
            deathAnim.clampWhenFinished = true;
          }
        }
        
        // Create a dead player marker
        this.createDeadPlayerMarker(playerId, playerData?.position);
      }
      
    } else {
      // Player has been respawned
      console.log(`Remote player ${playerId} respawned, resetting health to 100`);
      
      // Player data should have position information
      if (playerData && playerData.position) {
        // Create a new player model
        this.createRemotePlayerModel(playerId);
        
        // Update the position of the new model
        this.updateRemotePlayerPosition(playerId, playerData.position);
        
        // Publish debug message to confirm respawn
        if (this.gameEngine && this.gameEngine.ui && this.gameEngine.ui.showDebugMessage) {
          this.gameEngine.ui.showDebugMessage(`Player ${playerId} respawned`, 3000);
        }
      } else {
        console.warn(`Cannot recreate player model for ${playerId}: No position data`);
      }
    }
  }
  
  /**
   * Create a marker for a dead player
   * @param {string} playerId - The ID of the dead player
   * @param {Object} position - The position where the player died
   */
  createDeadPlayerMarker(playerId, position) {
    // No need to create a marker if we don't have position data
    if (!position || !this.gameEngine.scene || !this.gameEngine.scene.instance) {
      return;
    }
    
    // Create a simple marker where the player died
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0xFF0000,
      transparent: true,
      opacity: 0.6
    });
    
    const marker = new THREE.Mesh(geometry, material);
    marker.position.set(position.x, 0.1, position.z);
    
    // Add text indicating player is dead
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#550000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'Bold 32px Arial';
    context.fillStyle = '#FF0000';
    context.textAlign = 'center';
    context.fillText(`DEAD`, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const textMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide
    });
    
    const textGeometry = new THREE.PlaneGeometry(1, 0.25);
    const text = new THREE.Mesh(textGeometry, textMaterial);
    text.position.y = 0.5;
    text.rotation.x = -Math.PI / 2; // Face upward
    
    marker.add(text);
    
    // Store marker for later removal
    marker.userData.playerId = playerId;
    marker.userData.isDeadMarker = true;
    
    // Add to scene
    this.gameEngine.scene.instance.add(marker);
    
    // Store the marker for future reference
    this.playerModels.set(playerId, marker);
    
    console.log(`Created dead marker for player ${playerId}`);
  }
  
  /**
   * Remove a remote player from the game
   * @param {string} playerId - The ID of the player to remove
   */
  removeRemotePlayer(playerId) {
    // Remove from the map of remote players
    this.remotePlayers.delete(playerId);
    
    // Remove the player's model
    const model = this.playerModels.get(playerId);
    if (model && this.gameEngine.scene && this.gameEngine.scene.instance) {
      this.gameEngine.scene.instance.remove(model);
    }
    
    this.playerModels.delete(playerId);
  }
  
  /**
   * Clean up player models
   */
  cleanupPlayerModels() {
    if (!this.gameEngine.scene || !this.gameEngine.scene.instance) return;
    
    // Remove all player models from the scene
    for (const model of this.playerModels.values()) {
      this.gameEngine.scene.instance.remove(model);
    }
    
    this.playerModels.clear();
  }
  
  /**
   * Disconnect from the current multiplayer session
   */
  disconnect() {
    console.log("NetworkManager: Disconnecting from multiplayer session");
    
    // Stop server list updates if running
    if (this.serverListUpdateInterval) {
      clearInterval(this.serverListUpdateInterval);
      this.serverListUpdateInterval = null;
      
      // If we're hosting, remove our server from the list
      if (this.isHost && this.hostId) {
        this.unregisterServer(this.hostId);
      }
    }
    
    // Clear any position update intervals
    if (this._positionUpdateInterval) {
      console.log("Clearing position update interval");
      clearInterval(this._positionUpdateInterval);
      this._positionUpdateInterval = null;
    }
    
    // Disconnect the P2P network
    if (this.network) {
      console.log("Disconnecting network connections");
      this.network.disconnect();
      this.network = null;
    }
    
    // Reset remote player data
    this.remotePlayers.clear();
    this.cleanupPlayerModels();
    
    // Reset network state
    this.hostId = null;
    this.isHost = false;
    this.isConnected = false;
    this.isMultiplayer = false;
    this.gameMode = 'singleplayer';
    
    // Update connection status
    this.updateConnectionStatus('Disconnected');
    
    console.log("NetworkManager: Successfully disconnected");
  }
  
  /**
   * Send a chat message
   * @param {string} message - The message to send
   */
  sendChatMessage(message) {
    if (!this.isConnected || !this.network) return;
    
    this.network.sendChatMessage(message);
  }
  
  /**
   * Create a status element to show connection status
   */
  createStatusElement() {
    // Status element has been disabled as requested
    // This method is kept as a placeholder in case functionality needs to be restored
    this.connectionStatusElement = null;
  }
  
  /**
   * Update the connection status element
   * @param {string} status - The status text to display
   */
  updateConnectionStatus(status) {
    // Status updates have been disabled as requested
    // This method is kept as a placeholder in case functionality needs to be restored
  }
  
  /**
   * Get connection status text
   * @returns {string} The connection status text
   */
  getConnectionStatusText() {
    if (!this.isConnected) {
      return 'Disconnected';
    }
    
    if (this.isHost) {
      const playerCount = this.remotePlayers.size + 1;
      return `Hosting (${playerCount} ${playerCount === 1 ? 'player' : 'players'})`;
    } else {
      return `Connected to ${this.truncateId(this.hostId)}`;
    }
  }
  
  /**
   * Truncate a peer ID for display
   * @param {string} id - The peer ID
   * @returns {string} The truncated ID
   */
  truncateId(id) {
    if (!id) return '';
    return id.substring(0, 6) + '...';
  }
  
  /**
   * Register this server in the public server list
   * @param {string} hostId - Host ID
   */
  async registerServer(hostId) {
    if (!hostId) return;
    
    try {
      console.log("Attempting to register server with hostId:", hostId);
      
      // Use unique identifier from localStorage if available, or generate a new one
      if (!this.serverUniqueId) {
        this.serverUniqueId = localStorage.getItem('serverUniqueId') || this.generateUniqueId();
        localStorage.setItem('serverUniqueId', this.serverUniqueId);
      }
      
      console.log("Using server unique ID:", this.serverUniqueId);
      
      const requestBody = {
          id: hostId,
        name: this.serverName || `Game Server ${hostId.substring(0, 6)}`,
        uniqueId: this.serverUniqueId,
        playerCount: 1, // Start with 1 player (the host)
        maxPlayers: 2  // Maximum 2 players
      };
      
      console.log("Sending server registration request:", JSON.stringify(requestBody));
      console.log("API URL:", `${this.serverListApiUrl}/register`);
      
      const response = await fetch(`${this.serverListApiUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server registration failed with status:", response.status, errorText);
        throw new Error(`Failed to register server: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const responseData = await response.json();
      console.log("Server registration response:", responseData);
      
      console.log("Server registered in the public list");
      this.isServerRegistered = true;
      
      // Start sending server updates
      this.startServerListUpdates();
    } catch (err) {
      console.error("Error registering server:", err);
      // Don't rethrow - we want to continue with the game even if server registration fails
    }
  }
  
  /**
   * Start periodic updates to keep server info in the public list fresh
   */
  startServerListUpdates() {
    // Clear any existing interval
    if (this.serverListUpdateInterval) {
      clearInterval(this.serverListUpdateInterval);
    }
    
    // Update server info immediately and then every 30 seconds
    this.updateServerInfo();
    
    this.serverListUpdateInterval = setInterval(() => {
      this.updateServerInfo();
    }, 30000); // 30 seconds
  }
  
  /**
   * Update server information in the public server list
   */
  async updateServerInfo() {
    if (!this.isServerRegistered || !this.hostId) return;
    
    try {
      // Calculate current player count (host + connected peers)
      let playerCount = 1; // Host is always counted
      
      // Add connected peers to the count
      if (this.network && this.network.connections) {
        playerCount += Object.keys(this.network.connections).length;
      }
      
      const response = await fetch(`${this.serverListApiUrl}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.hostId,
          uniqueId: this.serverUniqueId,
          name: this.serverName,
          playerCount: playerCount,
          maxPlayers: 2
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update server info: ${response.statusText}`);
      }
    } catch (err) {
      console.error("Error updating server info:", err);
    }
  }
  
  /**
   * Show a dialog with the host's ID for sharing
   * @param {string} hostId - The host ID to display
   */
  showHostIdDialog(hostId) {
    console.log("Showing host ID dialog:", hostId);
    
    // Create a modal dialog
    const modal = document.createElement('div');
    modal.id = 'host-id-modal';
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '2000';
    
    // Create the dialog content
    const dialog = document.createElement('div');
    dialog.style.backgroundColor = '#333';
    dialog.style.color = 'white';
    dialog.style.padding = '20px';
    dialog.style.borderRadius = '5px';
    dialog.style.width = '400px';
    dialog.style.textAlign = 'center';
    dialog.style.fontFamily = 'Arial, sans-serif';
    
    // Add title
    const title = document.createElement('h2');
    title.textContent = 'Share this server ID with friends';
    title.style.marginTop = '0';
    title.style.color = '#4CAF50';
    dialog.appendChild(title);
    
    // Add host ID display
    const idDisplay = document.createElement('div');
    idDisplay.style.padding = '15px';
    idDisplay.style.marginTop = '15px';
    idDisplay.style.marginBottom = '15px';
    idDisplay.style.backgroundColor = '#222';
    idDisplay.style.color = '#fff';
    idDisplay.style.fontSize = '16px';
    idDisplay.style.fontFamily = 'monospace';
    idDisplay.style.cursor = 'pointer';
    idDisplay.style.borderRadius = '3px';
    idDisplay.textContent = hostId;
    
    // Add click-to-copy functionality
    idDisplay.addEventListener('click', () => {
      // Select the text
      const range = document.createRange();
      range.selectNode(idDisplay);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      
      // Copy to clipboard
      try {
      document.execCommand('copy');
        
        // Show copied message
        const copyMsg = document.createElement('div');
        copyMsg.textContent = 'Copied to clipboard!';
        copyMsg.style.fontSize = '12px';
        copyMsg.style.color = '#4CAF50';
        copyMsg.style.marginTop = '5px';
        
        // Remove any existing copy message
        const existingMsg = dialog.querySelector('.copy-msg');
        if (existingMsg) {
          dialog.removeChild(existingMsg);
        }
        
        copyMsg.className = 'copy-msg';
        dialog.insertBefore(copyMsg, idDisplay.nextSibling);
        
        // Remove message after 2 seconds
      setTimeout(() => {
          if (dialog.contains(copyMsg)) {
            dialog.removeChild(copyMsg);
          }
      }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      
      // Deselect
      window.getSelection().removeAllRanges();
    });
    
    dialog.appendChild(idDisplay);
    
    // Add note
    const note = document.createElement('p');
    note.textContent = 'Friends can use this ID to join your game.';
    note.style.marginTop = '10px';
    note.style.fontSize = '14px';
    note.style.color = '#aaa';
    dialog.appendChild(note);
    
    // Add server info
    const listingInfo = document.createElement('p');
    listingInfo.textContent = 'Your server will also appear in the server list.';
    listingInfo.style.marginTop = '5px';
    listingInfo.style.fontSize = '14px';
    listingInfo.style.color = '#aaa';
    dialog.appendChild(listingInfo);
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.padding = '10px 20px';
    closeButton.style.margin = '10px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.backgroundColor = '#4CAF50';
    closeButton.style.color = 'white';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '3px';
    closeButton.onclick = () => {
      console.log("Host dialog close button clicked");
      
      // Hide and remove the modal
      modal.style.display = 'none';
      document.body.removeChild(modal);
    
      // IMPORTANT: Request pointer lock after closing the dialog
      console.log("Dialog closed, locking pointer");
    
      // Add a short delay to ensure the dialog is fully removed before requesting pointer lock
    setTimeout(() => {
        console.log("Attempting to lock pointer after dialog close");
        
        if (this.gameEngine) {
          // Lock pointer to regain camera control
          if (typeof this.gameEngine.lockPointer === 'function') {
            console.log("Using gameEngine.lockPointer()");
            this.gameEngine.lockPointer();
          } else if (document.body.requestPointerLock) {
            // Fallback to directly requesting pointer lock
            console.log("Fallback: Using document.body.requestPointerLock()");
            document.body.requestPointerLock();
          }
          
          // Ensure controls are enabled
          if (this.gameEngine.controls) {
            console.log("Ensuring controls are enabled");
            this.gameEngine.controls.enabled = true;
          }
        } else {
          console.warn("gameEngine reference not found for pointer lock");
        }
    }, 100);
    };
    dialog.appendChild(closeButton);
    
    // Add to the modal
    modal.appendChild(dialog);
    
    // Show the modal
    document.body.appendChild(modal);
    modal.style.display = 'flex';
  }
  
  /**
   * Show a dialog with the list of available servers
   */
  showServerListDialog() {
    console.log("Showing server list dialog");
    
    // Define constants
    const MAX_PLAYERS = 2; // Maximum players per game
    
    // Create a modal dialog
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '2000';
    
    // Create the dialog content
    const dialog = document.createElement('div');
    dialog.style.backgroundColor = '#333';
    dialog.style.color = 'white';
    dialog.style.padding = '20px';
    dialog.style.borderRadius = '5px';
    dialog.style.width = '500px';
    dialog.style.maxHeight = '70vh';
    dialog.style.overflowY = 'auto';
    dialog.style.textAlign = 'center';
    dialog.style.fontFamily = 'Arial, sans-serif';
    
    // Add title
    const title = document.createElement('h2');
    title.textContent = 'Available Servers';
    title.style.marginTop = '0';
    title.style.color = '#4CAF50';
    dialog.appendChild(title);
    
    // Add loading indicator
    const loadingText = document.createElement('div');
    loadingText.textContent = 'Loading servers...';
    loadingText.style.margin = '20px 0';
    loadingText.style.fontSize = '16px';
    dialog.appendChild(loadingText);
    
    // Add server list container
    const serverListContainer = document.createElement('div');
    serverListContainer.style.display = 'none'; // Hide initially
    serverListContainer.style.marginTop = '20px';
    dialog.appendChild(serverListContainer);
    
    // Add manual join section
    const manualJoinSection = document.createElement('div');
    manualJoinSection.style.marginTop = '25px';
    manualJoinSection.style.padding = '15px 0';
    manualJoinSection.style.borderTop = '1px solid #444';
    
    const manualJoinTitle = document.createElement('h3');
    manualJoinTitle.textContent = 'Or Join by Server ID';
    manualJoinTitle.style.margin = '0 0 15px 0';
    manualJoinSection.appendChild(manualJoinTitle);
    
    const idInput = document.createElement('input');
    idInput.placeholder = 'Enter Server ID...';
    idInput.style.width = '100%';
    idInput.style.padding = '10px';
    idInput.style.margin = '10px 0';
    idInput.style.fontSize = '16px';
    idInput.style.textAlign = 'center';
    idInput.style.backgroundColor = '#222';
    idInput.style.color = 'white';
    idInput.style.border = '1px solid #444';
    manualJoinSection.appendChild(idInput);
    
    const manualJoinButton = document.createElement('button');
    manualJoinButton.textContent = 'Join with ID';
    manualJoinButton.style.padding = '10px 20px';
    manualJoinButton.style.margin = '10px 0';
    manualJoinButton.style.fontSize = '16px';
    manualJoinButton.style.cursor = 'pointer';
    manualJoinButton.style.backgroundColor = '#2196F3';
    manualJoinButton.style.color = 'white';
    manualJoinButton.style.border = 'none';
    manualJoinButton.style.borderRadius = '3px';
    manualJoinButton.onclick = () => {
      const serverId = idInput.value.trim();
      if (serverId) {
        // Close the dialog
        document.body.removeChild(modal);
        
        // Show the loading screen immediately when joining
        this.showLoadingScreen();
        
        // Join the game with the entered ID
        this.joinGame(serverId);
      } else {
        // Shake the input to indicate error
        idInput.style.animation = 'shake 0.5s';
        setTimeout(() => {
          idInput.style.animation = '';
        }, 500);
      }
    };
    manualJoinSection.appendChild(manualJoinButton);
    
    dialog.appendChild(manualJoinSection);
    
    // Add refresh button
    const refreshButton = document.createElement('button');
    refreshButton.textContent = 'Refresh List';
    refreshButton.style.padding = '10px 20px';
    refreshButton.style.margin = '20px 10px 10px 10px';
    refreshButton.style.fontSize = '16px';
    refreshButton.style.cursor = 'pointer';
    refreshButton.style.backgroundColor = '#4CAF50';
    refreshButton.style.color = 'white';
    refreshButton.style.border = 'none';
    refreshButton.style.borderRadius = '3px';
    refreshButton.onclick = () => loadServerList();
    dialog.appendChild(refreshButton);
    
    // Add cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.padding = '10px 20px';
    cancelButton.style.margin = '10px';
    cancelButton.style.fontSize = '16px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.backgroundColor = '#f44336';
    cancelButton.style.color = 'white';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '3px';
    cancelButton.onclick = () => {
      document.body.removeChild(modal);
      
      // Return to the main menu if it exists
      if (this.gameEngine && this.gameEngine.startMenu) {
        this.gameEngine.startMenu.show();
      } else if (this.gameEngine && typeof this.gameEngine.showMainMenu === 'function') {
        this.gameEngine.showMainMenu();
      }
    };
    dialog.appendChild(cancelButton);
    
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    // Function to load and display server list
    const loadServerList = async () => {
      // Show loading text and hide server list
      loadingText.style.display = 'block';
      serverListContainer.style.display = 'none';
      serverListContainer.innerHTML = ''; // Clear previous servers
      
      try {
        // Fetch servers
        const servers = await this.getServerList();
        
        // Hide loading text
        loadingText.style.display = 'none';
        
        // Show server list container
        serverListContainer.style.display = 'block';
          
          if (servers.length === 0) {
          // No servers found
          const noServersMsg = document.createElement('div');
          noServersMsg.textContent = 'No active servers found';
          noServersMsg.style.padding = '15px';
          noServersMsg.style.color = '#999';
          serverListContainer.appendChild(noServersMsg);
        } else {
          // Create table headers
          const tableHeader = document.createElement('div');
          tableHeader.style.display = 'grid';
          tableHeader.style.gridTemplateColumns = '1fr 100px 120px';
          tableHeader.style.padding = '10px';
          tableHeader.style.borderBottom = '1px solid #555';
          tableHeader.style.fontWeight = 'bold';
          tableHeader.style.backgroundColor = '#222';
          
          const nameHeader = document.createElement('div');
          nameHeader.textContent = 'Server Name';
          nameHeader.style.textAlign = 'left';
          tableHeader.appendChild(nameHeader);
          
          const playersHeader = document.createElement('div');
          playersHeader.textContent = 'Players';
          playersHeader.style.textAlign = 'center';
          tableHeader.appendChild(playersHeader);
          
          const actionHeader = document.createElement('div');
          actionHeader.textContent = 'Action';
          actionHeader.style.textAlign = 'center';
          tableHeader.appendChild(actionHeader);
          
          serverListContainer.appendChild(tableHeader);
          
          // Add each server to the list
          servers.forEach(server => {
            const serverItem = document.createElement('div');
            serverItem.style.display = 'grid';
            serverItem.style.gridTemplateColumns = '1fr 100px 120px';
            serverItem.style.padding = '10px';
            serverItem.style.borderBottom = '1px solid #444';
            
            // Server name
            const nameElement = document.createElement('div');
            nameElement.textContent = server.name || 'Unnamed Server';
            nameElement.style.textAlign = 'left';
            nameElement.style.overflow = 'hidden';
            nameElement.style.textOverflow = 'ellipsis';
            nameElement.style.whiteSpace = 'nowrap';
            serverItem.appendChild(nameElement);
            
            // Player count
            const playersElement = document.createElement('div');
            playersElement.textContent = `${server.players || 1}/${MAX_PLAYERS}`;
            playersElement.style.textAlign = 'center';
            serverItem.appendChild(playersElement);
            
            // Join button
            const joinButtonContainer = document.createElement('div');
            joinButtonContainer.style.textAlign = 'center';
            
            const canJoin = (server.players || 1) < MAX_PLAYERS;
            
            const joinButton = document.createElement('button');
            joinButton.textContent = canJoin ? 'Join' : 'Full';
            joinButton.style.padding = '5px 10px';
            joinButton.style.backgroundColor = canJoin ? '#4CAF50' : '#ccc';
            joinButton.style.color = 'white';
            joinButton.style.border = 'none';
            joinButton.style.borderRadius = '3px';
            joinButton.style.cursor = canJoin ? 'pointer' : 'not-allowed';
            
            if (canJoin) {
              joinButton.onclick = () => {
                // Close the dialog
              document.body.removeChild(modal);
                
                // Show the loading screen immediately when joining
                this.showLoadingScreen();
                
                // Join the game
              this.joinGame(server.id);
            };
            }
            
            joinButtonContainer.appendChild(joinButton);
            serverItem.appendChild(joinButtonContainer);
            
            serverListContainer.appendChild(serverItem);
          });
        }
      } catch (error) {
        console.error("Error fetching server list:", error);
        
        // Show error message
        loadingText.style.display = 'none';
        serverListContainer.style.display = 'block';
        
        const errorMsg = document.createElement('div');
        errorMsg.textContent = 'Failed to load servers: ' + error.message;
        errorMsg.style.padding = '15px';
        errorMsg.style.color = '#ff6b6b';
        serverListContainer.appendChild(errorMsg);
      }
    };
    
    // Load server list immediately
    loadServerList();
    
    // Fix for loadServerList reference in the refresh button
    refreshButton.onclick = () => loadServerList();
    
    // Focus the ID input for manual joining
    setTimeout(() => {
      idInput.focus();
    }, 500);
    
    // Add enter key handler for ID input
    idInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        manualJoinButton.click();
      }
    });
  }
  
  /**
   * Show an error dialog with a message
   * @param {string} message - The error message to display
   */
  showErrorDialog(message) {
    // Create a modal dialog
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '2000';
    
    // Create the dialog content
    const dialog = document.createElement('div');
    dialog.style.backgroundColor = '#333';
    dialog.style.color = 'white';
    dialog.style.padding = '20px';
    dialog.style.borderRadius = '5px';
    dialog.style.maxWidth = '400px';
    dialog.style.textAlign = 'center';
    dialog.style.fontFamily = 'Arial, sans-serif';
    
    // Add title
    const title = document.createElement('h2');
    title.textContent = 'Error';
    title.style.marginTop = '0';
    title.style.color = '#ff4444';
    dialog.appendChild(title);
    
    // Add message
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    messageElement.style.margin = '20px 0';
    dialog.appendChild(messageElement);
    
    // Add OK button
    const okButton = document.createElement('button');
    okButton.textContent = 'OK';
    okButton.style.padding = '10px 20px';
    okButton.style.margin = '10px';
    okButton.style.cursor = 'pointer';
    okButton.style.backgroundColor = '#4CAF50';
    okButton.style.color = 'white';
    okButton.style.border = 'none';
    okButton.style.borderRadius = '3px';
    okButton.onclick = () => {
      document.body.removeChild(modal);
    };
    dialog.appendChild(okButton);
    
    // Add to the modal
    modal.appendChild(dialog);
    
    // Show the modal
    document.body.appendChild(modal);
    
    // Focus the OK button
    setTimeout(() => {
      okButton.focus();
    }, 100);
  }
  
  /**
   * Remove this server from the public list
   */
  async removeServerFromList() {
    if (!this.isServerRegistered || !this.hostId) return;
    
    try {
      const response = await fetch(`${this.serverListApiUrl}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.hostId,
          uniqueId: this.serverUniqueId
        })
      });
      
        if (!response.ok) {
        throw new Error(`Failed to remove server: ${response.statusText}`);
      }
      
      console.log("Removed server from public list");
      this.isServerRegistered = false;
      
      // Clear update interval
      if (this.serverListUpdateInterval) {
        clearInterval(this.serverListUpdateInterval);
        this.serverListUpdateInterval = null;
      }
    } catch (err) {
      console.error("Error removing server from list:", err);
    }
  }
  
  /**
   * Get the list of available servers
   * @returns {Promise<Array>} Promise resolving to array of server objects
   */
  async getServerList() {
    try {
      console.log("Fetching server list from:", `${this.serverListApiUrl}`);
      
      const response = await fetch(`${this.serverListApiUrl}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server list fetch failed with status:", response.status, errorText);
        throw new Error(`Failed to get server list: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const servers = await response.json();
      console.log("Received server list:", servers);
      
      return servers;
    } catch (err) {
      console.error("Error getting server list:", err);
      return [];
    }
  }
  
  /**
   * Generate a unique identifier for this client
   * @returns {string} A unique ID
   */
  generateUniqueId() {
    // Create a random string for the session
    return 'client_' + Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }
  
  /**
   * Set the name for this server
   * @param {string} name - The server name
   */
  setServerName(name) {
    this.serverName = name;
    
    // If we're hosting, update the server info
    if (this.isServerRegistered && this.hostId) {
      this.updateServerInfo();
    }
  }
  
  /**
   * Update game status (pause, game over, etc.)
   * @param {Object} status - Game status information
   */
  updateGameStatus(status) {
    if (!this.gameEngine) return;
    
    // Only clients should process these updates
    if (this.isHost) return;
    
    console.log('Received game status update:', status);
    
    // Handle game over state
    if (status.isGameOver !== undefined && status.isGameOver !== this.gameEngine.isGameOver) {
      // Only show game over screen if all players are dead or if the local player is dead
      if (status.isGameOver && (status.allPlayersDead || this.gameEngine.controls.isDead)) {
        // Show multiplayer game over screen with "waiting for host" message
        this.showMultiplayerGameOverScreen(status.allPlayersDead);
      } else if (this.gameEngine.isGameOver) {
        // Host has restarted, close game over screen
        const gameOverMenu = document.getElementById('game-over-menu');
        if (gameOverMenu) {
          gameOverMenu.remove();
        }
        
        // Reset game state
        this.gameEngine.isGameOver = false;
      } else if (status.isGameOver) {
        // Host died but client is still alive - store this state but don't show screen yet
        console.log("Host died but client is still alive - continuing play");
        
        // We track that the host considers the game over, but we won't show UI yet
        this.hostDeclaredGameOver = true;
        
        // Check if all players besides this client are dead
        let allOtherPlayersDead = true;
        Object.entries(status.playerPositions || {}).forEach(([playerId, position]) => {
          if (playerId !== this.network.clientId && !position.isDead) {
            allOtherPlayersDead = false;
          }
        });
        
        if (allOtherPlayersDead) {
          console.log("All other players are dead, but client is still alive");
        }
      }
    }
    
    // Handle pause state
    if (status.isPaused !== undefined && status.isPaused !== this.gameEngine.isPaused) {
      if (status.isPaused) {
        // Pause the game if the host paused
        console.log("Host paused the game, pausing client");
        this.gameEngine.pauseGame();
      } else {
        // Resume the game if the host resumed
        console.log("Host resumed the game, resuming client");
        this.gameEngine.resumeGame();
      }
    }
    
    // Handle round status
    if (status.currentRound !== undefined && this.gameEngine.scene && 
        this.gameEngine.scene.room && this.gameEngine.scene.room.enemyManager) {
      this.gameEngine.scene.room.enemyManager.currentRound = status.currentRound;
      
      // Show round change notification if applicable
      if (this.gameEngine.ui && status.roundChanged) {
        this.gameEngine.ui.showRoundChangeMessage(status.currentRound);
      }
    }
  }
  
  /**
   * Show multiplayer game over screen
   * @param {boolean} allPlayersDead - Whether all players are dead
   */
  showMultiplayerGameOverScreen(allPlayersDead) {
    if (!this.gameEngine) return;
    
    // Set game over flag
    this.gameEngine.isGameOver = true;
    
    // Create game over container
    const gameOverContainer = document.createElement('div');
    gameOverContainer.id = 'game-over-menu';
    gameOverContainer.className = 'game-over-menu';
    gameOverContainer.style.position = 'absolute';
    gameOverContainer.style.top = '0';
    gameOverContainer.style.left = '0';
    gameOverContainer.style.width = '100%';
    gameOverContainer.style.height = '100%';
    gameOverContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    gameOverContainer.style.display = 'flex';
    gameOverContainer.style.flexDirection = 'column';
    gameOverContainer.style.alignItems = 'center';
    gameOverContainer.style.justifyContent = 'center';
    gameOverContainer.style.zIndex = '2000';
    gameOverContainer.style.color = '#fff';
    gameOverContainer.style.fontFamily = 'monospace, "Press Start 2P", Courier, fantasy';
    
    // Game over title
    const title = document.createElement('h1');
    title.textContent = allPlayersDead ? 'ALL PLAYERS DEAD' : 'GAME OVER';
    title.style.color = '#ff3333';
    title.style.fontSize = '48px';
    title.style.textShadow = '0 0 10px #ff3333, 0 0 20px #ff3333';
    title.style.marginBottom = '30px';
    title.style.fontFamily = 'Impact, fantasy';
    title.style.letterSpacing = '2px';
    
    // Score display
    let scoreText = "Score: 0";
    if (this.gameEngine.controls && this.gameEngine.controls.score !== undefined) {
      scoreText = `Score: ${this.gameEngine.controls.score}`;
    }
    
    const scoreDisplay = document.createElement('h2');
    scoreDisplay.textContent = scoreText;
    scoreDisplay.style.color = '#ffffff';
    scoreDisplay.style.fontSize = '24px';
    scoreDisplay.style.marginBottom = '20px';
    
    // Status message
    const statusMessage = document.createElement('p');
    statusMessage.textContent = allPlayersDead 
      ? 'Waiting for the host to restart the game...'
      : 'Your team is still fighting! Wait for the round to end or return to lobby.';
    statusMessage.style.color = '#fcba03';
    statusMessage.style.fontSize = '18px';
    statusMessage.style.marginBottom = '40px';
    statusMessage.style.maxWidth = '80%';
    statusMessage.style.textAlign = 'center';
    
    // Buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column';
    buttonContainer.style.gap = '15px';
    buttonContainer.style.width = '300px';
    
    // Create main menu button
    const menuButton = document.createElement('button');
    menuButton.textContent = 'RETURN TO MAIN MENU';
    menuButton.style.padding = '15px 20px';
    menuButton.style.fontSize = '18px';
    menuButton.style.backgroundColor = '#e74c3c';
    menuButton.style.color = 'white';
    menuButton.style.border = 'none';
    menuButton.style.borderRadius = '5px';
    menuButton.style.cursor = 'pointer';
    menuButton.style.fontFamily = 'monospace, Courier';
    menuButton.style.fontWeight = 'bold';
    menuButton.style.transition = 'all 0.2s ease';
    
    // Add warning text
    const warningText = document.createElement('p');
    warningText.textContent = 'Warning: This will disconnect you from the multiplayer session.';
    warningText.style.color = '#ff6b6b';
    warningText.style.fontSize = '14px';
    warningText.style.marginTop = '10px';
    
    // Hover effects
    menuButton.addEventListener('mouseover', () => {
      menuButton.style.transform = 'scale(1.05)';
      menuButton.style.boxShadow = '0 0 10px #e74c3c';
    });
    
    menuButton.addEventListener('mouseout', () => {
      menuButton.style.transform = 'scale(1)';
      menuButton.style.boxShadow = 'none';
    });
    
    // Return to main menu when clicked
    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      // Remove game over screen
      document.body.removeChild(gameOverContainer);
      
      // Properly disconnect from multiplayer
      this.disconnect();
      
      // Use the engine's reset method
      this.gameEngine.resetGameState();
      
      // Show the start menu
      if (this.gameEngine.startMenu) {
        this.gameEngine.startMenu.show();
      } else {
        // Fallback to the custom main menu
        this.gameEngine.showMainMenu();
      }
    });
    
    // Add elements to game over container
    gameOverContainer.appendChild(title);
    gameOverContainer.appendChild(scoreDisplay);
    gameOverContainer.appendChild(statusMessage);
    
    // Add buttons to container
    buttonContainer.appendChild(menuButton);
    buttonContainer.appendChild(warningText);
    
    // Add button container to main container
    gameOverContainer.appendChild(buttonContainer);
    
    // Add to the document
    document.body.appendChild(gameOverContainer);
  }
  
  /**
   * Host control: Pause game for all players
   */
  hostPauseGame() {
    if (!this.isHost || !this.network) return;
    
    this.network.hostPauseGame();
  }
  
  /**
   * Host control: Resume game for all players
   */
  hostResumeGame() {
    if (!this.isHost || !this.network) return;
    
    this.network.hostResumeGame();
  }
  
  /**
   * Host control: Restart game for all players
   */
  hostRestartGame() {
    if (!this.isHost || !this.network) return;
    
    this.network.hostRestartGame();
  }
  
  /**
   * Host respawn logic: Check if any dead players should respawn at round end
   */
  checkPlayersForRespawn() {
    if (!this.isHost || !this.network) {
      console.log("Not host or network not initialized, skipping respawn check");
      return;
    }
    
    console.log("Host checking for players to respawn at round end");
    
    // Check if we're at the end of a round and there are no active zombies
    const enemyManager = this.gameEngine?.scene?.room?.enemyManager;
    if (!enemyManager) {
      console.warn("Enemy manager not found, cannot check for round end");
      return;
    }
    
    // Only respawn players at round end when zombies are cleared
    if (enemyManager.roundActive || enemyManager.zombiesRemaining > 0 || enemyManager.enemies.length > 0) {
      console.log("Round still active or zombies remaining, not respawning players yet");
      return;
    }
    
    // If no round active and there are dead players but at least one player alive,
    // respawn the dead players
    const deadPlayers = [];
    
    // Check host player death state using both flags for reliability
    const isHostDead = this.gameEngine.controls.isDead || this.gameEngine.isLocalPlayerDead;
    let anyAlive = !isHostDead; // Check if host is alive
    
    // Log host state
    console.log(`Host player alive status: ${!isHostDead} (controls.isDead=${this.gameEngine.controls.isDead}, isLocalPlayerDead=${this.gameEngine.isLocalPlayerDead})`);
    
    // Check all remote players
    this.remotePlayers.forEach((player, playerId) => {
      if (player.isDead) {
        deadPlayers.push(playerId);
        console.log(`Found dead player: ${playerId}`);
      } else {
        anyAlive = true;
        console.log(`Found alive player: ${playerId}`);
      }
    });
    
    // If at least one player is alive, respawn all dead players
    if (anyAlive) {
      if (deadPlayers.length > 0) {
        console.log(`Host respawning ${deadPlayers.length} players at round end because at least one player is alive`);
        
        // Respawn each dead player
        deadPlayers.forEach(playerId => {
          console.log(`Sending respawn command to player: ${playerId}`);
          if (this.network.hostRespawnPlayer) {
            this.network.hostRespawnPlayer(playerId);
          } else {
            console.error("hostRespawnPlayer method not found on network object");
          }
        });
      }
      
      // If host is dead, respawn locally
      if (isHostDead) {
        console.log("Respawning local host player");
        this.respawnLocalPlayer();
      }
      
      // Force a game state update after respawning
      if (this.network.broadcastGameState) {
        this.network.broadcastGameState(true); // Force immediate update
      }
      
      // Update all clients that players have been respawned with additional
      // updates to ensure synchronization
      setTimeout(() => {
        if (this.network.broadcastGameState) {
          console.log("Sending follow-up game state update after respawns");
          this.network.broadcastGameState(true);
        }
      }, 500);
      
      // And one more delayed update to ensure everyone is in sync
      setTimeout(() => {
        if (this.network.broadcastGameState) {
          this.network.broadcastGameState(true);
        }
      }, 1500);
    } else if (!anyAlive) {
      console.log("All players are dead, not respawning anyone");
    } else {
      console.log("No dead players to respawn");
    }
  }
  
  /**
   * Respawn the local player (host only)
   */
  respawnLocalPlayer() {
    if (!this.gameEngine || !this.gameEngine.controls) return;
    
    console.log('Respawning local player');
    
    // Use the comprehensive respawn method
    if (typeof this.gameEngine.controls.respawn === 'function') {
      this.gameEngine.controls.respawn();
    } else {
      // Fallback to basic reset if respawn method doesn't exist
      console.warn("Respawn method not found, falling back to basic health reset");
      this.gameEngine.controls.resetHealth();
      this.gameEngine.controls.isDead = false;
    }
    
    // Reset game engine flags
    this.gameEngine.isLocalPlayerDead = false;
    
    // Re-lock pointer
    document.body.requestPointerLock();
    
    // Hide game over screen if visible
    const gameOverMenu = document.getElementById('game-over-menu');
    if (gameOverMenu) {
      gameOverMenu.remove();
    }
    
    // Hide spectator UI if visible
    const spectatorOverlay = document.getElementById('spectator-overlay');
    if (spectatorOverlay) {
      spectatorOverlay.remove();
    }
    
    // Unpause game if it was paused
    if (this.gameEngine.isPaused) {
      this.gameEngine.resumeGame();
    }
  }
  
  /**
   * Show a dialog for joining a game with a manual host ID
   */
  showJoinDialog() {
    console.log("Showing join dialog");
    
    // Create modal backdrop
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.left = '0';
    modal.style.top = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '2000';
    
    // Create dialog content
    const dialog = document.createElement('div');
    dialog.style.backgroundColor = '#333';
    dialog.style.color = 'white';
    dialog.style.padding = '20px';
    dialog.style.borderRadius = '5px';
    dialog.style.width = '400px';
    dialog.style.textAlign = 'center';
    dialog.style.fontFamily = 'Arial, sans-serif';
    
    // Add title
    const title = document.createElement('h2');
    title.textContent = 'Join a Game';
    title.style.marginTop = '0';
    title.style.color = '#4CAF50';
    dialog.appendChild(title);
    
    // Add description
    const description = document.createElement('p');
    description.textContent = 'Enter the server ID to join:';
    description.style.marginBottom = '20px';
    dialog.appendChild(description);
    
    // Add input field
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Server ID';
    input.style.width = '100%';
    input.style.padding = '10px';
    input.style.margin = '10px 0';
    input.style.fontSize = '16px';
    input.style.textAlign = 'center';
    input.style.backgroundColor = '#222';
    input.style.color = 'white';
    input.style.border = '1px solid #444';
    dialog.appendChild(input);
    
    // Add buttons container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.marginTop = '20px';
    
    // Add join button
    const joinButton = document.createElement('button');
    joinButton.textContent = 'Join Game';
    joinButton.style.padding = '10px 20px';
    joinButton.style.fontSize = '16px';
    joinButton.style.cursor = 'pointer';
    joinButton.style.backgroundColor = '#4CAF50';
    joinButton.style.color = 'white';
    joinButton.style.border = 'none';
    joinButton.style.borderRadius = '3px';
    joinButton.onclick = () => {
      const serverId = input.value.trim();
      if (serverId) {
        // Close the dialog
        document.body.removeChild(modal);
        // Join the game
        this.joinGame(serverId);
      } else {
        // Shake the input to indicate error
        input.style.border = '2px solid #ff3333';
        setTimeout(() => {
          input.style.border = '1px solid #444';
        }, 500);
      }
    };
    buttonContainer.appendChild(joinButton);
    
    // Add browse button
    const browseButton = document.createElement('button');
    browseButton.textContent = 'Browse Servers';
    browseButton.style.padding = '10px 20px';
    browseButton.style.fontSize = '16px';
    browseButton.style.cursor = 'pointer';
    browseButton.style.backgroundColor = '#2196F3';
    browseButton.style.color = 'white';
    browseButton.style.border = 'none';
    browseButton.style.borderRadius = '3px';
    browseButton.onclick = () => {
      // Close the dialog
      document.body.removeChild(modal);
      // Show server list
      this.showServerListDialog();
    };
    buttonContainer.appendChild(browseButton);
    
    // Add cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.padding = '10px 20px';
    cancelButton.style.fontSize = '16px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.backgroundColor = '#777';
    cancelButton.style.color = 'white';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '3px';
    cancelButton.onclick = () => {
      // Close the dialog
      document.body.removeChild(modal);
      
      // Return to the main menu if it exists
      if (this.gameEngine && this.gameEngine.startMenu) {
        this.gameEngine.startMenu.show();
      } else if (this.gameEngine && typeof this.gameEngine.showMainMenu === 'function') {
        this.gameEngine.showMainMenu();
      }
    };
    buttonContainer.appendChild(cancelButton);
    
    dialog.appendChild(buttonContainer);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    // Focus the input field
    setTimeout(() => {
      input.focus();
    }, 100);
    
    // Add enter key handler
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        joinButton.click();
      }
    });
  }
  
  /**
   * Create a host ID copy button for the pause menu
   * @returns {HTMLElement} The host ID copy button
   */
  createHostIdCopyButton() {
    if (!this.isHost || !this.hostId) {
      return null;
    }
    
    // Create container for the host ID section
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.marginBottom = '20px';
    container.style.width = '100%';
    
    // Create label
    const label = document.createElement('div');
    label.textContent = 'Server ID (Click to Copy):';
    label.style.fontSize = '14px';
    label.style.color = '#aaaaaa';
    label.style.marginBottom = '5px';
    container.appendChild(label);
    
    // Create ID display
    const idDisplay = document.createElement('div');
    idDisplay.style.padding = '10px 15px';
    idDisplay.style.backgroundColor = '#222222';
    idDisplay.style.color = '#ffffff';
    idDisplay.style.fontSize = '16px';
    idDisplay.style.fontFamily = 'monospace';
    idDisplay.style.borderRadius = '3px';
    idDisplay.style.cursor = 'pointer';
    idDisplay.style.marginBottom = '10px';
    idDisplay.style.width = '100%';
    idDisplay.style.textAlign = 'center';
    idDisplay.style.overflow = 'hidden';
    idDisplay.style.textOverflow = 'ellipsis';
    idDisplay.textContent = this.hostId;
    container.appendChild(idDisplay);
    
    // Create copy feedback element
    const copyFeedback = document.createElement('div');
    copyFeedback.style.fontSize = '12px';
    copyFeedback.style.color = '#4CAF50';
    copyFeedback.style.marginTop = '5px';
    copyFeedback.style.opacity = '0';
    copyFeedback.style.transition = 'opacity 0.3s ease';
    copyFeedback.textContent = 'Copied to clipboard!';
    container.appendChild(copyFeedback);
    
    // Add click-to-copy functionality
    idDisplay.addEventListener('click', () => {
      // Copy to clipboard
      navigator.clipboard.writeText(this.hostId).then(() => {
        // Show feedback
        copyFeedback.style.opacity = '1';
        setTimeout(() => {
          copyFeedback.style.opacity = '0';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
        // Fallback for browsers that don't support clipboard API
        this.fallbackCopy(idDisplay, this.hostId, copyFeedback);
      });
    });
    
    return container;
  }
  
  /**
   * Fallback copy method for browsers that don't support clipboard API
   * @param {HTMLElement} element - The element containing the text
   * @param {string} text - The text to copy
   * @param {HTMLElement} feedback - The feedback element
   */
  fallbackCopy(element, text, feedback) {
    try {
      // Create a temporary input element
      const tempInput = document.createElement('input');
      tempInput.value = text;
      tempInput.style.position = 'absolute';
      tempInput.style.left = '-9999px';
      document.body.appendChild(tempInput);
      
      // Select and copy the text
      tempInput.select();
      document.execCommand('copy');
      
      // Remove the temporary element
      document.body.removeChild(tempInput);
      
      // Show feedback
      feedback.style.opacity = '1';
      setTimeout(() => {
        feedback.style.opacity = '0';
      }, 2000);
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
  }
  
  /**
   * Show loading screen - DISABLED
   * This method is kept as a placeholder but doesn't create a loading screen
   * to prevent the issue where it remains visible after joining.
   */
  showLoadingScreen(message = 'Joining game...') {
    console.log("Loading screen disabled - would have shown: " + message);
    // Loading screen functionality removed
    return null;
  }
  
  /**
   * Hide loading screen - DISABLED
   * This method is kept as a placeholder but doesn't do anything
   * since the loading screen has been disabled.
   */
  hideLoadingScreen() {
    // Clean up any potentially remaining loading screens from previous sessions
    const loadingScreen = document.getElementById('multiplayer-loading-screen');
    if (loadingScreen && loadingScreen.parentNode) {
      loadingScreen.parentNode.removeChild(loadingScreen);
    }
  }
  
  /**
   * Handle a specific window update event
   * @param {Object} windowData - The window update data
   */
  handleWindowUpdate(windowData) {
    if (!this.isConnected || this.isHost || !this.gameEngine || !this.gameEngine.scene || !this.gameEngine.scene.room) {
      return;
    }
    
    try {
      const { windowIndex, boardsCount, boardHealths, isOpen } = windowData;
      const room = this.gameEngine.scene.room;
      
      if (!room.windows || !Array.isArray(room.windows) || windowIndex < 0 || windowIndex >= room.windows.length) {
        console.warn(`Invalid window update data: windowIndex ${windowIndex} out of range`);
        return;
      }
      
      console.log(`Received direct window update for window ${windowIndex}: boardsCount=${boardsCount}, isOpen=${isOpen}`);
      
      const window = room.windows[windowIndex];
      if (!window) {
        console.warn(`Window at index ${windowIndex} not found`);
        return;
      }
      
      // Ensure the windowIndex property is set
      if (window.windowIndex === undefined) {
        window.windowIndex = windowIndex;
      }
      
      // Use the new updateFromHostData method if available to respect pending actions
      if (typeof window.updateFromHostData === 'function') {
        window.updateFromHostData(windowData);
      } else {
        // Fallback to old method if updateFromHostData isn't available
        this.legacyUpdateWindow(window, windowData);
      }
    } catch (error) {
      console.error("Error handling window update:", error);
    }
  }
  
  /**
   * Legacy window update method (fallback)
   * @param {Window} window - The window to update
   * @param {Object} windowData - The window data from host
   */
  legacyUpdateWindow(window, windowData) {
    const { windowIndex, boardsCount, boardHealths, isOpen } = windowData;
    
    // First handle open/closed state
    if (isOpen !== undefined && window.isOpen !== isOpen) {
      if (isOpen && !window.isOpen) {
        console.log(`Window ${windowIndex} is now open (broken)`);
        window.breakWindow();
      }
    }
    
    // Then handle board count
    if (boardsCount !== undefined && window.boardsCount !== boardsCount) {
      console.log(`Syncing window ${windowIndex} boards: local=${window.boardsCount}, host=${boardsCount}`);
      
      // If we have fewer boards than the host, add boards
      while (window.boardsCount < boardsCount) {
        console.log(`Adding board ${window.boardsCount + 1} to window ${windowIndex}`);
        window.addBoard();
      }
      
      // If we have more boards than the host, remove boards
      while (window.boardsCount > boardsCount) {
        console.log(`Removing board ${window.boardsCount} from window ${windowIndex}`);
        window.removeBoard();
      }
    }
    
    // Finally update board health values
    if (Array.isArray(boardHealths) && window.boardHealths) {
      // Make sure arrays have same length
      const oldHealths = [...window.boardHealths];
      window.boardHealths = boardHealths.slice(0, window.boardsCount);
      
      console.log(`Updated window ${windowIndex} board health: ${JSON.stringify(oldHealths)} -> ${JSON.stringify(window.boardHealths)}`);
      
      // Update board appearance based on health
      window.boardHealths.forEach((health, boardIndex) => {
        if (window.updateBoardAppearance) {
          window.updateBoardAppearance(boardIndex);
        }
      });
    }
  }
  
  /**
   * Get the host player's current state
   * @returns {Object|null} The host player's state or null if not found
   */
  getHostPlayerState() {
    if (!this.network || !this.network.hostId) {
      console.log("Cannot get host player state: network or hostId not available");
      return null;
    }
    
    // If we are the host, return our own state
    if (this.isHost) {
      return {
        health: this.gameEngine.controls.health,
        isDead: this.gameEngine.controls.isDead
      };
    }
    
    // Otherwise look for the host in remotePlayers
    const hostData = this.remotePlayers.get(this.network.hostId);
    if (!hostData) {
      console.log(`Host player data not found for ID: ${this.network.hostId}`);
      return null;
    }
    
    return hostData;
  }
  
  /**
   * Check if any remote player (excluding host) is alive
   * @returns {boolean} True if any remote player is alive
   */
  isAnyRemotePlayerAlive() {
    if (!this.remotePlayers || this.remotePlayers.size === 0) {
      return false;
    }
    
    let anyAlive = false;
    const hostId = this.network ? this.network.hostId : null;
    
    this.remotePlayers.forEach((player, playerId) => {
      // Skip the host player in this check
      if (playerId !== hostId && !player.isDead) {
        anyAlive = true;
        console.log(`Found alive remote player: ${playerId}`);
      }
    });
    
    return anyAlive;
  }
  
  /**
   * Force an immediate player state update to all clients
   * @param {boolean} force - Whether to force an update even if it would otherwise be rate-limited
   */
  sendPlayerUpdate(force = false) {
    if (!this.isConnected || !this.network) {
      console.log("Cannot send player update - not connected to network");
      return;
    }
    
    // Get weapon information if available
    let weaponInfo = null;
    if (this.gameEngine && this.gameEngine.weaponManager && this.gameEngine.weaponManager.currentWeapon) {
      weaponInfo = {
        type: this.gameEngine.weaponManager.currentWeapon.type || 'PISTOL',
        isReloading: this.gameEngine.weaponManager.isReloading || false,
        isFiring: this.gameEngine.weaponManager.isFiring || false
      };
    }
    
    console.log("Forcing immediate player state update to all clients");
    
    // Send the update immediately
    this.network.sendPlayerPosition(weaponInfo);
    
    // For critically important updates (like death), send multiple times to ensure delivery
    if (force && this.gameEngine && this.gameEngine.controls && this.gameEngine.controls.isDead) {
      console.log("Critical state update (player death) - sending multiple times for reliability");
      
      // Send death state updates several times with slight delays to ensure delivery
      setTimeout(() => this.network.sendPlayerPosition(weaponInfo), 100);
      setTimeout(() => this.network.sendPlayerPosition(weaponInfo), 300);
      setTimeout(() => this.network.sendPlayerPosition(weaponInfo), 600);
      
      // If we're the host, also force a full game state broadcast
      if (this.isHost && this.network.broadcastGameState) {
        console.log("Host forcing immediate game state broadcast due to death");
        
        // Immediate broadcast
        this.network.broadcastGameState(true);
        
        // Additional delayed broadcasts to ensure clients receive the update
        setTimeout(() => this.network.broadcastGameState(true), 200);
        setTimeout(() => this.network.broadcastGameState(true), 500);
      }
    }
  }
  
  /**
   * Enter spectator mode when the local player has died
   */
  enterSpectatorMode() {
    console.log("Entering spectator mode");
    
    // Mark spectator mode active
    this.isSpectatorMode = true;
    
    // Show spectator UI
    this.showSpectatorUI();
    
    // If we're the host, ensure game state updates continue for clients
    if (this.isHost && this.network && this.network.broadcastGameState) {
      console.log("Host is dead but continuing game state broadcasts for clients");
      this.network.broadcastGameState(true); // Force immediate update
    }
  }
  
  /**
   * Show the spectator UI overlay
   */
  showSpectatorUI() {
    // Remove any existing spectator UI
    const existingUI = document.getElementById('spectator-overlay');
    if (existingUI) {
      existingUI.remove();
    }
    
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = 'spectator-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '20px';
    overlay.style.left = '50%';
    overlay.style.transform = 'translateX(-50%)';
    overlay.style.padding = '10px 20px';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    overlay.style.color = '#fff';
    overlay.style.borderRadius = '5px';
    overlay.style.zIndex = '1000';
    overlay.style.textAlign = 'center';
    overlay.style.fontFamily = 'Arial, sans-serif';
    
    // Add text
    overlay.textContent = 'SPECTATOR MODE - Waiting for round to end';
    
    // Add to DOM
    document.body.appendChild(overlay);
  }
  
  /**
   * Show the multiplayer game over screen
   */
  showMultiplayerGameOverScreen() {
    console.log("Showing multiplayer game over screen");
    
    // Set game over state
    if (this.gameEngine) {
      this.gameEngine.isGameOver = true;
    }
    
    // Remove any existing game over UI
    const existingUI = document.getElementById('game-over-screen');
    if (existingUI) {
      existingUI.remove();
    }
    
    // Remove spectator UI if present
    const spectatorUI = document.getElementById('spectator-overlay');
    if (spectatorUI) {
      spectatorUI.remove();
    }
    
    // Create game over container
    const container = document.createElement('div');
    container.id = 'game-over-screen';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    container.style.color = '#fff';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    container.style.zIndex = '2000';
    container.style.fontFamily = 'Arial, sans-serif';
    
    // Add title
    const title = document.createElement('h1');
    title.textContent = 'GAME OVER';
    title.style.fontSize = '48px';
    title.style.marginBottom = '20px';
    title.style.color = '#ff0000';
    container.appendChild(title);
    
    // Add message
    const message = document.createElement('p');
    message.textContent = 'All players have died';
    message.style.fontSize = '24px';
    message.style.marginBottom = '40px';
    container.appendChild(message);
    
    // Add restart button (only visible to host)
    const restartBtn = document.createElement('button');
    restartBtn.textContent = this.isHost ? 'Restart Game' : 'Waiting for host to restart...';
    restartBtn.style.padding = '12px 24px';
    restartBtn.style.fontSize = '18px';
    restartBtn.style.backgroundColor = this.isHost ? '#4CAF50' : '#555';
    restartBtn.style.color = '#fff';
    restartBtn.style.border = 'none';
    restartBtn.style.borderRadius = '4px';
    restartBtn.style.cursor = this.isHost ? 'pointer' : 'default';
    restartBtn.disabled = !this.isHost;
    
    // Add restart functionality (host only)
    if (this.isHost) {
      restartBtn.addEventListener('click', () => {
        console.log("Host restarting multiplayer game");
        if (this.gameEngine) {
          this.gameEngine.restartGame();
        }
      });
    }
    
    container.appendChild(restartBtn);
    
    // Add to DOM
    document.body.appendChild(container);
  }
  
  /**
   * Notify other players that the game is restarting
   */
  notifyGameRestart() {
    if (!this.isConnected || !this.network) {
      console.log("Cannot notify game restart - not connected to network");
      return;
    }
    
    console.log("Notifying all players of game restart");
    
    // Send game restart notification
    if (this.network.broadcastToAll) {
      this.network.broadcastToAll({
        type: 'gameRestart',
        timestamp: Date.now()
      });
    }
  }
} 