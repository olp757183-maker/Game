# 🎮 Classic Games — Play With Friends Online
### منصة ألعاب كلاسيكية جماعية عبر الإنترنت في الوقت الفعلي

A real-time multiplayer classic games web platform featuring **UNO**, **Chess (شطرنج)**, and **Domino (دومينو)**. Built strictly with pure **HTML5, CSS3, JavaScript ES6+ (Native Modules)** on the client, and **Node.js, Express, Socket.IO, SQLite** on the backend.

---

## 🌟 Features / المميزات

* **Zero Frontend Frameworks**: 100% Vanilla HTML5, CSS3, and ES6+ Modules. No React, Vue, Angular, TypeScript, Tailwind, or Bootstrap.
* **Server-Authoritative Game Architecture**: The server validates all game turns, rule adherence, legal moves, and win conditions. Clients cannot cheat or manipulate cards.
* **3 Fully Functional Multiplayer Games**:
  1. **UNO**: 108 cards deck, wild colors, action cards (Skip, Reverse, +2, +4), UNO shout button, penalties, stacking, and rounds scoring.
  2. **Chess (شطرنج)**: 8x8 Board, full move validation, in-check alerts, checkmate, stalemate, castling, en passant, pawn promotion, clocks, and draw offers.
  3. **Domino (دومينو)**: Double-six set (28 tiles), authentic dot layouts, chain matching ends (left/right), boneyard drawing, blocked game detection, and rounds.
* **Strict Private State Security**: Each player only sees their own private cards/tiles. Opponents only receive hand counts, preventing any card snooping.
* **Real-time Synchronization & WebSockets**: Low-latency multiplayer powered by Socket.IO.
* **In-Room Chat & Live Notifications**: Real-time room chat with system notices (join, leave, game started).
* **Dynamic Rules Engine & Rules Editor**: Custom starting cards, turn timers (30s, 60s, 120s), stacking on/off, target scores, and time controls.
* **Room Management**: Public & Private rooms, 6-character room codes (e.g. `X7K92P`), host controls (kick, transfer host, lock, start/restart match).
* **Bilingual Support (العربية / English)**: Full RTL (Arabic) and LTR (English) localization toggle.
* **Modern Gaming Aesthetics**: Dark mode by default, optional Light mode, glassmorphism, responsive across all screen sizes (360px to 1920px).
* **Zero External Asset Dependencies**: Vector piece symbols and CSS-generated domino pips and playing cards; audio synthesized via Web Audio API.

---

## 📁 Project Structure / هيكل المشروع

```text
classic-games/
├── client/
│   ├── index.html            # Landing home page
│   ├── login.html            # Login page
│   ├── register.html         # User registration page
│   ├── lobby.html            # Open rooms lobby and room creation
│   ├── room.html             # Real-time game room and stage
│   ├── profile.html          # User profile and match statistics
│   ├── settings.html         # Audio, theme, and language settings
│   │
│   ├── css/
│   │   ├── main.css          # Design system, CSS variables, tokens, buttons, modals
│   │   ├── auth.css          # Login/Register card styling
│   │   ├── lobby.css         # Rooms table, game shelf, filters
│   │   ├── room.css          # Game arena, chat sidebar, players list
│   │   ├── games.css         # Visual styles for UNO, Chess, Domino, Baloot, Cards
│   │   └── responsive.css    # Responsive breakpoints (360px - 1920px)
│   │
│   ├── js/
│   │   ├── main.js           # Home page logic
│   │   ├── auth.js           # Authentication & Guest login controller
│   │   ├── lobby.js          # Lobby rooms browser & Rules editor
│   │   ├── room.js           # Game room lifecycle controller
│   │   ├── socket.js         # Socket.IO client manager
│   │   ├── api.js            # REST API client
│   │   ├── ui.js             # Modals, theme manager, UI helpers
│   │   ├── utils.js          # Web Audio sound effects synthesizer
│   │   ├── language.js       # RTL/LTR i18n manager
│   │   └── translations/
│   │       ├── ar.js         # Arabic translations
│   │       └── en.js         # English translations
│   │
│   └── games/
│       ├── uno/uno-client.js
│       ├── chess/chess-client.js
│       └── domino/domino-client.js
│
├── server/
│   ├── server.js             # Express app & HTTP entrypoint
│   ├── socket.js             # Socket.IO server & event handlers
│   ├── rooms.js              # Room model & active room manager
│   ├── users.js              # User profiles & authentication
│   ├── auth.js               # Token session management
│   ├── database.js           # SQLite persistence layer (node:sqlite)
│   │
│   └── games/
│       ├── uno.js            # Server-authoritative UNO engine
│       ├── chess.js          # Server-authoritative Chess engine
│       └── domino.js         # Server-authoritative Domino engine
│
├── shared/
│   ├── constants.js          # Enums, game types, socket events
│   ├── rules.js              # Rules engine & default rules
│   └── validation.js         # Input sanitization & validation
│
├── tests/
│   ├── test-runner.js        # Automated unit and engine tests (18 tests)
│   └── multiplayer-simulation.js # Live multiplayer network simulation test
│
├── package.json
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🚀 Getting Started / تشغيل المشروع محليًا

### 1. Prerequisites
* **Node.js**: v20 or higher (Tested on Node.js v24.15 LTS).
* **npm**: v10 or higher.

### 2. Installation
Open your terminal in the `classic-games` directory and run:
```bash
npm install
```

### 3. Running the Server
```bash
npm start
```
Or for auto-reloading development mode:
```bash
npm run dev
```

The application will be running at:
👉 **`http://localhost:3000`**

---

## 🧪 Testing / تشغيل الاختبارات

Run the automated test suite verifying all 5 game engines, rules engine, and private state isolation:
```bash
npm test
```
Or run the live network simulation simulating two concurrent Socket.IO players:
```bash
node tests/multiplayer-simulation.js
```

---

## 👥 How to Test Multiplayer Between 2 Users (Manual Test)

1. Start the server with `npm start`.
2. Open **Browser 1** (e.g. Chrome / Normal Window) and navigate to `http://localhost:3000/lobby.html`.
   * Click **"Play as Guest"** or register as **Player 1**.
   * Click **"Create Room"**, select **UNO** (or Chess, Domino), and click **Create Room**.
   * Note the generated 6-letter room code (e.g. `X7K92P`).
3. Open **Browser 2** (e.g. Incognito Window / Firefox / Edge) and navigate to `http://localhost:3000/lobby.html`.
   * Click **"Play as Guest"** or register as **Player 2**.
   * Click **"Join with Code"**, enter the 6-letter room code `X7K92P`, and click **Join**.
4. Both players are now in the room!
   * Live chat is functional between both windows.
   * Player 1 (Host) clicks **"Start Game"**.
   * Both windows transition to the active game board in real time!
   * Notice that Player 1 only sees their own cards, and Player 2 only sees their own cards.
   * When it's Player 1's turn, Player 1 can play a card. Player 2's turn will then be updated automatically. Out-of-turn attempts are rejected server-side.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env`:
```ini
PORT=3000
NODE_ENV=development
DATABASE_PATH=./data/classic_games.db
```

---

## 🗄️ Database Architecture & Migration

The system uses SQLite via Node.js built-in `node:sqlite DatabaseSync` with WAL mode enabled.
Tables created automatically in `./data/classic_games.db`:
* `users`: Registered users, guest accounts, avatars, passwords hashed with bcrypt.
* `user_stats`: Match history, win/loss records, scores per game.
* `rooms`: Room definitions, active settings, custom rules JSON.
* `room_players`: Player assignments per room.
* `games`: Game state snapshots and match progress.
* `game_results`: Final match winners and scores.
* `chat_messages`: Archived in-room chat logs.

To migrate to **PostgreSQL**, replace the SQL queries in `server/database.js` with `pg` client pool queries without modifying any game or room logic.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
