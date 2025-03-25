# Resist Matrix

A 3D multiplayer zombie survival game built with Three.js.

## Features

- First-person 3D gameplay
- Zombie combat mechanics
- Multiplayer gameplay with server hosting/joining
- Round-based zombie spawning
- Weapons system
- Mystery box weapon pickups
- Destructible windows
- Mobile and desktop support

## Development Setup

Clone the repository:

```bash
git clone <your-repo-url>
cd resist-matrix
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

The game will open in your default browser at http://localhost:8080.

## Build for Production

```bash
npm run build
```

This will create a `dist` folder with the bundled application.

## Deployment to Heroku

### Prerequisites

- [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
- Git

### Steps

1. Log in to Heroku:

```bash
heroku login
```

2. Create a new Heroku app:

```bash
heroku create your-app-name
```

3. Push your code to Heroku:

```bash
git push heroku main
```

4. Open your app:

```bash
heroku open
```

## Multiplayer Setup

The game supports multiplayer via peer-to-peer connections:

1. One player hosts a game by clicking "Host Game"
2. The host shares their game ID with other players
3. Other players join by clicking "Join Game" and entering the host ID
4. The host starts the game when all players are connected

## Controls

- WASD: Move
- Mouse: Look around
- Left Click: Shoot
- R: Reload
- 1,2,3: Switch weapons
- E: Interact with windows/mystery box
- Space: Jump
- Shift: Run

## License

ISC 