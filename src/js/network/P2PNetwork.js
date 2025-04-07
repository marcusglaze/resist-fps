/**
 * P2P networking module for multiplayer functionality
 * Using PeerJS to handle WebRTC connections
 */
export class P2PNetwork {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.peer = null;
    this.connections = [];
    this.isHost = false;
    this.hostId = null;
    this.clientId = null;
    this.isConnected = false;
    this.onPlayerJoined = null;
    this.onPlayerLeft = null;
    this.onGameStateUpdate = null;
    this.onError = null;
    this.lastStateSent = 0;
    this.stateUpdateInterval = 50; // ms between state updates
    this.peerJSLoaded = false;
    
    // Add window close handler to ensure proper cleanup
    window.addEventListener('beforeunload', this._handleWindowClose.bind(this));
    
    // Load PeerJS from CDN if it's not already loaded
    if (!window.Peer) {
      this.loadPeerJS();
    } else {
      this.peerJSLoaded = true;
    }
  }
  
  /**
   * Handle window close event
   * @private
   */
  _handleWindowClose() {
    console.log("Window closing, cleaning up P2P connections");
    this.disconnect();
  }
  
  /**
   * Load the PeerJS library dynamically
   */
  loadPeerJS() {
    return new Promise((resolve, reject) => {
      console.log("Loading PeerJS from CDN...");
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.4.7/dist/peerjs.min.js';
      script.async = true;
      script.onload = () => {
        console.log("PeerJS loaded successfully");
        this.peerJSLoaded = true;
        resolve();
      };
      script.onerror = (err) => {
        console.error("Failed to load PeerJS", err);
        reject(new Error("Failed to load PeerJS"));
      };
      document.head.appendChild(script);
    });
  }
  
  /**
   * Wait for PeerJS to be loaded
   */
  waitForPeerJS() {
    return new Promise((resolve, reject) => {
      if (this.peerJSLoaded) {
        resolve();
        return;
      }
      
      if (!window.Peer) {
        const checkInterval = setInterval(() => {
          if (window.Peer) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            this.peerJSLoaded = true;
            resolve();
          }
        }, 100);
        
        const timeout = setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error("PeerJS failed to load within timeout"));
        }, 10000);
      } else {
        this.peerJSLoaded = true;
        resolve();
      }
    });
  }
  
  /**
   * Initialize as a host
   * @returns {string} The host ID that others can use to connect
   */
  async initHost() {
    try {
      // Make sure PeerJS is loaded
      await this.waitForPeerJS();
      return await this.createHost();
    } catch (err) {
      console.error("Error initializing host:", err);
      throw err;
    }
  }
  
  /**
   * Create the host connection
   */
  createHost() {
    return new Promise((resolve, reject) => {
      try {
        // Get the server's host
        const host = window.location.hostname;
        const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80);
        const secure = window.location.protocol === 'https:';
        
        console.log("Creating peer with host:", host, "port:", port, "secure:", secure);
        
        // Create a new Peer with a randomized ID (don't let the browser assign it)
        const randomId = 'host_' + Math.random().toString(36).substring(2, 15);
        
        // Create a new Peer using our custom server with better configuration
        this.peer = new Peer(randomId, {
          host: host,
          port: port,
          path: '/peerjs',
          secure: secure,
          debug: 3,
          config: {
            // Add STUN and TURN servers for connection in restrictive networks
            'iceServers': [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ],
            'sdpSemantics': 'unified-plan'
          },
          // Reconnection parameters
          pingInterval: 3000,   // Check connection every 3 seconds
          retryCount: 3,        // Retry 3 times
          retryDelay: 1000,     // 1 second between retries
          // Use less reliable but faster connections with lower overheads
          serialization: 'binary',
          reliable: true        // Use reliable connections
        });
        
        this.peer.on('open', (id) => {
          console.log('Host ID:', id);
          this.hostId = id;
          this.isHost = true;
          this.isConnected = true;
          
          // Keep connection alive with ping
          this.startHeartbeat();
          
          // Set up event handler for new connections
          this.peer.on('connection', (conn) => this.handleNewConnection(conn));
          
          resolve(id);
        });
        
        this.peer.on('error', (err) => {
          console.error('Host peer error:', err);
          
          // Handle specific errors
          if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
            console.log('Attempting to reconnect...');
            // Try to destroy and recreate peer after delay
            setTimeout(() => {
              if (this.peer) {
                this.peer.destroy();
                this.peer = null;
                this.createHost().then(resolve).catch(reject);
              }
            }, 2000);
          } else {
            if (this.onError) this.onError(err);
            reject(err);
          }
        });
        
        this.peer.on('disconnected', () => {
          console.log('Peer disconnected. Attempting to reconnect...');
          
          // Try to reconnect
          this.peer.reconnect();
        });
        
        this.peer.on('close', () => {
          console.log('Peer connection closed.');
          this.stopHeartbeat();
          this.isConnected = false;
        });
      } catch (err) {
        console.error('Failed to create host:', err);
        reject(err);
      }
    });
  }
  
  /**
   * Handle a new connection from a client
   * @param {DataConnection} conn - The new connection
   */
  handleNewConnection(conn) {
    console.log('New player connected:', conn.peer);
    
    // Store the connection
    this.connections.push(conn);
    
    // Set up event handlers for this connection
    conn.on('data', (data) => this.handleData(data, conn));
    
    conn.on('open', () => {
      console.log('Connection to client established:', conn.peer);
      
      // Notify that a new player has joined
      if (this.onPlayerJoined) {
        this.onPlayerJoined(conn.peer);
      }
      
      // Make sure the client gets a complete and accurate game state immediately
      try {
        // Send a complete game state snapshot
        const gameState = this.getGameState();
        console.log(`Sending initial game state to new client with ${gameState.enemies?.length || 0} enemies and round ${gameState.round?.round || 0}`);
        
        // Send the state to the new client
        conn.send({
          type: 'gameState',
          state: gameState
        });
        
        // Stagger repeated sends to ensure reliable state transfer
        setTimeout(() => {
          if (conn.open) {
            conn.send({
              type: 'gameState',
              state: this.getGameState()
            });
          }
        }, 500);
        
        setTimeout(() => {
          if (conn.open) {
            conn.send({
              type: 'gameState',
              state: this.getGameState()
            });
          }
        }, 1500);
      } catch (error) {
        console.error("Error sending initial game state:", error);
      }
    });
    
    conn.on('close', () => {
      console.log('Client disconnected:', conn.peer);
      
      // Remove the connection
      this.connections = this.connections.filter(c => c.peer !== conn.peer);
      
      // Notify that a player has left
      if (this.onPlayerLeft) {
        this.onPlayerLeft(conn.peer);
      }
    });
    
    conn.on('error', (err) => {
      console.error('Connection error:', err);
      if (this.onError) this.onError(err);
    });
  }
  
  /**
   * Join an existing game as a client
   * @param {string} hostId - The host's peer ID to connect to
   */
  async joinGame(hostId) {
    try {
      // Make sure PeerJS is loaded
      await this.waitForPeerJS();
      return await this.connectToHost(hostId);
    } catch (err) {
      console.error("Error joining game:", err);
      throw err;
    }
  }
  
  /**
   * Connect to a host as a client
   * @param {string} hostId - The host's peer ID
   */
  connectToHost(hostId) {
    return new Promise((resolve, reject) => {
      try {
        // Get the server's host
        const host = window.location.hostname;
        const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80);
        const secure = window.location.protocol === 'https:';
        
        console.log("Creating client peer with host:", host, "port:", port, "secure:", secure);
        
        // Create a random ID for the client
        const randomId = 'client_' + Math.random().toString(36).substring(2, 15);
        
        // Create a new Peer using our custom server with better configuration
        this.peer = new Peer(randomId, {
          host: host,
          port: port,
          path: '/peerjs',
          secure: secure,
          debug: 3,
          config: {
            // Add STUN and TURN servers for connection in restrictive networks
            'iceServers': [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ],
            'sdpSemantics': 'unified-plan'
          },
          // Reconnection parameters
          pingInterval: 3000,   // Check connection every 3 seconds
          retryCount: 3,        // Retry 3 times
          retryDelay: 1000,     // 1 second between retries
          // Use less reliable but faster connections with lower overheads
          serialization: 'binary',
          reliable: true        // Use reliable connections
        });
        
        this.peer.on('open', (id) => {
          console.log('Client ID:', id);
          this.clientId = id;
          this.isHost = false;
          this.hostId = hostId;
          
          // Keep connection alive with ping
          this.startHeartbeat();
          
          // Connect to the host
          const conn = this.peer.connect(hostId, {
            reliable: true,
            serialization: 'binary'
          });
          
          conn.on('open', () => {
            console.log('Connected to host:', hostId);
            this.connections.push(conn);
            this.isConnected = true;
            
            // Set up event handlers
            conn.on('data', (data) => this.handleData(data, conn));
            
            conn.on('close', () => {
              console.log('Disconnected from host');
              this.isConnected = false;
              this.connections = [];
              
              if (this.onPlayerLeft) {
                this.onPlayerLeft(hostId);
              }
            });
            
            conn.on('error', (err) => {
              console.error('Connection error:', err);
              if (this.onError) this.onError(err);
            });
            
            resolve(conn);
          });
          
          conn.on('error', (err) => {
            console.error('Connection error:', err);
            if (this.onError) this.onError(err);
            reject(err);
          });
        });
        
        this.peer.on('error', (err) => {
          console.error('Client peer error:', err);
          
          // Handle specific errors
          if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
            console.log('Attempting to reconnect...');
            // Try to destroy and recreate peer after delay
            setTimeout(() => {
              if (this.peer) {
                this.peer.destroy();
                this.peer = null;
                this.connectToHost(hostId).then(resolve).catch(reject);
              }
            }, 2000);
          } else {
            if (this.onError) this.onError(err);
            reject(err);
          }
        });
        
        this.peer.on('disconnected', () => {
          console.log('Peer disconnected. Attempting to reconnect...');
          
          // Try to reconnect
          this.peer.reconnect();
        });
        
        this.peer.on('close', () => {
          console.log('Peer connection closed.');
          this.stopHeartbeat();
          this.isConnected = false;
        });
      } catch (err) {
        console.error('Failed to connect to host:', err);
        reject(err);
      }
    });
  }
  
  /**
   * Handle incoming data from other peers
   * @param {Object} data - The received data
   * @param {DataConnection} conn - The connection that sent the data
   */
  handleData(data, conn) {
    console.log('Received data:', data.type);
    
    switch (data.type) {
      case 'gameState':
        // Update game state with data from host
        if (this.onGameStateUpdate) {
          this.onGameStateUpdate(data.state);
        }
        break;
        
      case 'playerAction':
        // Handle a player action (shooting, movement, etc.)
        this.handlePlayerAction(data.action, conn.peer);
        break;
        
      case 'playerPosition':
        // Update a remote player's position
        this.updatePlayerPosition(data.position, conn.peer);
        break;
        
      case 'chat':
        // Handle chat messages
        if (data.message && data.sender) {
          this.handleChatMessage(data.message, data.sender);
        }
        break;
        
      case 'hostAction':
        // Host is performing an action like pausing or restarting
        this.handleHostAction(data.action);
        break;
        
      case 'respawnPlayer':
        // Host is respawning a player
        if (data.playerId && this.isConnected && !this.isHost && 
            data.playerId === this.clientId) {
          this.handleRespawn();
        }
        break;
        
      case 'hostDisconnect':
        // Host is disconnecting, clean up
        console.log("Host is disconnecting:", data.message);
        if (!this.isHost) {
          // If we're a client and the host is disconnecting, we should disconnect too
          this.disconnect();
          
          // Show a message to the player
          if (this.gameEngine && this.gameEngine.ui) {
            this.gameEngine.ui.showMessage("Host disconnected", "The game host has left the game.");
          }
        }
        break;
        
      default:
        console.warn('Unknown data type received:', data.type);
    }
  }
  
  /**
   * Handle a player action
   * @param {Object} action - The action data
   * @param {string} playerId - The ID of the player who performed the action
   */
  handlePlayerAction(action, playerId) {
    // This would be implemented based on the game mechanics
    console.log(`Player ${playerId} performed action:`, action);
    
    // Handle specific action types
    if (action.type === 'damageEnemy' && this.isHost) {
      // Apply damage to the enemy if we're the host
      this.applyEnemyDamage(action.data, playerId);
    }
    
    // If we're the host, broadcast this to all other clients
    if (this.isHost) {
      this.broadcastToOthers({
        type: 'playerAction',
        action: action,
        playerId: playerId
      }, playerId);
    }
  }
  
  /**
   * Apply damage to an enemy from a client request (host only)
   * @param {Object} damageData - The damage data
   * @param {string} playerId - The ID of the player who did the damage
   */
  applyEnemyDamage(damageData, playerId) {
    if (!this.isHost || !this.gameEngine || !this.gameEngine.scene || 
        !this.gameEngine.scene.room || !this.gameEngine.scene.room.enemyManager) {
      console.warn("Cannot apply enemy damage: not host or game scene not fully initialized");
      return;
    }
    
    try {
      const { enemyId, damage, isHeadshot } = damageData;
      console.log(`Host applying damage from client ${playerId}: ${damage} to enemy ${enemyId} (headshot: ${isHeadshot})`);
      
      // Find the enemy by ID
      const enemyManager = this.gameEngine.scene.room.enemyManager;
      const enemy = enemyManager.enemies.find(e => e.id === enemyId);
      
      if (enemy) {
        // Apply damage to the enemy
        enemy.takeDamage(damage);
        console.log(`Applied ${damage} damage to enemy ${enemyId}, health now: ${enemy.health}`);
        
        // Ensure immediate state update to all clients
        if (enemy.health <= 0) {
          console.log(`Enemy ${enemyId} killed by client ${playerId}`);
          
          // Force a game state update after a short delay to ensure death is synchronized
          setTimeout(() => {
            if (this.broadcastGameState) {
              this.broadcastGameState(true); // Force immediate update
            }
          }, 100);
        }
      } else {
        console.warn(`Enemy with ID ${enemyId} not found`);
      }
    } catch (error) {
      console.error("Error applying enemy damage:", error);
    }
  }
  
  /**
   * Update a remote player's position
   * @param {Object} position - The position data (x, y, z coordinates and rotation)
   * @param {string} playerId - The ID of the player to update
   */
  updatePlayerPosition(position, playerId) {
    // Ensure NetworkManager actually updates the positions of remote players
    if (this.gameEngine && this.gameEngine.networkManager) {
      // Update the player's position in the NetworkManager
      console.log(`Updating position for player ${playerId}:`, position);
      this.gameEngine.networkManager.updateRemotePlayerPosition(playerId, position);
    }
    
    // Forward this position update to other clients if we're the host
    if (this.isHost) {
      this.broadcastToOthers({
        type: 'playerPosition',
        position: position,
        playerId: playerId
      }, playerId);
    }
  }
  
  /**
   * Handle a chat message
   * @param {string} message - The chat message
   * @param {string} sender - The sender's ID
   */
  handleChatMessage(message, sender) {
    console.log(`Chat from ${sender}: ${message}`);
    
    // Display the message in the game's chat UI
    // This would be implemented based on the game's UI system
    
    // If we're the host, broadcast this to all other clients
    if (this.isHost) {
      this.broadcastToOthers({
        type: 'chat',
        message: message,
        sender: sender
      }, sender);
    }
  }
  
  /**
   * Send the current game state to a client
   * @param {DataConnection} conn - The connection to send the state to
   */
  sendGameState(conn) {
    if (!this.gameEngine) return;
    
    // Get the current game state (this would be implemented based on the game)
    const gameState = this.getGameState();
    
    // Send the state to the client
    conn.send({
      type: 'gameState',
      state: gameState
    });
  }
  
  /**
   * Broadcast a message to all connected peers except the sender
   * @param {Object} data - The data to broadcast
   * @param {string} excludePeerId - The peer ID to exclude from the broadcast
   */
  broadcastToOthers(data, excludePeerId) {
    for (const conn of this.connections) {
      if (conn.peer !== excludePeerId) {
        conn.send(data);
      }
    }
  }
  
  /**
   * Broadcast a message to all connected peers
   * @param {Object} data - The data to broadcast
   */
  broadcastToAll(data) {
    if (!this.isConnected) {
      // Just log a debug message instead of a warning
      console.debug("No broadcast: Connection is not established yet, but game continues");
      return;
    }
    
    // If there are no connections, just return silently - the game should still function
    if (this.connections.length === 0) {
      console.debug("No broadcast: No active connections, but game continues");
      return;
    }
    
    for (const conn of this.connections) {
      try {
        // Check if the connection is ready for data
        if (conn.open) {
          conn.send(data);
        } else {
          console.warn(`Connection to ${conn.peer} is not open yet, message queued`);
          // Add event listener to send once open if not already added
          if (!conn._pendingSendHandlerAdded) {
            conn._pendingSendHandlerAdded = true;
            conn.on('open', () => {
              console.log(`Connection to ${conn.peer} now open, sending queued data`);
              conn.send(data);
              conn._pendingSendHandlerAdded = false;
            });
          }
        }
      } catch (err) {
        console.error(`Error sending data to peer ${conn.peer}:`, err);
        // If there's a chronic issue with this connection, we might want to close and remove it
        if (err.message && (
          err.message.includes("Connection is not open") || 
          err.message.includes("Connection is closed")
        )) {
          console.warn(`Removing problematic connection to ${conn.peer}`);
          this.connections = this.connections.filter(c => c.peer !== conn.peer);
        }
      }
    }
  }
  
  /**
   * Get the current game state
   * @returns {Object} The game state object
   */
  getGameState() {
    // This would be implemented to extract the relevant game state
    // from the game engine for synchronization
    
    if (!this.gameEngine) return {};
    
    return {
      playerPositions: this.getPlayerPositions(),
      enemies: this.getEnemiesState(),
      round: this.getRoundInfo(),
      windows: this.getWindowsState(),
      gameStatus: this.getGameStatus(),
      // Add other relevant game state data
    };
  }
  
  /**
   * Get all player positions
   * @returns {Object} Map of player IDs to positions
   */
  getPlayerPositions() {
    const positions = {};
    
    // Add host's position if available
    if (this.gameEngine && this.gameEngine.controls) {
      positions[this.isHost ? this.hostId : this.clientId] = {
        x: this.gameEngine.controls.camera.position.x,
        y: this.gameEngine.controls.camera.position.y,
        z: this.gameEngine.controls.camera.position.z,
        rotationY: this.gameEngine.controls.camera.rotation.y,
        health: this.gameEngine.controls.health || 100,
        isDead: this.gameEngine.controls.isDead || false
      };
    }
    
    // Add known remote player positions
    if (this.gameEngine.networkManager && this.gameEngine.networkManager.remotePlayers) {
      this.gameEngine.networkManager.remotePlayers.forEach((player, id) => {
        if (player.position && id !== (this.isHost ? this.hostId : this.clientId)) {
          positions[id] = {
            ...player.position,
            health: player.health || 100,
            isDead: player.isDead || false
          };
        }
      });
    }
    
    return positions;
  }
  
  /**
   * Get the current state of all enemies
   * @returns {Array} Array of enemy state objects
   */
  getEnemiesState() {
    // This would extract enemy positions, health, etc.
    if (!this.gameEngine.scene || !this.gameEngine.scene.room || !this.gameEngine.scene.room.enemyManager) {
      return [];
    }
    
    // Check if host is dead but there are living remote players
    const isHostDead = this.gameEngine.controls && this.gameEngine.controls.isDead;
    let hasLivingRemotePlayers = false;
    
    if (isHostDead && this.gameEngine.networkManager) {
      const remotePlayers = this.gameEngine.networkManager.remotePlayers;
      if (remotePlayers && remotePlayers.size > 0) {
        remotePlayers.forEach(player => {
          if (!player.isDead) {
            hasLivingRemotePlayers = true;
          }
        });
      }
    }
    
    return this.gameEngine.scene.room.enemyManager.enemies.map(enemy => {
      // Get the position to send
      const position = {
        x: enemy.instance.position.x,
        y: enemy.instance.position.y,
        z: enemy.instance.position.z
      };
      
      // Ensure we're sending non-frozen positions when host is dead
      if (isHostDead && hasLivingRemotePlayers) {
        // Make sure we're not sending the same position repeatedly
        const enemyPositionKey = `enemy_${enemy.id}_lastPos`;
        const lastSentPosition = this._lastSentPositions?.get(enemyPositionKey);
        
        if (lastSentPosition) {
          // Check if position hasn't changed
          const positionUnchanged = 
            Math.abs(lastSentPosition.x - position.x) < 0.01 &&
            Math.abs(lastSentPosition.z - position.z) < 0.01;
          
          if (positionUnchanged) {
            // Position is frozen - add a small movement
            if (Math.random() < 0.05) { // Log occasionally (5% chance)
              console.log(`Detected frozen enemy ${enemy.id} position: [${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}]`);
            }
            
            // Add a small movement in a random direction
            const angle = Math.random() * Math.PI * 2;
            const distance = 0.05 + Math.random() * 0.1; // Small random movement (0.05-0.15 units)
            
            position.x += Math.cos(angle) * distance;
            position.z += Math.sin(angle) * distance;
            
            if (Math.random() < 0.05) { // Log occasionally
              console.log(`Applied movement to frozen enemy: [${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}]`);
            }
          }
        }
        
        // Store this position for next comparison
        if (!this._lastSentPositions) {
          this._lastSentPositions = new Map();
        }
        this._lastSentPositions.set(enemyPositionKey, {...position});
      }
      
      return {
        id: enemy.id || (enemy.id = Math.random().toString(36).substring(2, 15)), // Ensure each enemy has a unique ID
        position: position,
        health: enemy.health,
        type: enemy.type || 'standard', // Include zombie type for proper spawning
        state: (isHostDead && hasLivingRemotePlayers) ? 'moving' : (enemy.state || 'idle'), // Ensure moving state when host is dead
        targetWindow: enemy.targetWindow ? {
          index: this.gameEngine.scene.room.windows.indexOf(enemy.targetWindow)
        } : null, // Include target window information
        insideRoom: enemy.insideRoom || false
      };
    });
  }
  
  /**
   * Get information about the current round
   * @returns {Object} Round information
   */
  getRoundInfo() {
    if (!this.gameEngine.scene || !this.gameEngine.scene.room || !this.gameEngine.scene.room.enemyManager) {
      return { round: 0 };
    }
    
    return {
      round: this.gameEngine.scene.room.enemyManager.currentRound,
      zombiesRemaining: this.gameEngine.scene.room.enemyManager.zombiesRemaining,
      roundActive: this.gameEngine.scene.room.enemyManager.roundActive
    };
  }
  
  /**
   * Get the current state of all windows
   * @returns {Array} Array of window state objects
   */
  getWindowsState() {
    if (!this.gameEngine.scene || !this.gameEngine.scene.room) {
      return [];
    }
    
    // Example implementation
    return this.gameEngine.scene.room.windows.map(window => ({
      position: {
        x: window.instance.position.x,
        y: window.instance.position.y,
        z: window.instance.position.z
      },
      boardsCount: window.boardsCount,
      isOpen: window.isOpen,
      health: window.boardHealths // Array of health values for each board
    }));
  }
  
  /**
   * Get game status information like paused state, game over state, etc.
   * @returns {Object} Game status information
   */
  getGameStatus() {
    if (!this.gameEngine) return {};
    
    return {
      isPaused: this.gameEngine.isPaused || false,
      isGameOver: this.gameEngine.isGameOver || false,
      allPlayersDead: this.areAllPlayersDead()
    };
  }
  
  /**
   * Check if all players are dead
   * @returns {boolean} True if all players are dead
   */
  areAllPlayersDead() {
    // Check local player
    const localPlayerDead = this.gameEngine.controls && this.gameEngine.controls.isDead;
    
    // If the local player (host) is alive, then not all players are dead
    if (!localPlayerDead) return false;
    
    // Check remote players
    let allRemotePlayersDead = true;
    
    if (this.gameEngine.networkManager && this.gameEngine.networkManager.remotePlayers.size > 0) {
      this.gameEngine.networkManager.remotePlayers.forEach(player => {
        if (!player.isDead) {
          allRemotePlayersDead = false;
        }
      });
    }
    
    // If host is dead but at least one remote player is alive, return false
    return allRemotePlayersDead;
  }
  
  /**
   * Handle host actions like pause, restart, etc.
   * @param {Object} action - The action data
   */
  handleHostAction(action) {
    if (!this.gameEngine || this.isHost) return;
    
    console.log('Received host action:', action.type);
    
    switch (action.type) {
      case 'pause':
        // Set pause state before showing UI
        this.gameEngine.isPaused = true;
        this.gameEngine.pauseGame();
        break;
        
      case 'resume':
        console.log('Processing resume command from host');
        // Set unpause state immediately
        this.gameEngine.isPaused = false;
        
        // Remove pause UI if it exists
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) {
          console.log('Removing pause menu from host resume command');
          pauseMenu.remove();
        }
        
        // Resume game
        this.gameEngine.resumeGame();
        break;
        
      case 'restart':
        this.gameEngine.restartGame();
        break;
        
      case 'endGame':
        this.gameEngine.endGame();
        break;
    }
  }
  
  /**
   * Handle player respawn command from host
   */
  handleRespawn() {
    if (!this.gameEngine || !this.gameEngine.controls) return;
    
    console.log('Host commanded player respawn');
    
    // Only respawn if player is dead
    if (this.gameEngine.controls.isDead) {
      // Reset player state
      this.gameEngine.controls.resetHealth();
      this.gameEngine.controls.isDead = false;
      
      // Re-lock pointer
      document.body.requestPointerLock();
      
      // Hide game over screen if visible
      const gameOverMenu = document.getElementById('game-over-menu');
      if (gameOverMenu) {
        gameOverMenu.remove();
      }
      
      // Unpause game if it was paused
      if (this.gameEngine.isPaused) {
        this.gameEngine.resumeGame();
      }
      
      // Send an immediate position update to broadcast the new death state
      // This ensures that other clients update the visual state correctly
      this.sendPlayerPosition();
      
      // Force multiple position updates to ensure the update propagates
      const sendAdditionalUpdates = () => {
        if (!this.isConnected || !this.gameEngine || !this.gameEngine.controls) return;
        this.sendPlayerPosition();
      };
      
      // Send additional updates over the next second to ensure sync
      setTimeout(sendAdditionalUpdates, 100);
      setTimeout(sendAdditionalUpdates, 300);
      setTimeout(sendAdditionalUpdates, 600);
      setTimeout(sendAdditionalUpdates, 1000);
      
      console.log('Player respawned successfully');
    }
  }
  
  /**
   * Send player position update
   * @param {Object} weaponInfo - Optional information about the player's current weapon
   */
  sendPlayerPosition(weaponInfo = null) {
    if (!this.isConnected || !this.gameEngine || !this.gameEngine.controls) return;
    
    // Get current position and orientation
    const position = {
      x: this.gameEngine.controls.camera.position.x,
      y: this.gameEngine.controls.camera.position.y,
      z: this.gameEngine.controls.camera.position.z,
      rotationY: this.gameEngine.controls.camera.rotation.y,
      weapon: weaponInfo // Include weapon information if provided
    };
    
    // Always include critical state information
    position.health = this.gameEngine.controls.health || 100;
    position.isDead = this.gameEngine.controls.isDead || false;
    
    // Special logging for death state changes
    const prevIsDead = this._lastSentDeathState || false;
    if (prevIsDead !== position.isDead) {
      console.log(`Sending player death state change: isDead=${position.isDead}, health=${position.health}`);
      this._lastSentDeathState = position.isDead;
    }
    
    // Send position update to all connected peers
    this.broadcastToAll({
      type: 'playerPosition',
      position: position,
      playerId: this.isHost ? this.hostId : this.clientId
    });
  }
  
  /**
   * Send a player action (shooting, reloading, etc.)
   * @param {string} actionType - The type of action
   * @param {Object} actionData - Additional data for the action
   */
  sendPlayerAction(actionType, actionData) {
    if (!this.isConnected) return;
    
    const action = {
      type: actionType,
      data: actionData,
      timestamp: Date.now()
    };
    
    this.broadcastToAll({
      type: 'playerAction',
      action: action,
      playerId: this.isHost ? this.hostId : this.clientId
    });
  }
  
  /**
   * Send a chat message
   * @param {string} message - The message to send
   */
  sendChatMessage(message) {
    if (!this.isConnected) return;
    
    this.broadcastToAll({
      type: 'chat',
      message: message,
      sender: this.isHost ? this.hostId : this.clientId
    });
    
    // Also display the message locally
    this.handleChatMessage(message, 'You');
  }
  
  /**
   * Start sending game state updates to clients
   */
  startGameStateUpdates() {
    if (!this.isHost) return;
    
    // Clear any existing update interval
    if (this._stateUpdateInterval) {
      clearInterval(this._stateUpdateInterval);
    }
    
    console.log("Starting game state update broadcasts");
    
    // Start periodic game state updates
    this._stateUpdateInterval = setInterval(() => {
      try {
        // Use our improved broadcastGameState method
        this.broadcastGameState();
      } catch (error) {
        console.error("Error in game state update:", error);
      }
    }, this.stateUpdateInterval);
    
    // Send an immediate update to initialize clients
    setTimeout(() => {
      this.broadcastGameState(true);
    }, 200);
  }
  
  /**
   * Stop regular game state updates
   */
  stopStateUpdates() {
    if (this.stateUpdateInterval) {
      clearInterval(this.stateUpdateInterval);
    }
  }
  
  /**
   * Disconnect from the P2P network
   */
  disconnect() {
    console.log("Disconnecting from P2P network");
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Stop state updates if hosting
    this.stopStateUpdates();
    
    // Close all connections
    for (const conn of this.connections) {
      try {
        conn.close();
      } catch (err) {
        console.error("Error closing connection:", err);
      }
    }
    
    // Close the peer connection
    if (this.peer) {
      try {
        // First emit a disconnect event to notify others that we're leaving
        if (this.isHost && this.peer.socket && typeof this.peer.socket.send === 'function') {
          try {
            // Send a final message to all connected peers that we're leaving
            this.broadcastToAll({
              type: 'hostDisconnect',
              message: 'Host is disconnecting'
            });
          } catch (e) {
            console.error("Error sending disconnect message:", e);
          }
        }
        
        // Properly destroy the peer
        this.peer.destroy();
      } catch (err) {
        console.error("Error destroying peer:", err);
      }
      this.peer = null;
    }
    
    // Reset state
    this.connections = [];
    this.isHost = false;
    this.hostId = null;
    this.clientId = null;
    this.isConnected = false;
    
    console.log("P2P network disconnected");
    
    // Notify the game that we've disconnected
    if (this.onPlayerLeft && this.hostId) {
      this.onPlayerLeft(this.hostId);
    }
  }
  
  /**
   * Start a heartbeat to keep the WebSocket connection alive
   */
  startHeartbeat() {
    // Clear any existing heartbeat
    this.stopHeartbeat();
    
    // Create a new heartbeat interval
    this.heartbeatInterval = setInterval(() => {
      // Send a ping to the server endpoint to keep connections alive
      fetch('/ping')
        .then(() => console.log('Heartbeat sent'))
        .catch(err => console.error('Heartbeat error:', err));
      
      // Remove the custom WebSocket ping as it's causing "Invalid message" errors
      // PeerJS already has its own internal ping mechanism
    }, 15000); // Every 15 seconds
  }
  
  /**
   * Stop the heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  /**
   * Host control: Pause game for all players
   */
  hostPauseGame() {
    if (!this.isHost || !this.isConnected) return;
    
    console.log("Host sending pause command to all clients");
    
    this.broadcastToAll({
      type: 'hostAction',
      action: {
        type: 'pause'
      }
    });
  }
  
  /**
   * Host control: Resume game for all players
   */
  hostResumeGame() {
    if (!this.isHost || !this.isConnected) return;
    
    console.log("Host sending resume command to all clients");
    
    // First update the gameStatus to reflect the new unpaused state
    if (this.gameEngine) {
      this.gameEngine.isPaused = false;
    }
    
    // Send a specific resume command
    this.broadcastToAll({
      type: 'hostAction',
      action: {
        type: 'resume'
      }
    });
    
    // Also immediately send the updated game state to ensure synchronization
    setTimeout(() => {
      this.broadcastToAll({
        type: 'gameState',
        state: this.getGameState()
      });
    }, 100); // Small delay to ensure clients process the resume command first
  }
  
  /**
   * Host control: Restart game for all players
   */
  hostRestartGame() {
    if (!this.isHost || !this.isConnected) return;
    
    console.log("Host sending restart command to all clients");
    
    this.broadcastToAll({
      type: 'hostAction',
      action: {
        type: 'restart'
      }
    });
  }
  
  /**
   * Host control: Respawn a specific player
   * @param {string} playerId - The ID of the player to respawn
   */
  hostRespawnPlayer(playerId) {
    if (!this.isHost || !this.isConnected) {
      console.warn("Cannot respawn player: not host or not connected");
      return;
    }
    
    console.log(`Host sending respawn command to player: ${playerId}`);
    
    // Find the connection for this player
    const playerConn = this.connections.find(conn => conn.peer === playerId);
    
    if (playerConn && playerConn.open) {
      try {
        // Send respawn command to the specific player
        playerConn.send({
          type: 'respawnPlayer',
          playerId: playerId
        });
        
        console.log(`Respawn command sent to player: ${playerId}`);
        
        // Force a game state update to all clients to ensure synchronization
        this.broadcastGameState(true);
        
        return true;
      } catch (error) {
        console.error(`Error sending respawn command to player ${playerId}:`, error);
        return false;
      }
    } else {
      console.warn(`Failed to send respawn command: Connection to player ${playerId} not found or not open`);
      return false;
    }
  }
  
  /**
   * Broadcast the current game state to all connected clients
   * @param {boolean} force - Whether to force sending regardless of time since last update
   * @returns {boolean} True if broadcast was sent, false otherwise
   */
  broadcastGameState(force = false) {
    if (!this.isHost || !this.isConnected) return false;
    
    const now = Date.now();
    
    // Check if host is dead but there are living remote players
    const isHostDead = this.gameEngine.controls && this.gameEngine.controls.isDead;
    let hasLivingRemotePlayers = false;
    let updateInterval = this.stateUpdateInterval; // Default interval
    
    // Check for living remote players
    if (isHostDead && this.gameEngine.networkManager) {
      const remotePlayers = this.gameEngine.networkManager.remotePlayers;
      if (remotePlayers && remotePlayers.size > 0) {
        remotePlayers.forEach(player => {
          if (!player.isDead) {
            hasLivingRemotePlayers = true;
          }
        });
      }
      
      // Use faster update interval when host is dead but remote players are alive
      if (hasLivingRemotePlayers) {
        // More frequent updates to keep enemies moving smoothly
        updateInterval = this.stateUpdateInterval * 0.5; // Twice as fast
        
        if (Math.random() < 0.02) { // Log occasionally
          console.log("Host dead but remote players alive: Using faster state update interval");
        }
      }
    }
    
    // Rate limit state updates unless forced
    if (!force && now - this.lastStateSent < updateInterval) {
      return false;
    }
    
    // Get current game state
    const gameState = this.getGameState();
    
    // Log state updates if forced or significant changes
    if (force) {
      console.log("Forced game state broadcast:", {
        playerCount: Object.keys(gameState.playerPositions || {}).length,
        enemyCount: (gameState.enemies || []).length,
        round: gameState.round?.round,
        windowCount: (gameState.windows || []).length
      });
    }
    
    // Send to all connected peers
    let broadcastSuccess = false;
    this.connections.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send({
            type: 'gameState',
            state: gameState
          });
          broadcastSuccess = true;
        } catch (error) {
          console.error(`Error broadcasting game state to ${conn.peer}:`, error);
        }
      }
    });
    
    // Update last sent time
    if (broadcastSuccess) {
      this.lastStateSent = now;
    }
    
    return broadcastSuccess;
  }
} 