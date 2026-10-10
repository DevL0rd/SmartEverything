import {
  TRANSCRIPT_SETTINGS,
  type TranscriptSettings,
  type TranscriptSettingsChange,
} from '@smarteverything/domain';
import type { Store } from '../store/store';

const KEY = 'transcripts.settings';

export class TranscriptSettingsStore {
  constructor(private readonly store: Pick<Store, 'aiChats'>) {}

  read(): TranscriptSettings {
    return TRANSCRIPT_SETTINGS.parse(this.store.aiChats.setting(KEY) ?? {});
  }

  save(change: TranscriptSettingsChange): TranscriptSettings {
    const next = TRANSCRIPT_SETTINGS.parse({ ...this.read(), ...change });
    this.store.aiChats.saveSetting(KEY, next);
    return next;
  }
}
