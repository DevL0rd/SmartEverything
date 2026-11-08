import type { DeviceFamily } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { LogTally } from '../../design/log-tally';

const log = new Logger('app.device-visuals');

let mounted = 0;

const tally = new LogTally(log, 'visual.summarised', 10_000, () => ({ mountedModels: mounted }));

export function tallyFrame(family: DeviceFamily): RefObject<View | null> {
  let node: View | null = null;
  return {
    get current(): View | null {
      return node;
    },
    set current(next: View | null) {
      if ((node === null) !== (next === null)) {
        mounted += next === null ? -1 : 1;
        tally.bump(`model_${next === null ? 'unmounted' : 'mounted'}_${family}`);
      }
      node = next;
    },
  };
}
