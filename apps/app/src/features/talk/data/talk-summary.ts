import { plural } from '../../../format/text';
import { useLocalPref } from '../../../store/local-prefs';
import { useTalkEngine } from '../engine/engine-state';
import { useFloors, useMyChannels } from './talk-data';

export function useTalkSummary(): string {
  const enabled = useLocalPref('talkEnabled');
  const engine = useTalkEngine();
  const floor = useFloors()[0];
  const channels = useMyChannels().length;
  if (floor !== undefined) {
    return `${floor.speaker.label} is talking`;
  }
  if (!enabled) {
    return 'Off on this device';
  }
  if (engine.link !== 'ready') {
    return engine.problem ?? 'Connecting…';
  }
  return channels === 0 ? 'No channels yet' : plural(channels, 'channel');
}
