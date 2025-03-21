# 3D Room Explorer

A Three.js application that lets you walk around a 3D room with windows in first-person view.

## Features

- 3D room with textured walls, floor, and ceiling
- Windows with glass panes
- First-person controls (WASD + mouse look)
- Modern ES6+ code with modular organization
- Realistic lighting and shadows

## Project Structure

```
├── public/               # Static assets
│   ├── index.html        # HTML entry point
│   └── css/              # CSS styles
├── src/                  # Source code
│   └── js/               # JavaScript files
│       ├── core/         # Core engine classes
│       │   ├── Engine.js    # Main engine
│       │   ├── Scene.js     # Scene management
│       │   └── Renderer.js  # Rendering
│       ├── objects/      # 3D objects
│       │   ├── Room.js      # Room geometry
│       │   └── Window.js    # Window geometry
│       ├── controls/     # Player controls
│       │   └── PlayerControls.js # First-person controls
│       └── main.js       # Application entry point
```

## How to Run

1. Install dependencies:
   ```
   npm install
   ```

2. Start the development server:
   ```
   npm start
   ```

3. Build for production:
   ```
   npm run build
   ```

## Controls

- **W** - Move forward
- **A** - Move left
- **S** - Move backward
- **D** - Move right
- **Mouse** - Look around (click in the scene to enable)

## Technologies Used

- Three.js
- JavaScript (ES6+)
- Webpack
- Babel 
 