const express = require('express');
const path = require('path');
const { ExpressPeerServer } = require('peer');
const port = process.env.PORT || 8080;
const app = express();

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

// Always return the main index.html for any route, as this is a SPA
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
});

// Listen on the specified port
server.listen(port);
console.log('Server started on port', port); 