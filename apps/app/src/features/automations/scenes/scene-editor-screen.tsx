import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import type { SceneRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { MenuItem } from '../../../components/menu';
import { PageHeader, type HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { TextField } from '../../../components/text-field';
import { useIdiom } from '../../../design/platform';
import { useSizeClass } from '../../../design/size-class';
import { useEntityStore } from '../../../store/store-context';
import { removeScene } from '../shared/actions';
import { useCatalog, type Catalog } from '../shared/catalog';
import { EMPTY_SCENE, readScene, type SceneDraft } from './scene-state';
import { IconRow } from './icon-sheet';
import { SceneSteps } from './scene-steps';
import { useSceneEditor, type SceneEditor } from './use-scene-editor';
import { background } from '@smarteverything/logging';

const PARAMS = z.object({ sceneId: z.string() });

type Opening =
  | {
      readonly kind: 'ready';
      readonly draft: SceneDraft;
      readonly sceneId: string | null;
      readonly position: number;
    }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unreadable'; readonly row: SceneRow };

function openingOf(sceneId: string, scenes: readonly SceneRow[]): Opening {
  if (sceneId === 'new') {
    return { kind: 'ready', draft: EMPTY_SCENE, sceneId: null, position: scenes.length };
  }
  const row = scenes.find((scene) => scene.id === sceneId);
  if (row === undefined) {
    return { kind: 'missing' };
  }
  const read = readScene(row);
  return read.readable
    ? { kind: 'ready', draft: read.draft, sceneId: row.id, position: row.position }
    : { kind: 'unreadable', row };
}

function Footer({ editor }: { readonly editor: SceneEditor }): ReactNode {
  const { width } = useSizeClass();
  return (
    <View className="w-full max-w-reading flex-row justify-end gap-3 self-center">
      {editor.sceneId === null ? null : (
        <Button
          label="Run"
          icon="play"
          variant="tonal"
          disabled={editor.dirty}
          onPress={editor.run}
        />
      )}
      <Button
        label="Save"
        icon="check"
        grow={width === 'compact'}
        loading={editor.saving}
        onPress={editor.save}
      />
    </View>
  );
}

function runAction(editor: SceneEditor): HeaderAction {
  return { icon: 'play', label: 'Run', onPress: editor.run };
}

function headerActions(editor: SceneEditor, touch: boolean): HeaderAction[] {
  if (touch) {
    return [];
  }
  return [
    ...(editor.sceneId === null || editor.dirty ? [] : [runAction(editor)]),
    { icon: 'check', label: 'Save', onPress: editor.save, primary: true },
  ];
}

function SceneHeader({
  editor,
  touch,
}: {
  readonly editor: SceneEditor;
  readonly touch: boolean;
}): ReactNode {
  const overflow: MenuItem[] =
    editor.sceneId === null
      ? []
      : [{ label: 'Delete', icon: 'trash', destructive: true, onPress: editor.remove }];
  const title = editor.sceneId === null ? 'New scene' : editor.draft.name.trim();
  return (
    <PageHeader
      title={title === '' ? 'Scene' : title}
      {...(editor.status === 'New' ? {} : { subtitle: editor.status })}
      actions={headerActions(editor, touch)}
      overflow={overflow}
    />
  );
}

function Editor({
  start,
  catalog,
}: {
  readonly start: Extract<Opening, { kind: 'ready' }>;
  readonly catalog: Catalog;
}): ReactNode {
  const editor = useSceneEditor(start, catalog.allDevices);
  const store = useEntityStore();
  const touch = useIdiom() === 'touch';
  return (
    <Screen
      maxWidth="reading"
      header={<SceneHeader editor={editor} touch={touch} />}
      {...(touch ? { footer: <Footer editor={editor} /> } : {})}
    >
      <TextField
        label="Name"
        value={editor.draft.name}
        placeholder="Movie night"
        error={editor.problems?.name[0] ?? null}
        onChange={(name) => {
          editor.change({ type: 'rename', name });
        }}
      />
      <IconRow
        value={editor.draft.icon}
        onChange={(icon) => {
          editor.change({ type: 'icon', icon });
        }}
      />
      <SceneSteps
        draft={editor.draft}
        change={editor.change}
        devices={catalog.devices}
        valuesOf={(deviceId) => store.get().deviceValues.get(deviceId)}
        names={catalog.names}
        problems={editor.problems?.steps ?? []}
      />
    </Screen>
  );
}

function Gone({
  title,
  body,
  row,
}: {
  readonly title: string;
  readonly body: string;
  readonly row: SceneRow | null;
}): ReactNode {
  const router = useRouter();
  return (
    <Screen maxWidth="reading" header={<PageHeader title="Scene" />}>
      <EmptyState
        icon="alert"
        title={title}
        body={body}
        action={
          row === null ? (
            <Button label="All scenes" href={href.scenes()} />
          ) : (
            <Button
              label="Delete"
              variant="destructive"
              onPress={() => {
                background(
                  removeScene(row.id, null).then((removed) => {
                    if (removed) {
                      router.back();
                    }
                  }),
                  'scene.remove_failed',
                );
              }}
            />
          )
        }
      />
    </Screen>
  );
}

function OpenedScene({ sceneId }: { readonly sceneId: string }): ReactNode {
  const catalog = useCatalog();
  const [opening] = useState(() => openingOf(sceneId, catalog.scenes));
  switch (opening.kind) {
    case 'missing':
      return (
        <Gone
          title="This scene is gone"
          body="It may have been deleted on another device."
          row={null}
        />
      );
    case 'unreadable':
      return (
        <Gone
          title={`${opening.row.name} can’t be opened`}
          body="It was saved in a form this app can’t read."
          row={opening.row}
        />
      );
    case 'ready':
      return <Editor start={opening} catalog={catalog} />;
  }
}

export function SceneEditorScreen(): ReactNode {
  useHideNavigation();
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <OpenedScene sceneId={params.data.sceneId} />
  ) : (
    <Gone title="Scene not found" body="This link doesn’t point to a scene." row={null} />
  );
}
