import {
  TRANSCRIPT_SETTINGS,
  type TranscriptSettings,
  type TranscriptSettingsChange,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

const KEY = 'transcripts.settings';

export class TranscriptSettingsStore {
  constructor(private readonly store: Pick<Store, 'settingsKv'>) {}

  read(): TranscriptSettings {
    return TRANSCRIPT_SETTINGS.parse(this.store.settingsKv.read(KEY) ?? {});
  }

  save(change: TranscriptSettingsChange): TranscriptSettings {
    const next = TRANSCRIPT_SETTINGS.parse({ ...this.read(), ...change });
    this.store.settingsKv.save(KEY, next);
    return next;
  }
}
