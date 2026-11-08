import type { MachineUpdateStatus } from '@smarteverything/domain';
import { releaseNotesOf } from '../../../format/release-notes';
import { OFFER_TITLE, QUIET_OFFER, offerAction, type ReleaseOffer } from './release-offer';

export type InstallerStatus = MachineUpdateStatus & { readonly version: string };

function availableOffer(status: InstallerStatus, blocked: string | null): Partial<ReleaseOffer> {
  const ready = status.installable && status.offerId !== undefined;
  const sentence = ready ? blocked : status.detail;
  return {
    tone: 'info',
    title: OFFER_TITLE.available,
    sentence,
    action: ready && blocked === null ? offerAction('update') : null,
    dismissible: true,
  };
}

function progressOf(status: InstallerStatus): number | null {
  return status.progress === null
    ? null
    : Math.min(1, status.progress.received / status.progress.total);
}

function stateOffer(status: InstallerStatus, blocked: string | null): Partial<ReleaseOffer> {
  switch (status.state) {
    case 'available':
      return availableOffer(status, blocked);
    case 'downloading': {
      const progress = progressOf(status);
      return {
        tone: 'info',
        title: OFFER_TITLE.downloading,
        progress,
        sentence: progress === null ? status.detail : null,
      };
    }
    case 'installing':
      return { tone: 'info', title: OFFER_TITLE.installing, sentence: status.detail };
    case 'failed':
    case 'none':
      return {
        tone: 'critical',
        title: OFFER_TITLE.installFailed,
        sentence: status.detail,
        action: offerAction('retry'),
        dismissible: true,
      };
  }
}

export function desktopOfferOf(status: InstallerStatus, blocked: string | null): ReleaseOffer {
  const notes = releaseNotesOf(status.notes);
  return {
    ...QUIET_OFFER,
    tone: 'info',
    title: OFFER_TITLE.available,
    key: `desktop:${status.state}:${status.offerId ?? status.version}`,
    offerId: status.offerId ?? null,
    meta: `Version ${status.version}`,
    brief: notes?.brief,
    notes: notes?.full,
    ...stateOffer(status, blocked),
  };
}
