import {
  TRANSCRIPT_SETTINGS,
  type TranscriptSettings,
  type TranscriptSettingsChange,
} from '@smarteverything/domain';
import type { StoreHost } from '../store/host/host';

const KEY = 'transcripts.settings';

export class TranscriptSettingsStore {
  constructor(private readonly host: Pick<StoreHost, 'call'>) {}

  async read(): Promise<TranscriptSettings> {
    return TRANSCRIPT_SETTINGS.parse((await this.host.call('settingsKv', 'read', KEY)) ?? {});
  }

  async save(change: TranscriptSettingsChange): Promise<TranscriptSettings> {
    const next = TRANSCRIPT_SETTINGS.parse({ ...(await this.read()), ...change });
    await this.host.call('settingsKv', 'save', KEY, next);
    return next;
  }
}
