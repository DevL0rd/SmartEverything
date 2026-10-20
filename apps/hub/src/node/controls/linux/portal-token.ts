import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isMissing } from '../../../fs-util';
import { userStateHome } from '../../../plugins/builtin/user-directories';

export interface RestoreTokenStore {
  readonly read: () => Promise<string | null>;
  readonly write: (token: string) => Promise<void>;
}

export function restoreTokenFile(): string {
  return join(userStateHome(), 'smarteverything', 'remote-input.token');
}

export class FileRestoreToken implements RestoreTokenStore {
  constructor(private readonly file: string) {}

  async read(): Promise<string | null> {
    try {
      const token = (await readFile(this.file, 'utf8')).trim();
      return token === '' ? null : token;
    } catch (cause) {
      if (isMissing(cause)) return null;
      throw cause;
    }
  }

  async write(token: string): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    await writeFile(this.file, `${token}\n`, { mode: 0o600 });
  }
}
