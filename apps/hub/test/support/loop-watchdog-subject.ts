import { appendFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import { Logger, renderJson } from '@smarteverything/logging';
import { startLoopWatchdog } from '../../src/service/loop-watchdog/start';

const [mode, script, logPath] = argv.slice(2);

if (script === undefined || logPath === undefined) {
  throw new Error('The watchdog subject needs a mode, the worker script and a log path');
}

Logger.configure({
  level: 'info',
  context: { platform: 'server', release: '1' },
  sink: (record) => {
    appendFileSync(logPath, `${renderJson(record)}\n`);
  },
});

startLoopWatchdog({
  script,
  name: 'subject',
  logPath,
  release: '1',
  exitAfterMs: 3000,
  tickMs: 100,
  stackAfterMs: 500,
  log: new Logger('hub.subject'),
});

function blockForever(): void {
  for (;;) {
    Math.sqrt(Math.random());
  }
}

function blockBriefly(): void {
  const end = Date.now() + 1300;
  while (Date.now() < end) {
    Math.sqrt(Math.random());
  }
}

if (mode === 'spin') {
  setTimeout(blockForever, 300);
} else if (mode === 'pause') {
  setTimeout(blockBriefly, 300);
  setTimeout(() => {
    exit(0);
  }, 2500);
} else {
  setTimeout(() => {
    exit(0);
  }, 1200);
}
