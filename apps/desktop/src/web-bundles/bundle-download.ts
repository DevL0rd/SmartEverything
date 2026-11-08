import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { APP_UPDATE_FILE_PATH, type AppUpdateCompatible } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { downloadVerified } from '../updates/update-download.js';
import { UpdateVerificationError } from '../updates/update-errors.js';

const log = new Logger('desktop.web-update');

const BUNDLE_FILE = 'bundle.json';
const ENTRY_FILE = 'index.html';
const PARTIAL_SUFFIX = '.part';

export interface BundleProgress {
  readonly received: number;
  readonly total: number;
}

export interface BundleDownload {
  readonly directory: string;
  readonly offer: AppUpdateCompatible;
  readonly runtime: string;
  readonly serverUrl: string;
  readonly fetch: typeof fetch;
  readonly onProgress: (progress: BundleProgress) => void;
}

function verifyFileList(offer: AppUpdateCompatible): void {
  const paths = new Set([BUNDLE_FILE]);
  let entryBytes = 0;
  for (const file of offer.files) {
    const name = APP_UPDATE_FILE_PATH.parse(file.path);
    if (paths.has(name)) {
      throw new UpdateVerificationError(offer.id, 'unique file paths', `a repeated path ${name}`);
    }
    paths.add(name);
    if (name === ENTRY_FILE) entryBytes = file.size;
  }
  if (entryBytes === 0) {
    throw new UpdateVerificationError(offer.id, `a nonempty ${ENTRY_FILE}`, 'no entry page');
  }
}

export async function downloadBundle(request: BundleDownload): Promise<string> {
  const { directory, offer, runtime, serverUrl } = request;
  verifyFileList(offer);
  const partial = path.join(directory, `${offer.id}${PARTIAL_SUFFIX}`);
  const final = path.join(directory, offer.id);
  const total = offer.files.reduce((sum, file) => sum + file.size, 0);
  let received = 0;
  await rm(partial, { recursive: true, force: true });
  await mkdir(partial, { recursive: true, mode: 0o700 });
  try {
    for (const file of offer.files) {
      await downloadVerified(
        {
          url: file.url,
          sha256: file.sha256,
          size: file.size,
          path: path.join(partial, ...file.path.split('/')),
        },
        serverUrl,
        request.fetch,
        (bytes) => {
          received += bytes;
          request.onProgress({ received, total });
        },
      );
    }
    await writeFile(
      path.join(partial, BUNDLE_FILE),
      `${JSON.stringify({ id: offer.id, runtimeVersion: runtime, createdAt: offer.createdAt }, null, 2)}\n`,
    );
    await rm(final, { recursive: true, force: true });
    await rename(partial, final);
  } catch (cause) {
    await rm(partial, { recursive: true, force: true });
    throw cause;
  }
  log.info('web_bundle.downloaded', { id: offer.id, files: offer.files.length, bytes: total });
  return final;
}
