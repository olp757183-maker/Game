/**
 * Shared Constants for Classic Games Online
 * Used by both Frontend and Backend
 */

export const GAME_TYPES = {
  UNO: 'uno',
  BALOOT: 'baloot',
  CHESS: 'chess',
  DOMINO: 'domino',
  CARDS: 'cards'
};

export const GAME_INFO = {
  [GAME_TYPES.UNO]: {
    id: 'uno',
    nameEn: 'UNO',
    nameAr: 'أونو',
    minPlayers: 2,
    maxPlayers: 8,
    defaultPlayers: 4,
    descriptionEn: 'The world-famous card shedding game with action cards and wild colors.',
    descriptionAr: 'لعبة البطاقات الشهيرة القائمة على التخلص من الأوراق وبطاقات الحركة والألوان.'
  },
  [GAME_TYPES.BALOOT]: {
    id: 'baloot',
    nameEn: 'Baloot',
    nameAr: 'بلوت',
    minPlayers: 4,
    maxPlayers: 4,
    defaultPlayers: 4,
    descriptionEn: 'The premier 4-player Arabian trick-taking game with Sun and Hokom bidding.',
    descriptionAr: 'لعبة الورق الشعبية الخليجية الأشهر لأربعة لاعبين وفريقين بنظام الصن والحكم.'
  },
  [GAME_TYPES.CHESS]: {
    id: 'chess',
    nameEn: 'Chess',
    nameAr: 'شطرنج',
    minPlayers: 2,
    maxPlayers: 2,
    defaultPlayers: 2,
    descriptionEn: 'The timeless strategy duel of kings, queens, knights, and tactical brilliance.',
    descriptionAr: 'المبارزة الاستراتيجية الخالدة بين الملوك والوزراء والفرسان والتكتيك الذكي.'
  },
  [GAME_TYPES.DOMINO]: {
    id: 'domino',
    nameEn: 'Domino',
    nameAr: 'دومينو',
    minPlayers: 2,
    maxPlayers: 4,
    defaultPlayers: 2,
    descriptionEn: 'Classic double-six domino matching game with drawing, blocking, and rounds.',
    descriptionAr: 'لعبة الدومينو الكلاسيكية المزدوجة الستة مع سحب الأحجار والتسكير وحساب النقاط.'
  },
  [GAME_TYPES.CARDS]: {
    id: 'cards',
    nameEn: 'Cards / Batta',
    nameAr: 'بطّة / شِدّة',
    minPlayers: 2,
    maxPlayers: 6,
    defaultPlayers: 4,
    descriptionEn: 'Customizable card game engine with shedding, suit-matching, and special power cards.',
    descriptionAr: 'محرك ألعاب ورق كلاسيكية مع إمكانية التخصيص الكامل للتخلص من الأوراق والحركات الخاصة.'
  }
};

export const ROOM_STATUS = {
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
  CLOSED: 'CLOSED'
};

export const ROOM_PRIVACY = {
  PUBLIC: 'public',
  PRIVATE: 'private'
};

export const GAME_STATUS = {
  WAITING: 'WAITING',
  STARTING: 'STARTING',
  PLAYING: 'PLAYING',
  ROUND_END: 'ROUND_END',
  MATCH_END: 'MATCH_END',
  FINISHED: 'FINISHED'
};

export const SOCKET_EVENTS = {
  // Client -> Server
  JOIN_ROOM: 'room:join',
  LEAVE_ROOM: 'room:leave',
  START_GAME: 'room:start',
  UPDATE_SETTINGS: 'room:settings',
  KICK_PLAYER: 'room:kick',
  TRANSFER_HOST: 'room:transfer_host',
  GAME_ACTION: 'game:action',
  CHAT_MESSAGE: 'chat:message',
  RESTART_GAME: 'room:restart',
  VOTE_REMATCH: 'game:vote_rematch',
  NEXT_ROUND: 'game:next_round',
  RECONNECT: 'user:reconnect',

  // Server -> Client
  ROOM_JOINED: 'room:joined',
  ROOM_PLAYER_JOINED: 'room:player-joined',
  ROOM_PLAYER_LEFT: 'room:player-left',
  ROOM_SETTINGS_UPDATED: 'room:settings-updated',
  ROOM_STARTED: 'room:started',
  ROOM_STATE: 'room:state',
  GAME_STATE: 'game:state',
  REMATCH_UPDATE: 'game:rematch_update',
  CHAT_BROADCAST: 'chat:broadcast',
  ERROR: 'room:error',
  ERROR_MESSAGE: 'error:message',
  NOTIFICATION: 'system:notification',
  ROOM_CLOSED: 'room:closed',

  // Lobby Real-Time Events
  LOBBY_ROOM_CREATED: 'lobby:room-created',
  LOBBY_ROOM_UPDATED: 'lobby:room-updated',
  LOBBY_ROOM_REMOVED: 'lobby:room-removed'
};

export const UNO_COLORS = {
  RED: 'red',
  BLUE: 'blue',
  GREEN: 'green',
  YELLOW: 'yellow',
  WILD: 'wild'
};

export const UNO_VALUES = {
  ZERO: '0',
  ONE: '1',
  TWO: '2',
  THREE: '3',
  FOUR: '4',
  FIVE: '5',
  SIX: '6',
  SEVEN: '7',
  EIGHT: '8',
  NINE: '9',
  SKIP: 'skip',
  REVERSE: 'reverse',
  DRAW_TWO: 'draw2',
  WILD: 'wild',
  WILD_DRAW_FOUR: 'wild4'
};

export const CHESS_COLORS = {
  WHITE: 'w',
  BLACK: 'b'
};

export const CHESS_PIECES = {
  PAWN: 'p',
  KNIGHT: 'n',
  BISHOP: 'b',
  ROOK: 'r',
  QUEEN: 'q',
  KING: 'k'
};

export const BALOOT_SUITS = {
  SPADES: 'spades',     // سبيت
  HEARTS: 'hearts',     // هاص
  DIAMONDS: 'diamonds', // ديمن
  CLUBS: 'clubs'        // كبة
};

export const BALOOT_BIDS = {
  PASS: 'pass',         // بس
  SUN: 'sun',           // صن
  HOKOM: 'hokom',       // حكم
  ASHKAL: 'ashkal',     // أشكال (في الصن فقط من اللاعب الثاني أو الرابع)
  DOUBLE: 'double',     // دبل
  THREE: 'three',       // ثري
  FOUR: 'four',         // أربعة
  GAHWA: 'gahwa'        // قهوة
};
