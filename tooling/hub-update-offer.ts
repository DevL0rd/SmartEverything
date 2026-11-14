import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SELF_UPDATE_ROOT } from '@smarteverything/domain';
import { z } from 'zod';
import { findUpdateSource } from '../apps/hub/src/self-update/update-source.ts';
import { hubPendingIdentity } from './hub-update-candidate.ts';
import { dataLayoutOf } from './release-hub-files.ts';
import {
  HUB_SOURCE_OFFER,
  HubSourceError,
  type HubUpdateSource,
  type SourceOffer,
} from './hub-update-source.ts';

export const REVIEWED_OFFER = z.strictObject({
  offerId: z.uuid(),
  ownerClient: z.uuid(),
  offer: HUB_SOURCE_OFFER,
  pending: z.string().regex(/^[a-f0-9]{64}$/u),
});

type ReviewedOffer = z.infer<typeof REVIEWED_OFFER>;

export function configuredHubSource(data: string): HubUpdateSource {
  const source = findUpdateSource(dataLayoutOf(data));
  if (source === undefined)
    throw new HubSourceError(
      'git',
      'This hub has no update source configured. Run tooling/configure-update-source.ts from the SmartEverything checkout.',
    );
  return { folder: source.checkout, remote: source.remote, branch: source.branch };
}

function readOffer(file: string): ReviewedOffer | undefined {
  return existsSync(file)
    ? REVIEWED_OFFER.parse(JSON.parse(readFileSync(file, 'utf8')))
    : undefined;
}

export async function recordHubSourceOffer(
  data: string,
  ownerClient: string,
  offer: SourceOffer,
): Promise<string> {
  const pending = await hubPendingIdentity(offer.source.folder);
  const work = join(data, SELF_UPDATE_ROOT);
  const file = offerFile(data, ownerClient);
  const previous = readOffer(file);
  if (previous?.pending === pending && JSON.stringify(previous.offer) === JSON.stringify(offer))
    return previous.offerId;
  const offerId = randomUUID();
  const stage = `${file}.${offerId}.next`;
  mkdirSync(work, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(stage, JSON.stringify({ offerId, ownerClient, offer, pending }), {
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(stage, file);
  } finally {
    rmSync(stage, { force: true });
  }
  return offerId;
}

function offerFile(data: string, ownerClient: string): string {
  return join(data, SELF_UPDATE_ROOT, `source-offer-${z.uuid().parse(ownerClient)}.json`);
}

export function reviewedHubSourceOffer(
  data: string,
  ownerClient: string,
  id: string,
): ReviewedOffer {
  const recorded = readOffer(offerFile(data, ownerClient));
  if (recorded?.offerId !== id || recorded.ownerClient !== ownerClient)
    throw new HubSourceError('changed', 'This update offer changed. Check for updates again.');
  const trusted = configuredHubSource(data);
  const { source } = recorded.offer;
  if (
    trusted.folder !== source.folder ||
    trusted.remote !== source.remote ||
    trusted.branch !== source.branch
  )
    throw new HubSourceError('changed', 'The configured Git source changed. Check again.');
  return recorded;
}
