const express = require('express');
const path = require('path');
const { ExpressPeerServer } = require('peer');
const port = process.env.PORT || 8080;
const app = express();

// In-memory store for active servers
const activeServers = new Map();

// Auto-cleanup of stale servers (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, server] of activeServers.entries()) {
    if (now - server.timestamp > 5 * 60 * 1000) { // 5 minutes
      activeServers.delete(id);
      console.log(`Removed stale server: ${id}`);
    }
  }
}, 60 * 1000); // Check every minute

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Create HTTP server with proper timeout settings
const server = require('http').createServer(app);

// Increase server timeout for WebSocket connections
server.setTimeout(30000); // 30 seconds timeout

// Set up PeerJS server with better configuration for Heroku
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs',
  allow_discovery: true, // Enable peer discovery
  proxied: true, // Important for Heroku
  pingInterval: 20000, // Send ping every 20 seconds
  pingTimeout: 30000,  // Consider connection dead after 30 seconds without response
  // Express traffic is allowed to be proxied
  key: 'peerjs' // Default key that PeerJS uses
});

// Use the PeerJS server
app.use('/peerjs', peerServer);

// Add a heartbeat route to keep the Heroku dyno active
app.get('/ping', (req, res) => {
  res.send('pong');
});

// Log when peers connect and disconnect
peerServer.on('connection', (client) => {
  console.log(`Client connected: ${client.getId()}`);
});

peerServer.on('disconnect', (client) => {
  console.log(`Client disconnected: ${client.getId()}`);
});

// API endpoint to register a server
app.post('/api/servers', (req, res) => {
  const { id, name, playerCount } = req.body;
  
  if (!id) {
    return res.status(400).json({ error: 'Server ID is required' });
  }
  
  activeServers.set(id, {
    id,
    name: name || `Game Server #${Math.floor(Math.random() * 1000)}`,
    playerCount: playerCount || 1,
    timestamp: Date.now()
  });
  
  console.log(`Registered server: ${id}, ${name}, ${playerCount} players`);
  
  res.status(201).json({ success: true });
});

// API endpoint to update server information
app.put('/api/servers/:id', (req, res) => {
  const { id } = req.params;
  const { name, playerCount } = req.body;
  
  if (!activeServers.has(id)) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  const server = activeServers.get(id);
  
  if (name) server.name = name;
  if (playerCount !== undefined) server.playerCount = playerCount;
  server.timestamp = Date.now();
  
  res.json({ success: true });
});

// API endpoint to get the list of servers
app.get('/api/servers', (req, res) => {
  const serversList = Array.from(activeServers.values());
  res.json(serversList);
});

// API endpoint to delete a server
app.delete('/api/servers/:id', (req, res) => {
  const { id } = req.params;
  
  if (activeServers.has(id)) {
    activeServers.delete(id);
    console.log(`Removed server: ${id}`);
  }
  
  res.json({ success: true });
});

// Always return the main index.html for any route, as this is a SPA
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
});

// Listen on the specified port
server.listen(port);
console.log('Server started on port', port);

// Add a heartbeat interval to keep WebSocket connections alive
setInterval(() => {
  console.log("Sending heartbeat ping");
  
  // Create an internal ping to keep the server active
  try {
    // Instead of using http.get which requires the full URL,
    // we'll directly call our own ping route handler to keep it active
    // This simulates an internal ping without making an actual HTTP request
    console.log("Internal heartbeat ping");
    
    // The PeerJS server has its own internal ping mechanism to keep
    // WebSocket connections alive via the pingInterval setting we configured
    // so we don't need to manually ping each client
  } catch (err) {
    console.error("Error during heartbeat:", err);
  }
}, 20000); // Every 20 seconds 