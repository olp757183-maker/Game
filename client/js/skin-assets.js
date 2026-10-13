/**
 * Skin Assets Manager & Cache
 * Handles fetching, caching, and querying skin bundle visual assets for UNO, Chess, and Domino.
 */

class SkinAssetManager {
  constructor() {
    this.cache = new Map(); // skinId -> { assets: Record<string, string>, gameType, name }
    this.pendingFetches = new Map();
    this.listeners = new Set();
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const cb of this.listeners) {
      try { cb(); } catch (e) { console.error('Skin listener error:', e); }
    }
  }

  /**
   * Preload and cache a skin by its ID
   */
  async loadSkin(skinId) {
    if (!skinId || skinId === 'default') return null;
    if (this.cache.has(skinId)) return this.cache.get(skinId);
    if (this.pendingFetches.has(skinId)) return this.pendingFetches.get(skinId);

    const promise = (async () => {
      try {
        const res = await fetch(`/api/skins/${encodeURIComponent(skinId)}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.skin) {
          const skinData = {
            id: data.skin.id,
            gameType: data.skin.gameType,
            name: data.skin.name,
            previewUrl: data.skin.previewUrl,
            assets: data.skin.assets || {}
          };
          this.cache.set(skinId, skinData);
          this.notify();
          return skinData;
        }
        return null;
      } catch (err) {
        console.warn(`[SkinAssetManager] Failed to load skin ${skinId}:`, err);
        return null;
      } finally {
        this.pendingFetches.delete(skinId);
      }
    })();

    this.pendingFetches.set(skinId, promise);
    return promise;
  }

  /**
   * Register skin assets directly (e.g. from bundle preview or store listing)
   */
  registerSkin(skin) {
    if (!skin || !skin.id) return;
    this.cache.set(skin.id, {
      id: skin.id,
      gameType: skin.gameType,
      name: skin.name,
      previewUrl: skin.previewUrl,
      assets: skin.assets || {}
    });
  }

  /**
   * Synchronous asset lookup
   */
  getAsset(skinId, itemKey) {
    if (!skinId || skinId === 'default' || !itemKey) return null;
    const skin = this.cache.get(skinId);
    if (!skin) {
      // Trigger lazy background load
      this.loadSkin(skinId);
      return null;
    }
    return skin.assets?.[itemKey] || null;
  }

  // --- UNO Helpers ---
  getUnoAssetKey(card) {
    if (!card) return null;
    if (card.color === 'wild' || card.value === 'wild') return 'wild';
    if (card.value === 'wild4') return 'wild4';
    if (!card.color || card.value === undefined) return null;
    return `${card.color}_${card.value}`;
  }

  getUnoCardAsset(skinId, card) {
    const key = this.getUnoAssetKey(card);
    return key ? this.getAsset(skinId, key) : null;
  }

  getUnoBackAsset(skinId) {
    return this.getAsset(skinId, 'card_back');
  }

  // --- Chess Helpers ---
  getChessAssetKey(piece) {
    if (!piece || !piece.color || !piece.type) return null;
    return `${piece.color}_${piece.type}`;
  }

  getChessPieceAsset(skinId, piece) {
    const key = this.getChessAssetKey(piece);
    return key ? this.getAsset(skinId, key) : null;
  }

  getChessSquareAsset(skinId, isDark) {
    const key = isDark ? 'board_dark' : 'board_light';
    return this.getAsset(skinId, key);
  }

  // --- Domino Helpers ---
  getDominoAssetKey(tile) {
    if (!tile) return null;
    const left = tile.left !== undefined ? tile.left : (tile.placedLeft !== undefined ? tile.placedLeft : 0);
    const right = tile.right !== undefined ? tile.right : (tile.placedRight !== undefined ? tile.placedRight : 0);
    const min = Math.min(left, right);
    const max = Math.max(left, right);
    return `tile_${min}_${max}`;
  }

  getDominoTileAsset(skinId, tile) {
    const key = this.getDominoAssetKey(tile);
    return key ? this.getAsset(skinId, key) : null;
  }

  getDominoBackAsset(skinId) {
    return this.getAsset(skinId, 'tile_back');
  }
}

export const skinAssets = new SkinAssetManager();
if (typeof window !== 'undefined') {
  window.skinAssets = skinAssets;
}
export default skinAssets;
