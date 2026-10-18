import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { SceneRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { confirm } from '../../../components/confirm-store';
import { Icon } from '../../../components/icon';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { orderScenes } from '../../../api/scenes';
import { plural } from '../../../format/text';
import { attempt, removeScene, runSceneNow } from '../data/actions';
import type { Names } from '../model/describe';
import { describeAction } from '../model/describe-action';
import { readScene, reordered } from '../model/scene-state';
import { sentenceStart } from '../model/time-text';
import { sceneIcon } from './icon-sheet';
import { background } from '@smarteverything/logging';

const DESCRIBED = 2;

function sceneSummary(scene: SceneRow, names: Names): string {
  const read = readScene(scene);
  if (!read.readable) {
    return 'Can’t be read. Open to fix.';
  }
  const steps = read.draft.actions;
  const shown = steps.slice(0, DESCRIBED).map((action) => describeAction(names, action));
  const more = steps.length - DESCRIBED;
  return sentenceStart(
    more > 0 ? `${shown.join(', ')} and ${String(more)} more` : shown.join(', '),
  );
}

function stepCount(scene: SceneRow): string {
  const read = readScene(scene);
  return read.readable ? plural(read.draft.actions.length, 'step') : 'Needs fixing';
}

function moveItems(scene: SceneRow, scenes: readonly SceneRow[]): MenuItem[] {
  const move = (by: -1 | 1): void => {
    const order = reordered(scenes, scene.id, by);
    if (order !== null) {
      background(
        attempt('The order didn’t change', () => orderScenes(order), {
          action: 'order-scenes',
          scenes: order.length,
        }),
        'scene_card.attempt_failed',
      );
    }
  };
  const index = scenes.findIndex((candidate) => candidate.id === scene.id);
  return [
    {
      label: 'Move earlier',
      icon: 'chevronUp',
      disabled: index <= 0,
      onPress: (): void => {
        move(-1);
      },
    },
    {
      label: 'Move later',
      icon: 'chevronDown',
      disabled: index === scenes.length - 1,
      onPress: (): void => {
        move(1);
      },
    },
  ];
}

function deleteItem(scene: SceneRow): MenuItem {
  const read = readScene(scene);
  const restore = read.readable ? { ...read.draft, position: scene.position } : null;
  return {
    label: 'Delete',
    icon: 'trash',
    destructive: true,
    onPress: (): void => {
      background(
        confirm({
          title: `Delete ${scene.name}?`,
          confirmLabel: 'Delete',
          tone: 'destructive',
        }).then((accepted) => {
          if (accepted) {
            background(removeScene(scene.id, restore), 'scene.remove_failed');
          }
        }),
        'scene_card.confirm_failed',
      );
    },
  };
}

function useSceneMenu(scene: SceneRow, scenes: readonly SceneRow[]): MenuItem[] {
  const router = useRouter();
  return [
    {
      label: 'Run',
      icon: 'play',
      onPress: (): void => {
        runSceneNow(scene);
      },
    },
    {
      label: 'Edit',
      icon: 'pencil',
      onPress: (): void => {
        router.push(href.scene(scene.id));
      },
    },
    ...moveItems(scene, scenes),
    deleteItem(scene),
  ];
}

export function SceneListRow({
  scene,
  scenes,
  names,
}: {
  readonly scene: SceneRow;
  readonly scenes: readonly SceneRow[];
  readonly names: Names;
}): ReactNode {
  return (
    <ListRow
      title={scene.name}
      subtitle={sceneSummary(scene, names)}
      icon={sceneIcon(scene.icon)}
      iconTone="primary"
      href={href.scene(scene.id)}
      contextMenu={useSceneMenu(scene, scenes)}
      trailing={
        <IconButton
          icon="play"
          label={`Run ${scene.name}`}
          variant="tonal"
          onPress={() => {
            runSceneNow(scene);
          }}
        />
      }
    />
  );
}

export function SceneCard({
  scene,
  scenes,
  names,
}: {
  readonly scene: SceneRow;
  readonly scenes: readonly SceneRow[];
  readonly names: Names;
}): ReactNode {
  const menu = useSceneMenu(scene, scenes);
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <View className="size-12 items-center justify-center rounded-full bg-primary-container">
          <Icon name={sceneIcon(scene.icon)} size={24} tone="primary" />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="title-3" numberOfLines={1}>
            {scene.name}
          </Text>
          <Text variant="footnote" tone="variant">
            {stepCount(scene)}
          </Text>
        </View>
        <IconButton icon="pencil" label={`Edit ${scene.name}`} href={href.scene(scene.id)} />
        <OverflowButton items={menu} label={`More for ${scene.name}`} />
      </View>
      <Text variant="callout" tone="variant" numberOfLines={2} className="min-h-10">
        {sceneSummary(scene, names)}
      </Text>
      <Button
        label="Run"
        icon="play"
        variant="tonal"
        onPress={() => {
          runSceneNow(scene);
        }}
      />
    </Card>
  );
}
