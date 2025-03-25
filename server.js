const express = require('express');
const path = require('path');
const port = process.env.PORT || 8080;
const app = express();

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Always return the main index.html for any route, as this is a SPA
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
});

app.listen(port);
console.log('Server started on port', port); 