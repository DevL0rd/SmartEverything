import type { ReactNode } from 'react';
import { z } from 'zod';
import { List } from '../../../components/section';
import { SwitchRow } from '../../../components/rows';
import { Banner } from '../../../components/banner';
import { useExtensions } from './queries';
import { useExtensionActions } from './change';

const COLLECTIONS = {
  skill: {
    id: 'skills',
    subtitle:
      'Turn all installed Claude skills on or off. Included, custom and workspace skills stay available.',
    setting: 'claude_skills_enabled',
  },
  extension: {
    id: 'claude-plugins',
    subtitle: 'Turn all installed Claude plugins on or off. Your selections stay saved.',
    setting: null,
  },
} as const;

export function ClaudeCollectionControl({
  kind,
}: {
  readonly kind: 'skill' | 'extension';
}): ReactNode {
  const catalogue = useExtensions().data;
  const actions = useExtensionActions();
  const collection = COLLECTIONS[kind];
  const item = catalogue?.items.find((candidate) => candidate.id === collection.id);
  if (item === undefined) return null;
  const enabled = z
    .boolean()
    .default(true)
    .safeParse(collection.setting === null ? item.enabled : item.config[collection.setting]);
  if (!enabled.success)
    return (
      <Banner
        tone="warning"
        title={`${item.name} setting is invalid`}
        body="Expected an on or off choice in the shared configuration."
      />
    );
  return (
    <List inset>
      <SwitchRow
        title={item.name}
        subtitle={collection.subtitle}
        value={enabled.data}
        disabled={!actions.allowed}
        onChange={(value) => {
          if (collection.setting === null) actions.setEnabled(item, value);
          else actions.setSetting(item, collection.setting, value);
        }}
      />
    </List>
  );
}
