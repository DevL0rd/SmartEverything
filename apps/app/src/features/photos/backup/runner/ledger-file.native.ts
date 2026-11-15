import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { LedgerFile } from './ports';

const FOLDER = 'photos-backup-ledgers';

const PART = '.part';

function folder(): Directory {
  const directory = new Directory(Paths.document, FOLDER);
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

export function ledgerFileOf(scopeKey: string): LedgerFile {
  const nameOf = async (): Promise<string> =>
    `${await digestStringAsync(CryptoDigestAlgorithm.SHA256, scopeKey)}.json`;
  return {
    async read(): Promise<string | null> {
      const file = new File(folder(), await nameOf());
      return file.exists ? file.text() : null;
    },
    async write(text): Promise<void> {
      const directory = folder();
      const name = await nameOf();
      const part = new File(directory, `${name}${PART}`);
      if (part.exists) part.delete();
      part.write(text);
      const final = new File(directory, name);
      if (final.exists) final.delete();
      part.rename(name);
    },
  };
}
