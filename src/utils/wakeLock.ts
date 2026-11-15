/**
 * Screen Wake Lock helper that keeps mobile & laptop displays awake while watching cinema videos.
 */
class ScreenWakeLockManager {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private listenersAttached = false;

  private handleReacquire = (): void => {
    if (this.wanted && document.visibilityState === 'visible') {
      void this.requestLock();
    }
  };

  private attachListeners(): void {
    if (this.listenersAttached || typeof document === 'undefined') return;
    this.listenersAttached = true;
    document.addEventListener('visibilitychange', this.handleReacquire);
    document.addEventListener('fullscreenchange', this.handleReacquire);
  }

  private detachListeners(): void {
    if (!this.listenersAttached || typeof document === 'undefined') return;
    this.listenersAttached = false;
    document.removeEventListener('visibilitychange', this.handleReacquire);
    document.removeEventListener('fullscreenchange', this.handleReacquire);
  }

  private async requestLock(): Promise<void> {
    if (!this.wanted || typeof navigator === 'undefined') return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (this.sentinel && !this.sentinel.released) return;

    const wakeLockApi = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wakeLockApi || typeof wakeLockApi.request !== 'function') return;

    try {
      const sentinel = await wakeLockApi.request('screen');
      if (!this.wanted) {
        await sentinel.release().catch(() => {});
        return;
      }
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) {
          this.sentinel = null;
        }
      });
    } catch {
      // Browser/OS may deny Wake Lock before user gesture or in unsupported environments
    }
  }

  public setActive(active: boolean): void {
    this.wanted = active;
    if (active) {
      this.attachListeners();
      void this.requestLock();
    } else {
      this.detachListeners();
      const current = this.sentinel;
      this.sentinel = null;
      if (current && !current.released) {
        current.release().catch(() => {});
      }
    }
  }
}

export const screenWakeLock = new ScreenWakeLockManager();
