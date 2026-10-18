import { describe, expect, it } from 'vitest';
import { DiscordMic, discordHoldsMic } from '../../../src/node/controls/linux/discord-mic';
import { parseStreams, type PulseStream } from '../../../src/node/controls/linux/pulse-parse';
import { fakeLines, installed, settle, type FakeLines } from '../controls/support';
import { stream } from '../controls/pulse-fixtures';

function outputs(...streams: Record<string, string>[]): string {
  return JSON.stringify(streams.map((properties, index) => stream(index + 1, 1, properties)));
}

const DISCORD_ELECTRON = {
  'application.name': 'WEBRTC VoiceEngine',
  'application.process.binary': 'Discord',
};
const BROWSER_CALL = {
  'application.name': 'WEBRTC VoiceEngine',
  'application.process.binary': 'chrome',
};
const OWN_RECORDER = { 'application.name': 'pw-record', 'node.name': 'pw-record' };

interface Rig {
  readonly lines: FakeLines;
  readonly changes: boolean[];
  readonly failures: unknown[];
  readonly stop: () => void;
  readonly set: (text: string) => void;
}

describe('discord microphone', () => {
  it('recognises the Discord client through its binary even when it calls itself WebRTC', () => {
    const parse = (text: string): readonly PulseStream[] => parseStreams(text, 'source outputs');
    expect(discordHoldsMic(parse(outputs(DISCORD_ELECTRON)))).toBe(true);
    expect(discordHoldsMic(parse(outputs({ 'application.name': 'Vesktop' })))).toBe(true);
    expect(discordHoldsMic(parse(outputs(BROWSER_CALL, OWN_RECORDER)))).toBe(false);
    expect(discordHoldsMic(parse(outputs()))).toBe(false);
  });

  function rig(first: string): Rig {
    let current = first;
    const lines = fakeLines();
    const failures: unknown[] = [];
    const mic = new DiscordMic({
      run: (): Promise<string> => Promise.resolve(current),
      probe: installed('pactl'),
      lines: lines.subscriber,
      failed: (cause: unknown): void => {
        failures.push(cause);
      },
    });
    const changes: boolean[] = [];
    const stop = mic.watch((held) => {
      changes.push(held);
    });
    return {
      lines,
      changes,
      failures,
      stop,
      set: (text: string): void => {
        current = text;
      },
    };
  }

  it('reports the first reading and then only real changes, driven by pactl events', async () => {
    const bench = rig(outputs(OWN_RECORDER));
    await settle();
    expect(bench.changes).toEqual([false]);
    bench.set(outputs(OWN_RECORDER, DISCORD_ELECTRON));
    bench.lines.emit("Event 'new' on source-output #7");
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(bench.changes).toEqual([false, true]);
    bench.lines.emit("Event 'change' on source-output #7");
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(bench.changes).toEqual([false, true]);
    bench.set(outputs(OWN_RECORDER));
    bench.lines.emit("Event 'remove' on source-output #7");
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(bench.changes).toEqual([false, true, false]);
  });

  it('ignores events about other pulse objects and stops listening when asked', async () => {
    const bench = rig(outputs());
    await settle();
    bench.set(outputs(DISCORD_ELECTRON));
    bench.lines.emit("Event 'new' on sink-input #3");
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(bench.changes).toEqual([false]);
    bench.stop();
    expect(bench.lines.stopped).toHaveLength(1);
  });

  it('hands a failed read to the failure handler', async () => {
    const lines = fakeLines();
    const failures: unknown[] = [];
    new DiscordMic({
      run: (): Promise<string> => Promise.resolve('not json'),
      probe: installed('pactl'),
      lines: lines.subscriber,
      failed: (cause: unknown): void => {
        failures.push(cause);
      },
    }).watch(() => undefined);
    await settle();
    expect(failures).toHaveLength(1);
  });
});
