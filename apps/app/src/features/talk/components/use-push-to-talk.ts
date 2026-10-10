import type { TalkFloor, TalkSpeaker } from '@smarteverything/domain';
import { selectionTick } from '../../../platform/haptics';
import { useLocalPref } from '../../../store/local-prefs';
import { useFloor, useOwnMembership } from '../data/talk-data';
import { talkEngine } from '../engine/engine';
import { useTalkEngine, type TalkEngineState } from '../engine/engine-state';

export type PushState =
  | 'off'
  | 'unavailable'
  | 'not_member'
  | 'ready'
  | 'requesting'
  | 'talking'
  | 'busy'
  | 'receiving'
  | 'live';

export interface PushToTalk {
  readonly state: PushState;
  readonly mode: 'hold' | 'tap';
  readonly speaker: TalkSpeaker | null;
  readonly liveLabel: string | null;
  readonly startedAt: number | null;
  readonly limitSeconds: number | null;
  readonly level: number;
  readonly problem: string | null;
  readonly onPressIn: () => void;
  readonly onPressOut: () => void;
  readonly onPress: () => void;
}

interface Inputs {
  readonly enabled: boolean;
  readonly member: boolean;
  readonly link: string;
  readonly mine: 'idle' | 'requesting' | 'talking';
  readonly floorOwnedByOther: boolean;
  readonly hearingHere: boolean;
  readonly liveHere: boolean;
}

function stateOf(input: Inputs): PushState {
  if (!input.enabled) {
    return 'off';
  }
  if (input.link !== 'ready') {
    return 'unavailable';
  }
  if (!input.member) {
    return 'not_member';
  }
  if (input.liveHere) {
    return 'live';
  }
  if (input.mine !== 'idle') {
    return input.mine;
  }
  if (input.hearingHere) {
    return 'receiving';
  }
  return input.floorOwnedByOther ? 'busy' : 'ready';
}

const NOTHING = (): void => undefined;

function handlersOf(
  mode: 'hold' | 'tap',
  state: PushState,
  channelId: string,
): Pick<PushToTalk, 'onPressIn' | 'onPressOut' | 'onPress'> {
  const start = (): void => {
    selectionTick();
    talkEngine.press(channelId);
  };
  const stop = (): void => {
    talkEngine.release();
  };
  const active = state === 'talking' || state === 'requesting';
  if (mode === 'tap') {
    return { onPressIn: NOTHING, onPressOut: NOTHING, onPress: active ? stop : start };
  }
  return {
    onPressIn: state === 'ready' ? start : NOTHING,
    onPressOut: active ? stop : NOTHING,
    onPress: NOTHING,
  };
}

function speakerOf(
  engine: TalkEngineState,
  channelId: string,
  floor: TalkFloor | null,
): TalkSpeaker | null {
  if (engine.receive?.channelId === channelId) {
    return engine.receive.speaker;
  }
  return floor?.speaker ?? null;
}

export function usePushToTalk(channelId: string): PushToTalk {
  const engine = useTalkEngine();
  const enabled = useLocalPref('talkEnabled');
  const mode = useLocalPref('talkMode');
  const member = useOwnMembership(channelId) !== null;
  const floor = useFloor(channelId);
  const transmit = engine.transmit;
  const mine = transmit.channelId === channelId && transmit.cameraId === null;
  const state = stateOf({
    enabled,
    member,
    link: engine.link,
    mine: mine ? transmit.status : 'idle',
    floorOwnedByOther: floor !== null && floor.messageId !== transmit.messageId,
    hearingHere: engine.receive?.channelId === channelId,
    liveHere: engine.live !== null,
  });
  return {
    state,
    mode,
    speaker: speakerOf(engine, channelId, floor),
    liveLabel: engine.live?.label ?? null,
    startedAt: mine ? transmit.startedAt : null,
    limitSeconds: mine ? transmit.limitSeconds : null,
    level: mine ? engine.level : 0,
    problem: engine.problem,
    ...handlersOf(mode, state, channelId),
  };
}
