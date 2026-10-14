import { randomUUID } from 'node:crypto';
import {
  ApiError,
  type HarnessDesiredConfiguration,
  type HarnessDiscoveryItem,
  type HarnessSkillUpdates,
  type HarnessSkillUpdateResult,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { Clock, Cancel } from '../clock';
import type { HarnessSkillUpdatesRepository } from '../store/repositories/harness-skill-updates';
import type { HarnessConfigurationService } from './configuration';
import type { HarnessExtensions } from './extensions';
import { excludedAnthropicSkill, type AnthropicSkills } from './anthropic-skills';
import type { ClaudePlugins } from './claude-plugins';
import { prepareOfficialAssetUpdate } from './official-asset-updates';
import { claudePluginsEntry } from './claude-plugin-selection';

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
    private readonly ports: {
      readonly source: AnthropicSkills;
      readonly plugins: ClaudePlugins;
      readonly clock: Clock;
    },
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
    const selectedSkills = retainedSkills(entry);
    const pluginEntry = claudePluginsEntry(original);
    const [skills, plugins] = await Promise.all([
      this.ports.source.snapshot(true),
      this.ports.plugins.snapshot(true),
    ]);
    const skillUpdate = await prepareOfficialAssetUpdate(
      selectedSkills.entry,
      skills,
      async (url, previous) => {
        const inspected = await this.extensions.resolve({ url }, 'owner', previous);
        if (inspected.selection.kind !== 'skill_asset')
          throw new ApiError('conflict', 'Skill inspection did not return a verified skill asset.');
        return inspected.selection.asset;
      },
    );
    const pluginUpdate = await prepareOfficialAssetUpdate(
      pluginEntry,
      { ...plugins, items: selectedPluginItems(original, pluginEntry, plugins.items) },
      (url, previous) => this.extensions.resolvePlugin(url, previous),
    );
    const updated = skillUpdate.updated + pluginUpdate.updated + selectedSkills.removed;
    if (updated === 0)
      return {
        updated,
        unchanged: skillUpdate.unchanged + pluginUpdate.unchanged,
        skipped: skillUpdate.skipped + pluginUpdate.skipped,
        revision: original.revision,
      };
    const desired = this.configuration.replace(
      {
        expected_revision: original.revision,
        configuration: replacedAssets(original, [skillUpdate.entry, pluginUpdate.entry]),
      },
      'owner',
    );
    return {
      updated,
      unchanged: skillUpdate.unchanged + pluginUpdate.unchanged,
      skipped: skillUpdate.skipped + pluginUpdate.skipped,
      revision: desired.revision,
    };
  }

  private requireOwner(role: 'owner' | 'member'): void {
    if (role !== 'owner')
      throw new ApiError('forbidden', 'Only an owner may change or run shared skill updates.');
  }
}

function replacedAssets(
  original: HarnessDesiredConfiguration,
  replacements: HarnessDesiredConfiguration['entries'],
): HarnessDesiredConfiguration {
  return {
    ...original,
    revision: `official-assets-${randomUUID()}`,
    entries: [
      ...original.entries.map(
        (entry) => replacements.find((next) => next.id === entry.id) ?? entry,
      ),
      ...replacements.filter((next) => !original.entries.some((entry) => entry.id === next.id)),
    ],
  };
}

function selectedPluginItems(
  desired: HarnessDesiredConfiguration,
  entry: HarnessDesiredConfiguration['entries'][number],
  items: readonly HarnessDiscoveryItem[],
): readonly HarnessDiscoveryItem[] {
  if (!desired.entries.some((candidate) => candidate.id === entry.id)) return items;
  return items.filter(
    (item) => entry.metadata?.skill_assets.some((asset) => asset.id === item.id) === true,
  );
}

function retainedSkills(entry: HarnessDesiredConfiguration['entries'][number]): {
  readonly entry: HarnessDesiredConfiguration['entries'][number];
  readonly removed: number;
} {
  if (entry.metadata === undefined)
    throw new ApiError('conflict', 'Shared skill metadata is absent.');
  const assets = entry.metadata.skill_assets.filter((asset) => !excludedAnthropicSkill(asset.id));
  return {
    entry: { ...entry, metadata: { ...entry.metadata, skill_assets: assets } },
    removed: entry.metadata.skill_assets.length - assets.length,
  };
}
