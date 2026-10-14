import { Keyboard } from 'react-native';
import { WINDOW_MS } from './config';
import { watchCommits } from './fibers';
import { makeFlush } from './flush';
import { startFrames } from './frames';
import { patchGlobals } from './globals';
import { Probe } from './probe';
import type { DeveloperFlags } from '../../developer/toggles';
import type { ProbeSession } from '../runtime';

const KEYBOARD_EVENTS = [
  'keyboardWillShow',
  'keyboardWillHide',
  'keyboardDidShow',
  'keyboardDidHide',
] as const;

function trackRenders(probe: Probe, stops: (() => void)[]): boolean {
  const stop = watchCommits((report, collectionMs) => {
    probe.fiberCommit(report, collectionMs);
  });
  if (stop !== null) {
    stops.push(stop);
  }
  return stop !== null;
}

function trackStalls(probe: Probe, stops: (() => void)[], active: () => boolean): void {
  stops.push(
    startFrames({
      frame: (gap, start, end) => {
        probe.frame(gap, start, end);
      },
    }),
  );
  KEYBOARD_EVENTS.forEach((name) => {
    const subscription = Keyboard.addListener(name, () => {
      if (active()) {
        probe.action('kb', name.replace('keyboard', ''));
      }
    });
    stops.push(() => {
      subscription.remove();
    });
  });
}

function trackNetwork(probe: Probe): () => void {
  return patchGlobals({
    json: (ms, size) => {
      probe.json(ms, size);
    },
    net: (path, ms) => {
      probe.net(path, ms);
    },
  });
}

function disposeAll(stops: readonly (() => void)[]): void {
  const errors: unknown[] = [];
  [...stops].reverse().forEach((dispose) => {
    try {
      dispose();
    } catch (error: unknown) {
      errors.push(error);
    }
  });
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Performance collector cleanup failed');
  }
}

export function startProbe(flags: DeveloperFlags): ProbeSession {
  const probe = new Probe();
  const stops: (() => void)[] = [
    (): void => {
      probe.stop();
    },
  ];
  let active = true;
  const stop = (): void => {
    if (!active) {
      return;
    }
    active = false;
    disposeAll(stops);
  };
  try {
    if (flags['perf.renders']) {
      probe.fibers = trackRenders(probe, stops) ? 1 : 0;
    }
    if (flags['perf.stalls']) {
      trackStalls(probe, stops, (): boolean => active);
    }
    if (flags['perf.network']) {
      stops.push(trackNetwork(probe));
    }
    const flush = makeFlush(probe, flags['perf.upload']);
    const timer = setInterval(() => {
      if (active) {
        flush();
      }
    }, WINDOW_MS);
    stops.push(() => {
      clearInterval(timer);
    });
    return { sink: probe, stop };
  } catch (error: unknown) {
    stop();
    throw error;
  }
}
