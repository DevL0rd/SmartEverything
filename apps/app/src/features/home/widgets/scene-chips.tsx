import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { SceneRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { HScroller } from '../../../components/h-scroller';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { SemanticSizes } from '../../../design/tokens';
import { cn } from '../../../design/cn';
import { plural } from '../../../format/text';
import { runSceneNow, sceneIcon } from '../../automations';
import { sceneGrid } from '../model/widget-fit';

const RAN_MS = 3000;

interface Ran {
  readonly sceneId: string;
}

function useRanScene(): { readonly ranId: string | null; readonly run: (scene: SceneRow) => void } {
  const [ran, setRan] = useState<Ran | null>(null);
  useEffect(() => {
    if (ran === null) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setRan(null);
    }, RAN_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [ran]);
  return {
    ranId: ran?.sceneId ?? null,
    run: (scene): void => {
      runSceneNow(scene);
      setRan({ sceneId: scene.id });
    },
  };
}

function SceneChip({
  scene,
  ran,
  grow,
  onRun,
}: {
  readonly scene: SceneRow;
  readonly ran: boolean;
  readonly grow: boolean;
  readonly onRun: (scene: SceneRow) => void;
}): ReactNode {
  return (
    <Interactive
      label={`Run ${scene.name}`}
      onPress={() => {
        onRun(scene);
      }}
      className={cn(
        'min-h-touch-min flex-row items-center gap-2 rounded-full bg-primary-container pl-3 pr-4',
        grow && 'min-w-0 flex-1',
      )}
      layerClassName="rounded-full"
    >
      <Icon name={ran ? 'check' : sceneIcon(scene.icon)} size={20} tone="primary" />
      <Text variant="label" tone="primary" numberOfLines={1} className="shrink">
        {scene.name}
      </Text>
    </Interactive>
  );
}

export function SceneScroller({ scenes }: { readonly scenes: readonly SceneRow[] }): ReactNode {
  const { ranId, run } = useRanScene();
  return (
    <HScroller label="Scenes">
      {scenes.map((scene) => (
        <SceneChip key={scene.id} scene={scene} ran={ranId === scene.id} grow={false} onRun={run} />
      ))}
    </HScroller>
  );
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, row) =>
    items.slice(row * size, row * size + size),
  );
}

export function SceneChipGrid({
  scenes,
  columns,
  body,
  sizes,
}: {
  readonly scenes: readonly SceneRow[];
  readonly columns: number;
  readonly body: number;
  readonly sizes: SemanticSizes;
}): ReactNode {
  const { ranId, run } = useRanScene();
  const { shown, more } = sceneGrid(body, scenes.length, columns, sizes);
  return (
    <View className="flex-1 gap-3 overflow-hidden">
      <View className="gap-2">
        {chunk(scenes.slice(0, shown), columns).map((row) => (
          <View key={row.map((scene) => scene.id).join()} className="flex-row gap-2">
            {row.map((scene) => (
              <SceneChip key={scene.id} scene={scene} ran={ranId === scene.id} grow onRun={run} />
            ))}
            {Array.from({ length: columns - row.length }, (_, gap) => (
              <View key={`gap-${String(gap)}`} className="flex-1" />
            ))}
          </View>
        ))}
      </View>
      {more === 0 ? null : (
        <View className="flex-row">
          <Button label={`+${String(more)} more`} variant="text" href={href.scenes()} />
        </View>
      )}
    </View>
  );
}

export function SceneGlance({ scenes }: { readonly scenes: readonly SceneRow[] }): ReactNode {
  const { ranId, run } = useRanScene();
  const [first] = scenes;
  return (
    <View className="flex-1 justify-end gap-1.5">
      <Text variant="footnote" tone="variant">
        {plural(scenes.length, 'scene')}
      </Text>
      {first === undefined ? null : (
        <View className="flex-row">
          <SceneChip scene={first} ran={ranId === first.id} grow onRun={run} />
        </View>
      )}
    </View>
  );
}
