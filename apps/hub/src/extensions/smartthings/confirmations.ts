export class TargetConfirmations {
  private readonly confirmed = new Set<string>();
  private readonly waiters = new Map<string, () => void>();
  private settingUp = false;

  constructor(private readonly knownAppId: () => string | null) {}

  accepts(appId: string): boolean {
    return this.settingUp || appId === this.knownAppId();
  }

  record(appId: string): void {
    if (this.settingUp) {
      this.confirmed.add(appId);
    }
    this.waiters.get(appId)?.();
  }

  open(): () => void {
    this.settingUp = true;
    return () => {
      this.settingUp = false;
      this.confirmed.clear();
    };
  }

  wait(appId: string, timeoutMs: number): Promise<boolean> {
    if (this.confirmed.has(appId)) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const settle = (outcome: boolean): void => {
        clearTimeout(timer);
        this.waiters.delete(appId);
        resolve(outcome);
      };
      const timer = setTimeout(() => {
        settle(false);
      }, timeoutMs).unref();
      this.waiters.set(appId, () => {
        settle(true);
      });
    });
  }
}
