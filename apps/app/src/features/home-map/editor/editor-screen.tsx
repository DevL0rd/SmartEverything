import { randomUUID } from 'expo-crypto';
import { useReducer, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { HomeMap, HomeMapActor, HomeMapId, HomeMapOp } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { ErrorState } from '../../../components/error-state';
import { IconButton } from '../../../components/icon-button';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import type { RenderFloor, RenderScene } from '../../../components/house-map/render-scene';
import { isNative } from '../../../design/platform';
import { useActiveProfile } from '../../../store/people';
import type { EditSettled } from '../components/stage/home-map-3d';
import { EmptyFloorRow } from '../components/stage/stage-states';
import { useHomeMap, useHomeMapEditing, type HomeMapEditing } from '../data/home-map-query';
import { useHomeMapScene } from '../data/map-scene';
import { editorLaunchOf } from '../model/create-map';
import { DockedPanel } from './docked-panel';
import { EditorOptions } from './editor-options';
import { EditorStage } from './editor-stage';
import { ListMode } from './list-editor/list-mode';
import type { EditCommit } from './mount-edit';
import { stageNoticeOf } from './stage-notice';
import { listModeOf, useToolMount, type Editor, type MountSync } from './tool-mounts';
import { ToolRow } from './tool-row';
import {
  TOOL_INFO,
  acceptedSave,
  entryToolState,
  floorEmpty,
  historyButtons,
  nextFloorLevel,
  nextFloorName,
  openEmptyFloor,
  reduceTool,
  saveLine,
  shownFloorId,
  shownTool,
  type EditorTool,
} from './tool-state';

export const EDITOR_TITLE = 'Edit house map';

const NO_PROFILE_TEXT = 'Choose who you are on this device to edit the house map';

const TOOL_HINTS: Readonly<Record<EditorTool, string>> = {
  select: 'Tap anything to select it.',
  rooms: 'Tap two opposite corners for a rectangle, or tap each corner for any shape.',
  walls: 'Tap to start a wall and tap again for each corner.',
  openings: 'Tap a wall to put a door or a window in it.',
  furniture: 'Choose a piece from the catalogue to place it in the room you see.',
  devices: 'Tap a device in the tray, then tap where it goes.',
  materials: 'Choose a finish, then tap a floor or a wall face.',
  measure: 'Tap two points to measure the distance between them.',
  notes: 'Tap the map to pin a note.',
  align: 'Import the robot map and line it up with two points.',
  scan: 'Move, turn and scale the realistic view until it lines up with the map.',
};

const TOUCH_CAMERA_HINT = 'One finger turns the view, two fingers pan and zoom.';

const MOUSE_CAMERA_HINT = 'Drag to pan, right drag to turn, scroll to zoom.';

const READ_ONLY_HINT = 'You can look around while editing is paused.';

function run(job: Promise<unknown>, event: string): void {
  background(job, event);
}

function addFloorOp(map: HomeMap): HomeMapOp {
  return {
    op: 'addFloor',
    floor: {
      id: randomUUID(),
      name: nextFloorName(map),
      level: nextFloorLevel(map),
      elevation: 0,
      rooms: [],
      walls: [],
      openings: [],
      objects: [],
      placements: [],
      annotations: [],
    },
  };
}

function Options({ editor }: { readonly editor: Editor }): ReactNode {
  const { tools, dispatch } = editor;
  return (
    <EditorOptions
      view={tools.view}
      camera={tools.camera}
      readOnly={editor.readOnly}
      onView={(view): void => {
        dispatch({ type: 'view', view });
      }}
      onCamera={(camera): void => {
        dispatch({ type: 'camera', camera });
      }}
      onAddFloor={(): void => {
        run(editor.editing.edit([addFloorOp(editor.map)]), 'home_map.add_floor_failed');
      }}
    />
  );
}

interface HeaderProps {
  readonly editor: Editor;
  readonly draft: boolean;
  readonly onDone: () => void;
}

function Header({ editor, draft, onDone }: HeaderProps): ReactNode {
  const { editing } = editor;
  const line = saveLine(editing.state);
  const history = historyButtons(editing.state);
  return (
    <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
      <View className="min-w-0 max-w-full grow gap-0.5">
        <Text variant="body-strong" accessibilityRole="header">
          {editor.map.name === '' ? EDITOR_TITLE : editor.map.name}
        </Text>
        <Text variant="caption" tone={line.tone} accessibilityLiveRegion="polite">
          {line.text}
        </Text>
      </View>
      <View className="ml-auto shrink-0 flex-row items-center gap-2">
        <IconButton
          icon="undo"
          label="Undo"
          size="control"
          disabled={!history.undo}
          onPress={(): void => {
            run(editing.undo(), 'home_map.undo_failed');
          }}
        />
        <IconButton
          icon="redo"
          label="Redo"
          size="control"
          disabled={!history.redo}
          onPress={(): void => {
            run(editing.redo(), 'home_map.redo_failed');
          }}
        />
        <Options editor={editor} />
        <Button label="Done" icon="check" variant={draft ? 'tonal' : 'filled'} onPress={onDone} />
      </View>
    </View>
  );
}

export function toolHint(tool: EditorTool, readOnly: boolean, touch: boolean): string {
  if (readOnly) return READ_ONLY_HINT;
  if (tool !== 'select') return TOOL_HINTS[tool];
  return `${TOOL_HINTS.select} ${touch ? TOUCH_CAMERA_HINT : MOUSE_CAMERA_HINT}`;
}

function Hint({ editor }: { readonly editor: Editor }): ReactNode {
  const tool = shownTool(editor.tools, editor.readOnly);
  return (
    <View className="gap-1 rounded-md bg-surface-2 p-3">
      <Text variant="body-strong">{TOOL_INFO[tool].title}</Text>
      <Text variant="footnote" tone="variant">
        {toolHint(tool, editor.readOnly, isNative())}
      </Text>
    </View>
  );
}

interface Shown {
  readonly scene: RenderScene;
  readonly floor: RenderFloor;
}

function useShown(editor: Editor): Shown | null {
  const scene = useHomeMapScene(editor.map);
  const floor = scene?.floors.find((item) => item.id === editor.floorId) ?? scene?.floors[0];
  return scene === null || floor === undefined ? null : { scene, floor };
}

function EmptyFloorPrompt({
  editor,
  floor,
}: {
  readonly editor: Editor;
  readonly floor: RenderFloor | undefined;
}): ReactNode {
  const tool = shownTool(editor.tools, editor.readOnly);
  if ((floor?.rooms.length ?? 0) > 0 || tool === 'rooms') return null;
  const name = editor.map.floors.find((item) => item.id === editor.floorId)?.name ?? null;
  return (
    <EmptyFloorRow
      floorName={name}
      onDrawRooms={
        editor.readOnly
          ? undefined
          : (): void => {
              editor.dispatch({ type: 'pick', tool: 'rooms' });
            }
      }
    />
  );
}

interface EditSync extends MountSync {
  readonly settled: EditSettled | null;
}

function useEditSync(edit: HomeMapEditing['edit']): EditSync {
  const [committed, setCommitted] = useState<number | null>(null);
  const [settled, setSettled] = useState<EditSettled | null>(null);
  const commit: EditCommit = (seq, ops) => {
    if (ops.length === 0) {
      setSettled({ seq, accepted: false });
      return;
    }
    setCommitted(seq);
    run(
      edit(ops).then(
        (status) => {
          setSettled({ seq, accepted: acceptedSave(status) });
        },
        (error: unknown) => {
          setSettled({ seq, accepted: false });
          throw error;
        },
      ),
      'home_map.select_edit_failed',
    );
  };
  return { commit, committed, settled };
}

export interface EditorBodyProps extends Editor {
  readonly onDone: () => void;
}

export function EditorBody({ onDone, ...editor }: EditorBodyProps): ReactNode {
  const shown = useShown(editor);
  const sync = useEditSync(editor.editing.edit);
  const mount = useToolMount(editor, shown?.floor, sync);
  const [unavailable, setUnavailable] = useState(false);
  const { tools, readOnly, dispatch } = editor;
  const { status } = editor.editing.state;
  const notice = stageNoticeOf({ unavailable, readOnly, status, notice: mount.notice });
  const stage =
    shown === null ? null : (
      <EditorStage
        {...{ editor, scene: shown.scene, floor: shown.floor, mount, notice }}
        settled={sync.settled}
        onUnavailable={(): void => {
          setUnavailable(true);
        }}
      />
    );
  return (
    <DockedPanel
      map={
        <>
          {tools.view === 'list' ? <ListMode {...listModeOf(editor)} /> : stage}
          <EmptyFloorPrompt editor={editor} floor={shown?.floor} />
        </>
      }
      bar={mount.bar ?? null}
      header={<Header editor={editor} draft={mount.draft} onDone={onDone} />}
      tools={
        <ToolRow
          tool={shownTool(tools, readOnly)}
          more={tools.more}
          readOnly={readOnly}
          onPick={(tool): void => {
            dispatch({ type: 'pick', tool });
          }}
          onToggleMore={(): void => {
            dispatch({ type: 'toggleMore' });
          }}
        />
      }
    >
      <Hint editor={editor} />
      {unavailable && tools.view === 'map' ? <ListMode {...listModeOf(editor)} /> : null}
      {mount.panel}
    </DockedPanel>
  );
}

interface ShellProps {
  readonly map: HomeMap;
  readonly mapId: HomeMapId | undefined;
  readonly actor: HomeMapActor;
  readonly params: Readonly<Record<string, unknown>>;
  readonly launchFloorId: string | null;
}

function Shell({ map, mapId, actor, params, launchFloorId }: ShellProps): ReactNode {
  const router = useRouter();
  const editing = useHomeMapEditing(actor, mapId);
  const [tools, dispatch] = useReducer(reduceTool, params, (entry) => {
    const start = { ...entryToolState(entry), floorId: launchFloorId };
    return openEmptyFloor(start, floorEmpty(map, shownFloorId(map, start)));
  });
  const readOnly = !editing.state.connected;
  return (
    <EditorBody
      map={map}
      mapId={mapId}
      actor={actor}
      editing={editing}
      tools={tools}
      dispatch={dispatch}
      readOnly={readOnly}
      floorId={shownFloorId(map, tools)}
      onDone={(): void => {
        router.back();
      }}
    />
  );
}

function Frame({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="flex-1 bg-bg pt-safe">{children}</View>;
}

export function HomeMapEditorScreen(): ReactNode {
  const params = useLocalSearchParams();
  const launch = editorLaunchOf(params);
  const { map, loading, failure, retry } = useHomeMap(launch.mapId);
  const profile = useActiveProfile();
  if (failure !== null) {
    return (
      <Frame>
        <ErrorState error={failure} retry={retry} page />
      </Frame>
    );
  }
  if (map === null || loading) {
    return (
      <Frame>
        <Skeleton shape="block" className="m-3 flex-1" />
      </Frame>
    );
  }
  if (profile === null) {
    return (
      <Frame>
        <Text variant="body" tone="variant" align="center" className="m-6">
          {NO_PROFILE_TEXT}
        </Text>
      </Frame>
    );
  }
  return (
    <Frame>
      <Shell
        map={map}
        mapId={launch.mapId}
        actor={`profile:${profile.id}`}
        params={params}
        launchFloorId={launch.floorId ?? null}
      />
    </Frame>
  );
}
