import {
  MAIL_SECURITIES,
  type MailSettings,
  type MailSettingsWrite,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { SecretStore } from '../secrets/store';
import type { SettingsKvRepository } from '../store/repositories/settings-kv';

const SETTINGS_KEY = 'mail';
const PASSWORD_REFERENCE = 'mail.password';

const STORED_SETTINGS = z.strictObject({
  host: z.string().min(1),
  port: z.int().min(1).max(65535),
  security: z.enum(MAIL_SECURITIES),
  user: z.string().min(1).nullable(),
  from_name: z.string().min(1).nullable(),
  from_address: z.email(),
});

type StoredSettings = z.infer<typeof STORED_SETTINGS>;

export interface MailConfig extends StoredSettings {
  readonly password: string | null;
}

export interface MailSettingsDeps {
  readonly settingsKv: Pick<SettingsKvRepository, 'read' | 'save'>;
  readonly secrets: Pick<SecretStore, 'apiKey' | 'saveApiKey' | 'removeApiKey'>;
}

export class MailSettingsStore {
  constructor(private readonly deps: MailSettingsDeps) {}

  config(): MailConfig | null {
    const stored = this.stored();
    if (stored === null) return null;
    return { ...stored, password: this.deps.secrets.apiKey(PASSWORD_REFERENCE) };
  }

  view(): MailSettings | null {
    const stored = this.stored();
    if (stored === null) return null;
    return { ...stored, password_set: this.deps.secrets.apiKey(PASSWORD_REFERENCE) !== null };
  }

  async write(input: MailSettingsWrite): Promise<MailSettings> {
    const { password, ...settings } = input;
    if (password.action === 'set') {
      await this.deps.secrets.saveApiKey(PASSWORD_REFERENCE, password.value);
    } else if (password.action === 'clear' || settings.user === null) {
      await this.deps.secrets.removeApiKey(PASSWORD_REFERENCE);
    }
    this.deps.settingsKv.save(SETTINGS_KEY, STORED_SETTINGS.parse(settings));
    const view = this.view();
    if (view === null) throw new Error('The mail settings were saved but cannot be read back.');
    return view;
  }

  private stored(): StoredSettings | null {
    const raw = this.deps.settingsKv.read(SETTINGS_KEY);
    return raw === null ? null : STORED_SETTINGS.parse(raw);
  }
}
