import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import type { AiHarnessExtensions } from '@smarteverything/domain';
import { SettingsFrame } from '../../../settings/settings-frame';
import { EmptyState } from '../../../components/empty-state';
import { List } from '../../../components/section';
import { ListRow } from '../../../components/list-row';
import { CopyButton } from '../../../components/copy-button';
import { Banner } from '../../../components/banner';
import { Markdown } from '../components/markdown/markdown';
import { useExtensions } from './queries';
import { ItemHeader } from './item-header';
import { ExtensionReadStatus } from './query-status';
import { background } from '@smarteverything/logging';

type BundledSkill = NonNullable<AiHarnessExtensions['bundled_skills']>[number];

function SkillBody({ skill }: { readonly skill: BundledSkill }): ReactNode {
  return (
    <>
      <ItemHeader
        icon="fileText"
        kind="skill"
        included
        description={skill.description}
        byline={skill.publisher}
      />
      <Banner
        tone="info"
        title="Included skills are read-only"
        body="These instructions load when needed and do not grant permissions. Updates arrive with the app."
        wrapBody
      />
      <List inset title="Source">
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
  );
}

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
          background(catalogue.refetch(), 'catalogue.refetch_failed');
        }}
      />
      {skill === undefined ? (
        <SkillMissing loaded={catalogue.data !== undefined} />
      ) : (
        <SkillBody skill={skill} />
      )}
    </SettingsFrame>
  );
}

function SkillMissing({ loaded }: { readonly loaded: boolean }): ReactNode {
  return loaded ? (
    <EmptyState
      icon="fileText"
      title="Skill unavailable"
      body="Update the hub to see included skills."
    />
  ) : null;
}
