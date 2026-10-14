import type { ReactNode } from 'react';
import { z } from 'zod';
import { List } from '../../../components/section';
import { SwitchRow } from '../../../components/rows';
import { Banner } from '../../../components/banner';
import type { HarnessExtensionItem } from '@smarteverything/domain';
import { useExtensions, useExtensionConfiguration } from './queries';
import { useExtensionWriter } from './change';
import { ExtensionChangeReview } from './change-review';
import type { ExtensionChange } from './selection';

const COLLECTIONS = {
  skill: {
    id: 'skills',
    title: 'Claude skills',
    subtitle:
      'Turn all installed Claude skills on or off. Included, custom and workspace skills stay available.',
    setting: 'claude_skills_enabled',
  },
  extension: {
    id: 'claude-plugins',
    title: 'Claude plugins',
    subtitle: 'Turn all installed Claude plugins on or off. Your selections stay saved.',
    setting: null,
  },
} as const;

export function ClaudeCollectionControl({
  kind,
}: {
  readonly kind: 'skill' | 'extension';
}): ReactNode {
  const configuration = useExtensionConfiguration().data;
  const catalogue = useExtensions().data;
  const writer = useExtensionWriter();
  const collection = COLLECTIONS[kind];
  const entry = configuration?.desired.entries.find((candidate) => candidate.id === collection.id);
  const item = catalogue?.items.find((candidate) => candidate.id === collection.id);
  if (entry === undefined || item === undefined || configuration === undefined) return null;
  const enabled = z
    .boolean()
    .default(true)
    .safeParse(collection.setting === null ? entry.enabled : entry.config[collection.setting]);
  if (!enabled.success)
    return (
      <Banner
        tone="warning"
        title={`${collection.title} setting is invalid`}
        body="Expected an on or off choice in the shared configuration."
      />
    );
  return (
    <>
      <ExtensionChangeReview writer={writer} />
      <List inset>
        <SwitchRow
          title={collection.title}
          subtitle={collection.subtitle}
          value={enabled.data}
          disabled={!writer.allowed}
          onChange={(enabled) => {
            void writer.save(
              collectionChange(item, collection.setting, collection.title, enabled),
              configuration.desired,
            );
          }}
        />
      </List>
    </>
  );
}

function collectionChange(
  item: HarnessExtensionItem,
  setting: string | null,
  label: string,
  enabled: boolean,
): ExtensionChange {
  return setting === null
    ? { kind: 'switch', item, enabled }
    : { kind: 'setting', item, key: setting, value: enabled, label, defaultValue: true };
}
