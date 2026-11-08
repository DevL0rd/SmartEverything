import { Session } from 'node:inspector';
import { z } from 'zod';

const PAUSED = z.object({
  callFrames: z.array(
    z.object({
      functionName: z.string(),
      url: z.string(),
      location: z.object({ lineNumber: z.number() }),
    }),
  ),
});

const FRAME_LIMIT = 8;
const NO_FRAMES =
  'no JavaScript frame was reachable: the main thread is inside native code or wasm that does not yield';

function describe(frame: z.output<typeof PAUSED>['callFrames'][number]): string {
  const name = frame.functionName === '' ? '(anonymous)' : frame.functionName;
  return `${name} ${frame.url}:${String(frame.location.lineNumber + 1)}`;
}

export function captureMainStack(waitMs: number): Promise<readonly string[]> {
  return new Promise((resolve) => {
    const session = new Session();
    session.connectToMainThread();
    let settled = false;
    const finish = (frames: readonly string[]): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      session.post('Debugger.resume', () => {
        session.post('Debugger.disable', () => {
          session.disconnect();
          resolve(frames);
        });
      });
    };
    const timer = setTimeout(() => {
      finish([NO_FRAMES]);
    }, waitMs);
    session.on('Debugger.paused', (message) => {
      const paused = PAUSED.safeParse(message.params);
      finish(paused.success ? paused.data.callFrames.slice(0, FRAME_LIMIT).map(describe) : []);
    });
    session.post('Debugger.enable', () => {
      session.post('Debugger.pause');
    });
  });
}
