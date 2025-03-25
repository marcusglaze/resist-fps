import * as THREE from 'three';

/**
 * StartMenu class to handle the game's start screen
 */
export class StartMenu {
  constructor(engine = null) {
    this.onStartGame = null;
    this.container = null;
    this.isVisible = false;
    this.doomMode = true; // Default to doom mode
    this.soundVolume = 0.8; // Default sound volume
    this.musicVolume = 0.5; // Default music volume
    this.difficultyLevel = 'normal'; // Default difficulty
    this.engine = engine; // Store reference to the engine
    this.gameMode = 'singleplayer'; // Default game mode
  }

  /**
   * Initialize the start menu
   * @param {Function} startCallback - Function to call when game starts
   * @param {Engine} engine - Optional reference to the game engine
   */
  init(startCallback, engine = null) {
    this.onStartGame = startCallback;
    
    // Store engine reference if provided
    if (engine) {
      this.engine = engine;
    }
    
    this.createMenuElements();
    this.show();
  }

  /**
   * Create all menu elements and add to DOM
   */
  createMenuElements() {
    // Create menu container
    this.container = document.createElement('div');
    this.container.id = 'start-menu';
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.alignItems = 'center';
    this.container.style.justifyContent = 'center';
    this.container.style.zIndex = '1000';
    this.container.style.color = '#fff';
    this.container.style.fontFamily = 'monospace, "Press Start 2P", Courier, fantasy';
    
    // Prevent pointer lock when interacting with menu
    this.container.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    this.container.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Create title
    const title = document.createElement('h1');
    title.textContent = 'RESIST: MATRIX';
    title.style.color = '#ff3333';
    title.style.fontSize = '48px';
    title.style.textShadow = '0 0 10px #ff3333, 0 0 20px #ff3333';
    title.style.marginBottom = '30px';
    title.style.fontFamily = 'Impact, fantasy';
    title.style.letterSpacing = '2px';
    
    // Subtitle
    const subtitle = document.createElement('h2');
    subtitle.textContent = 'Zombie Window Defense';
    subtitle.style.color = '#aaaaaa';
    subtitle.style.fontSize = '24px';
    subtitle.style.marginBottom = '40px';
    subtitle.style.fontFamily = 'monospace';

    // Create menu buttons container
    const menuOptions = document.createElement('div');
    menuOptions.style.display = 'flex';
    menuOptions.style.flexDirection = 'column';
    menuOptions.style.gap = '15px';
    menuOptions.style.width = '300px';
    
    // Helper function to create buttons
    const createButton = (text, onClick, primary = false) => {
      const button = document.createElement('button');
      button.textContent = text;
      button.style.padding = '15px 20px';
      button.style.fontSize = '18px';
      button.style.cursor = 'pointer';
      button.style.border = 'none';
      button.style.borderRadius = '5px';
      button.style.fontFamily = 'monospace, Courier';
      button.style.fontWeight = 'bold';
      button.style.transition = 'all 0.2s ease';
      
      if (primary) {
        button.style.backgroundColor = '#ff3333';
        button.style.color = 'white';
      } else {
        button.style.backgroundColor = '#333333';
        button.style.color = '#dddddd';
      }
      
      // Hover effects
      button.addEventListener('mouseover', () => {
        button.style.transform = 'scale(1.05)';
        button.style.boxShadow = primary ? '0 0 10px #ff3333' : '0 0 10px #555555';
      });
      
      button.addEventListener('mouseout', () => {
        button.style.transform = 'scale(1)';
        button.style.boxShadow = 'none';
      });
      
      // Prevent pointer lock and event propagation
      button.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });
      
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      });
      
      return button;
    };

    // Create game mode container
    const gameModeContainer = document.createElement('div');
    gameModeContainer.style.display = 'flex';
    gameModeContainer.style.flexDirection = 'column';
    gameModeContainer.style.alignItems = 'center';
    gameModeContainer.style.marginBottom = '20px';
    
    // Game mode title
    const gameModeTitle = document.createElement('h3');
    gameModeTitle.textContent = 'GAME MODE';
    gameModeTitle.style.color = '#dddddd';
    gameModeTitle.style.marginBottom = '15px';
    
    // Game mode buttons
    const gameModeButtons = document.createElement('div');
    gameModeButtons.style.display = 'flex';
    gameModeButtons.style.gap = '10px';
    
    const singlePlayerButton = document.createElement('button');
    singlePlayerButton.textContent = 'SINGLE PLAYER';
    singlePlayerButton.style.padding = '10px 15px';
    singlePlayerButton.style.backgroundColor = this.gameMode === 'singleplayer' ? '#ff3333' : '#333333';
    singlePlayerButton.style.color = '#ffffff';
    singlePlayerButton.style.border = 'none';
    singlePlayerButton.style.borderRadius = '3px';
    singlePlayerButton.style.cursor = 'pointer';
    singlePlayerButton.style.fontFamily = 'monospace';
    singlePlayerButton.style.fontWeight = 'bold';
    
    const multiplayerButton = document.createElement('button');
    multiplayerButton.textContent = 'MULTIPLAYER';
    multiplayerButton.style.padding = '10px 15px';
    multiplayerButton.style.backgroundColor = this.gameMode !== 'singleplayer' ? '#ff3333' : '#333333';
    multiplayerButton.style.color = '#ffffff';
    multiplayerButton.style.border = 'none';
    multiplayerButton.style.borderRadius = '3px';
    multiplayerButton.style.cursor = 'pointer';
    multiplayerButton.style.fontFamily = 'monospace';
    multiplayerButton.style.fontWeight = 'bold';
    
    singlePlayerButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.gameMode = 'singleplayer';
      singlePlayerButton.style.backgroundColor = '#ff3333';
      multiplayerButton.style.backgroundColor = '#333333';
      startButton.textContent = 'START GAME';
      hostButton.style.display = 'none';
      joinButton.style.display = 'none';
    });
    
    multiplayerButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.gameMode = 'multiplayer';
      singlePlayerButton.style.backgroundColor = '#333333';
      multiplayerButton.style.backgroundColor = '#ff3333';
      startButton.textContent = 'MULTIPLAYER OPTIONS';
      hostButton.style.display = 'block';
      joinButton.style.display = 'block';
    });
    
    gameModeButtons.appendChild(singlePlayerButton);
    gameModeButtons.appendChild(multiplayerButton);
    
    gameModeContainer.appendChild(gameModeTitle);
    gameModeContainer.appendChild(gameModeButtons);

    // Single Player button
    const startButton = createButton('START GAME', () => {
      if (this.gameMode === 'singleplayer') {
        this.hide();
        if (this.onStartGame) {
          // Start single player game
          this.engine.networkManager.startSingleplayer();
        }
      } else {
        // Toggle visibility of multiplayer options
        if (hostButton.style.display === 'none') {
          hostButton.style.display = 'block';
          joinButton.style.display = 'block';
        } else {
          hostButton.style.display = 'none';
          joinButton.style.display = 'none';
        }
      }
    }, true);

    // Host Game button
    const hostButton = createButton('HOST GAME', () => {
      this.hide();
      if (this.engine && this.engine.networkManager) {
        this.engine.networkManager.startHosting();
      }
    });
    hostButton.style.display = 'none';
    hostButton.style.backgroundColor = '#4CAF50'; // Green color for host button

    // Join Game button
    const joinButton = createButton('JOIN GAME', () => {
      if (this.engine && this.engine.networkManager) {
        this.engine.networkManager.joinGame();
      }
    });
    joinButton.style.display = 'none';
    joinButton.style.backgroundColor = '#2196F3'; // Blue color for join button

    // Settings button
    const settingsButton = createButton('SETTINGS', () => {
      this.showSettings();
    });

    // Instructions button
    const instructionsButton = createButton('INSTRUCTIONS', () => {
      this.showInstructions();
    });

    // Credits button
    const creditsButton = createButton('CREDITS', () => {
      this.showCredits();
    });

    // Assemble menu
    menuOptions.appendChild(gameModeContainer);
    menuOptions.appendChild(startButton);
    menuOptions.appendChild(hostButton);
    menuOptions.appendChild(joinButton);
    menuOptions.appendChild(settingsButton);
    menuOptions.appendChild(instructionsButton);
    menuOptions.appendChild(creditsButton);

    // Add elements to container
    this.container.appendChild(title);
    this.container.appendChild(subtitle);
    this.container.appendChild(menuOptions);

    // Add to DOM
    document.body.appendChild(this.container);
  }

  /**
   * Show the settings panel
   */
  showSettings() {
    // Create settings panel
    const settingsPanel = document.createElement('div');
    settingsPanel.style.position = 'absolute';
    settingsPanel.style.top = '50%';
    settingsPanel.style.left = '50%';
    settingsPanel.style.transform = 'translate(-50%, -50%)';
    settingsPanel.style.backgroundColor = '#222222';
    settingsPanel.style.padding = '30px';
    settingsPanel.style.borderRadius = '10px';
    settingsPanel.style.boxShadow = '0 0 20px rgba(255, 51, 51, 0.5)';
    settingsPanel.style.zIndex = '1001';
    settingsPanel.style.width = '400px';
    
    // Prevent pointer lock
    settingsPanel.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    settingsPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Settings title
    const title = document.createElement('h2');
    title.textContent = 'GAME SETTINGS';
    title.style.color = '#ff3333';
    title.style.marginBottom = '20px';
    title.style.textAlign = 'center';
    settingsPanel.appendChild(title);
    
    // Create settings form
    const form = document.createElement('form');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '15px';
    
    // Prevent form events from propagating
    form.addEventListener('mousedown', (e) => e.stopPropagation());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    
    // Doom Mode setting
    const doomModeGroup = document.createElement('div');
    doomModeGroup.style.display = 'flex';
    doomModeGroup.style.alignItems = 'center';
    doomModeGroup.style.justifyContent = 'space-between';
    
    const doomModeLabel = document.createElement('label');
    doomModeLabel.textContent = 'DOOM Mode:';
    doomModeLabel.style.color = '#dddddd';
    
    const doomModeToggle = document.createElement('input');
    doomModeToggle.type = 'checkbox';
    doomModeToggle.checked = this.doomMode;
    doomModeToggle.style.width = '20px';
    doomModeToggle.style.height = '20px';
    
    doomModeGroup.appendChild(doomModeLabel);
    doomModeGroup.appendChild(doomModeToggle);
    form.appendChild(doomModeGroup);
    
    // Sound volume setting
    const soundGroup = document.createElement('div');
    soundGroup.style.display = 'flex';
    soundGroup.style.flexDirection = 'column';
    soundGroup.style.gap = '5px';
    
    const soundLabel = document.createElement('label');
    soundLabel.textContent = 'Sound Effects Volume:';
    soundLabel.style.color = '#dddddd';
    
    const soundSlider = document.createElement('input');
    soundSlider.type = 'range';
    soundSlider.min = '0';
    soundSlider.max = '1';
    soundSlider.step = '0.1';
    soundSlider.value = this.soundVolume;
    
    soundGroup.appendChild(soundLabel);
    soundGroup.appendChild(soundSlider);
    form.appendChild(soundGroup);
    
    // Music volume setting
    const musicGroup = document.createElement('div');
    musicGroup.style.display = 'flex';
    musicGroup.style.flexDirection = 'column';
    musicGroup.style.gap = '5px';
    
    const musicLabel = document.createElement('label');
    musicLabel.textContent = 'Music Volume:';
    musicLabel.style.color = '#dddddd';
    
    const musicSlider = document.createElement('input');
    musicSlider.type = 'range';
    musicSlider.min = '0';
    musicSlider.max = '1';
    musicSlider.step = '0.1';
    musicSlider.value = this.musicVolume;
    
    musicGroup.appendChild(musicLabel);
    musicGroup.appendChild(musicSlider);
    form.appendChild(musicGroup);
    
    // Difficulty settings
    const difficultyGroup = document.createElement('div');
    difficultyGroup.style.display = 'flex';
    difficultyGroup.style.flexDirection = 'column';
    difficultyGroup.style.gap = '5px';
    
    const difficultyLabel = document.createElement('label');
    difficultyLabel.textContent = 'Difficulty:';
    difficultyLabel.style.color = '#dddddd';
    
    const difficultySelect = document.createElement('select');
    difficultySelect.style.padding = '5px';
    difficultySelect.style.backgroundColor = '#333333';
    difficultySelect.style.color = '#ffffff';
    difficultySelect.style.border = '1px solid #555555';
    
    const difficulties = ['easy', 'normal', 'hard', 'nightmare'];
    difficulties.forEach(diff => {
      const option = document.createElement('option');
      option.value = diff;
      option.textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
      if (diff === this.difficultyLevel) {
        option.selected = true;
      }
      difficultySelect.appendChild(option);
    });
    
    difficultyGroup.appendChild(difficultyLabel);
    difficultyGroup.appendChild(difficultySelect);
    form.appendChild(difficultyGroup);
    
    // Buttons
    const buttonGroup = document.createElement('div');
    buttonGroup.style.display = 'flex';
    buttonGroup.style.justifyContent = 'space-between';
    buttonGroup.style.marginTop = '20px';
    
    const saveButton = document.createElement('button');
    saveButton.textContent = 'SAVE';
    saveButton.style.padding = '10px 20px';
    saveButton.style.backgroundColor = '#ff3333';
    saveButton.style.color = '#ffffff';
    saveButton.style.border = 'none';
    saveButton.style.borderRadius = '5px';
    saveButton.style.cursor = 'pointer';
    saveButton.addEventListener('mousedown', (e) => e.stopPropagation());
    saveButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.doomMode = doomModeToggle.checked;
      this.soundVolume = parseFloat(soundSlider.value);
      this.musicVolume = parseFloat(musicSlider.value);
      this.difficultyLevel = difficultySelect.value;
      document.body.removeChild(settingsPanel);
    };
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'CANCEL';
    cancelButton.style.padding = '10px 20px';
    cancelButton.style.backgroundColor = '#555555';
    cancelButton.style.color = '#ffffff';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '5px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.addEventListener('mousedown', (e) => e.stopPropagation());
    cancelButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.removeChild(settingsPanel);
    };
    
    buttonGroup.appendChild(cancelButton);
    buttonGroup.appendChild(saveButton);
    form.appendChild(buttonGroup);
    
    settingsPanel.appendChild(form);
    document.body.appendChild(settingsPanel);
  }

  /**
   * Show the instructions panel
   */
  showInstructions() {
    const instructionsPanel = document.createElement('div');
    instructionsPanel.style.position = 'absolute';
    instructionsPanel.style.top = '50%';
    instructionsPanel.style.left = '50%';
    instructionsPanel.style.transform = 'translate(-50%, -50%)';
    instructionsPanel.style.backgroundColor = '#222222';
    instructionsPanel.style.padding = '30px';
    instructionsPanel.style.borderRadius = '10px';
    instructionsPanel.style.boxShadow = '0 0 20px rgba(255, 51, 51, 0.5)';
    instructionsPanel.style.zIndex = '1001';
    instructionsPanel.style.width = '500px';
    instructionsPanel.style.color = '#ffffff';
    
    // Prevent pointer lock
    instructionsPanel.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    instructionsPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Instructions title
    const title = document.createElement('h2');
    title.textContent = 'HOW TO PLAY';
    title.style.color = '#ff3333';
    title.style.marginBottom = '20px';
    title.style.textAlign = 'center';
    
    // Instructions content
    const content = document.createElement('div');
    content.style.marginBottom = '25px';
    content.style.lineHeight = '1.6';
    
    content.innerHTML = `
      <p><b>MOVEMENT:</b> Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> keys to move around</p>
      <p><b>LOOK:</b> Move the mouse to look around</p>
      <p><b>SHOOT:</b> Left-click to fire your weapon</p>
      <p><b>RELOAD:</b> Press <kbd>R</kbd> to reload your weapon</p>
      <p><b>SWITCH WEAPONS:</b> Use mouse wheel or number keys <kbd>1</kbd>-<kbd>5</kbd></p>
      <p><b>INTERACT:</b> Press <kbd>F</kbd> to board up windows or buy wall weapons</p>
      <p><b>MYSTERY BOX:</b> Press <kbd>F</kbd> to open the mystery box when near it</p>
      
      <div style="margin-top: 20px;">
        <p>Zombies will attack through windows. Repair them to keep them at bay!</p>
        <p>Earn points by killing zombies and repairing windows</p>
        <p>Use points to buy better weapons from the walls or try your luck with the Mystery Box</p>
      </div>
    `;
    
    // Add a little styling to keyboard keys
    const styles = document.createElement('style');
    styles.textContent = `
      kbd {
        background-color: #333;
        border: 1px solid #555;
        border-radius: 3px;
        box-shadow: 0 1px 0 rgba(0,0,0,0.2);
        color: #fff;
        display: inline-block;
        font-family: monospace;
        font-size: 14px;
        line-height: 1.4;
        margin: 0 2px;
        padding: 2px 6px;
      }
    `;
    document.head.appendChild(styles);
    
    // Close button in instructions panel
    const closeButton = document.createElement('button');
    closeButton.textContent = 'CLOSE';
    closeButton.style.padding = '10px 20px';
    closeButton.style.backgroundColor = '#ff3333';
    closeButton.style.color = '#ffffff';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '5px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.display = 'block';
    closeButton.style.margin = '0 auto';
    closeButton.addEventListener('mousedown', (e) => e.stopPropagation());
    closeButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.removeChild(instructionsPanel);
    };
    
    instructionsPanel.appendChild(title);
    instructionsPanel.appendChild(content);
    instructionsPanel.appendChild(closeButton);
    document.body.appendChild(instructionsPanel);
  }

  /**
   * Show the credits panel
   */
  showCredits() {
    const creditsPanel = document.createElement('div');
    creditsPanel.style.position = 'absolute';
    creditsPanel.style.top = '50%';
    creditsPanel.style.left = '50%';
    creditsPanel.style.transform = 'translate(-50%, -50%)';
    creditsPanel.style.backgroundColor = '#222222';
    creditsPanel.style.padding = '30px';
    creditsPanel.style.borderRadius = '10px';
    creditsPanel.style.boxShadow = '0 0 20px rgba(255, 51, 51, 0.5)';
    creditsPanel.style.zIndex = '1001';
    creditsPanel.style.width = '500px';
    creditsPanel.style.color = '#ffffff';
    
    // Prevent pointer lock
    creditsPanel.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    creditsPanel.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    // Credits title
    const title = document.createElement('h2');
    title.textContent = 'CREDITS';
    title.style.color = '#ff3333';
    title.style.marginBottom = '20px';
    title.style.textAlign = 'center';
    
    // Credits content
    const content = document.createElement('div');
    content.style.marginBottom = '25px';
    content.style.lineHeight = '1.6';
    content.style.textAlign = 'center';
    
    content.innerHTML = `
      <p><b>RESIST: MATRIX</b></p>
      <p>A Zombie Window Defense Game</p>
      <br>
      <p><b>DEVELOPMENT</b></p>
      <p>Created by: Marcus Glaze</p>
      <br>
      <p><b>TECHNOLOGIES</b></p>
      <p>THREE.js - 3D Graphics Engine</p>
      <p>JavaScript - Programming</p>
      <br>
      <p><b>SPECIAL THANKS</b></p>
      <p>To all zombie apocalypse survivors</p>
      <br>
      <p>© 2023 All Rights Reserved</p>
    `;
    
    // Close button in credits panel
    const closeButton = document.createElement('button');
    closeButton.textContent = 'CLOSE';
    closeButton.style.padding = '10px 20px';
    closeButton.style.backgroundColor = '#ff3333';
    closeButton.style.color = '#ffffff';
    closeButton.style.border = 'none';
    closeButton.style.borderRadius = '5px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.display = 'block';
    closeButton.style.margin = '0 auto';
    closeButton.addEventListener('mousedown', (e) => e.stopPropagation());
    closeButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.body.removeChild(creditsPanel);
    };
    
    creditsPanel.appendChild(title);
    creditsPanel.appendChild(content);
    creditsPanel.appendChild(closeButton);
    document.body.appendChild(creditsPanel);
  }

  /**
   * Get the current settings
   * @returns {Object} Current settings
   */
  getSettings() {
    return {
      doomMode: this.doomMode,
      soundVolume: this.soundVolume,
      musicVolume: this.musicVolume,
      difficulty: this.difficultyLevel,
      gameMode: this.gameMode
    };
  }

  /**
   * Show the menu
   */
  show() {
    if (this.container) {
      this.container.style.display = 'flex';
      this.isVisible = true;
      
      // Ensure the pointer is unlocked when showing menu
      if (this.engine && typeof this.engine.unlockPointer === 'function') {
        this.engine.unlockPointer();
      }
    }
  }

  /**
   * Hide the menu
   */
  hide() {
    if (this.container) {
      this.container.style.display = 'none';
      this.isVisible = false;
    }
  }

  /**
   * Destroy the menu
   */
  destroy() {
    if (this.container) {
      document.body.removeChild(this.container);
      this.container = null;
    }
  }
} 