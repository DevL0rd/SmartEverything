import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { AppUpdateEntry, AppUpdateFile, AppUpdateIndex } from '@smarteverything/domain';
import type { HubLayout } from '../../src/data-layout';
import { receiveBlob, updateIndex } from '../../src/app-updates/store';

export interface SourceFile {
  readonly source: string;
  readonly path: string;
  readonly contentType: string;
  readonly fileExtension?: string;
}

export async function writeBlob(layout: HubLayout, file: SourceFile): Promise<AppUpdateFile> {
  const bytes = readFileSync(file.source);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await receiveBlob(layout, sha256, Readable.from([bytes]));
  return {
    path: file.path,
    sha256,
    size: bytes.length,
    contentType: file.contentType,
    ...(file.fileExtension === undefined ? {} : { fileExtension: file.fileExtension }),
  };
}

export function appendEntry(layout: HubLayout, entry: AppUpdateEntry): Promise<AppUpdateIndex> {
  return updateIndex(layout, (current) => {
    const index = { entries: [...current.entries, entry] };
    return { index, result: index };
  });
}
