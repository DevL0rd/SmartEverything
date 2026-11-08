'use dom';

import './map-3d.css';
import { useDOMImperativeHandle } from 'expo/dom';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { useStableCallback } from '../../../design/use-stable-callback';
import { createGlowDecalFactory } from '../../models/three/glow-decal';
import { createSceneModelSet } from '../../models/three/scene-model';
import {
  SCENE_MESSAGE,
  type Map3dDomProps,
  type Map3dHandle,
  type ScanHandle,
} from './map-3d-protocol';
import {
  LIVE_MESSAGE,
  MODELS_MESSAGE,
  POSE_MESSAGE,
  SCAN_BAND_MESSAGE,
  SCAN_MESSAGE,
  SCAN_PLACEMENT_MESSAGE,
  TRAIL_MESSAGE,
  VIEW_INSETS,
} from './map-3d-messages';
import { Marks, sameMarks } from './map-3d-marks';
import { Map3dSession } from './map-3d-session';
import { RenderCore } from './render-core';
import { WebglUnavailableError } from './render-core-renderer';
import type { ScreenMarks } from './render-core-marks';
import { SHOW_ALL_OBJECTS } from './render-core-objects';
import { FULL_QUALITY } from '../live-visibility/quality-scaler';
import {
  CLEAR_EDIT_MESSAGE,
  EDIT_EVENT,
  EDIT_FLOOR_MESSAGE,
  EDIT_MESSAGE,
  EDIT_RESULT_MESSAGE,
  type EditEvent,
  type Map3dEditHandle,
} from './map-3d-edit-protocol';
import { EditOverlayLayer, type OverlayPainter } from './edit/overlay';
import { NO_YIELD, sameYield, type YieldZones } from './edit/overlay-model';

interface Mounted {
  readonly core: RenderCore;
  readonly session: Map3dSession;
}

function observeSize(canvas: HTMLCanvasElement, core: RenderCore): () => void {
  const observer = new ResizeObserver(([entry]) => {
    if (entry === undefined) return;
    core.resize(entry.contentRect.width, entry.contentRect.height, window.devicePixelRatio);
  });
  observer.observe(canvas);
  return () => {
    observer.disconnect();
  };
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const NO_MARKS: ScreenMarks = { width: 0, height: 0, labels: [], chips: [], robot: null };

function useMarks(): readonly [ScreenMarks, (next: ScreenMarks) => void] {
  const [marks, setMarks] = useState<ScreenMarks>(NO_MARKS);
  const update = useCallback((next: ScreenMarks): void => {
    setMarks((current) => (sameMarks(current, next) ? current : next));
  }, []);
  return [marks, update];
}

interface MountCallbacks {
  readonly onPick: (roomId: string | null) => void;
  readonly onPickDevice: ((deviceId: string) => void) | undefined;
  readonly onUnavailable: (detail: string) => void;
  readonly onMarks: (marks: ScreenMarks) => void;
  readonly onFrameTime: (frameMs: number) => void;
  readonly onScanFailed: (detail: string) => void;
  readonly onEdit: ((event: EditEvent) => void) | undefined;
  readonly onYield: (zones: YieldZones) => void;
}

function useMounted(
  callbacks: MountCallbacks,
): readonly [Mounted | null, (canvas: HTMLCanvasElement) => (() => void) | undefined] {
  const [mounted, setMounted] = useState<Mounted | null>(null);
  const { onPick, onPickDevice, onUnavailable, onMarks, onFrameTime, onScanFailed } = callbacks;
  const { onEdit, onYield } = callbacks;
  const attach = useCallback(
    (canvas: HTMLCanvasElement): (() => void) | undefined => {
      try {
        const core = new RenderCore({
          canvas,
          onPickRoom: onPick,
          onPickDevice,
          onMarks,
          onFrameTime,
          onScanFailed,
          onEdit,
          onYield,
          createModelSet: createSceneModelSet,
          createDecals: createGlowDecalFactory,
        });
        const unobserve = observeSize(canvas, core);
        setMounted({ core, session: new Map3dSession(core) });
        return () => {
          unobserve();
          core.dispose();
          setMounted(null);
        };
      } catch (error) {
        if (!(error instanceof WebglUnavailableError)) throw error;
        onUnavailable(detailOf(error.cause));
        return undefined;
      }
    },
    [onPick, onPickDevice, onUnavailable, onMarks, onFrameTime, onScanFailed, onEdit, onYield],
  );
  return [mounted, attach];
}

function guarded(
  onUnavailable: Map3dDomProps['onUnavailable'],
  run: (args: readonly unknown[]) => void,
): (...args: unknown[]) => void {
  return (...args): void => {
    try {
      run(args);
    } catch (error) {
      background(onUnavailable('scene', detailOf(error)), 'vacuum.map3d_report_failed');
    }
  };
}

function handleOf(
  mounted: Mounted | null,
  onUnavailable: Map3dDomProps['onUnavailable'],
): Map3dHandle {
  const session = mounted?.session;
  return {
    setScene: guarded(onUnavailable, (args) => {
      const [key, source, json] = SCENE_MESSAGE.parse(args);
      session?.loadScene(key, source, json);
    }),
    setPose: guarded(onUnavailable, (args) => {
      const [x, y, yaw, turretRaised] = POSE_MESSAGE.parse(args);
      session?.setPose(x, y, yaw, turretRaised);
    }),
    setTrail: guarded(onUnavailable, (args) => {
      session?.setTrail(TRAIL_MESSAGE.parse(args)[0]);
    }),
    setModels: guarded(onUnavailable, (args) => {
      session?.setModels(MODELS_MESSAGE.parse(args)[0]);
    }),
    setLive: guarded(onUnavailable, (args) => {
      session?.setLive(LIVE_MESSAGE.parse(args)[0]);
    }),
    clearPose: (): void => {
      session?.clearPose();
    },
    ...scanHandleOf(session, onUnavailable),
    ...editHandleOf(session, onUnavailable),
  };
}

function editHandleOf(
  session: Map3dSession | undefined,
  onUnavailable: Map3dDomProps['onUnavailable'],
): Map3dEditHandle {
  return {
    setEditFloor: guarded(onUnavailable, (args) => {
      const [key, json, committed] = EDIT_FLOOR_MESSAGE.parse(args);
      session?.setEditFloor(key, json, committed);
    }),
    setEdit: guarded(onUnavailable, (args) => {
      session?.setEdit(EDIT_MESSAGE.parse(args)[0]);
    }),
    editResult: guarded(onUnavailable, (args) => {
      const [seq, accepted] = EDIT_RESULT_MESSAGE.parse(args);
      session?.editResult(seq, accepted);
    }),
    clearEdit: guarded(onUnavailable, (args) => {
      CLEAR_EDIT_MESSAGE.parse(args);
      session?.clearEdit();
    }),
  };
}

function scanHandleOf(
  session: Map3dSession | undefined,
  onUnavailable: Map3dDomProps['onUnavailable'],
): ScanHandle {
  return {
    setScan: guarded(onUnavailable, (args) => {
      const [key, url, format] = SCAN_MESSAGE.parse(args);
      session?.setScan(key, url, format);
    }),
    clearScan: (): void => {
      session?.clearScan();
    },
    setScanPlacement: guarded(onUnavailable, (args) => {
      const [tx, ty, tz, yawDeg, scale, opacity] = SCAN_PLACEMENT_MESSAGE.parse(args);
      session?.setScanPlacement({ tx, ty, tz, yawDeg, scale, opacity });
    }),
    setScanBand: guarded(onUnavailable, (args) => {
      const [bottom, top] = SCAN_BAND_MESSAGE.parse(args);
      session?.setScanBand(bottom, top);
    }),
    clearScanBand: (): void => {
      session?.clearScanBand();
    },
  };
}

function useObjectProps(
  mounted: Mounted | null,
  props: Pick<Map3dDomProps, 'selectedItem' | 'quality' | 'realistic' | 'objectLook'>,
): void {
  const { selectedItem = null, quality = FULL_QUALITY, realistic = false } = props;
  const { renderScale, splatScale, lodBias, decalLightShare, animationDivisor } = quality;
  const { showFurniture, showDeviceModels } = props.objectLook ?? SHOW_ALL_OBJECTS;
  useEffect(() => {
    mounted?.core.objects?.select(selectedItem);
  }, [mounted, selectedItem]);
  useEffect(() => {
    mounted?.core.setQuality({
      renderScale,
      splatScale,
      lodBias,
      decalLightShare,
      animationDivisor,
    });
  }, [mounted, renderScale, splatScale, lodBias, decalLightShare, animationDivisor]);
  useEffect(() => {
    mounted?.core.realistic.setView(realistic);
  }, [mounted, realistic]);
  useEffect(() => {
    mounted?.core.objects?.setLook({ showFurniture, showDeviceModels });
  }, [mounted, showFurniture, showDeviceModels]);
}

function useInsets(
  mounted: Mounted | null,
  insets: Map3dDomProps['insets'],
  onUnavailable: Map3dDomProps['onUnavailable'],
): void {
  const { top, bottom } = insets;
  useEffect(() => {
    if (mounted === null) return;
    const parsed = VIEW_INSETS.safeParse({ top, bottom });
    if (parsed.success) {
      mounted.core.setInsets(parsed.data);
      return;
    }
    background(onUnavailable('scene', parsed.error.message), 'house_map.map3d_insets_failed');
  }, [mounted, top, bottom, onUnavailable]);
}

function useEditCallback(props: Map3dDomProps): MountCallbacks['onEdit'] {
  const send = useStableCallback((event: EditEvent): void => {
    if (props.onEdit !== undefined) {
      background(
        props.onEdit(JSON.stringify(EDIT_EVENT.parse(event))),
        'house_map.map3d_edit_failed',
      );
    }
  });
  return props.onEdit === undefined ? undefined : send;
}

function useYield(): readonly [YieldZones, (next: YieldZones) => void] {
  const [zones, setZones] = useState<YieldZones>(NO_YIELD);
  const update = useCallback((next: YieldZones): void => {
    setZones((current) => (sameYield(current, next) ? current : next));
  }, []);
  return [zones, update];
}

function useEditLayer(
  mounted: Mounted | null,
  editing: boolean,
): (painter: OverlayPainter | null) => void {
  const [painter, setPainter] = useState<OverlayPainter | null>(null);
  useEffect(() => {
    mounted?.core.setOverlayPainter(painter);
  }, [mounted, painter]);
  useEffect(() => {
    mounted?.core.setEditing(editing);
  }, [mounted, editing]);
  return setPainter;
}

function useCoreCallbacks(
  props: Map3dDomProps,
): Omit<MountCallbacks, 'onMarks' | 'onEdit' | 'onYield'> {
  const onPick = useStableCallback((roomId: string | null): void => {
    background(props.onPickRoom(roomId), 'vacuum.map3d_pick_failed');
  });
  const pickDevice = useStableCallback((deviceId: string): void => {
    if (props.onPickDevice !== undefined) {
      background(props.onPickDevice(deviceId), 'house_map.map3d_device_pick_failed');
    }
  });
  const onPickDevice = props.onPickDevice === undefined ? undefined : pickDevice;
  const onUnavailable = useStableCallback((detail: string): void => {
    background(props.onUnavailable('webgl', detail), 'vacuum.map3d_report_failed');
  });
  const onFrameTime = useStableCallback((frameMs: number): void => {
    if (props.onFrameTime !== undefined) {
      background(props.onFrameTime(frameMs), 'house_map.map3d_frame_time_failed');
    }
  });
  const onScanFailed = useStableCallback((detail: string): void => {
    if (props.onScanFailed !== undefined) {
      background(props.onScanFailed(detail), 'house_map.map3d_scan_failed_report_failed');
    }
  });
  return { onPick, onPickDevice, onUnavailable, onFrameTime, onScanFailed };
}

const NO_ROOMS: readonly string[] = [];

function useFraming(mounted: Mounted | null, frameRooms: readonly string[] = NO_ROOMS): void {
  useEffect(() => {
    mounted?.core.frameRooms(frameRooms);
  }, [mounted, frameRooms]);
}

function useSessionLooks(
  mounted: Mounted | null,
  theme: Map3dDomProps['theme'],
  finish: Map3dDomProps['finish'],
): void {
  useEffect(() => {
    mounted?.session.setTheme(theme);
  }, [mounted, theme]);
  useEffect(() => {
    mounted?.session.setFinish(finish);
  }, [mounted, finish]);
}

export default function Map3d(props: Map3dDomProps): ReactNode {
  const { ref, theme, finish, preset, active, reducedMotion, label, fitSeq, follow } = props;
  const { selection, currentRoomId } = props;
  const onReady = useStableCallback(props.onReady);
  const onUnavailable = useStableCallback(props.onUnavailable);
  const [marks, onMarks] = useMarks();
  const [yieldTo, onYield] = useYield();
  const onEdit = useEditCallback(props);
  const [mounted, attach] = useMounted({ ...useCoreCallbacks(props), onMarks, onEdit, onYield });
  const onPainter = useEditLayer(mounted, props.editing ?? false);
  useDOMImperativeHandle<Map3dHandle>(ref, () => handleOf(mounted, onUnavailable), [mounted]);
  useEffect(() => {
    mounted?.core.setReducedMotion(reducedMotion);
  }, [mounted, reducedMotion]);
  useEffect(() => {
    mounted?.core.setActive(active);
  }, [mounted, active]);
  useEffect(() => {
    mounted?.core.setPreset(preset);
  }, [mounted, preset, fitSeq]);
  useEffect(() => {
    mounted?.core.setFollow(follow);
  }, [mounted, follow]);
  useEffect(() => {
    mounted?.core.selectRooms(selection);
  }, [mounted, selection]);
  useObjectProps(mounted, props);
  useFraming(mounted, props.frameRooms);
  useInsets(mounted, props.insets, onUnavailable);
  useSessionLooks(mounted, theme, finish);
  useEffect(() => {
    if (mounted !== null) background(onReady(), 'vacuum.map3d_ready_failed');
  }, [mounted, onReady]);
  return (
    <div className="vacuum-map3d-frame" data-theme={theme} role="img" aria-label={label}>
      <canvas ref={attach} className="vacuum-map3d" />
      <Marks
        marks={marks}
        selection={selection}
        currentRoomId={currentRoomId}
        keepOut={props.keepOut}
        yieldTo={yieldTo}
      />
      <EditOverlayLayer onPainter={onPainter} />
    </div>
  );
}
