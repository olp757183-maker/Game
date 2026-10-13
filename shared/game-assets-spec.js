/**
 * Authoritative Game Assets & Skin Bundles Specification
 * Defines every single card, piece, and tile required for complete bundles.
 */

export const GAME_ASSETS_SPEC = {
  uno: {
    gameType: 'uno',
    nameAr: 'أونو (UNO)',
    nameEn: 'UNO',
    totalRequired: 55,
    categories: [
      { id: 'all', nameAr: 'جميع البطاقات (55)', nameEn: 'All Cards (55)' },
      { id: 'red', nameAr: 'البطاقات الحمراء (13)', nameEn: 'Red Cards (13)' },
      { id: 'blue', nameAr: 'البطاقات الزرقاء (13)', nameEn: 'Blue Cards (13)' },
      { id: 'green', nameAr: 'البطاقات الخضراء (13)', nameEn: 'Green Cards (13)' },
      { id: 'yellow', nameAr: 'البطاقات الصفراء (13)', nameEn: 'Yellow Cards (13)' },
      { id: 'wild', nameAr: 'البطاقات الخاصة (2)', nameEn: 'Wild Cards (2)' },
      { id: 'back', nameAr: 'ظهر البطاقة (1)', nameEn: 'Card Back (1)' }
    ],
    items: [
      // RED
      { key: 'red_0', category: 'red', nameAr: 'أحمر - 0', nameEn: 'Red 0', symbol: '0', color: 'red' },
      { key: 'red_1', category: 'red', nameAr: 'أحمر - 1', nameEn: 'Red 1', symbol: '1', color: 'red' },
      { key: 'red_2', category: 'red', nameAr: 'أحمر - 2', nameEn: 'Red 2', symbol: '2', color: 'red' },
      { key: 'red_3', category: 'red', nameAr: 'أحمر - 3', nameEn: 'Red 3', symbol: '3', color: 'red' },
      { key: 'red_4', category: 'red', nameAr: 'أحمر - 4', nameEn: 'Red 4', symbol: '4', color: 'red' },
      { key: 'red_5', category: 'red', nameAr: 'أحمر - 5', nameEn: 'Red 5', symbol: '5', color: 'red' },
      { key: 'red_6', category: 'red', nameAr: 'أحمر - 6', nameEn: 'Red 6', symbol: '6', color: 'red' },
      { key: 'red_7', category: 'red', nameAr: 'أحمر - 7', nameEn: 'Red 7', symbol: '7', color: 'red' },
      { key: 'red_8', category: 'red', nameAr: 'أحمر - 8', nameEn: 'Red 8', symbol: '8', color: 'red' },
      { key: 'red_9', category: 'red', nameAr: 'أحمر - 9', nameEn: 'Red 9', symbol: '9', color: 'red' },
      { key: 'red_skip', category: 'red', nameAr: 'أحمر - تخطي الدور', nameEn: 'Red Skip', symbol: '⊘', color: 'red' },
      { key: 'red_reverse', category: 'red', nameAr: 'أحمر - عكس الاتجاه', nameEn: 'Red Reverse', symbol: '⇄', color: 'red' },
      { key: 'red_draw2', category: 'red', nameAr: 'أحمر - سحب ورقتين (+2)', nameEn: 'Red Draw 2', symbol: '+2', color: 'red' },

      // BLUE
      { key: 'blue_0', category: 'blue', nameAr: 'أزرق - 0', nameEn: 'Blue 0', symbol: '0', color: 'blue' },
      { key: 'blue_1', category: 'blue', nameAr: 'أزرق - 1', nameEn: 'Blue 1', symbol: '1', color: 'blue' },
      { key: 'blue_2', category: 'blue', nameAr: 'أزرق - 2', nameEn: 'Blue 2', symbol: '2', color: 'blue' },
      { key: 'blue_3', category: 'blue', nameAr: 'أزرق - 3', nameEn: 'Blue 3', symbol: '3', color: 'blue' },
      { key: 'blue_4', category: 'blue', nameAr: 'أزرق - 4', nameEn: 'Blue 4', symbol: '4', color: 'blue' },
      { key: 'blue_5', category: 'blue', nameAr: 'أزرق - 5', nameEn: 'Blue 5', symbol: '5', color: 'blue' },
      { key: 'blue_6', category: 'blue', nameAr: 'أزرق - 6', nameEn: 'Blue 6', symbol: '6', color: 'blue' },
      { key: 'blue_7', category: 'blue', nameAr: 'أزرق - 7', nameEn: 'Blue 7', symbol: '7', color: 'blue' },
      { key: 'blue_8', category: 'blue', nameAr: 'أزرق - 8', nameEn: 'Blue 8', symbol: '8', color: 'blue' },
      { key: 'blue_9', category: 'blue', nameAr: 'أزرق - 9', nameEn: 'Blue 9', symbol: '9', color: 'blue' },
      { key: 'blue_skip', category: 'blue', nameAr: 'أزرق - تخطي الدور', nameEn: 'Blue Skip', symbol: '⊘', color: 'blue' },
      { key: 'blue_reverse', category: 'blue', nameAr: 'أزرق - عكس الاتجاه', nameEn: 'Blue Reverse', symbol: '⇄', color: 'blue' },
      { key: 'blue_draw2', category: 'blue', nameAr: 'أزرق - سحب ورقتين (+2)', nameEn: 'Blue Draw 2', symbol: '+2', color: 'blue' },

      // GREEN
      { key: 'green_0', category: 'green', nameAr: 'أخضر - 0', nameEn: 'Green 0', symbol: '0', color: 'green' },
      { key: 'green_1', category: 'green', nameAr: 'أخضر - 1', nameEn: 'Green 1', symbol: '1', color: 'green' },
      { key: 'green_2', category: 'green', nameAr: 'أخضر - 2', nameEn: 'Green 2', symbol: '2', color: 'green' },
      { key: 'green_3', category: 'green', nameAr: 'أخضر - 3', nameEn: 'Green 3', symbol: '3', color: 'green' },
      { key: 'green_4', category: 'green', nameAr: 'أخضر - 4', nameEn: 'Green 4', symbol: '4', color: 'green' },
      { key: 'green_5', category: 'green', nameAr: 'أخضر - 5', nameEn: 'Green 5', symbol: '5', color: 'green' },
      { key: 'green_6', category: 'green', nameAr: 'أخضر - 6', nameEn: 'Green 6', symbol: '6', color: 'green' },
      { key: 'green_7', category: 'green', nameAr: 'أخضر - 7', nameEn: 'Green 7', symbol: '7', color: 'green' },
      { key: 'green_8', category: 'green', nameAr: 'أخضر - 8', nameEn: 'Green 8', symbol: '8', color: 'green' },
      { key: 'green_9', category: 'green', nameAr: 'أخضر - 9', nameEn: 'Green 9', symbol: '9', color: 'green' },
      { key: 'green_skip', category: 'green', nameAr: 'أخضر - تخطي الدور', nameEn: 'Green Skip', symbol: '⊘', color: 'green' },
      { key: 'green_reverse', category: 'green', nameAr: 'أخضر - عكس الاتجاه', nameEn: 'Green Reverse', symbol: '⇄', color: 'green' },
      { key: 'green_draw2', category: 'green', nameAr: 'أخضر - سحب ورقتين (+2)', nameEn: 'Green Draw 2', symbol: '+2', color: 'green' },

      // YELLOW
      { key: 'yellow_0', category: 'yellow', nameAr: 'أصفر - 0', nameEn: 'Yellow 0', symbol: '0', color: 'yellow' },
      { key: 'yellow_1', category: 'yellow', nameAr: 'أصفر - 1', nameEn: 'Yellow 1', symbol: '1', color: 'yellow' },
      { key: 'yellow_2', category: 'yellow', nameAr: 'أصفر - 2', nameEn: 'Yellow 2', symbol: '2', color: 'yellow' },
      { key: 'yellow_3', category: 'yellow', nameAr: 'أصفر - 3', nameEn: 'Yellow 3', symbol: '3', color: 'yellow' },
      { key: 'yellow_4', category: 'yellow', nameAr: 'أصفر - 4', nameEn: 'Yellow 4', symbol: '4', color: 'yellow' },
      { key: 'yellow_5', category: 'yellow', nameAr: 'أصفر - 5', nameEn: 'Yellow 5', symbol: '5', color: 'yellow' },
      { key: 'yellow_6', category: 'yellow', nameAr: 'أصفر - 6', nameEn: 'Yellow 6', symbol: '6', color: 'yellow' },
      { key: 'yellow_7', category: 'yellow', nameAr: 'أصفر - 7', nameEn: 'Yellow 7', symbol: '7', color: 'yellow' },
      { key: 'yellow_8', category: 'yellow', nameAr: 'أصفر - 8', nameEn: 'Yellow 8', symbol: '8', color: 'yellow' },
      { key: 'yellow_9', category: 'yellow', nameAr: 'أصفر - 9', nameEn: 'Yellow 9', symbol: '9', color: 'yellow' },
      { key: 'yellow_skip', category: 'yellow', nameAr: 'أصفر - تخطي الدور', nameEn: 'Yellow Skip', symbol: '⊘', color: 'yellow' },
      { key: 'yellow_reverse', category: 'yellow', nameAr: 'أصفر - عكس الاتجاه', nameEn: 'Yellow Reverse', symbol: '⇄', color: 'yellow' },
      { key: 'yellow_draw2', category: 'yellow', nameAr: 'أصفر - سحب ورقتين (+2)', nameEn: 'Yellow Draw 2', symbol: '+2', color: 'yellow' },

      // WILD
      { key: 'wild', category: 'wild', nameAr: 'تغيير اللون (Wild)', nameEn: 'Wild Card', symbol: '★', color: 'wild' },
      { key: 'wild4', category: 'wild', nameAr: 'تغيير اللون وسحب 4 (+4)', nameEn: 'Wild Draw 4', symbol: '+4', color: 'wild' },

      // CARD BACK
      { key: 'card_back', category: 'back', nameAr: 'ظهر ورقة أونو', nameEn: 'UNO Card Back', symbol: '🎴', color: 'back' }
    ]
  },

  chess: {
    gameType: 'chess',
    nameAr: 'الشطرنج (Chess)',
    nameEn: 'Chess',
    totalRequired: 14,
    categories: [
      { id: 'all', nameAr: 'جميع القطع والرقعة (14)', nameEn: 'All Pieces & Board (14)' },
      { id: 'white', nameAr: 'القطع البيضاء (6)', nameEn: 'White Pieces (6)' },
      { id: 'black', nameAr: 'القطع السوداء (6)', nameEn: 'Black Pieces (6)' },
      { id: 'board', nameAr: 'رقعة الشطرنج (2)', nameEn: 'Board Squares (2)' }
    ],
    items: [
      // WHITE PIECES
      { key: 'w_k', category: 'white', nameAr: 'الملك الأبيض', nameEn: 'White King', symbol: '♚', color: 'w' },
      { key: 'w_q', category: 'white', nameAr: 'الوزير الأبيض', nameEn: 'White Queen', symbol: '♛', color: 'w' },
      { key: 'w_r', category: 'white', nameAr: 'القلعة البيضاء', nameEn: 'White Rook', symbol: '♜', color: 'w' },
      { key: 'w_b', category: 'white', nameAr: 'الفيل الأبيض', nameEn: 'White Bishop', symbol: '♝', color: 'w' },
      { key: 'w_n', category: 'white', nameAr: 'الحصان الأبيض', nameEn: 'White Knight', symbol: '♞', color: 'w' },
      { key: 'w_p', category: 'white', nameAr: 'البيدق الأبيض', nameEn: 'White Pawn', symbol: '♟', color: 'w' },

      // BLACK PIECES
      { key: 'b_k', category: 'black', nameAr: 'الملك الأسود', nameEn: 'Black King', symbol: '♚', color: 'b' },
      { key: 'b_q', category: 'black', nameAr: 'الوزير الأسود', nameEn: 'Black Queen', symbol: '♛', color: 'b' },
      { key: 'b_r', category: 'black', nameAr: 'القلعة السوداء', nameEn: 'Black Rook', symbol: '♜', color: 'b' },
      { key: 'b_b', category: 'black', nameAr: 'الفيل الأسود', nameEn: 'Black Bishop', symbol: '♝', color: 'b' },
      { key: 'b_n', category: 'black', nameAr: 'الحصان الأسود', nameEn: 'Black Knight', symbol: '♞', color: 'b' },
      { key: 'b_p', category: 'black', nameAr: 'البيدق الأسود', nameEn: 'Black Pawn', symbol: '♟', color: 'b' },

      // BOARD SQUARES
      { key: 'board_light', category: 'board', nameAr: 'المربعات الفاتحة (Light Square)', nameEn: 'Light Square', symbol: '⬜', color: 'board' },
      { key: 'board_dark', category: 'board', nameAr: 'المربعات الداكنة (Dark Square)', nameEn: 'Dark Square', symbol: '⬛', color: 'board' }
    ]
  },

  domino: {
    gameType: 'domino',
    nameAr: 'الدومينو (Domino)',
    nameEn: 'Domino',
    totalRequired: 29,
    categories: [
      { id: 'all', nameAr: 'جميع الأحجار (29)', nameEn: 'All Tiles (29)' },
      { id: 'doubles', nameAr: 'الأحجار المزدوجة (7)', nameEn: 'Double Tiles (7)' },
      { id: 'series_0', nameAr: 'سلسلة الصفر (7)', nameEn: '0-Series Tiles (7)' },
      { id: 'series_1_6', nameAr: 'باقي السلاسل (21)', nameEn: '1-6 Series Tiles (21)' },
      { id: 'back', nameAr: 'ظهر الحجر (1)', nameEn: 'Tile Back (1)' }
    ],
    items: [
      // 0-series
      { key: 'tile_0_0', category: 'doubles', nameAr: 'حجر [0 | 0] (بلاطة بيضاء)', nameEn: 'Double Blank [0|0]', symbol: '🁣', left: 0, right: 0 },
      { key: 'tile_0_1', category: 'series_0', nameAr: 'حجر [0 | 1]', nameEn: 'Tile [0|1]', symbol: '🁤', left: 0, right: 1 },
      { key: 'tile_0_2', category: 'series_0', nameAr: 'حجر [0 | 2]', nameEn: 'Tile [0|2]', symbol: '🁥', left: 0, right: 2 },
      { key: 'tile_0_3', category: 'series_0', nameAr: 'حجر [0 | 3]', nameEn: 'Tile [0|3]', symbol: '🁦', left: 0, right: 3 },
      { key: 'tile_0_4', category: 'series_0', nameAr: 'حجر [0 | 4]', nameEn: 'Tile [0|4]', symbol: '🁧', left: 0, right: 4 },
      { key: 'tile_0_5', category: 'series_0', nameAr: 'حجر [0 | 5]', nameEn: 'Tile [0|5]', symbol: '🁨', left: 0, right: 5 },
      { key: 'tile_0_6', category: 'series_0', nameAr: 'حجر [0 | 6]', nameEn: 'Tile [0|6]', symbol: '🁩', left: 0, right: 6 },

      // 1-series
      { key: 'tile_1_1', category: 'doubles', nameAr: 'حجر [1 | 1] (دبل واحد)', nameEn: 'Double One [1|1]', symbol: '🁪', left: 1, right: 1 },
      { key: 'tile_1_2', category: 'series_1_6', nameAr: 'حجر [1 | 2]', nameEn: 'Tile [1|2]', symbol: '🁫', left: 1, right: 2 },
      { key: 'tile_1_3', category: 'series_1_6', nameAr: 'حجر [1 | 3]', nameEn: 'Tile [1|3]', symbol: '🁬', left: 1, right: 3 },
      { key: 'tile_1_4', category: 'series_1_6', nameAr: 'حجر [1 | 4]', nameEn: 'Tile [1|4]', symbol: '🁭', left: 1, right: 4 },
      { key: 'tile_1_5', category: 'series_1_6', nameAr: 'حجر [1 | 5]', nameEn: 'Tile [1|5]', symbol: '🁮', left: 1, right: 5 },
      { key: 'tile_1_6', category: 'series_1_6', nameAr: 'حجر [1 | 6]', nameEn: 'Tile [1|6]', symbol: '🁯', left: 1, right: 6 },

      // 2-series
      { key: 'tile_2_2', category: 'doubles', nameAr: 'حجر [2 | 2] (دبل اثنين)', nameEn: 'Double Two [2|2]', symbol: '🁰', left: 2, right: 2 },
      { key: 'tile_2_3', category: 'series_1_6', nameAr: 'حجر [2 | 3]', nameEn: 'Tile [2|3]', symbol: '🁱', left: 2, right: 3 },
      { key: 'tile_2_4', category: 'series_1_6', nameAr: 'حجر [2 | 4]', nameEn: 'Tile [2|4]', symbol: '🁲', left: 2, right: 4 },
      { key: 'tile_2_5', category: 'series_1_6', nameAr: 'حجر [2 | 5]', nameEn: 'Tile [2|5]', symbol: '🁳', left: 2, right: 5 },
      { key: 'tile_2_6', category: 'series_1_6', nameAr: 'حجر [2 | 6]', nameEn: 'Tile [2|6]', symbol: '🁴', left: 2, right: 6 },

      // 3-series
      { key: 'tile_3_3', category: 'doubles', nameAr: 'حجر [3 | 3] (دبل ثلاثة)', nameEn: 'Double Three [3|3]', symbol: '🁵', left: 3, right: 3 },
      { key: 'tile_3_4', category: 'series_1_6', nameAr: 'حجر [3 | 4]', nameEn: 'Tile [3|4]', symbol: '🁶', left: 3, right: 4 },
      { key: 'tile_3_5', category: 'series_1_6', nameAr: 'حجر [3 | 5]', nameEn: 'Tile [3|5]', symbol: '🁷', left: 3, right: 5 },
      { key: 'tile_3_6', category: 'series_1_6', nameAr: 'حجر [3 | 6]', nameEn: 'Tile [3|6]', symbol: '🁸', left: 3, right: 6 },

      // 4-series
      { key: 'tile_4_4', category: 'doubles', nameAr: 'حجر [4 | 4] (دبل أربعة)', nameEn: 'Double Four [4|4]', symbol: '🁹', left: 4, right: 4 },
      { key: 'tile_4_5', category: 'series_1_6', nameAr: 'حجر [4 | 5]', nameEn: 'Tile [4|5]', symbol: '🁺', left: 4, right: 5 },
      { key: 'tile_4_6', category: 'series_1_6', nameAr: 'حجر [4 | 6]', nameEn: 'Tile [4|6]', symbol: '🁻', left: 4, right: 6 },

      // 5-series
      { key: 'tile_5_5', category: 'doubles', nameAr: 'حجر [5 | 5] (دبل خمسة)', nameEn: 'Double Five [5|5]', symbol: '🁼', left: 5, right: 5 },
      { key: 'tile_5_6', category: 'series_1_6', nameAr: 'حجر [5 | 6]', nameEn: 'Tile [5|6]', symbol: '🁽', left: 5, right: 6 },

      // 6-series
      { key: 'tile_6_6', category: 'doubles', nameAr: 'حجر [6 | 6] (دبل ستة)', nameEn: 'Double Six [6|6]', symbol: '🁾', left: 6, right: 6 },

      // TILE BACK
      { key: 'tile_back', category: 'back', nameAr: 'ظهر حجر الدومينو', nameEn: 'Domino Tile Back', symbol: '🁢', left: null, right: null }
    ]
  }
};

export function getGameAssetsSpec(gameType) {
  return GAME_ASSETS_SPEC[gameType?.toLowerCase()] || null;
}

export function getExpectedTotalCount(gameType) {
  const spec = getGameAssetsSpec(gameType);
  return spec ? spec.items.length : 0;
}

export function validateAssetKey(gameType, key) {
  const spec = getGameAssetsSpec(gameType);
  if (!spec) return { valid: false, error: 'Unknown game type' };
  const exists = spec.items.some(item => item.key === key);
  if (!exists) {
    return { valid: false, error: `Invalid itemKey "${key}" for game "${gameType}"` };
  }
  return { valid: true };
}
