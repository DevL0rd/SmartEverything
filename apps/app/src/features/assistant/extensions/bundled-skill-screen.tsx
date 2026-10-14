import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { SettingsFrame } from '../../../settings/settings-frame';
import { EmptyState } from '../../../components/empty-state';
import { List } from '../../../components/section';
import { ListRow } from '../../../components/list-row';
import { CopyButton } from '../../../components/copy-button';
import { Text } from '../../../components/text';
import { Markdown } from '../components/markdown/markdown';
import { useExtensions } from './queries';
import { ExtensionReadStatus } from './query-status';

export function BundledSkillScreen(): ReactNode {
  const params = z
    .object({ skillId: z.string().max(200).optional() })
    .parse(useLocalSearchParams());
  const catalogue = useExtensions();
  const skill = catalogue.data?.bundled_skills?.find((item) => item.id === params.skillId);
  return (
    <SettingsFrame page="assistant/skills/detail" title={skill?.name ?? 'Included skill'}>
      <ExtensionReadStatus
        kind="skill"
        loading={catalogue.isFetching ? catalogue.data === undefined : false}
        error={catalogue.error}
        retry={() => {
          void catalogue.refetch();
        }}
      />
      {skill === undefined ? (
        <EmptyState
          icon="fileText"
          title="Skill unavailable"
          body="Refresh the catalogue. Older hubs may not publish included skills yet."
        />
      ) : (
        <>
          <Text>{skill.description}</Text>
          <Text variant="callout" tone="variant">
            Included in SmartEverything. These instructions load when needed and do not grant
            permissions.
          </Text>
          <List inset title="Source">
            <ListRow title="Publisher" subtitle={skill.publisher} />
            <ListRow
              title="Skill name"
              subtitle={skill.id}
              wrapSubtitle
              trailing={<CopyButton value={skill.id} label="Copy skill name" />}
            />
            <ListRow
              title="Bundled revision"
              subtitle={skill.revision}
              wrapSubtitle
              trailing={<CopyButton value={skill.revision} label="Copy revision" />}
            />
          </List>
          <Markdown text={skill.content} selectable />
        </>
      )}
    </SettingsFrame>
  );
}
