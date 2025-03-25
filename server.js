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

// Create HTTP server
const server = require('http').createServer(app);

// Set up PeerJS server
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/peerjs'
});

// Use the PeerJS server
app.use('/peerjs', peerServer);

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