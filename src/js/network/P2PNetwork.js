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
      
      // Send initial game state to the new player
      this.sendGameState(conn);
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
   * Update a remote player's position
   * @param {Object} position - The position data (x, y, z coordinates and rotation)
   * @param {string} playerId - The ID of the player to update
   */
  updatePlayerPosition(position, playerId) {
    // This would be implemented to update the remote player's position in the game
    console.log(`Updating position for player ${playerId}:`, position);
    
    // If we're the host, broadcast this to all other clients
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
    for (const conn of this.connections) {
      conn.send(data);
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
      // Add other relevant game state data
    };
  }
  
  /**
   * Get all player positions
   * @returns {Object} Map of player IDs to positions
   */
  getPlayerPositions() {
    // Example implementation
    return {
      // Placeholder for actual player position data
      [this.isHost ? this.hostId : this.clientId]: {
        x: this.gameEngine.controls.camera.position.x,
        y: this.gameEngine.controls.camera.position.y,
        z: this.gameEngine.controls.camera.position.z,
        rotationY: this.gameEngine.controls.camera.rotation.y
      }
      // Other players would be added here
    };
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
    
    // Example implementation
    return this.gameEngine.scene.room.enemyManager.enemies.map(enemy => ({
      id: enemy.id,
      position: {
        x: enemy.instance.position.x,
        y: enemy.instance.position.y,
        z: enemy.instance.position.z
      },
      health: enemy.health,
      type: enemy.type,
      state: enemy.state // idle, attacking, dying, etc.
    }));
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
   * Send player position update
   */
  sendPlayerPosition() {
    if (!this.isConnected || !this.gameEngine || !this.gameEngine.controls) return;
    
    const position = {
      x: this.gameEngine.controls.camera.position.x,
      y: this.gameEngine.controls.camera.position.y,
      z: this.gameEngine.controls.camera.position.z,
      rotationY: this.gameEngine.controls.camera.rotation.y
    };
    
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
   * Start regular game state updates if hosting
   */
  startStateUpdates() {
    if (!this.isHost) return;
    
    // Send state updates at regular intervals
    this.stateUpdateInterval = setInterval(() => {
      const now = Date.now();
      
      // Limit update frequency
      if (now - this.lastStateSent > this.stateUpdateInterval) {
        this.broadcastToAll({
          type: 'gameState',
          state: this.getGameState()
        });
        
        this.lastStateSent = now;
      }
    }, this.stateUpdateInterval);
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
} 