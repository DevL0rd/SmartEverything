import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const MANIFEST_FILE = 'package.json';

export const WEB_RUNTIME = z.string().regex(/^[0-9a-f]{32}$/u);

const WEB_STAMP_MANIFEST = z.object({
  webRuntime: WEB_RUNTIME,
  webEmbedded: z.object({ createdAt: z.iso.datetime({ offset: true }) }),
});

export interface WebStamp {
  readonly runtime: string;
  readonly embeddedCreatedAt: string;
}

export const WEB_UPDATES_UNPACKAGED_REASON =
  'This copy of SmartEverything runs from source, so it has no web runtime to update.';

export class WebStampMissingError extends Error {
  override readonly name = 'WebStampMissingError';

  constructor(
    readonly manifestFile: string,
    reason: string,
  ) {
    super(
      `The packaged ${manifestFile} must carry webRuntime (32 hex characters) and webEmbedded.createdAt (an ISO date); ${reason}`,
    );
  }
}

export interface WebStampSource {
  readonly appPath: string;
  readonly packaged: boolean;
}

export async function readWebStamp(source: WebStampSource): Promise<WebStamp | null> {
  if (!source.packaged) {
    return null;
  }
  const manifestFile = path.join(source.appPath, MANIFEST_FILE);
  const parsed = WEB_STAMP_MANIFEST.safeParse(JSON.parse(await readFile(manifestFile, 'utf8')));
  if (!parsed.success) {
    throw new WebStampMissingError(manifestFile, parsed.error.message);
  }
  return {
    runtime: parsed.data.webRuntime,
    embeddedCreatedAt: parsed.data.webEmbedded.createdAt,
  };
}
