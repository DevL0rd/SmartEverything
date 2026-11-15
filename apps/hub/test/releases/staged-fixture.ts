import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ReleaseStaged, ReleaseUpload } from '@smarteverything/domain';
import type { HubLayout } from '../../src/data-layout';
import type { ReleaseStaging } from '../../src/releases/staging';
import { writeRecord } from '../../src/releases/upload-record';
import { COMMIT } from './release-fixture';

export interface StagedInput {
  readonly artifact: 'ui' | 'desktop';
  readonly target: ReleaseStaged['target'];
  readonly facts: Readonly<Record<string, unknown>>;
  readonly version: string;
  readonly files: Readonly<Record<string, Buffer | string>>;
}

function digest(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function stageRelease(
  layout: HubLayout,
  staging: ReleaseStaging,
  input: StagedInput,
): Promise<ReleaseUpload> {
  const begun = await staging.begin({ artifact: input.artifact, size: 1, sha256: digest('x') });
  const directory = join(layout.system.updates.releaseStaging, begun.uploadId);
  const root = join(directory, 'release');
  const listed = [];
  for (const [path, content] of Object.entries(input.files)) {
    const target = join(root, 'files', ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
    listed.push({
      path,
      size: Buffer.byteLength(content),
      sha256: digest(content),
      executable: false,
    });
  }
  await writeFile(
    join(root, 'release.json'),
    JSON.stringify({
      artifact: input.artifact,
      target: input.target,
      facts: input.facts,
      version: input.version,
      commit: COMMIT,
      notes: 'A release.',
      files: listed,
      gate: { typeCheck: 'passed', commit: COMMIT },
    }),
  );
  const staged: ReleaseUpload = {
    ...begun,
    state: 'staged',
    release: {
      version: input.version,
      commit: COMMIT,
      target: input.target,
      fingerprint: 'f'.repeat(64),
      files: listed.length,
      bytes: 1,
    },
  };
  await writeRecord(directory, staged);
  return staged;
}

export function hermesBundle(): Buffer {
  const body = Buffer.alloc(100);
  Buffer.from('c61fbc03c103191f', 'hex').copy(body, 0);
  body.write('SHA-256', 40);
  const total = body.length + 20;
  body.writeUInt32LE(total, 32);
  return Buffer.concat([body, createHash('sha1').update(body).digest()]);
}
