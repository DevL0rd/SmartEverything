import { describe, expect, it } from 'vitest';
import {
  MIC_TOOLS,
  MicCapture,
  type MicHandlers,
} from '../../../src/node/controls/linux/mic-capture';
import { NodeFailureError } from '../../../src/node/node-failure';
import { settle } from '../controls/support';
import { bytesOf, FakeChild } from './recorder-fakes';

const installed =
  (...programs: string[]) =>
  (program: string): Promise<boolean> =>
    Promise.resolve(programs.includes(program));

interface Rig {
  readonly capture: MicCapture;
  readonly spawned: { program: string; args: readonly string[] }[];
  readonly child: FakeChild;
  readonly chunks: Int16Array[];
  readonly ended: string[];
  readonly handlers: MicHandlers;
}

function rig(programs: string[]): Rig {
  const spawned: { program: string; args: readonly string[] }[] = [];
  const child = new FakeChild();
  const capture = new MicCapture({
    probe: installed(...programs),
    spawnRecorder: (program, args): FakeChild => {
      spawned.push({ program, args });
      return child;
    },
  });
  const chunks: Int16Array[] = [];
  const ended: string[] = [];
  const handlers: MicHandlers = {
    pcm: (chunk) => {
      chunks.push(chunk);
    },
    ended: (reason) => {
      ended.push(reason);
    },
  };
  return { capture, spawned, child, chunks, ended, handlers };
}

describe('microphone capture', () => {
  it('records 16 kHz mono signed 16-bit raw from pw-record when it is installed', async () => {
    const { capture, spawned, handlers } = rig(['pw-record', 'parec']);
    await capture.open(handlers);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.program).toBe('pw-record');
    expect(spawned[0]?.args).toEqual(expect.arrayContaining(['--raw', '--rate', '16000']));
    expect(spawned[0]?.args).toContain('s16');
  });

  it('follows the system default input and never pins a device or a monitor source', () => {
    for (const tool of MIC_TOOLS) {
      const pinned = tool.args.filter((arg) => /^(--target|--device|-d|--monitor)/.test(arg));
      expect(pinned, tool.program).toEqual([]);
    }
  });

  it('falls back to parec when pw-record is missing', async () => {
    const { capture, spawned, handlers } = rig(['parec']);
    await capture.open(handlers);
    expect(spawned[0]?.program).toBe('parec');
    expect(spawned[0]?.args).toEqual(MIC_TOOLS[1]?.args);
  });

  it('says what to install when neither tool exists', async () => {
    const { capture, spawned, handlers } = rig([]);
    await expect(capture.open(handlers)).rejects.toBeInstanceOf(NodeFailureError);
    await expect(capture.open(handlers)).rejects.toThrow(/pw-record or parec/);
    expect(spawned).toEqual([]);
  });

  it('delivers whole 100 ms chunks whatever the pipe splits the bytes into', async () => {
    const { capture, child, chunks, handlers } = rig(['pw-record']);
    await capture.open(handlers);
    const samples = Int16Array.from({ length: 3300 }, (_, index) => index % 1000);
    const bytes = bytesOf(samples);
    child.stdout.write(bytes.subarray(0, 1001));
    child.stdout.write(bytes.subarray(1001, 4000));
    child.stdout.write(bytes.subarray(4000));
    await settle();
    expect(chunks.map((chunk) => chunk.length)).toEqual([1600, 1600]);
    expect([...(chunks[0] ?? [])]).toEqual([...samples.subarray(0, 1600)]);
    expect([...(chunks[1] ?? [])]).toEqual([...samples.subarray(1600, 3200)]);
  });

  it('stops by signalling the recorder and reports nothing afterwards', async () => {
    const { capture, child, chunks, ended, handlers } = rig(['pw-record']);
    const stop = await capture.open(handlers);
    stop();
    child.exit(null, 'SIGTERM');
    child.stdout.write(bytesOf(new Int16Array(1600)));
    await settle();
    expect(child.killed).toEqual(['SIGTERM']);
    expect(ended).toEqual([]);
    expect(chunks).toEqual([]);
  });

  it('reports an unexpected exit once with the recorder message', async () => {
    const { capture, child, ended, handlers } = rig(['pw-record']);
    await capture.open(handlers);
    child.stderr.write('connection refused');
    await settle();
    child.exit(1);
    child.exit(1);
    expect(ended).toEqual(['pw-record exited (1) connection refused']);
  });

  it('reports a recorder that cannot start', async () => {
    const { capture, child, ended, handlers } = rig(['pw-record']);
    await capture.open(handlers);
    child.fail('spawn pw-record ENOENT');
    expect(ended).toEqual(['pw-record could not start: spawn pw-record ENOENT']);
  });
});
