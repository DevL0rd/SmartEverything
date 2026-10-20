import { describe, expect, it, vi } from 'vitest';
import type { SpeakerStream } from '../../../src/node/controls/linux/speaker-playback';
import { CallSpeaker } from '../../../src/node/ear/call-speaker';
import { captureLogs, testLogger } from '../../support/logs';

const OPEN = {
  open: (): Promise<SpeakerStream> => Promise.resolve({ write: vi.fn(), end: vi.fn() }),
};

describe('call speaker loop lag', () => {
  it('logs the event loop lag of the call when the speaker closes', async () => {
    const logs = captureLogs();
    const speaker = new CallSpeaker(OPEN, testLogger('node-ear'));
    speaker.open();
    await new Promise((resolve) => setTimeout(resolve, 40));
    speaker.close();
    const record = logs.records.find((entry) => entry.event === 'computer_ear.spoke');
    expect(Object.keys(record?.payload ?? {}).sort()).toEqual(['loopLagMaxMs', 'loopLagP99Ms']);
  });

  it('logs nothing when no call was opened', () => {
    const logs = captureLogs();
    new CallSpeaker(OPEN, testLogger('node-ear')).close();
    expect(logs.events()).not.toContain('computer_ear.spoke');
  });
});
