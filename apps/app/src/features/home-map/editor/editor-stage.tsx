import { useMemo, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import type { HomeMapLookPref } from '@smarteverything/domain';
import type { StageLiveProps } from '../../../components/house-map/live-visibility/stage-host';
import type { RenderFloor, RenderScene } from '../../../components/house-map/render-scene';
import { PREFS, prefValueOf } from '../../../store/prefs';
import { sameJson } from '../../../store/same-json';
import { useStoreSelector } from '../../../store/store-context';
import { HomeMap3d, type EditSettled } from '../components/stage/home-map-3d';
import { Stage, type StageContext } from '../components/stage/stage';
import type { StageFloors, StageViewOption } from '../components/stage/stage-chrome';
import { StageStillView } from '../components/stage/stage-states';
import { useHomeMapLive, type HomeMapLiveRequest } from '../data/live-feed';
import type { EditorNotice } from './mount-edit';
import type { StageSize } from './manipulate/menu-model';
import { StageNoticeChip } from './stage-notice';
import type { Editor, EditorMount } from './tool-mounts';
import { editorCanvasLabel, floorEmpty, floorOptions } from './tool-state';

export const EDITOR_STAGE_ID = 'home-map.editor';

const NO_VIEWS: readonly StageViewOption<'3d'>[] = [];

const NO_STATE = { unavailable: false } as const;

const NO_SIZE: StageSize = { width: 0, height: 0 };

export interface EditorStageProps {
  readonly editor: Editor;
  readonly scene: RenderScene;
  readonly floor: RenderFloor;
  readonly mount: EditorMount;
  readonly settled: EditSettled | null;
  readonly notice: EditorNotice | null;
  readonly onUnavailable: () => void;
}

function useEditorLook(): HomeMapLookPref {
  const saved = useStoreSelector((state) => prefValueOf(state, PREFS.homeMapLook), sameJson);
  return useMemo(() => ({ ...saved, showFurniture: true, showDeviceModels: true }), [saved]);
}

function useStageSize(): readonly [StageSize, (event: LayoutChangeEvent) => void] {
  const [size, setSize] = useState<StageSize>(NO_SIZE);
  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setSize((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height },
    );
  };
  return [size, onLayout];
}

export function stageFloorsOf(editor: Editor): StageFloors | undefined {
  const { floorId, map } = editor;
  if (floorId === null) return undefined;
  return {
    options: floorOptions(map),
    value: floorId,
    onChange: (next): void => {
      editor.dispatch({ type: 'floor', floorId: next, empty: floorEmpty(map, next) });
    },
  };
}

function roomSelection(floor: RenderFloor, selected: string | null): readonly string[] {
  return selected !== null && floor.rooms.some((room) => room.id === selected) ? [selected] : [];
}

interface SceneProps extends EditorStageProps {
  readonly context: StageContext;
  readonly live: StageLiveProps;
}

function Still({ floor, name }: { readonly floor: RenderFloor; readonly name: string }): ReactNode {
  return <StageStillView input={{ floor }} name={name} state={NO_STATE} />;
}

function EditorScene(props: SceneProps): ReactNode {
  const { editor, floor, mount, context, live } = props;
  const look = useEditorLook();
  const request = useMemo<HomeMapLiveRequest>(
    () => ({ mapName: editor.map.name, animate: live.active }),
    [editor.map.name, live.active],
  );
  const feed = useHomeMapLive(editor.map, floor, look, request);
  const { selected } = editor.tools;
  return (
    <HomeMap3d
      {...{ scene: props.scene, floor, view3d: context.view3d, chrome: context.chrome }}
      {...{ insets: context.chromeInsets, label: feed.summary, look, live, feed }}
      selection={roomSelection(floor, selected)}
      selectedItem={selected}
      realistic={null}
      fallback={
        <View className="h-full w-full opacity-45">
          <Still floor={floor} name={editor.map.name} />
        </View>
      }
      onPickRoom={(roomId): void => {
        editor.dispatch(roomId === null ? { type: 'clear' } : { type: 'select', id: roomId });
      }}
      onPickDevice={(deviceId): void => {
        editor.dispatch({ type: 'select', id: deviceId });
      }}
      edit={{
        floor: mount.editFloor,
        overlay: mount.overlay,
        settled: props.settled,
        onEvent: (event): void => {
          mount.onEdit?.(event);
        },
        onUnavailable: props.onUnavailable,
      }}
    />
  );
}

export function EditorStage(props: EditorStageProps): ReactNode {
  const { editor, floor, mount, notice } = props;
  const [size, onLayout] = useStageSize();
  return (
    <View className="flex-1" onLayout={onLayout}>
      <Stage
        variant="full"
        className="h-full"
        summary={editorCanvasLabel(floor, editor.map.name)}
        content={{
          kind: 'live',
          id: EDITOR_STAGE_ID,
          still: <Still floor={floor} name={editor.map.name} />,
          render: (context, live) => <EditorScene {...props} context={context} live={live} />,
        }}
        views={NO_VIEWS}
        view="3d"
        onViewChange={(): void => undefined}
        tools={{ tools3d: true }}
        floors={stageFloorsOf(editor)}
        camera={{
          preset: editor.tools.camera,
          onPreset: (camera): void => {
            editor.dispatch({ type: 'camera', camera });
          },
        }}
        notices={notice === null ? null : <StageNoticeChip notice={notice} />}
      />
      {mount.layer === null ? null : (
        <View pointerEvents="box-none" className="absolute inset-0">
          {mount.layer(size)}
        </View>
      )}
    </View>
  );
}
