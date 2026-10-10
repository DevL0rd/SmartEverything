import { Keyboard } from 'react-native';
import { WINDOW_MS } from './config';
import { watchCommits } from './fibers';
import { makeFlush } from './flush';
import { startFrames } from './frames';
import { patchGlobals } from './globals';
import { Probe } from './probe';
import type { PerfSink } from '../sink';

const KEYBOARD_EVENTS = [
  'keyboardWillShow',
  'keyboardWillHide',
  'keyboardDidShow',
  'keyboardDidHide',
] as const;

export function startProbe(): PerfSink {
  const probe = new Probe();
  probe.fibers = watchCommits((report) => {
    probe.fibers = report.timed ? 2 : 1;
    probe.fiberCommit(report);
  })
    ? 1
    : 0;
  startFrames({
    frame: (gap, start, end) => {
      probe.frame(gap, start, end);
    },
  });
  patchGlobals({
    json: (ms, size) => {
      probe.json(ms, size);
    },
    net: (path, ms) => {
      probe.net(path, ms);
    },
  });
  KEYBOARD_EVENTS.forEach((name) => {
    Keyboard.addListener(name, () => {
      probe.action('kb', name.replace('keyboard', ''));
    });
  });
  setInterval(makeFlush(probe), WINDOW_MS);
  return probe;
}
