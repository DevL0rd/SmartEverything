import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { Grid } from '../../../components/grid';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { List } from '../../../components/section';
import { useSizeClass } from '../../../design/size-class';
import { plural } from '../../../format/text';
import { useCatalog, type Catalog } from '../data/use-automations';
import { SceneCard, SceneListRow } from '../scenes/scene-card';
import { subtitleProp } from './shared';

function ScenesBody({
  catalog,
  compact,
}: {
  readonly catalog: Catalog;
  readonly compact: boolean;
}): ReactNode {
  const scenes = catalog.scenes;
  if (scenes.length === 0) {
    return (
      <EmptyState
        icon="sparkles"
        title="Set the mood in one tap"
        body="A scene sets several devices at once, like Movie night or Bedtime."
      />
    );
  }
  if (compact) {
    return (
      <List inset>
        {scenes.map((scene) => (
          <SceneListRow key={scene.id} scene={scene} scenes={scenes} names={catalog.names} />
        ))}
      </List>
    );
  }
  return (
    <Grid minItemWidth={260}>
      {scenes.map((scene) => (
        <SceneCard key={scene.id} scene={scene} scenes={scenes} names={catalog.names} />
      ))}
    </Grid>
  );
}

export function ScenesScreen(): ReactNode {
  const router = useRouter();
  const catalog = useCatalog();
  const { width } = useSizeClass();
  const scenes = catalog.scenes;
  return (
    <Screen
      maxWidth={width === 'compact' ? 'reading' : 'dashboard'}
      header={
        <PageHeader
          title="Scenes"
          {...subtitleProp(scenes.length === 0 ? undefined : plural(scenes.length, 'scene'))}
        />
      }
      primaryAction={{
        label: 'New scene',
        icon: 'plus',
        extended: scenes.length === 0,
        onPress: () => {
          router.push(href.scene('new'));
        },
      }}
    >
      <ScenesBody catalog={catalog} compact={width === 'compact'} />
    </Screen>
  );
}
