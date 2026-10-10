import type { TalkChannelRow } from '@smarteverything/domain';
import type { TalkEngineState } from '../engine/engine-state';

export function engineStatus(state: TalkEngineState, channel: TalkChannelRow | undefined): string {
  const place = channel === undefined ? 'No channel yet' : channel.name;
  if (state.link === 'off') {
    return 'Off on this device';
  }
  if (state.link !== 'ready') {
    return state.problem ?? 'Connecting…';
  }
  if (state.live !== null) {
    return `${state.live.label} is talking · mic on`;
  }
  if (state.transmit.status === 'talking') {
    return `Talking · ${place}`;
  }
  if (state.receive !== null) {
    return `${state.receive.speaker.label} is talking`;
  }
  return `Ready · ${place}`;
}
