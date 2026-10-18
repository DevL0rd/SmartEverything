import { Listeners } from '../listeners';

export interface OwnerAlert {
  readonly title: string;
  readonly body: string;
  readonly data: Readonly<Record<string, string>>;
  readonly person?: string;
}

export type OwnerAlertListener = (alert: OwnerAlert) => void;

export class OwnerAlerts {
  private readonly alerts = new Listeners<OwnerAlert>();

  raise(alert: OwnerAlert): void {
    this.alerts.emit(alert);
  }

  listen(listener: OwnerAlertListener): () => void {
    return this.alerts.listen(listener);
  }
}
