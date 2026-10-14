import { randomUUID } from 'node:crypto';
import {
  ApiError,
  type HarnessSkillAsset,
  type HarnessDesiredConfiguration,
  type HarnessDesiredEntry,
  type HarnessSkillUpdates,
  type HarnessSkillUpdateResult,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Clock, Cancel } from '../clock';
import type { HarnessSkillUpdatesRepository } from '../store/repositories/harness-skill-updates';
import type { HarnessConfigurationService } from './configuration';
import type { HarnessExtensions } from './extensions';
import type { AnthropicSkills } from './anthropic-skills';

const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export class HarnessSkillUpdatesService {
  private pending: Promise<HarnessSkillUpdateResult> | undefined;
  private cancel: Cancel | undefined;
  private running = false;
  private readonly log = new Logger('hub.harness-skill-updates');

  constructor(
    private readonly repository: HarnessSkillUpdatesRepository,
    private readonly configuration: HarnessConfigurationService,
    private readonly extensions: HarnessExtensions,
    private readonly ports: { readonly source: AnthropicSkills; readonly clock: Clock },
  ) {}

  read(): HarnessSkillUpdates {
    return this.repository.read();
  }

  replace(input: unknown, role: 'owner' | 'member'): HarnessSkillUpdates {
    this.requireOwner(role);
    const result = this.repository.replace(input);
    this.configuration.notifySettings();
    if (result.automatic && this.running) this.automatic();
    return result;
  }

  update(role: 'owner' | 'member'): Promise<HarnessSkillUpdateResult> {
    this.requireOwner(role);
    if (this.pending !== undefined) return this.pending;
    this.pending = this.sync().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.automatic();
    this.schedule();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.cancel?.();
    this.cancel = undefined;
    await this.pending?.catch((cause: unknown) => {
      this.log.error('updates.stop_failed', cause);
    });
  }

  private automatic(): void {
    if (!this.read().automatic) return;
    void this.update('owner').catch((cause: unknown) => {
      this.log.error('updates.failed', cause);
    });
  }

  private schedule(): void {
    this.cancel = this.ports.clock.at(
      new Date(this.ports.clock.now().getTime() + UPDATE_INTERVAL_MS),
      () => {
        if (!this.running) return;
        this.automatic();
        this.schedule();
      },
    );
  }

  private async sync(): Promise<HarnessSkillUpdateResult> {
    const original = this.configuration.desired();
    const entry = original.entries.find((item) => item.id === 'skills');
    if (entry?.metadata === undefined)
      throw new ApiError('conflict', 'Shared skills require registered metadata before updating.');
    const snapshot = await this.ports.source.snapshot(true);
    const replacements: HarnessSkillAsset[] = [];
    let unchanged = 0;
    let skipped = 0;
    for (const item of snapshot.items) {
      if (item.acquisition.state !== 'available') {
        skipped += 1;
        continue;
      }
      const current = entry.metadata.skill_assets.find((asset) => asset.id === item.id);
      if (sameSkillVersion(current, snapshot.commit)) {
        unchanged += 1;
        continue;
      }
      const resolved = await this.extensions.resolve(
        { url: item.acquisition.url },
        'owner',
        current,
      );
      if (resolved.selection.kind !== 'skill_asset')
        throw new ApiError(
          'conflict',
          'Anthropic update inspection did not return a verified skill asset.',
        );
      if (sameSkillVersion(current, resolved.selection.asset.version)) unchanged += 1;
      else replacements.push(resolved.selection.asset);
    }
    if (replacements.length === 0)
      return { updated: 0, unchanged, skipped, revision: original.revision };
    const desired = this.configuration.replace(
      {
        expected_revision: original.revision,
        configuration: replacedSkills(original, entry, replacements),
      },
      'owner',
    );
    return { updated: replacements.length, unchanged, skipped, revision: desired.revision };
  }

  private requireOwner(role: 'owner' | 'member'): void {
    if (role !== 'owner')
      throw new ApiError('forbidden', 'Only an owner may change or run shared skill updates.');
  }
}

function replacedSkills(
  original: HarnessDesiredConfiguration,
  entry: HarnessDesiredEntry,
  replacements: readonly HarnessSkillAsset[],
): HarnessDesiredConfiguration {
  if (entry.metadata === undefined)
    throw new ApiError('conflict', 'Shared skill metadata is absent.');
  const replacement = {
    ...entry,
    metadata: {
      ...entry.metadata,
      skill_assets: [
        ...entry.metadata.skill_assets.filter(
          (asset) => !replacements.some((next) => next.id === asset.id),
        ),
        ...replacements,
      ],
    },
  };
  return {
    ...original,
    revision: `anthropic-skills-${randomUUID()}`,
    entries: original.entries.map((item) => (item.id === entry.id ? replacement : item)),
  };
}

function sameSkillVersion(asset: HarnessSkillAsset | undefined, version: string): boolean {
  return asset?.version === version;
}
