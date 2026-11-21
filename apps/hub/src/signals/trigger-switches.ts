import type { TriggerSettings } from '@smarteverything/domain';
import type { Store } from '../store/store';

export class TriggerSwitches {
  constructor(private readonly store: Pick<Store, 'live'>) {}

  readonly current = (): TriggerSettings => this.store.live.home.settings.read().trigger_settings;
}
