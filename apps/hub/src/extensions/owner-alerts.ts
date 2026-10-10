export interface OwnerAlert {
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string>>;
}

export type OwnerAlertListener = (alert: OwnerAlert) => void;

export class OwnerAlerts {
  private readonly listeners = new Set<OwnerAlertListener>();

  raise(alert: OwnerAlert): void {
    for (const listener of this.listeners) {
      listener(alert);
    }
  }

  listen(listener: OwnerAlertListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
