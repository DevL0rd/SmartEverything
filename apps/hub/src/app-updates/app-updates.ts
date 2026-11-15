import {
  appUpdateSummaryOf,
  latestAppUpdate,
  newerIncompatibleUpdate,
  rollsBackToEmbedded,
  type AppUpdateCompatible,
  type AppUpdateEntry,
  type AppUpdateListing,
  type AppUpdateOffer,
  type AppUpdateOutcome,
  type ClientRow,
  type AppUpdateQuery,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { directClient, type Caller } from '../server/auth';
import type { MediaLinks } from '../server/media-links';
import type { AppUpdateFolder } from './update-folder';

export function updateAudience(caller: Caller): string | undefined {
  return directClient(caller)?.id;
}

export class AppUpdates {
  constructor(
    private readonly folder: AppUpdateFolder,
    private readonly links: MediaLinks,
    private readonly log: Logger,
  ) {}

  async offer(query: AppUpdateQuery, clientId?: string): Promise<AppUpdateOffer> {
    const entries = await this.folder.entries();
    const target = { ...query, clientId };
    const compatible = latestAppUpdate(entries, target);
    const newer = query.platform === 'desktop' ? newerIncompatibleUpdate(entries, target) : null;
    return {
      compatible: compatible === null ? null : this.compatible(compatible),
      newerIncompatible: newer === null ? null : appUpdateSummaryOf(newer),
      rollBackToEmbedded: rollsBackToEmbedded(entries, target, query.currentId ?? null),
    };
  }

  async list(): Promise<AppUpdateListing[]> {
    const entries = await this.folder.entries();
    return entries.map((entry) => ({
      ...appUpdateSummaryOf(entry),
      ...(entry.clientId === undefined ? {} : { clientId: entry.clientId }),
      platform: entry.platform,
      channel: entry.channel,
      runtimeVersion: entry.runtimeVersion,
      withdrawn: entry.withdrawn,
    }));
  }

  report(client: ClientRow, outcome: AppUpdateOutcome): void {
    const fields = {
      clientId: client.id,
      platform: client.platform,
      updateId: outcome.updateId,
      outcome: outcome.outcome,
      reason: outcome.reason,
    };
    if (outcome.outcome === 'fell_back')
      this.log.warn('app_update.fell_back_awaiting_decision', fields);
    else this.log.info('app_update.outcome', fields);
  }

  private compatible(entry: AppUpdateEntry): AppUpdateCompatible {
    return {
      ...appUpdateSummaryOf(entry),
      files:
        entry.platform === 'desktop'
          ? entry.files.map((file) => ({
              ...file,
              url: this.links.appUpdateBlob(file.sha256).url,
            }))
          : [],
    };
  }
}
