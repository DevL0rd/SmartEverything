import type { TriggerSettings } from '@smarteverything/domain';
import type { Store } from '../store/store';

export class TriggerSwitches {
  private settings: TriggerSettings;

  constructor(store: Store) {
    this.settings = store.settings.read().trigger_settings;
    store.feed.subscribe((change) => {
      if (change.table === 'settings' && change.record !== null) {
        this.settings = change.record.trigger_settings;
      }
    });
  }

  readonly current = (): TriggerSettings => this.settings;
}
