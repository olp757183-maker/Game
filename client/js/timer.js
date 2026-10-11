/**
 * Authoritative Client-Side Turn Timer & Clock Synchronization
 * Computes remaining time from server deadline, estimates clock skew,
 * and maintains smooth local countdowns resilient to tab sleep and lag.
 */

export class GameTimer {
  /**
   * @param {Object} options
   * @param {Function} options.onTick - Called with { remainingSec, remainingMs, progress, turnNumber }
   * @param {Function} options.onExpire - Called when timer reaches 0
   */
  constructor({ onTick, onExpire } = {}) {
    this.onTick = onTick || null;
    this.onExpire = onExpire || null;
    this.intervalId = null;
    this.clockOffset = 0; // serverTime - localNow (in ms)
    this.hasSyncedClock = false;
    this.turnDeadline = 0;
    this.turnDuration = 0;
    this.turnNumber = 0;
    this.turnStartedAt = 0;
    this.expired = false;
    this.isActive = false;

    // Handle tab sleep / visibility change / device wake-up
    this.handleVisibilityChange = () => {
      if (!document.hidden && this.isActive && this.turnDeadline > 0) {
        this.tick();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  /**
   * Synchronize clock skew between client and server
   * @param {number} serverTime - Server timestamp (Date.now() on server)
   */
  syncClock(serverTime) {
    if (typeof serverTime === 'number' && serverTime > 0) {
      const now = Date.now();
      const currentOffset = serverTime - now;
      if (!this.hasSyncedClock) {
        this.clockOffset = currentOffset;
        this.hasSyncedClock = true;
      } else {
        // Smooth exponential moving average to filter network jitter
        this.clockOffset = (this.clockOffset * 0.7) + (currentOffset * 0.3);
      }
    }
  }

  /**
   * Start or synchronize turn countdown
   * @param {Object} turnData
   * @param {number} [turnData.serverTime]
   * @param {number} [turnData.turnDeadline]
   * @param {number} [turnData.turnDuration]
   * @param {number} [turnData.turnStartedAt]
   * @param {number} [turnData.turnNumber]
   */
  start({ serverTime, turnDeadline, turnDuration, turnStartedAt, turnNumber }) {
    if (serverTime) {
      this.syncClock(serverTime);
    }

    // Reject stale turn updates if a newer turn is already active
    if (typeof turnNumber === 'number' && this.turnNumber > 0 && turnNumber < this.turnNumber) {
      return;
    }

    if (typeof turnNumber === 'number') {
      this.turnNumber = turnNumber;
    }

    this.turnDeadline = turnDeadline || 0;
    this.turnDuration = turnDuration || 0;
    this.turnStartedAt = turnStartedAt || 0;
    this.expired = false;

    this.stopInterval();

    if (this.turnDeadline > 0) {
      this.isActive = true;
      this.tick();
      // Tick every 250ms for smooth, responsive second transitions
      this.intervalId = setInterval(() => this.tick(), 250);
    } else {
      this.isActive = false;
      if (typeof this.onTick === 'function') {
        this.onTick({ remainingSec: 0, remainingMs: 0, progress: 0, turnNumber: this.turnNumber });
      }
    }
  }

  /**
   * Execute single tick calculation
   */
  tick() {
    if (!this.turnDeadline || !this.isActive) return;

    // Authoritative server time estimation: Date.now() + clockOffset
    const estimatedServerNow = Date.now() + this.clockOffset;
    const remainingMs = Math.max(0, this.turnDeadline - estimatedServerNow);
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

    let progress = 1;
    if (this.turnDuration > 0) {
      progress = Math.min(1, Math.max(0, remainingMs / this.turnDuration));
    }

    if (typeof this.onTick === 'function') {
      this.onTick({
        remainingSec,
        remainingMs,
        progress,
        turnNumber: this.turnNumber
      });
    }

    if (remainingMs <= 0 && !this.expired) {
      this.expired = true;
      if (typeof this.onExpire === 'function') {
        this.onExpire();
      }
    }
  }

  /**
   * Stop the active interval without clearing clock calibration
   */
  stopInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Stop timer completely
   */
  stop() {
    this.stopInterval();
    this.isActive = false;
    this.turnDeadline = 0;
  }

  /**
   * Cleanup listeners
   */
  destroy() {
    this.stop();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }
}

export default GameTimer;
