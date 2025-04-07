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
    this.lastStateSentLog = 0; // For throttling log messages
    this.stateUpdateInterval = 1000; // Send updates every second
    this.peerJSLoaded = false;
    
    // Direct reference to the host connection (for clients)
    this.hostConnection = null;
    
    // Add debounce mechanism for client actions
    this.lastClientActionTime = 0;
    this.clientActionDebounceTime = 500; // ms to wait after client action before broadcasting state
    
    // Tracking for reliable action delivery
    this._pendingActions = {};
    this._maxActionRetries = 5;
    this._actionRetryInterval = 150; // ms
    
    // Add window close handler to ensure proper cleanup
    window.addEventListener('beforeunload', this._handleWindowClose.bind(this));
    
    // Load PeerJS from CDN if it's not already loaded
    if (!window.Peer) {
      this.loadPeerJS();
    } else {
      this.peerJSLoaded = true;
    }
    
    console.log("NETWORK: P2PNetwork constructor initialized");
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
            
            // Store a direct reference to the host connection for easier access
            this.hostConnection = conn;
            
            this.isConnected = true;
            
            // Set up event handlers
            conn.on('data', (data) => this.handleData(data, conn));
            
            conn.on('close', () => {
              console.log('Disconnected from host');
              this.isConnected = false;
              this.connections = [];
              this.hostConnection = null; // Clear the host connection reference
              
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
    
    if (!data || !data.type) {
      console.warn('Invalid data received, missing type:', data);
      return;
    }
    
    try {
      switch(data.type) {
        case 'gameState':
          // Update the game state with data from host
          if (!this.isHost) {
            this.handleGameState(data.state);
          }
          break;
        
        case 'playerAction':
          // Handle player actions (host only)
          if (this.isHost) {
            this.handlePlayerAction(conn.peer, data);
          }
          break;
          
        case 'actionResult':
          // Handle result of an action we sent to the host
          if (!this.isHost && data.actionId) {
            console.log(`NETWORK: Received action result for ${data.actionId}: ${data.result}`);
            this.handleActionResult(data);
          }
          break;
          
        case 'actionAck':
          // Handle acknowledgment for a player action
          if (!this.isHost && data.actionId) {
            console.log(`NETWORK: Received acknowledgment for action ${data.actionId}`);
            this.confirmAction(data.actionId);
          }
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
        
        case 'enemyDamageConfirmed':
          // Host confirmed damage to an enemy
          if (!this.isHost && this.gameEngine) {
            this.handleEnemyDamageConfirmation(data);
          }
          break;
        
        case 'enemyDamageError':
          // Host reported error with enemy damage
          if (!this.isHost) {
            console.warn(`Error damaging enemy: ${data.error} (Enemy ID: ${data.enemyId})`);
          }
          break;
        
        case 'windowUpdated':
          // Handle window update event
          if (!this.isHost && this.gameEngine && this.gameEngine.networkManager) {
            console.log("Received window update event, forwarding to NetworkManager");
            this.gameEngine.networkManager.handleWindowUpdate(data);
          }
          break;
        
        case 'assumeEnemyControl':
          // Host is dead and we're being asked to help control enemies
          if (!this.isHost && this.gameEngine) {
            console.log("TAKEOVER: Received request to assume enemy control while host is dead");
            this.handleAssumeEnemyControl(data);
          }
          break;
          
        case 'relinquishEnemyControl':
          // Host is alive again, relinquish enemy control
          if (!this.isHost && this.gameEngine) {
            console.log("TAKEOVER: Received request to relinquish enemy control");
            this.handleRelinquishEnemyControl(data);
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
    } catch (error) {
      console.error('Error handling received data:', error);
    }
  }
  
  /**
   * Handle a player action
   * @param {string} playerId - The player ID
   * @param {Object} data - The action data
   */
  handlePlayerAction(playerId, data) {
    // Log all received actions clearly with distinctive markers
    console.log("⭐⭐⭐ HOST RECEIVED PLAYER ACTION ⭐⭐⭐");
    console.log(`Action type: ${data.actionType}, from player: ${playerId}`);
    console.log("Action data:", data.actionData);
    
    if (!this.isHost) {
      console.warn("Received player action but not host - ignoring");
      return;
    }
    
    try {
      // Process the action based on type
      let result = null;
      
      switch (data.actionType) {
        case 'damageEnemy':
          result = this.applyEnemyDamage(data.actionData, playerId);
          break;
          
        case 'addWindowBoard':
          console.log("HOST: Processing window boarding action from client", data.actionData);
          result = this.applyWindowBoarding(data.actionData, playerId);
          
          if (result) {
            console.log("HOST: Window boarding successful, sending confirmation", result);
          } else {
            console.warn("HOST: Window boarding failed, sending failure notification");
          }
          break;
          
        case 'damageWindowBoard':
          result = this.applyWindowBoardDamage(data.actionData, playerId);
          break;
          
        // ... other action types ...
          
        default:
          console.warn(`Unknown player action type: ${data.actionType}`);
      }
      
      // Send confirmation to the client that their action was processed
      if (data.actionId) {
        // Find the connection for this player
        const playerConn = this.connections.find(conn => conn.peer === playerId);
        
        if (playerConn) {
          const confirmationMessage = {
            type: 'actionResult',
            actionId: data.actionId,
            actionType: data.actionType,
            result: result ? 'success' : 'failure',
            resultData: result
          };
          
          console.log(`Sending action confirmation to player ${playerId}:`, confirmationMessage);
          playerConn.send(confirmationMessage);
        }
      }
    } catch (error) {
      console.error("Error handling player action:", error);
    }
  }
  
  /**
   * Apply damage to an enemy from a client request (host only)
   * @param {Object} damageData - The damage data
   * @param {string} playerId - The ID of the player who did the damage
   * @returns {Object|null} Result data for the action, or null if failed
   */
  applyEnemyDamage(damageData, playerId) {
    if (!this.isHost || !this.gameEngine || !this.gameEngine.scene || 
        !this.gameEngine.scene.room || !this.gameEngine.scene.room.enemyManager) {
      console.warn("Cannot apply enemy damage: not host or game scene not fully initialized");
      return null;
    }
    
    // Record the time of this client action to prevent immediate state overrides
    this.lastClientActionTime = Date.now();
    
    try {
      const { enemyId, damage, isHeadshot, originalHealth, newHealth, isDead, timestamp } = damageData;
      
      if (!enemyId) {
        console.error("Invalid enemy damage data: missing enemyId", damageData);
        return null;
      }
      
      console.log(`NETWORK: Host applying damage from client ${playerId}: ${damage} to enemy ${enemyId} (headshot: ${isHeadshot}, client health: ${newHealth}, timestamp: ${timestamp})`);
      
      // Find the enemy by ID
      const enemyManager = this.gameEngine.scene.room.enemyManager;
      
      // Log info about all available enemies to help with debugging
      console.log(`Current enemies: ${enemyManager.enemies.length}`, 
                  enemyManager.enemies.map(e => e.id).join(', '));
      
      const enemy = enemyManager.enemies.find(e => e.id === enemyId);
      
      if (enemy) {
        // Store health before damage for comparison
        const healthBefore = enemy.health;
        
        // Apply damage to the enemy
        enemy.takeDamage(damage);
        
        // Calculate actual damage applied (in case of limits or other factors)
        const actualDamage = healthBefore - enemy.health;
        
        console.log(`NETWORK: Applied ${actualDamage} damage to enemy ${enemyId}, health changed from ${healthBefore} to ${enemy.health}`);
        
        // Create result data
        const resultData = {
          enemyId: enemyId,
          damage: actualDamage,
          health: enemy.health,
          isDead: enemy.health <= 0,
          isHeadshot: isHeadshot,
          timestamp: timestamp || Date.now(),
          // Add comparison with client data
          clientHealth: newHealth,
          healthDifference: newHealth - enemy.health,
          clientIsDead: isDead
        };
        
        // Send confirmation of damage back to ALL clients
        // This ensures everyone sees consistent enemy health
        this.broadcastToAll({
          type: 'enemyDamageConfirmed',
          ...resultData
        });
        
        // Ensure immediate state update to all clients
        if (enemy.health <= 0) {
          console.log(`NETWORK: Enemy ${enemyId} killed by client ${playerId}`);
          
          // Force a game state update after the debounce period
          setTimeout(() => {
            if (this.broadcastGameState) {
              this.broadcastGameState(true); // Force immediate update
            }
          }, this.clientActionDebounceTime + 50); // Delayed update
        } else {
          // Even if the enemy isn't dead, still update all clients after a hit
          // This keeps all clients updated with the enemy's current health
          setTimeout(() => {
            if (this.broadcastGameState) {
              this.broadcastGameState(true); // Force update for any damage
            }
          }, this.clientActionDebounceTime + 50); // Delayed update
        }
        
        return resultData;
      } else {
        console.warn(`NETWORK: Enemy with ID ${enemyId} not found. Available IDs: ${enemyManager.enemies.map(e => e.id).join(', ')}`);
        // Send error back to client
        this.sendToPlayer(playerId, {
          type: 'enemyDamageError',
          enemyId: enemyId,
          error: 'Enemy not found'
        });
        return null;
      }
    } catch (error) {
      console.error("Error applying enemy damage:", error);
      return null;
    }
  }
  
  /**
   * Apply window boarding action from client (host only)
   * @param {Object} boardData - The window boarding data
   * @param {string} playerId - The ID of the player who placed the board
   * @returns {Object|null} Result data with window state, or null if failed
   */
  applyWindowBoarding(boardData, playerId) {
    if (!this.isHost || !this.gameEngine || !this.gameEngine.scene || 
        !this.gameEngine.scene.room) {
      console.warn("NETWORK: Cannot apply window boarding: not host or game scene not fully initialized");
      return null;
    }
    
    try {
      const { windowIndex, boardsCount, boardHealths, timestamp } = boardData;
      console.log(`NETWORK: Host applying window board action from ${playerId} for window ${windowIndex}`);
      
      // Validate window index
      const room = this.gameEngine.scene.room;
      
      if (!room.windows || 
          !Array.isArray(room.windows) || 
          windowIndex < 0 || 
          windowIndex >= room.windows.length) {
        console.warn(`NETWORK: Invalid window index: ${windowIndex}`);
        return null;
      }
      
      const window = room.windows[windowIndex];
      
      if (!window) {
        console.warn(`NETWORK: Window at index ${windowIndex} not found`);
        return null;
      }
      
      console.log(`NETWORK: Found window at index ${windowIndex}, current boards: ${window.boardsCount}, adding board...`);
      
      // Update the window state by adding a board
      const boardsBeforeAdd = window.boardsCount;
      const result = window.addBoard();
      console.log(`NETWORK: Board add result: ${result ? 'success' : 'failed'}, new count: ${window.boardsCount}`);
      
      // Check if the board was actually added
      if (result && window.boardsCount > boardsBeforeAdd) {
        // Update board health values if provided
        if (Array.isArray(boardHealths) && boardHealths.length > 0) {
          // Copy health values (slice to match current board count)
          window.boardHealths = [...boardHealths].slice(0, window.boardsCount);
          console.log(`NETWORK: Updated board health values: ${window.boardHealths.join(', ')}`);
        }
        
        // Create result data
        const resultData = {
          windowIndex: windowIndex,
          boardsCount: window.boardsCount,
          boardHealths: [...window.boardHealths],
          isOpen: window.isOpen,
          timestamp: timestamp || Date.now()
        };
        
        // Force a game state update to all clients AFTER the debounce period
        setTimeout(() => {
          if (this.broadcastGameState) {
            console.log("NETWORK: Broadcasting updated game state to all clients (after window boarding)");
            this.broadcastGameState(true); // Force immediate update
          }
        }, this.clientActionDebounceTime + 50);
        
        // Send a specific window update event immediately
        this.broadcastToAll({
          type: 'windowUpdated',
          ...resultData
        });
        
        return resultData;
      } else {
        console.warn(`NETWORK: Failed to add board to window ${windowIndex}, current count: ${window.boardsCount}, max: ${window.maxBoards}`);
        return null;
      }
    } catch (error) {
      console.error("NETWORK: Error applying window boarding:", error);
      return null;
    }
  }
  
  /**
   * Apply window board removal action from client (host only)
   * @param {Object} boardData - The window board removal data
   * @param {string} playerId - The ID of the player who removed the board
   */
  applyWindowBoardRemoval(boardData, playerId) {
    if (!this.isHost || !this.gameEngine || !this.gameEngine.scene || 
        !this.gameEngine.scene.room) {
      console.warn("Cannot apply window board removal: not host or game scene not fully initialized");
      return;
    }
    
    try {
      const { windowIndex, boardsCount, boardHealths } = boardData;
      console.log(`Host applying window board removal from client ${playerId}: window ${windowIndex}, boards ${boardsCount}`);
      
      // Get the window by index
      const room = this.gameEngine.scene.room;
      const window = room.windows[windowIndex];
      
      if (window) {
        // Update the window state by removing a board
        window.removeBoard();
        
        // Force a game state update to all clients
        setTimeout(() => {
          if (this.broadcastGameState) {
            this.broadcastGameState(true); // Force immediate update
          }
        }, 50);
      } else {
        console.warn(`Window with index ${windowIndex} not found`);
      }
    } catch (error) {
      console.error("Error applying window board removal:", error);
    }
  }
  
  /**
   * Apply window board damage action from client (host only)
   * @param {Object} boardData - The window board damage data
   * @param {string} playerId - The ID of the player or entity who damaged the board
   */
  applyWindowBoardDamage(boardData, playerId) {
    if (!this.isHost || !this.gameEngine || !this.gameEngine.scene || 
        !this.gameEngine.scene.room) {
      console.warn("Cannot apply window board damage: not host or game scene not fully initialized");
      return;
    }
    
    try {
      const { windowIndex, boardsCount, boardHealths, boardsRemoved } = boardData;
      console.log(`Host applying window board damage from ${playerId}: window ${windowIndex}, boards ${boardsCount}`);
      
      // Get the window by index
      const room = this.gameEngine.scene.room;
      const window = room.windows[windowIndex];
      
      if (window) {
        // Update the window state by syncing the health values
        window.boardHealths = [...boardHealths];
        
        // If any boards were removed due to damage, remove them on the host side too
        if (boardsRemoved && boardsRemoved > 0) {
          for (let i = 0; i < boardsRemoved; i++) {
            window.removeBoard();
          }
        }
        
        // Update board appearances
        window.boardHealths.forEach((health, boardIndex) => {
          if (window.updateBoardAppearance) {
            window.updateBoardAppearance(boardIndex);
          }
        });
        
        // Force a game state update to all clients
        setTimeout(() => {
          if (this.broadcastGameState) {
            this.broadcastGameState(true); // Force immediate update
          }
        }, 50);
      } else {
        console.warn(`Window with index ${windowIndex} not found`);
      }
    } catch (error) {
      console.error("Error applying window board damage:", error);
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
   * Send data to a specific player
   * @param {string} playerId - The ID of the player to send data to
   * @param {Object} data - The data to send
   * @returns {boolean} True if sent successfully, false otherwise
   */
  sendToPlayer(playerId, data) {
    if (!this.isConnected) {
      console.debug("Cannot send to player: Not connected");
      return false;
    }
    
    // Find the connection for this player
    const conn = this.connections.find(c => c.peer === playerId);
    
    if (!conn) {
      console.warn(`No connection found for player ${playerId}`);
      return false;
    }
    
    if (!conn.open) {
      console.warn(`Connection to player ${playerId} is not open`);
      return false;
    }
    
    try {
      conn.send(data);
      return true;
    } catch (err) {
      console.error(`Error sending data to player ${playerId}:`, err);
      return false;
    }
  }
  
  /**
   * Get current game state for broadcasting to clients
   * @returns {Object} The current game state
   */
  getGameState() {
    if (!this.isHost || !this.gameEngine) {
      return {};
    }

    try {
      const state = {
        timestamp: Date.now()
      };

      // Get player positions
      state.playerPositions = this.getAllPlayerPositions();
      
      // Get enemy positions if available
      if (this.gameEngine.scene && this.gameEngine.scene.room && 
          this.gameEngine.scene.room.enemyManager) {
        const enemyManager = this.gameEngine.scene.room.enemyManager;
        state.enemies = enemyManager.enemies.map(enemy => ({
          id: enemy.id,
          position: {
            x: enemy.instance.position.x,
            y: enemy.instance.position.y,
            z: enemy.instance.position.z
          },
          rotation: {
            y: enemy.instance.rotation.y
          },
          state: enemy.state,
          health: enemy.health,
          maxHealth: enemy.maxHealth,
          isDead: enemy.isDead || enemy.markedForRemoval,
          type: enemy.type || 'standard'
        }));
        
        // Include round information
        state.round = {
          round: enemyManager.currentRound,
          zombiesRemaining: enemyManager.zombiesRemaining,
          roundActive: enemyManager.roundActive,
          timeSinceLastRound: enemyManager.timeSinceLastRound
        };
      }
      
      // Include window states
      if (this.gameEngine.scene && this.gameEngine.scene.room && 
          this.gameEngine.scene.room.windows) {
        state.windows = this.gameEngine.scene.room.windows.map((window, index) => ({
          index: index,
          boardsCount: window.boardsCount,
          maxBoards: window.maxBoards,
          isBreaking: window.isBreaking,
          health: window.health
        }));
      }
      
      // Include game status information
      state.gameStatus = {
        isGameOver: this.gameEngine.isGameOver,
        isPaused: this.gameEngine.isPaused,
        allPlayersDead: this.allPlayersAreDead()
      };
      
      return state;
    } catch (error) {
      console.error("Error generating game state:", error);
      return {};
    }
  }
  
  /**
   * Check if all players in the game are dead
   * @returns {boolean} True if all players are dead
   */
  allPlayersAreDead() {
    // Start with checking the host
    let allDead = this.gameEngine.controls && this.gameEngine.controls.isDead;
    
    // If host is alive, we can return false immediately
    if (!allDead) {
      return false;
    }
    
    // Check remote players
    if (this.gameEngine.networkManager && this.gameEngine.networkManager.remotePlayers) {
      const remotePlayers = this.gameEngine.networkManager.remotePlayers;
      if (remotePlayers.size > 0) {
        let anyAlive = false;
        remotePlayers.forEach(player => {
          if (!player.isDead) {
            anyAlive = true;
          }
        });
        
        // If any remote player is alive, not all are dead
        return !anyAlive;
      }
    }
    
    // Default to host state if no remote players
    return allDead;
  }
  
  /**
   * Handle relinquishing enemy control
   * @param {Object} data - Control data
   */
  handleRelinquishEnemyControl(data) {
    if (this.isHost || !this._hasEnemyControlAuthority) {
      return;
    }
    
    console.log("CLIENT TAKEOVER DEACTIVATED: Relinquishing control of enemies");
    
    // Clear takeover flag
    this._hasEnemyControlAuthority = false;
    
    // Clear interval if it exists
    if (this._enemyTakeoverInterval) {
      clearInterval(this._enemyTakeoverInterval);
      this._enemyTakeoverInterval = null;
    }
    
    // Remove client-controlled flags from enemies
    if (this.gameEngine && this.gameEngine.scene && 
        this.gameEngine.scene.room && this.gameEngine.scene.room.enemyManager) {
      const enemyManager = this.gameEngine.scene.room.enemyManager;
      
      if (enemyManager.enemies && enemyManager.enemies.length > 0) {
        enemyManager.enemies.forEach(enemy => {
          enemy._clientControlled = false;
        });
      }
    }
    
    // Notify the player
    if (this.gameEngine.controls) {
      this.gameEngine.controls.showNotification("Host has resumed control of enemies", 3000);
    }
  }
  
  /**
   * Handle data received from a peer
   * @param {any} data - Data received
   * @param {Peer.DataConnection} conn - The connection that sent the data
   */
  receiveData(data, conn) {
    try {
      // Log incoming data with some basic info
      if (data.type !== 'gameState') { // Don't log game state updates, too noisy
        console.log(`Received ${data.type} from ${conn.peer}`);
      }
      
      // Process data based on type
      switch (data.type) {
        case 'gameState':
          // Update the game state with data from host
          if (!this.isHost) {
            this.handleGameState(data.state);
          }
          break;
        
        case 'playerAction':
          // Handle player actions (host only)
          if (this.isHost) {
            this.handlePlayerAction(conn.peer, data);
          }
          break;
          
        case 'actionResult':
          // Handle result of an action we sent to the host
          if (!this.isHost && data.actionId) {
            console.log(`NETWORK: Received action result for ${data.actionId}: ${data.result}`);
            this.handleActionResult(data);
          }
          break;
          
        case 'actionAck':
          // Handle acknowledgment for a player action
          if (!this.isHost && data.actionId) {
            console.log(`NETWORK: Received acknowledgment for action ${data.actionId}`);
            this.confirmAction(data.actionId);
          }
          break;
        
        case 'playerPosition':
          // Update a remote player's position
          this.updatePlayerPosition(data.position, conn.peer);
          break;
          
        case 'clientEnemyUpdates':
          // Handle enemy updates from a client with takeover authority
          if (this.isHost && this._deadHostClientTakeover === conn.peer) {
            console.log("TAKEOVER: Received enemy updates from authorized client");
            this.handleClientEnemyUpdates(data, conn.peer);
          }
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
        
        case 'enemyDamageConfirmed':
          // Host confirmed damage to an enemy
          if (!this.isHost && this.gameEngine) {
            this.handleEnemyDamageConfirmation(data);
          }
          break;
        
        case 'enemyDamageError':
          // Host reported error with enemy damage
          if (!this.isHost) {
            console.warn(`Error damaging enemy: ${data.error} (Enemy ID: ${data.enemyId})`);
          }
          break;
        
        case 'windowUpdated':
          // Handle window update event
          if (!this.isHost && this.gameEngine && this.gameEngine.networkManager) {
            console.log("Received window update event, forwarding to NetworkManager");
            this.gameEngine.networkManager.handleWindowUpdate(data);
          }
          break;
        
        case 'assumeEnemyControl':
          // Host is dead and we're being asked to help control enemies
          if (!this.isHost && this.gameEngine) {
            console.log("TAKEOVER: Received request to assume enemy control while host is dead");
            this.handleAssumeEnemyControl(data);
          }
          break;
          
        case 'relinquishEnemyControl':
          // Host is alive again, relinquish enemy control
          if (!this.isHost && this.gameEngine) {
            console.log("TAKEOVER: Received request to relinquish enemy control");
            this.handleRelinquishEnemyControl(data);
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
    } catch (error) {
      console.error('Error handling received data:', error);
    }
  }
  
  /**
   * Handle enemy updates from a client with takeover authority
   * @param {Object} data - Enemy update data
   * @param {string} clientId - Client ID that sent the updates
   */
  handleClientEnemyUpdates(data, clientId) {
    if (!this.isHost || !this.gameEngine || !this.gameEngine.scene || 
        !this.gameEngine.scene.room || !this.gameEngine.scene.room.enemyManager) {
      return;
    }
    
    // Ignore if this client doesn't have takeover authority
    if (this._deadHostClientTakeover !== clientId) {
      console.warn(`Ignoring enemy updates from unauthorized client ${clientId}`);
      return;
    }
    
    try {
      const { enemyUpdates, timestamp } = data;
      
      if (!enemyUpdates || !Array.isArray(enemyUpdates)) {
        console.warn("Invalid enemy updates received:", data);
        return;
      }
      
      // Get enemy manager
      const enemyManager = this.gameEngine.scene.room.enemyManager;
      
      // Update each enemy
      enemyUpdates.forEach(update => {
        if (!update.id) return;
        
        // Find the enemy in our list
        const enemy = enemyManager.enemies.find(e => e.id === update.id);
        
        if (enemy) {
          // Update position and state
          if (update.position) {
            enemy.instance.position.set(
              update.position.x,
              update.position.y,
              update.position.z
            );
          }
          
          // Update rotation if provided
          if (update.rotation) {
            if (update.rotation.y !== undefined) {
              enemy.instance.rotation.y = update.rotation.y;
            }
          }
          
          // Update state
          if (update.state) {
            enemy.state = update.state;
          }
          
          // Update health if significantly different
          if (update.health !== undefined && Math.abs(enemy.health - update.health) > 10) {
            enemy.health = update.health;
            if (typeof enemy.updateHealthBar === 'function') {
              enemy.updateHealthBar();
            }
          }
          
          // Handle death state if needed
          if (update.isDead && !enemy.isDead && enemy.health > 0) {
            enemy.health = 0;
            if (typeof enemy.die === 'function') {
              enemy.die();
            }
          }
          
          // Mark as client controlled
          enemy._clientControlled = true;
        }
      });
      
      // Broadcast these updates to all other clients
      this.connections.forEach(conn => {
        // Don't send back to the client who sent the updates
        if (conn.peer !== clientId && conn.open) {
          try {
            conn.send({
              type: 'gameState',
              state: this.getGameState() // Include the updated enemy positions
            });
          } catch (error) {
            console.error(`Error broadcasting client-sourced enemy updates to ${conn.peer}:`, error);
          }
        }
      });
    } catch (error) {
      console.error("Error handling client enemy updates:", error);
    }
  }
  
  /**
   * Handle game state received from host
   * @param {Object} state - The game state data
   */
  handleGameState(state) {
    if (this.isHost || !this.gameEngine) {
      return;
    }
    
    try {
      // Update player positions
      if (state.playerPositions) {
        this.updatePlayerPositions(state.playerPositions);
      }
      
      // Update windows state
      if (state.windows && this.gameEngine.scene && this.gameEngine.scene.room) {
        this.updateWindowsState(state.windows);
      }
      
      // Special handling for dead host scenario
      if (state.hostState && state.hostState.isDead && state.hostState.hasLivingRemotePlayers) {
        console.log("Client received game state with dead host flag");
        
        // Check if we are the designated takeover client
        const isTakeoverClient = state.hostState.takeoverClientId === this.clientId;
        
        if (isTakeoverClient && !this._hasEnemyControlAuthority) {
          console.log("Client detected it should have takeover authority but doesn't yet");
          // Assume control if we haven't already
          this.handleAssumeEnemyControl({
            reason: 'hostDead',
            scope: 'enemies'
          });
        }
      }
      
      // Update enemies - special handling for client-controlled enemies
      if (state.enemies && this.gameEngine.scene && this.gameEngine.scene.room && 
          this.gameEngine.scene.room.enemyManager) {
        
        const enemyManager = this.gameEngine.scene.room.enemyManager;
        
        // When we have enemy control authority, don't let the host positions override our control
        const hasControlAuthority = this._hasEnemyControlAuthority === true;
        
        // Normal update for enemy positions
        this.updateEnemiesState(state.enemies, hasControlAuthority);
        
        // Special update for round state
        if (state.round) {
          this.updateRoundState(state.round);
        }
      }
      
      // Update game status
      if (state.gameStatus) {
        this.updateGameStatus(state.gameStatus);
      }
    } catch (error) {
      console.error("Error handling game state update:", error);
    }
  }
  
  /**
   * Update enemies state with data from host
   * @param {Array} enemiesData - Enemy state data
   * @param {boolean} hasControlAuthority - Whether this client has control authority
   */
  updateEnemiesState(enemiesData, hasControlAuthority) {
    if (!this.gameEngine || !this.gameEngine.scene || !this.gameEngine.scene.room || 
        !this.gameEngine.scene.room.enemyManager) {
      return;
    }
    
    const enemyManager = this.gameEngine.scene.room.enemyManager;
    
    // Process each enemy update
    enemiesData.forEach(enemyData => {
      if (!enemyData.id) return;
      
      // Find existing enemy with this ID
      let enemy = enemyManager.enemies.find(e => e.id === enemyData.id);
      
      if (enemy) {
        // For client-controlled enemies, only update certain properties
        if (hasControlAuthority && enemy._clientControlled) {
          // Only update health and damage state, not position
          if (enemyData.health !== undefined && Math.abs(enemy.health - enemyData.health) > 5) {
            enemy.health = enemyData.health;
            if (typeof enemy.updateHealthBar === 'function') {
              enemy.updateHealthBar();
            }
          }
          
          // If the host thinks the enemy is dead but we don't, kill it locally
          if (enemyData.isDead && !enemy.isDead) {
            enemy.health = 0;
            if (typeof enemy.die === 'function') {
              enemy.die();
            }
          }
        } else {
          // For normal enemies, update all properties
          
          // Update position if needed
          if (enemyData.position && !enemy.isDead) {
            enemy.instance.position.set(
              enemyData.position.x,
              enemyData.position.y,
              enemyData.position.z
            );
          }
          
          // Update rotation if provided
          if (enemyData.rotation && !enemy.isDead) {
            if (enemyData.rotation.y !== undefined) {
              enemy.instance.rotation.y = enemyData.rotation.y;
            }
          }
          
          // Update state
          if (enemyData.state) {
            enemy.state = enemyData.state;
          }
          
          // Update health
          if (enemyData.health !== undefined) {
            enemy.health = enemyData.health;
            if (typeof enemy.updateHealthBar === 'function') {
              enemy.updateHealthBar();
            }
          }
          
          // Handle death state
          if (enemyData.isDead && !enemy.isDead) {
            enemy.health = 0;
            if (typeof enemy.die === 'function') {
              enemy.die();
            }
          }
        }
      } else {
        // This is a new enemy we don't have locally - spawn it
        if (enemyManager && typeof enemyManager.spawnEnemy === 'function') {
          // Extract position
          let x, y, z;
          if (enemyData.position) {
            x = enemyData.position.x;
            y = enemyData.position.y;
            z = enemyData.position.z;
          }
          
          // Spawn with the same ID
          const newEnemy = enemyManager.spawnEnemy(x, y, z, enemyData.id);
          
          // Set additional properties if spawned successfully
          if (newEnemy) {
            if (enemyData.state) {
              newEnemy.state = enemyData.state;
            }
            
            if (enemyData.health !== undefined) {
              newEnemy.health = enemyData.health;
              newEnemy.maxHealth = enemyData.maxHealth || enemyData.health;
              if (typeof newEnemy.updateHealthBar === 'function') {
                newEnemy.updateHealthBar();
              }
            }
            
            // Handle rotation
            if (enemyData.rotation && enemyData.rotation.y !== undefined) {
              newEnemy.instance.rotation.y = enemyData.rotation.y;
            }
            
            // If it's supposed to be dead, kill it
            if (enemyData.isDead) {
              newEnemy.health = 0;
              if (typeof newEnemy.die === 'function') {
                newEnemy.die();
              }
            }
          }
        }
      }
    });
  }
  
  /**
   * Update the round state based on host data
   * @param {Object} roundData - Round state data
   */
  updateRoundState(roundData) {
    if (!this.gameEngine || !this.gameEngine.scene || !this.gameEngine.scene.room || 
        !this.gameEngine.scene.room.enemyManager) {
      return;
    }
    
    const enemyManager = this.gameEngine.scene.room.enemyManager;
    
    // Update round properties
    if (roundData.round !== undefined) {
      enemyManager.currentRound = roundData.round;
    }
    
    if (roundData.zombiesRemaining !== undefined) {
      enemyManager.zombiesRemaining = roundData.zombiesRemaining;
    }
    
    if (roundData.roundActive !== undefined) {
      enemyManager.roundActive = roundData.roundActive;
    }
    
    if (roundData.timeSinceLastRound !== undefined) {
      enemyManager.timeSinceLastRound = roundData.timeSinceLastRound;
    }
    
    // Update UI elements if they exist
    enemyManager.updateRoundDisplay(`Round: ${enemyManager.currentRound}`);
  }
  
  /**
   * Update game status based on host data
   * @param {Object} statusData - Game status data
   */
  updateGameStatus(statusData) {
    if (!this.gameEngine) return;
    
    // Update appropriate game engine properties based on status
    if (statusData.isGameOver !== undefined) {
      this.gameEngine.isGameOver = statusData.isGameOver;
    }
    
    if (statusData.isPaused !== undefined) {
      // Only update if different to avoid triggering unnecessary UI updates
      if (this.gameEngine.isPaused !== statusData.isPaused) {
        this.gameEngine.isPaused = statusData.isPaused;
        
        // Handle UI updates
        if (statusData.isPaused) {
          if (typeof this.gameEngine.pauseGame === 'function') {
            this.gameEngine.pauseGame();
          }
        } else {
          if (typeof this.gameEngine.resumeGame === 'function') {
            this.gameEngine.resumeGame();
          }
        }
      }
    }
    
    // Handle "all players dead" state if reported
    if (statusData.allPlayersDead) {
      if (!this.gameEngine.isGameOver) {
        this.gameEngine.endGame();
      }
    }
  }
} 