/**
 * NetworkManager class
 * Manages multiplayer sessions and coordinates network activities
 */
import { P2PNetwork } from './P2PNetwork.js';

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
    this.positionUpdateInterval = 100; // ms between position updates
    this.connectionStatusElement = null;
    
    // For server list feature
    this.serverListUpdateInterval = null;
    this.serverName = "Game Server #" + Math.floor(Math.random() * 1000);
  }
  
  /**
   * Initialize the network manager
   */
  init() {
    console.log("Initializing NetworkManager");
    this.createStatusElement();
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
      this.registerServer(hostId);
      
      // Show host ID for sharing
      this.showHostIdDialog(hostId);
      
      // Start game state updates
      this.network.startStateUpdates();
      
      // Start sending position updates
      this.startPositionUpdates();
      
      this.updateConnectionStatus(`Hosting (ID: ${this.truncateId(hostId)})`);
    } catch (err) {
      console.error("Failed to start hosting:", err);
      this.updateConnectionStatus('Failed to start hosting');
      this.showErrorDialog("Failed to start hosting: " + err.message);
    }
  }
  
  /**
   * Join a multiplayer game as a client
   * @param {string} hostId - The host ID to connect to
   */
  async joinGame(hostId) {
    if (!hostId) {
      this.showJoinDialog();
      return;
    }
    
    console.log("Joining game with host ID:", hostId);
    this.gameMode = 'client';
    this.isMultiplayer = true;
    this.isHost = false;
    this.hostId = hostId;
    
    this.updateConnectionStatus('Connecting...');
    
    // Create new network if needed
    if (!this.network) {
      this.network = new P2PNetwork(this.gameEngine);
      this.setupNetworkCallbacks();
    }
    
    // Join the game
    try {
      await this.network.joinGame(hostId);
      this.isConnected = true;
      
      // Start sending position updates
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
    setInterval(() => {
      if (!this.isConnected || !this.network) return;
      
      const now = Date.now();
      
      // Limit update frequency
      if (now - this.lastPositionUpdate > this.positionUpdateInterval) {
        this.network.sendPlayerPosition();
        this.lastPositionUpdate = now;
      }
    }, this.positionUpdateInterval);
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
        }
      });
    }
    
    // Update enemy state if needed (for client-side visualization)
    if (state.enemies && this.gameEngine.scene && this.gameEngine.scene.room && 
        this.gameEngine.scene.room.enemyManager) {
      // This would be implemented to update enemy positions and states
      // This is a simplified example and would need to be expanded based on the game structure
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
    }
    
    // Update window states if necessary
    if (state.windows && this.gameEngine.scene && this.gameEngine.scene.room) {
      // This would be implemented to update window states
      // This is a simplified example and would need to be expanded based on the game structure
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
    
    // Create a simple placeholder model for the remote player
    // This is a simplified example and would need to be expanded with proper models
    const geometry = new THREE.BoxGeometry(0.5, 1.8, 0.5);
    const material = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const model = new THREE.Mesh(geometry, material);
    
    // Set initial position
    model.position.set(0, 0, 0);
    
    // Add to the scene
    this.gameEngine.scene.add(model);
    
    // Store the model
    this.playerModels.set(playerId, model);
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
    
    // Update the player's position
    playerData.position = position;
    playerData.lastUpdate = Date.now();
    
    // Update the player's model
    const model = this.playerModels.get(playerId);
    if (model) {
      model.position.set(position.x, position.y, position.z);
      model.rotation.y = position.rotationY;
    }
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
    if (model && this.gameEngine.scene) {
      this.gameEngine.scene.remove(model);
    }
    
    this.playerModels.delete(playerId);
  }
  
  /**
   * Clean up player models
   */
  cleanupPlayerModels() {
    if (!this.gameEngine.scene) return;
    
    // Remove all player models from the scene
    for (const model of this.playerModels.values()) {
      this.gameEngine.scene.remove(model);
    }
    
    this.playerModels.clear();
  }
  
  /**
   * Disconnect from the current multiplayer session
   */
  disconnect() {
    if (!this.isConnected) return;
    
    console.log("Disconnecting from multiplayer session");
    
    if (this.network) {
      this.network.disconnect();
    }
    
    // Clean up player data
    this.remotePlayers.clear();
    this.cleanupPlayerModels();
    
    this.isConnected = false;
    this.isMultiplayer = false;
    this.gameMode = 'singleplayer';
    
    this.updateConnectionStatus('Disconnected');
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
    // Create a status element if it doesn't exist
    if (!this.connectionStatusElement) {
      this.connectionStatusElement = document.createElement('div');
      this.connectionStatusElement.id = 'connection-status';
      this.connectionStatusElement.style.position = 'absolute';
      this.connectionStatusElement.style.bottom = '10px';
      this.connectionStatusElement.style.right = '10px';
      this.connectionStatusElement.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
      this.connectionStatusElement.style.color = 'white';
      this.connectionStatusElement.style.padding = '5px 10px';
      this.connectionStatusElement.style.borderRadius = '5px';
      this.connectionStatusElement.style.fontFamily = 'Arial, sans-serif';
      this.connectionStatusElement.style.fontSize = '14px';
      this.connectionStatusElement.style.zIndex = '1000';
      document.body.appendChild(this.connectionStatusElement);
    }
    
    this.updateConnectionStatus('Singleplayer');
  }
  
  /**
   * Update the connection status element
   * @param {string} status - The status text to display
   */
  updateConnectionStatus(status) {
    if (this.connectionStatusElement) {
      this.connectionStatusElement.textContent = status;
    }
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
   * Register a server in the public server list
   * @param {string} hostId - The host ID to register
   */
  registerServer(hostId) {
    try {
      // Get existing server list
      let serverList = JSON.parse(localStorage.getItem('serverList') || '[]');
      
      // Clean up old servers (older than 5 minutes)
      const now = Date.now();
      serverList = serverList.filter(server => {
        return now - server.timestamp < 5 * 60 * 1000;
      });
      
      // Add this server
      serverList.push({
        id: hostId,
        name: this.serverName,
        playerCount: 1, // Start with just the host
        timestamp: now
      });
      
      // Save back to storage
      localStorage.setItem('serverList', JSON.stringify(serverList));
      
      // Start the server list update interval to keep it fresh
      this.startServerListUpdates();
      
      console.log("Registered server in public list:", hostId);
    } catch (err) {
      console.error("Error registering server:", err);
    }
  }
  
  /**
   * Start periodic updates to the server list for this host
   */
  startServerListUpdates() {
    // Clear any existing interval
    if (this.serverListUpdateInterval) {
      clearInterval(this.serverListUpdateInterval);
    }
    
    // Update player count and timestamp every 30 seconds
    this.serverListUpdateInterval = setInterval(() => {
      if (!this.isHost || !this.hostId) return;
      
      try {
        // Get existing server list
        const serverList = JSON.parse(localStorage.getItem('serverList') || '[]');
        
        // Find this server
        const serverIndex = serverList.findIndex(server => server.id === this.hostId);
        if (serverIndex !== -1) {
          // Update player count and timestamp
          serverList[serverIndex].playerCount = this.remotePlayers.size + 1;
          serverList[serverIndex].timestamp = Date.now();
          
          // Save back to storage
          localStorage.setItem('serverList', JSON.stringify(serverList));
        }
      } catch (err) {
        console.error("Error updating server list:", err);
      }
    }, 30000); // Every 30 seconds
    
    // Also set up an event to remove the server when this window is closed
    window.addEventListener('beforeunload', () => {
      this.removeServerFromList();
    });
  }
  
  /**
   * Remove this server from the public list
   */
  removeServerFromList() {
    if (!this.isHost || !this.hostId) return;
    
    try {
      // Get existing server list
      let serverList = JSON.parse(localStorage.getItem('serverList') || '[]');
      
      // Remove this server
      serverList = serverList.filter(server => server.id !== this.hostId);
      
      // Save back to storage
      localStorage.setItem('serverList', JSON.stringify(serverList));
      
      console.log("Removed server from public list:", this.hostId);
    } catch (err) {
      console.error("Error removing server from list:", err);
    }
  }
  
  /**
   * Get the list of available servers
   * @returns {Array} Array of server objects
   */
  getServerList() {
    try {
      // Get server list
      let serverList = JSON.parse(localStorage.getItem('serverList') || '[]');
      
      // Clean up old servers (older than 5 minutes)
      const now = Date.now();
      serverList = serverList.filter(server => {
        return now - server.timestamp < 5 * 60 * 1000;
      });
      
      // Save cleaned list
      localStorage.setItem('serverList', JSON.stringify(serverList));
      
      return serverList;
    } catch (err) {
      console.error("Error getting server list:", err);
      return [];
    }
  }

  /**
   * Set the name for this server
   * @param {string} name - The server name
   */
  setServerName(name) {
    this.serverName = name;
  }
  
  /**
   * Show a dialog with the host ID for sharing
   * @param {string} hostId - The host ID to display
   */
  showHostIdDialog(hostId) {
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
    title.textContent = 'Game Hosted!';
    title.style.marginTop = '0';
    dialog.appendChild(title);
    
    // Add server name input
    const nameLabel = document.createElement('div');
    nameLabel.textContent = 'Server Name:';
    nameLabel.style.marginTop = '15px';
    dialog.appendChild(nameLabel);
    
    const nameInput = document.createElement('input');
    nameInput.value = this.serverName;
    nameInput.style.width = '100%';
    nameInput.style.padding = '10px';
    nameInput.style.margin = '5px 0 15px';
    nameInput.style.fontSize = '16px';
    nameInput.style.textAlign = 'center';
    nameInput.style.backgroundColor = '#222';
    nameInput.style.color = 'white';
    nameInput.style.border = '1px solid #444';
    nameInput.oninput = () => {
      this.setServerName(nameInput.value);
      
      // Update server name in list
      try {
        const serverList = JSON.parse(localStorage.getItem('serverList') || '[]');
        const serverIndex = serverList.findIndex(server => server.id === hostId);
        if (serverIndex !== -1) {
          serverList[serverIndex].name = nameInput.value;
          localStorage.setItem('serverList', JSON.stringify(serverList));
        }
      } catch (err) {
        console.error("Error updating server name:", err);
      }
    };
    dialog.appendChild(nameInput);
    
    // Add host ID display
    const idDisplay = document.createElement('div');
    idDisplay.textContent = 'Share this ID with friends:';
    dialog.appendChild(idDisplay);
    
    // Add ID input field for easy copying
    const idInput = document.createElement('input');
    idInput.value = hostId;
    idInput.readOnly = true;
    idInput.style.width = '100%';
    idInput.style.padding = '10px';
    idInput.style.margin = '10px 0';
    idInput.style.fontSize = '16px';
    idInput.style.textAlign = 'center';
    idInput.style.backgroundColor = '#222';
    idInput.style.color = 'white';
    idInput.style.border = '1px solid #444';
    dialog.appendChild(idInput);
    
    // Add copy button
    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy ID';
    copyButton.style.padding = '10px 20px';
    copyButton.style.margin = '10px';
    copyButton.style.cursor = 'pointer';
    copyButton.style.backgroundColor = '#4CAF50';
    copyButton.style.color = 'white';
    copyButton.style.border = 'none';
    copyButton.style.borderRadius = '3px';
    copyButton.onclick = () => {
      idInput.select();
      document.execCommand('copy');
      copyButton.textContent = 'Copied!';
      setTimeout(() => {
        copyButton.textContent = 'Copy ID';
      }, 2000);
    };
    dialog.appendChild(copyButton);
    
    // Add instructions
    const instructions = document.createElement('p');
    instructions.textContent = 'Friends can join your game by choosing "Join Game" and entering this ID.';
    dialog.appendChild(instructions);
    
    // Add player count display
    const playerCount = document.createElement('p');
    playerCount.textContent = `Players connected: ${this.remotePlayers.size + 1}`;
    playerCount.style.fontWeight = 'bold';
    playerCount.style.marginTop = '20px';
    dialog.appendChild(playerCount);
    
    // Update player count when players join
    const updateInterval = setInterval(() => {
      playerCount.textContent = `Players connected: ${this.remotePlayers.size + 1}`;
    }, 1000);
    
    // Add start game button
    const startButton = document.createElement('button');
    startButton.textContent = 'Start Game';
    startButton.style.padding = '10px 20px';
    startButton.style.margin = '10px';
    startButton.style.cursor = 'pointer';
    startButton.style.backgroundColor = '#2196F3';
    startButton.style.color = 'white';
    startButton.style.border = 'none';
    startButton.style.borderRadius = '3px';
    startButton.style.fontSize = '18px';
    startButton.style.fontWeight = 'bold';
    startButton.onclick = () => {
      clearInterval(updateInterval);
      document.body.removeChild(modal);
      // Now start the game after dialog is closed
      this.gameEngine.startGame();
    };
    dialog.appendChild(startButton);
    
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    
    // Auto-select the ID for easy copying
    setTimeout(() => {
      idInput.select();
    }, 100);
  }
  
  /**
   * Show a dialog to enter a host ID to join
   */
  showJoinDialog() {
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
    dialog.style.maxWidth = '500px';
    dialog.style.textAlign = 'center';
    dialog.style.fontFamily = 'Arial, sans-serif';
    
    // Add title
    const title = document.createElement('h2');
    title.textContent = 'Join a Game';
    title.style.marginTop = '0';
    dialog.appendChild(title);
    
    // Create tabs container
    const tabsContainer = document.createElement('div');
    tabsContainer.style.display = 'flex';
    tabsContainer.style.justifyContent = 'center';
    tabsContainer.style.margin = '20px 0';
    dialog.appendChild(tabsContainer);
    
    // Create server list tab
    const serverListTab = document.createElement('div');
    serverListTab.textContent = 'Server List';
    serverListTab.style.padding = '10px 20px';
    serverListTab.style.backgroundColor = '#4CAF50';
    serverListTab.style.color = 'white';
    serverListTab.style.cursor = 'pointer';
    serverListTab.style.borderRadius = '5px 0 0 5px';
    tabsContainer.appendChild(serverListTab);
    
    // Create direct join tab
    const directJoinTab = document.createElement('div');
    directJoinTab.textContent = 'Direct Join';
    directJoinTab.style.padding = '10px 20px';
    directJoinTab.style.backgroundColor = '#555';
    directJoinTab.style.color = '#ddd';
    directJoinTab.style.cursor = 'pointer';
    directJoinTab.style.borderRadius = '0 5px 5px 0';
    tabsContainer.appendChild(directJoinTab);
    
    // Create content containers
    const serverListContent = document.createElement('div');
    serverListContent.style.display = 'block';
    dialog.appendChild(serverListContent);
    
    const directJoinContent = document.createElement('div');
    directJoinContent.style.display = 'none';
    dialog.appendChild(directJoinContent);
    
    // Set up tab switching
    serverListTab.onclick = () => {
      serverListTab.style.backgroundColor = '#4CAF50';
      serverListTab.style.color = 'white';
      directJoinTab.style.backgroundColor = '#555';
      directJoinTab.style.color = '#ddd';
      serverListContent.style.display = 'block';
      directJoinContent.style.display = 'none';
      refreshServerList(); // Refresh the list when switching to this tab
    };
    
    directJoinTab.onclick = () => {
      directJoinTab.style.backgroundColor = '#4CAF50';
      directJoinTab.style.color = 'white';
      serverListTab.style.backgroundColor = '#555';
      serverListTab.style.color = '#ddd';
      directJoinContent.style.display = 'block';
      serverListContent.style.display = 'none';
    };
    
    // --- Server List Content ---
    
    // Create server list container with a fixed height and scrolling
    const serverListContainer = document.createElement('div');
    serverListContainer.style.maxHeight = '300px';
    serverListContainer.style.overflowY = 'auto';
    serverListContainer.style.margin = '10px 0';
    serverListContainer.style.border = '1px solid #444';
    serverListContainer.style.borderRadius = '5px';
    serverListContainer.style.padding = '5px';
    serverListContainer.style.backgroundColor = '#222';
    serverListContent.appendChild(serverListContainer);
    
    // Add refresh button
    const refreshButton = document.createElement('button');
    refreshButton.textContent = 'Refresh Servers';
    refreshButton.style.padding = '10px 20px';
    refreshButton.style.margin = '10px';
    refreshButton.style.cursor = 'pointer';
    refreshButton.style.backgroundColor = '#607D8B';
    refreshButton.style.color = 'white';
    refreshButton.style.border = 'none';
    refreshButton.style.borderRadius = '3px';
    refreshButton.onclick = refreshServerList;
    serverListContent.appendChild(refreshButton);
    
    // Function to refresh the server list
    function refreshServerList() {
      // Clear current list
      serverListContainer.innerHTML = '';
      
      // Get server list
      const servers = this.getServerList();
      
      if (servers.length === 0) {
        const noServers = document.createElement('div');
        noServers.textContent = 'No active servers found. Try refreshing or host your own game!';
        noServers.style.padding = '15px';
        noServers.style.color = '#aaa';
        noServers.style.textAlign = 'center';
        serverListContainer.appendChild(noServers);
        return;
      }
      
      // Add each server to the list
      servers.forEach(server => {
        const serverItem = document.createElement('div');
        serverItem.style.padding = '10px';
        serverItem.style.margin = '5px 0';
        serverItem.style.borderRadius = '5px';
        serverItem.style.backgroundColor = '#333';
        serverItem.style.cursor = 'pointer';
        serverItem.style.transition = 'background-color 0.2s';
        
        // Name and player count
        const serverInfo = document.createElement('div');
        serverInfo.textContent = `${server.name} - ${server.playerCount} player(s) online`;
        serverInfo.style.marginBottom = '5px';
        serverItem.appendChild(serverInfo);
        
        // Server ID (truncated)
        const serverId = document.createElement('div');
        serverId.textContent = `ID: ${this.truncateId(server.id)}`;
        serverId.style.fontSize = '12px';
        serverId.style.color = '#aaa';
        serverItem.appendChild(serverId);
        
        // Hover effect
        serverItem.onmouseover = () => {
          serverItem.style.backgroundColor = '#444';
        };
        
        serverItem.onmouseout = () => {
          serverItem.style.backgroundColor = '#333';
        };
        
        // Join on click
        serverItem.onclick = () => {
          document.body.removeChild(modal);
          this.joinGame(server.id);
        };
        
        serverListContainer.appendChild(serverItem);
      });
    }
    
    // Bind the refreshServerList function to this NetworkManager instance
    refreshServerList = refreshServerList.bind(this);
    
    // Initial refresh
    refreshServerList();
    
    // --- Direct Join Content ---
    
    // Add instructions
    const instructions = document.createElement('p');
    instructions.textContent = 'Enter the host ID to join their game:';
    directJoinContent.appendChild(instructions);
    
    // Add ID input field
    const idInput = document.createElement('input');
    idInput.placeholder = 'Paste Host ID here';
    idInput.style.width = '100%';
    idInput.style.padding = '10px';
    idInput.style.margin = '10px 0';
    idInput.style.fontSize = '16px';
    idInput.style.textAlign = 'center';
    idInput.style.backgroundColor = '#222';
    idInput.style.color = 'white';
    idInput.style.border = '1px solid #444';
    directJoinContent.appendChild(idInput);
    
    // Add join button
    const joinButton = document.createElement('button');
    joinButton.textContent = 'Join Game';
    joinButton.style.padding = '10px 20px';
    joinButton.style.margin = '10px';
    joinButton.style.cursor = 'pointer';
    joinButton.style.backgroundColor = '#4CAF50';
    joinButton.style.color = 'white';
    joinButton.style.border = 'none';
    joinButton.style.borderRadius = '3px';
    joinButton.onclick = () => {
      const hostId = idInput.value.trim();
      if (hostId) {
        this.joinGame(hostId);
        document.body.removeChild(modal);
      } else {
        instructions.textContent = 'Please enter a valid host ID!';
        instructions.style.color = '#FF5252';
      }
    };
    directJoinContent.appendChild(joinButton);
    
    // Add cancel button for both views
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.padding = '10px 20px';
    cancelButton.style.margin = '10px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.backgroundColor = '#9E9E9E';
    cancelButton.style.color = 'white';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '3px';
    cancelButton.onclick = () => {
      document.body.removeChild(modal);
    };
    dialog.appendChild(cancelButton);
    
    modal.appendChild(dialog);
    document.body.appendChild(modal);
  }
  
  /**
   * Show an error dialog
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
    title.style.color = '#FF5252';
    dialog.appendChild(title);
    
    // Add error message
    const errorMessage = document.createElement('p');
    errorMessage.textContent = message;
    dialog.appendChild(errorMessage);
    
    // Add OK button
    const okButton = document.createElement('button');
    okButton.textContent = 'OK';
    okButton.style.padding = '10px 20px';
    okButton.style.margin = '10px';
    okButton.style.cursor = 'pointer';
    okButton.style.backgroundColor = '#2196F3';
    okButton.style.color = 'white';
    okButton.style.border = 'none';
    okButton.style.borderRadius = '3px';
    okButton.onclick = () => {
      document.body.removeChild(modal);
    };
    dialog.appendChild(okButton);
    
    modal.appendChild(dialog);
    document.body.appendChild(modal);
  }
} 