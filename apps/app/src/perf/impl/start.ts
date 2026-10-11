import { Keyboard } from 'react-native';
import { WINDOW_MS } from './config';
import { watchCommits } from './fibers';
import { makeFlush } from './flush';
import { startFrames } from './frames';
import { patchGlobals } from './globals';
import { Probe } from './probe';
import type { DeveloperFlags } from '../../developer/toggles';
import type { PerfSink } from '../sink';

const KEYBOARD_EVENTS = [
  'keyboardWillShow',
  'keyboardWillHide',
  'keyboardDidShow',
  'keyboardDidHide',
] as const;

export function startProbe(flags: DeveloperFlags): PerfSink {
  const probe = new Probe();
  if (flags['perf.renders']) {
    probe.fibers = watchCommits((report) => {
      probe.fibers = report.timed ? 2 : 1;
      probe.fiberCommit(report);
    })
      ? 1
      : 0;
  }
  if (flags['perf.stalls']) {
    startFrames({
      frame: (gap, start, end) => {
        probe.frame(gap, start, end);
      },
    });
    KEYBOARD_EVENTS.forEach((name) => {
      Keyboard.addListener(name, () => {
        probe.action('kb', name.replace('keyboard', ''));
      });
    });
  }
  if (flags['perf.network']) {
    patchGlobals({
      json: (ms, size) => {
        probe.json(ms, size);
      },
      net: (path, ms) => {
        probe.net(path, ms);
      },
    });
  }
  setInterval(makeFlush(probe, flags['perf.upload']), WINDOW_MS);
  return probe;
}
