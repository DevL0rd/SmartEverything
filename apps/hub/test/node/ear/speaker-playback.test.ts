import { describe, expect, it } from 'vitest';
import { SPEAKER_TOOLS, SpeakerPlayback } from '../../../src/node/controls/linux/speaker-playback';
import { settle } from '../controls/support';
import { until } from '../../support/wait';
import { FakeChild } from './recorder-fakes';

const installed =
  (...programs: string[]) =>
  (program: string): Promise<boolean> =>
    Promise.resolve(programs.includes(program));

function rig(programs: string[]): {
  playback: SpeakerPlayback;
  child: FakeChild;
  spawned: string[];
  written: Buffer[];
} {
  const child = new FakeChild();
  const spawned: string[] = [];
  const written: Buffer[] = [];
  child.stdin.on('data', (data: Buffer) => {
    written.push(data);
  });
  const playback = new SpeakerPlayback({
    probe: installed(...programs),
    spawnPlayer: (program): FakeChild => {
      spawned.push(program);
      return child;
    },
  });
  return { playback, child, spawned, written };
}

describe('speaker playback', () => {
  it('plays 48 kHz mono s16 raw through pw-play, falling back to paplay', async () => {
    const first = rig(['pw-play', 'paplay']);
    await first.playback.open();
    const second = rig(['paplay']);
    await second.playback.open();
    expect([first.spawned, second.spawned]).toEqual([['pw-play'], ['paplay']]);
    expect(SPEAKER_TOOLS[0]?.args).toEqual(expect.arrayContaining(['--raw', '--rate', '48000']));
  });

  it('refuses to open when no player is installed', async () => {
    await expect(rig([]).playback.open()).rejects.toThrow(/pw-play or paplay/);
  });

  it('writes the samples as little-endian bytes and ends the stream to let it drain', async () => {
    const { playback, child, written } = rig(['pw-play']);
    const speaker = await playback.open();
    speaker.write(Int16Array.from([1, -2, 3]));
    await settle();
    expect([...Buffer.concat(written)]).toEqual([1, 0, 254, 255, 3, 0]);
    let closed = false;
    child.stdin.on('end', () => {
      closed = true;
    });
    speaker.end();
    await until(() => closed, 'the player input to close');
    expect(closed).toBe(true);
  });

  it('drops writes once the player has exited', async () => {
    const { playback, child, written } = rig(['pw-play']);
    const speaker = await playback.open();
    child.exit(0);
    speaker.write(Int16Array.from([5]));
    await settle();
    expect(written).toEqual([]);
  });
});
