import type { BrushLiveFrame, BrushLiveNotice, DeviceRow } from '@smarteverything/domain';
import type { DeviceState } from './fleet';

type Detail = Pick<
  BrushLiveFrame,
  | 'pressure'
  | 'pressureValue'
  | 'temperatureC'
  | 'strip'
  | 'excessS'
  | 'force'
  | 'angleDeg'
  | 'face'
>;

const HIDDEN: Detail = {
  pressure: null,
  pressureValue: null,
  temperatureC: null,
  strip: [],
  excessS: 0,
  force: null,
  angleDeg: null,
  face: null,
};

function detailOf(state: DeviceState): Detail {
  const { runtime } = state;
  const trace = runtime.machine.pressureTrace;
  const brush = runtime.state;
  return {
    pressure: runtime.pressureShown,
    pressureValue: brush.pressureValue,
    temperatureC: brush.temperatureC,
    strip: [...trace.strip],
    excessS: trace.excessS,
    force: brush.force,
    angleDeg: brush.angleDeg,
    face: brush.face,
  };
}

export function liveFrameOf(
  state: DeviceState,
  at: string,
  detailVisible: boolean,
): BrushLiveFrame {
  const { runtime } = state;
  const brush = runtime.state;
  const live = runtime.session === 'running' || runtime.session === 'paused';
  return {
    at,
    activity: brush.activity,
    session: runtime.session,
    link: state.link.phase,
    mode: brush.mode,
    intensity: brush.intensity,
    elapsedS: live ? brush.elapsedS : 0,
    routineS: brush.routineS,
    zone: live ? brush.zone : null,
    battery: brush.battery,
    detailVisible,
    zoneSource: runtime.profile.zoneSource,
    zoneSeconds: live ? [...brush.zoneSeconds] : [],
    sectorS: live ? brush.sectorS : null,
    liveSource: brush.liveSource,
    ...(detailVisible ? detailOf(state) : HIDDEN),
  };
}

export function noticeOf(device: Pick<DeviceRow, 'id'>, frame: BrushLiveFrame): BrushLiveNotice {
  return { type: 'toothbrush_live', deviceId: device.id, frame };
}
