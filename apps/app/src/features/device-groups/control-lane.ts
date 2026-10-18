import type { JsonValue } from '@smarteverything/domain';
import { trailingThrottle } from './master-throttle';
import { background } from '@smarteverything/logging';

interface Sent {
  readonly value: JsonValue;
  readonly revision: number;
}

export function controlLane(
  submit: (value: JsonValue) => Promise<boolean>,
  settled: (latest: boolean) => void,
): (value: JsonValue) => Promise<boolean> {
  let revision = 0;
  let waiting: ((sent: boolean) => void) | null = null;
  const throttle = trailingThrottle<Sent>((next) => {
    const done = waiting;
    waiting = null;
    background(
      submit(next.value).then((sent) => {
        done?.(sent);
        settled(revision === next.revision);
      }),
      'control_lane.submit_failed',
    );
  });
  return (value) => {
    waiting?.(false);
    return new Promise((resolve) => {
      waiting = resolve;
      revision += 1;
      throttle.push({ value, revision });
    });
  };
}
