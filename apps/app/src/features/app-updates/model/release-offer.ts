import { bytes } from '../../../format/number';
import { releaseNotesOf } from '../../../format/release-notes';
import { joinParts } from '../../../format/text';
import { shortDate } from '../../../format/time';

export type OfferTone = 'info' | 'positive' | 'warning' | 'critical';

export type OfferActionKind = 'update' | 'restart' | 'retry' | 'check' | 'cancel';

export interface OfferAction {
  readonly kind: OfferActionKind;
  readonly label: string;
  readonly busy: boolean;
}

export interface OfferRelease {
  readonly appVersion: string;
  readonly createdAt: string;
  readonly size: number;
  readonly notes: string;
}

export interface ReleaseOffer {
  readonly key: string;
  readonly offerId: string | null;
  readonly tone: OfferTone;
  readonly title: string;
  readonly meta: string | null;
  readonly brief: string | undefined;
  readonly notes: string | undefined;
  readonly sentence: string | null;
  readonly progress: number | null;
  readonly action: OfferAction | null;
  readonly dismissible: boolean;
}

export const OFFER_TITLE = {
  available: 'Update available',
  downloading: 'Downloading update',
  verifying: 'Checking the update',
  installing: 'Installing update',
  ready: 'Update ready',
  waiting: 'Updating after your call',
  restarting: 'Restarting to update',
  permission: 'Waiting for install permission',
  android: 'Waiting for Android',
  withdrawn: 'Update withdrawn',
  checkFailed: 'Couldn’t check for updates',
  downloadFailed: 'Update didn’t download',
  restartFailed: 'Update couldn’t restart',
  launchFailed: 'Update couldn’t start',
  installFailed: 'Update couldn’t install',
} as const;

const LABELS: Readonly<Record<OfferActionKind, string>> = {
  update: 'Update',
  restart: 'Restart',
  retry: 'Try again',
  check: 'Check for updates',
  cancel: 'Cancel',
};

export function offerAction(kind: OfferActionKind, busy = false): OfferAction {
  return { kind, label: LABELS[kind], busy };
}

export function releaseMeta(release: Omit<OfferRelease, 'notes'>): string {
  return joinParts([
    `Version ${release.appVersion}`,
    shortDate(release.createdAt),
    bytes(release.size),
  ]);
}

export function releaseCopy(release: OfferRelease): Pick<ReleaseOffer, 'meta' | 'brief' | 'notes'> {
  const notes = releaseNotesOf(release.notes);
  return { meta: releaseMeta(release), brief: notes?.brief, notes: notes?.full };
}

export const QUIET_OFFER = {
  offerId: null,
  meta: null,
  brief: undefined,
  notes: undefined,
  sentence: null,
  progress: null,
  action: null,
  dismissible: false,
} as const;

export function offerBody(offer: ReleaseOffer): string | undefined {
  return offer.sentence ?? offer.meta ?? undefined;
}
