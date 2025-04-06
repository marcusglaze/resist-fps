/**
 * SoundManager class
 * Manages sound effects and preloading for the game
 */
export class SoundManager {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
    this.initialized = false;
    this.audioElements = {};
    this.preloaded = false;
  }
  
  /**
   * Initialize the sound manager
   */
  init() {
    console.log("Initializing SoundManager");
    
    // Create audio elements for game sounds
    this.initAudioElements();
    
    this.initialized = true;
  }
  
  /**
   * Preload all sounds for the game
   * This is especially important for clients in multiplayer to avoid sound glitches
   */
  async preloadSounds() {
    if (this.preloaded) {
      console.log("Sounds already preloaded");
      return;
    }
    
    console.log("Preloading sound effects");
    
    // Create and preload all audio elements
    this.initAudioElements();
    
    // Force load all sounds by playing them silently
    try {
      const promises = Object.values(this.audioElements).map(audio => {
        if (!audio) return Promise.resolve();
        
        // Set volume to 0 to avoid any sound
        audio.volume = 0;
        
        // Play and immediately pause to force browser to load the sound
        const promise = audio.play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            return Promise.resolve();
          })
          .catch(err => {
            console.warn("Error preloading sound:", err);
            return Promise.resolve(); // Still resolve to let other sounds load
          });
          
        return promise;
      });
      
      // Wait for all sounds to be preloaded
      await Promise.all(promises);
      
      // Reset volumes after preloading
      Object.values(this.audioElements).forEach(audio => {
        if (!audio) return;
        audio.volume = 0.7; // Default volume
      });
      
      this.preloaded = true;
      console.log("Sound preloading complete");
    } catch (error) {
      console.error("Error during sound preloading:", error);
    }
  }
  
  /**
   * Initialize audio elements
   */
  initAudioElements() {
    this.audioElements = {
      // Weapon sounds
      pistolShoot: new Audio('/audio/pistol-shooting.wav'),
      shotgunShoot: new Audio('/audio/shotgun-shooting.wav'),
      machineGunShoot: new Audio('/audio/machine-gun-shooting.wav'),
      pistolReload: new Audio('/audio/pistol-reload.wav'),
      shotgunReload: new Audio('/audio/shotgun-reload.wav'),
      machineGunReload: new Audio('/audio/machine-gun-reload.wav'),
      
      // Player sounds
      playerWalk: new Audio('/audio/player-walk.wav'),
      playerDamage: new Audio('/audio/player-damage.wav'),
      
      // Window sounds
      windowBoardAdd: new Audio('/audio/window-board-add.wav'),
      windowBoardBreaking: new Audio('/audio/window-board-breaking.wav'),
      
      // Zombie sounds
      zombieSound1: new Audio('/audio/zombie-1.wav'),
      zombieSound2: new Audio('/audio/zombie-2.wav'),
      zombieSound3: new Audio('/audio/zombie-3.wav'),
      zombieSound4: new Audio('/audio/zombie-4.wav'),
      zombieSound5: new Audio('/audio/zombie-5.wav'),
      
      // Background music
      backgroundMusic: new Audio('/audio/game-music.wav'),
      
      // Pickup sounds
      weaponPickup: new Audio('/audio/weapon-pickup.wav')
    };
    
    // Configure audio elements
    Object.values(this.audioElements).forEach(audio => {
      if (audio) {
        audio.preload = 'auto';
        audio.volume = 0.7; // Default volume
      }
    });
    
    // Set specific volume for pistol shooting
    if (this.audioElements.pistolShoot) {
      this.audioElements.pistolShoot.volume = 0.42;
    }
    
    // Configure sounds that should loop
    if (this.audioElements.machineGunShoot) {
      this.audioElements.machineGunShoot.loop = true;
    }
    
    if (this.audioElements.backgroundMusic) {
      this.audioElements.backgroundMusic.loop = true;
      this.audioElements.backgroundMusic.volume = 0.5;
    }
  }
  
  /**
   * Set the volume for all sound effects
   * @param {number} volume - Volume from 0 to 1
   */
  setSoundVolume(volume) {
    const soundVolume = Math.max(0, Math.min(1, volume));
    
    // Apply to all sounds except background music
    Object.entries(this.audioElements).forEach(([key, audio]) => {
      if (!audio || key === 'backgroundMusic') return;
      audio.volume = soundVolume;
    });
    
    // Special case for pistol which should be a bit quieter
    if (this.audioElements.pistolShoot) {
      this.audioElements.pistolShoot.volume = soundVolume * 0.6;
    }
  }
  
  /**
   * Set the volume for background music
   * @param {number} volume - Volume from 0 to 1
   */
  setMusicVolume(volume) {
    const musicVolume = Math.max(0, Math.min(1, volume));
    
    if (this.audioElements.backgroundMusic) {
      this.audioElements.backgroundMusic.volume = musicVolume;
    }
  }
} 