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
          // Received a game state update from the host
          if (!this.isHost && this.gameEngine && this.onGameStateUpdate) {
            this.onGameStateUpdate(data.state);
          }
          break;
          
        case 'playerAction':
          // Handle a player action (host only)
          if (this.isHost && data.clientId && data.actionType && data.actionData) {
            this.handlePlayerAction(data.clientId, data);
          }
          break;
          
        case 'actionResult':
          // Handle the result of an action (success/failure)
          if (!this.isHost && data.actionId) {
            console.log(`NETWORK: Received result for action ${data.actionId}: ${data.result}`);
            
            // Process any specific result data
            if (data.actionType === 'damageEnemy') {
              // Handle enemy damage result
              this.handleEnemyDamageConfirmation(data.resultData);
            } else if (data.actionType === 'addWindowBoard') {
              // Handle window boarding result
              console.log("NETWORK: Received window boarding result", data.resultData);
              if (this.gameEngine && this.gameEngine.scene && this.gameEngine.scene.room) {
                const room = this.gameEngine.scene.room;
                
                // Find the window and update it with result data
                if (data.resultData && data.resultData.windowIndex !== undefined) {
                  const windowIndex = data.resultData.windowIndex;
                  if (room.windows && room.windows[windowIndex]) {
                    console.log(`NETWORK: Updating window ${windowIndex} with result data`);
                    const window = room.windows[windowIndex];
                    if (typeof window.handleActionResult === 'function') {
                      window.handleActionResult(data.resultData);
                    } else {
                      console.warn("NETWORK: Window doesn't have handleActionResult method");
                    }
                  }
                }
              }
            }
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
        
        case 'gameRestart':
          // Game is being restarted by the host
          console.log("Received game restart message from host");
          if (!this.isHost && this.gameEngine) {
            this.handleGameRestart(data);
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
    
    const enemies = this.gameEngine.scene.room.enemyManager.enemies;
    const isLocalPlayerDead = this.gameEngine.controls && this.gameEngine.controls.isDead;
    let hasLivingRemotePlayers = false;
    
    // Check if any remote players are alive - this is important for enemy targeting
    if (isLocalPlayerDead && this.gameEngine.networkManager && this.gameEngine.networkManager.remotePlayers) {
      this.gameEngine.networkManager.remotePlayers.forEach(player => {
        if (!player.isDead) {
          hasLivingRemotePlayers = true;
        }
      });
      
      // Log this information when host is dead but remote players are alive
      if (hasLivingRemotePlayers) {
        console.log(`Host player is dead but there are living remote players. Sending enemy states to clients.`);
      }
    }
    
    // If there are any enemies to report
    if (enemies && enemies.length > 0) {
      // Generate enemy states for all enemies
      return enemies.map(enemy => {
        // Ensure each enemy has a consistent unique ID without modifying the original
        if (!enemy.id) {
          console.warn("Enemy without ID found, this should not happen", enemy);
          // Give it a permanent ID rather than re-generating each time
          enemy.id = `enemy_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
        }
        
        // If the local player is dead but there are living remote players,
        // make sure enemies are still in a valid state for targeting
        if (isLocalPlayerDead && hasLivingRemotePlayers && enemy.state === 'idle') {
          // Force enemies to be in moving state so they'll target remote players
          enemy.state = 'moving';
        }
        
        return {
          id: enemy.id,
          position: {
            x: enemy.instance.position.x,
            y: enemy.instance.position.y,
            z: enemy.instance.position.z
          },
          health: enemy.health,
          type: enemy.type || 'standard', // Include zombie type for proper spawning
          state: enemy.state || 'moving', // idle, attacking, dying, etc.
          targetWindow: enemy.targetWindow ? {
            index: this.gameEngine.scene.room.windows.indexOf(enemy.targetWindow)
          } : null, // Include target window information
          insideRoom: enemy.insideRoom || false
        };
      });
    }
    
    // Return empty array if no enemies
    return [];
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
      console.warn("Cannot get window states: scene or room not available");
      return [];
    }
    
    const windows = this.gameEngine.scene.room.windows;
    if (!windows || !Array.isArray(windows) || windows.length === 0) {
      console.warn("No windows array found in room");
      return [];
    }
    
    console.log(`Getting state of ${windows.length} windows`);
    
    // Prepare window states
    const windowStates = windows.map((window, index) => {
      // Check if windowIndex is set, if not set it now
      if (window.windowIndex === undefined) {
        console.log(`Setting missing windowIndex ${index} on window before sending state`);
        window.windowIndex = index;
      }
      
      const state = {
        windowIndex: window.windowIndex,
        position: {
          x: window.instance.position.x,
          y: window.instance.position.y,
          z: window.instance.position.z
        },
        boardsCount: window.boardsCount,
        isOpen: window.isOpen,
        health: window.boardHealths // Array of health values for each board
      };
      
      console.log(`Window ${index} state: ${window.boardsCount} boards, isOpen=${window.isOpen}`);
      
      return state;
    });
    
    return windowStates;
  }
  
  /**
   * Get game status information like paused state, game over state, etc.
   * @returns {Object} Game status information
   */
  getGameStatus() {
    if (!this.gameEngine) return {};
    
    // Determine if all players are dead by checking both local and remote players
    const allPlayersDead = this.areAllPlayersDead();
    
    // Check if the local player is dead (separate from global game over)
    const isLocalPlayerDead = this.gameEngine.isLocalPlayerDead || false;
    
    // Important: isGameOver should only be true when ALL players are dead
    // isLocalPlayerDead tracks just the local player's death state
    return {
      isPaused: this.gameEngine.isPaused || false,
      isGameOver: this.gameEngine.isGameOver || false,
      isLocalPlayerDead: isLocalPlayerDead,
      allPlayersDead: allPlayersDead,
      
      // Add additional fields to help clients understand the game state
      hasLivingRemotePlayers: this.hasLivingRemotePlayers(),
      
      // Include this timestamp to help debugging network state sync issues
      statusTimestamp: Date.now()
    };
  }
  
  /**
   * Check if all players are dead (both local and remote)
   * @returns {boolean} True if all players are dead
   */
  areAllPlayersDead() {
    // Check if the local player is dead using the Engine's tracking property
    // This is more reliable than checking controls.isDead which might be in a different state
    const localPlayerDead = this.gameEngine.isLocalPlayerDead || false;
    
    // Log local player state
    console.log(`DEATH STATE CHECK: Local player is ${localPlayerDead ? 'dead' : 'alive'}`);
    
    // If local player is alive, not all players are dead - can return early
    if (!localPlayerDead) {
      return false;
    }
    
    // Local player is dead, now check remote players
    return !this.hasLivingRemotePlayers();
  }
  
  /**
   * Check if any remote players are still alive
   * @returns {boolean} True if any remote players are alive
   */
  hasLivingRemotePlayers() {
    // If we don't have network manager or remote players, then no living remote players
    if (!this.gameEngine || !this.gameEngine.networkManager || 
        !this.gameEngine.networkManager.remotePlayers || 
        this.gameEngine.networkManager.remotePlayers.size === 0) {
      return false;
    }
    
    // Check each remote player
    let hasLivingPlayers = false;
    let remotePlayerCount = this.gameEngine.networkManager.remotePlayers.size;
    
    this.gameEngine.networkManager.remotePlayers.forEach((player, playerId) => {
      if (!player.isDead) {
        hasLivingPlayers = true;
        console.log(`DEATH STATE CHECK: Remote player ${playerId} is alive`);
      } else {
        console.log(`DEATH STATE CHECK: Remote player ${playerId} is dead`);
      }
    });
    
    console.log(`DEATH STATE CHECK: ${remotePlayerCount} remote players, any living remote players: ${hasLivingPlayers}`);
    return hasLivingPlayers;
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
      // Use the comprehensive respawn method
      if (typeof this.gameEngine.controls.respawn === 'function') {
        this.gameEngine.controls.respawn();
      } else {
        // Fallback to basic reset if respawn method doesn't exist
        console.warn("Respawn method not found, falling back to basic health reset");
        this.gameEngine.controls.resetHealth();
        this.gameEngine.controls.isDead = false;
      }
      
      // Re-lock pointer to regain control
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
      
      // Reset gameEngine state flags
      if (this.gameEngine.isLocalPlayerDead) {
        this.gameEngine.isLocalPlayerDead = false;
      }
      
      // Send an immediate position update to broadcast the new alive state
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
    } else {
      console.log('Player is not dead, ignoring respawn command');
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
   * Send a player action to the host (client -> host)
   * @param {string} actionType - The type of action
   * @param {Object} actionData - The action data
   * @returns {string|null} The action ID if sent, null if error
   */
  sendPlayerAction(actionType, actionData) {
    console.log("NETWORK: *** SENDING PLAYER ACTION ***", actionType, actionData);
    // Add a more visible console log with large stars at beginning and end
    console.log("********************************************************************************");
    console.log(`* NETWORK DEBUG: Sending action ${actionType} with data:`, actionData);
    console.log("********************************************************************************");
    
    if (!this.isConnected) {
      console.error("Cannot send player action: not connected (isConnected is false)");
      return null;
    }
    
    try {
      // Generate a unique action ID for tracking
      const actionId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Create the message with a timestamp for debouncing
      const message = {
        type: 'playerAction',
        actionType: actionType,
        actionData: actionData,
        timestamp: Date.now(),
        actionId: actionId,
        clientId: this.clientId
      };
      
      // If we're the host, process locally
      if (this.isHost) {
        console.log("NETWORK: Host processing own action locally:", actionType);
        this.handlePlayerAction(this.clientId, message);
        return actionId;
      }
      
      // Detailed connection debugging
      console.log("NETWORK: Connection details:", {
        peerExists: !!this.peer,
        hostConnectionExists: !!this.hostConnection,
        clientId: this.clientId, 
        hostId: this.hostId,
        connectionState: this.peer ? 'exists' : 'no peer connection',
        hostConnectionState: this.hostConnection ? 'exists' : 'missing'
      });
      
      // Send to host
      if (this.peer && this.hostConnection) {
        console.log(`NETWORK: Client sending action '${actionType}' to host`);
        this.hostConnection.send(message);
        return actionId;
      } else {
        console.error("No connection to host to send action - check if hostConnection is properly established");
        return null;
      }
    } catch (error) {
      console.error("Error sending player action:", error);
      return null;
    }
  }
  
  /**
   * Check if an action has been confirmed and retry if needed
   * @param {string} actionId - The ID of the action to check
   * @private
   */
  _checkActionConfirmation(actionId) {
    const pendingAction = this._pendingActions[actionId];
    
    if (!pendingAction) {
      // Action already confirmed or expired
      return;
    }
    
    // Check if we should retry
    if (pendingAction.retries < this._maxActionRetries) {
      pendingAction.retries++;
      console.log(`NETWORK: Retrying action ${actionId} (attempt ${pendingAction.retries}/${this._maxActionRetries})`);
      
      // Retry sending the action
      if (this.connections.length > 0) {
        try {
          // Send only to the host (first connection for clients)
          const hostConn = this.connections[0];
          hostConn.send({
            type: 'playerAction',
            action: pendingAction.action,
            requiresAck: true,
            playerId: this.clientId,
            isRetry: true,
            retryCount: pendingAction.retries
          });
          
          // Check again after the retry interval
          setTimeout(() => this._checkActionConfirmation(actionId), this._actionRetryInterval);
        } catch (error) {
          console.error("Error retrying player action:", error);
        }
      }
    } else {
      // Max retries reached, action failed
      console.error(`NETWORK: Action ${actionId} failed after ${this._maxActionRetries} retries`);
      delete this._pendingActions[actionId];
    }
  }
  
  /**
   * Confirm that an action was received and processed
   * @param {string} actionId - The ID of the action to confirm
   */
  confirmAction(actionId) {
    if (this._pendingActions[actionId]) {
      console.log(`NETWORK: Action ${actionId} confirmed`);
      delete this._pendingActions[actionId];
    }
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
    
    // Close the host connection specifically
    if (this.hostConnection) {
      try {
        this.hostConnection.close();
      } catch (err) {
        console.error("Error closing host connection:", err);
      }
      this.hostConnection = null;
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
    this.isConnected = false;
    this.clientId = null;
    this.hostId = null;
    
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
   * @param {boolean} force - Whether to force a broadcast regardless of timing
   * @returns {boolean} True if broadcast was sent, false otherwise
   */
  broadcastGameState(force = false) {
    if (!this.isHost || !this.isConnected) return false;
    
    const now = Date.now();
    
    // Don't send updates if we recently received a client action (unless forced)
    if (!force && now - this.lastClientActionTime < this.clientActionDebounceTime) {
      console.log(`Skipping state broadcast during client action debounce period (${this.clientActionDebounceTime - (now - this.lastClientActionTime)}ms remaining)`);
      return false;
    }
    
    // Rate limit state updates unless forced
    if (!force && now - this.lastStateSent < this.stateUpdateInterval) {
      return false;
    }
    
    // Get current game state
    const gameState = this.getGameState();
    
    // Check if host player is dead but there are living remote players
    const isHostDead = this.gameEngine.controls && this.gameEngine.controls.isDead;
    let hasLivingRemotePlayers = false;
    
    // Explicitly check the allPlayersDead status
    const allPlayersDead = gameState.gameStatus?.allPlayersDead || false;
    
    // If host is dead, explicitly check for living remote players
    if (isHostDead && this.gameEngine.networkManager && this.gameEngine.networkManager.remotePlayers) {
      this.gameEngine.networkManager.remotePlayers.forEach(player => {
        if (!player.isDead) {
          hasLivingRemotePlayers = true;
        }
      });
      
      // When host is dead but remote players are alive, force updates to continue
      if (hasLivingRemotePlayers) {
        console.log("HOST IS DEAD BUT REMOTE PLAYERS ALIVE: FORCING GAME STATE UPDATES");
        
        // If we don't already have a more frequent update interval for dead host state,
        // set one up to improve remote player experience
        if (!this._deadHostUpdateInterval) {
          // First clear any existing interval to avoid duplicates
          if (this._stateUpdateInterval) {
            clearInterval(this._stateUpdateInterval);
            this._stateUpdateInterval = null;
          }
          
          // Setup new faster update interval for dead host case
          const fasterInterval = this.stateUpdateInterval / 2; // Twice as frequent
          console.log(`Setting up faster state update interval: ${fasterInterval}ms for dead host case`);
          
          this._deadHostUpdateInterval = setInterval(() => {
            try {
              // Check if we should still be in this state
              const stillHostDead = this.gameEngine.controls && this.gameEngine.controls.isDead;
              let stillLivingRemotes = false;
              
              if (this.gameEngine.networkManager && this.gameEngine.networkManager.remotePlayers) {
                this.gameEngine.networkManager.remotePlayers.forEach(player => {
                  if (!player.isDead) {
                    stillLivingRemotes = true;
                  }
                });
              }
              
              if (stillHostDead && stillLivingRemotes) {
                // Still valid state, continue with forced updates
                this.broadcastGameState(true);
              } else {
                // State has changed, revert to normal interval
                console.log("Host state or remote player state changed, reverting to normal interval");
                this.resetUpdateIntervals();
              }
            } catch (error) {
              console.error("Error in dead host game state update:", error);
            }
          }, fasterInterval);
        }
        
        // Force all enemies to be in moving state to ensure they keep functioning
        if (gameState.enemies && gameState.enemies.length > 0) {
          gameState.enemies.forEach(enemy => {
            if (enemy.state === 'idle') {
              enemy.state = 'moving';
            }
            
            // Mark enemies to continue updating
            enemy._forceContinueUpdating = true;
          });
        }
      } else if (this._deadHostUpdateInterval) {
        // No more living remote players, clean up the special interval
        this.resetUpdateIntervals();
      }
    } else if (this._deadHostUpdateInterval) {
      // Host is no longer dead, clean up the special interval
      this.resetUpdateIntervals();
    }
    
    // Log state updates if forced or significant changes
    if (force || isHostDead || (now - this.lastStateSentLog > 5000)) {
      console.log(`Game state broadcast [Force:${force}, HostDead:${isHostDead}, HasLivingRemotes:${hasLivingRemotePlayers}, AllPlayersDead:${allPlayersDead}]:`, {
        playerCount: Object.keys(gameState.playerPositions || {}).length,
        enemyCount: (gameState.enemies || []).length,
        round: gameState.round?.round,
        windowCount: (gameState.windows || []).length
      });
      this.lastStateSentLog = now;
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
  
  /**
   * Reset update intervals to their default state
   */
  resetUpdateIntervals() {
    // Clear any dead host special interval
    if (this._deadHostUpdateInterval) {
      clearInterval(this._deadHostUpdateInterval);
      this._deadHostUpdateInterval = null;
    }
    
    // Clear any regular interval
    if (this._stateUpdateInterval) {
      clearInterval(this._stateUpdateInterval);
      this._stateUpdateInterval = null;
    }
    
    // Setup regular interval if needed
    if (this.isHost && this.isConnected) {
      this._stateUpdateInterval = setInterval(() => {
        try {
          this.broadcastGameState();
        } catch (error) {
          console.error("Error in regular game state update:", error);
        }
      }, this.stateUpdateInterval);
    }
  }
  
  /**
   * Handle enemy damage confirmation from host (client only)
   * @param {Object} data - The damage confirmation data
   */
  handleEnemyDamageConfirmation(data) {
    if (this.isHost || !this.gameEngine || !this.gameEngine.scene || 
        !this.gameEngine.scene.room || !this.gameEngine.scene.room.enemyManager) {
      return;
    }
    
    try {
      const { enemyId, health, isDead, timestamp } = data;
      console.log(`Client received damage confirmation for enemy ${enemyId}: health=${health}, isDead=${isDead}, timestamp=${timestamp}`);
      
      // Find the enemy in the client's game
      const enemyManager = this.gameEngine.scene.room.enemyManager;
      
      // Log info about available enemies to help with debugging
      console.log(`Client has ${enemyManager.enemies.length} enemies with IDs: ${enemyManager.enemies.map(e => e.id).join(', ')}`);
      
      const enemy = enemyManager.enemies.find(e => e.id === enemyId);
      
      if (enemy) {
        // Check if this is a stale update (happened before our most recent local action)
        const now = Date.now();
        if (enemy.lastDamageTime && (now - enemy.lastDamageTime < this.clientActionDebounceTime)) {
          console.log(`Skipping enemy health update because local damage was applied recently (${now - enemy.lastDamageTime}ms ago)`);
          return;
        }
        
        // Update the enemy's health locally to match the host's value
        const oldHealth = enemy.health;
        enemy.health = health;
        console.log(`Updated enemy ${enemyId} health from ${oldHealth} to ${health}`);
        
        // Update health bar if it exists
        if (typeof enemy.updateHealthBar === 'function') {
          enemy.updateHealthBar();
        }
        
        // If the enemy is dead according to the host, kill it locally
        if (isDead && enemy.health > 0) {
          console.log(`Enemy ${enemyId} was killed by host, forcing death locally`);
          enemy.health = 0;
          if (typeof enemy.die === 'function') {
            enemy.die();
          }
        }
      } else {
        console.warn(`Client could not find enemy with ID ${enemyId} to apply damage confirmation`);
      }
    } catch (error) {
      console.error("Error handling enemy damage confirmation:", error);
    }
  }
  
  /**
   * Handle game restart from host
   * @param {Object} data - The restart data
   */
  handleGameRestart(data) {
    console.log("Received game restart command from host");
    
    if (!this.gameEngine) {
      console.error("Cannot handle game restart: game engine not available");
      return;
    }
    
    // Clear any game over or spectator UI
    const gameOverScreen = document.getElementById('game-over-screen');
    if (gameOverScreen) {
      gameOverScreen.remove();
    }
    
    const spectatorOverlay = document.getElementById('spectator-overlay');
    if (spectatorOverlay) {
      spectatorOverlay.remove();
    }
    
    // Reset game state
    console.log("Resetting game state from host command");
    
    // Reset flags
    this.gameEngine.isGameOver = false;
    this.gameEngine.isLocalPlayerDead = false;
    
    // Reset player
    if (this.gameEngine.controls) {
      console.log("Resetting player state");
      
      // Reset health and death status
      this.gameEngine.controls.isDead = false;
      this.gameEngine.controls.health = 100;
      
      // Reset position
      if (typeof this.gameEngine.controls.resetPosition === 'function') {
        this.gameEngine.controls.resetPosition();
      }
      
      // Re-enable movement
      this.gameEngine.controls.canMove = true;
      
      // Reset weapon if needed
      if (this.gameEngine.weaponManager) {
        this.gameEngine.weaponManager.reset();
      }
    }
    
    // Reset room and enemies if available
    if (this.gameEngine.scene && this.gameEngine.scene.room) {
      console.log("Resetting room state");
      if (typeof this.gameEngine.scene.room.reset === 'function') {
        this.gameEngine.scene.room.reset();
      }
    }
    
    // Force a position update to broadcast our alive state
    this.sendPlayerPosition();
    
    // Show notification to player
    this.showTemporaryMessage("Game Restarted", 3000);
  }
  
  /**
   * Show a temporary message to the player
   * @param {string} message - The message to show
   * @param {number} duration - How long to show the message (ms)
   */
  showTemporaryMessage(message, duration = 3000) {
    // Remove any existing temporary messages
    const existingMsg = document.getElementById('temporary-message');
    if (existingMsg) {
      existingMsg.remove();
    }
    
    // Create message element
    const msgElement = document.createElement('div');
    msgElement.id = 'temporary-message';
    msgElement.style.position = 'absolute';
    msgElement.style.top = '100px';
    msgElement.style.left = '50%';
    msgElement.style.transform = 'translateX(-50%)';
    msgElement.style.padding = '10px 20px';
    msgElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    msgElement.style.color = '#fff';
    msgElement.style.borderRadius = '5px';
    msgElement.style.zIndex = '1000';
    msgElement.style.fontFamily = 'Arial, sans-serif';
    msgElement.style.fontSize = '18px';
    msgElement.style.textAlign = 'center';
    msgElement.style.transition = 'opacity 0.5s ease';
    
    // Set message
    msgElement.textContent = message;
    
    // Add to DOM
    document.body.appendChild(msgElement);
    
    // Remove after duration
    setTimeout(() => {
      if (msgElement.parentNode) {
        // Fade out
        msgElement.style.opacity = '0';
        
        // Remove after fade
        setTimeout(() => {
          if (msgElement.parentNode) {
            msgElement.parentNode.removeChild(msgElement);
          }
        }, 500);
      }
    }, duration);
  }

  broadcastPlayerUpdate(playerData) {
    if (!this.isHost) return;

    const update = {
      type: 'playerUpdate',
      playerId: this.peer.id,
      data: playerData
    };

    this.broadcast(update);
  }

  handlePlayerUpdate(data) {
    const { playerId, data: playerData } = data;
    
    if (playerId === this.peer.id) return; // Ignore own updates

    const remotePlayer = this.remotePlayers.get(playerId);
    if (!remotePlayer) return;

    // Update remote player's death state
    if (playerData.isDead !== undefined) {
        remotePlayer.isDead = playerData.isDead;
    }

    // Update position and rotation
    if (playerData.position) {
        remotePlayer.position.fromArray(playerData.position);
    }
    if (playerData.rotation) {
        remotePlayer.rotation.fromArray(playerData.rotation);
    }

    // Update health
    if (playerData.health !== undefined) {
        remotePlayer.health = playerData.health;
    }

    // Update weapon state
    if (playerData.weapon) {
        remotePlayer.currentWeapon = playerData.weapon.currentWeapon;
        remotePlayer.ammo = playerData.weapon.ammo;
        remotePlayer.isReloading = playerData.weapon.isReloading;
    }

    // Check if all players are dead
    this.checkAllPlayersDead();
  }

  checkAllPlayersDead() {
    // Check local player
    if (!this.gameEngine.controls.isDead) {
        return false;
    }

    // Check all remote players
    for (const [_, player] of this.remotePlayers) {
        if (!player.isDead) {
            return false;
        }
    }

    // If we get here, all players are dead
    console.log("All players are dead, showing game over screen");
    this.gameEngine.showMultiplayerGameOverScreen();
    return true;
  }
} 