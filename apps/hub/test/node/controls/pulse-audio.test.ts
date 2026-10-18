import type { AudioState } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PulseAudio } from '../../../src/node/controls/linux/pulse-audio';
import { pulseCommands } from '../../../src/node/controls/linux/pulse-commands';
import {
  buildAudioState,
  parseDevices,
  parseInfo,
  parseStreams,
} from '../../../src/node/controls/linux/pulse-parse';
import {
  INFO,
  PACTL_ANSWERS,
  SINK_INPUTS,
  SINKS,
  SOURCE_OUTPUTS,
  SOURCES,
  stream,
} from './pulse-fixtures';
import { fakeLines, installed, recorder, settle } from './support';

const SNAPSHOT = {
  info: parseInfo(INFO),
  sinks: parseDevices(SINKS, 'sinks'),
  sources: parseDevices(SOURCES, 'sources'),
  sinkInputs: parseStreams(SINK_INPUTS, 'sink inputs'),
  sourceOutputs: parseStreams(SOURCE_OUTPUTS, 'source outputs'),
};

describe('audio state from pactl JSON', () => {
  const state = buildAudioState(SNAPSHOT);

  it('lists outputs with the default marked, kind guessed and unplugged ports flagged', () => {
    expect(
      state.outputs.map((output) => [output.id, output.kind, output.isDefault, output.available]),
    ).toEqual([
      ['speakers', 'speakers', true, true],
      ['headset', 'headset', false, true],
      ['hdmi', 'hdmi', false, false],
    ]);
    expect(state.outputs[1]).toMatchObject({ volume: 25, muted: true, name: 'Arctis Nova 7' });
  });

  it('hides monitor sources and names who records from a microphone', () => {
    expect(state.inputs).toHaveLength(1);
    expect(state.inputs[0]).toMatchObject({ id: 'mic', kind: 'microphone', usedBy: ['Discord'] });
  });

  it('groups streams by app, takes the loudest volume and skips unconnected streams', () => {
    expect(state.apps).toEqual([
      {
        streamId: 'firefox',
        app: 'firefox',
        icon: null,
        volume: 70,
        muted: true,
        outputId: 'headset',
      },
      {
        streamId: 'Spotify',
        app: 'Spotify',
        icon: 'spotify',
        volume: 90,
        muted: false,
        outputId: 'speakers',
      },
    ]);
  });

  it('keeps apps in name order when streams are re-created with new indexes', () => {
    const reversed = buildAudioState({ ...SNAPSHOT, sinkInputs: SNAPSHOT.sinkInputs.toReversed() });
    expect(reversed.apps).toEqual(state.apps);
  });

  it('reports who plays to each output', () => {
    expect(state.outputs[0]?.usedBy).toEqual(['Spotify']);
  });

  it('refuses output it cannot read, naming what failed', () => {
    expect(() => parseInfo('not json')).toThrow(/pactl returned server info that is not JSON/);
    expect(() => parseDevices('{}', 'sinks')).toThrow(/sinks in a shape we do not know/);
  });
});

describe('audio changes become pactl commands', () => {
  it('sets the default device volume and mutes a named microphone', () => {
    expect(pulseCommands({ action: 'volume', level: 42.4, kind: 'output' }, SNAPSHOT)).toEqual([
      ['set-sink-volume', '@DEFAULT_SINK@', '42%'],
    ]);
    expect(
      pulseCommands(
        { action: 'mute', muted: true, kind: 'input', device: 'headset microphone' },
        SNAPSHOT,
      ),
    ).toEqual([['set-source-mute', 'mic', '1']]);
  });

  it('switches the default output by description', () => {
    expect(
      pulseCommands({ action: 'default', kind: 'output', device: 'arctis nova 7' }, SNAPSHOT),
    ).toEqual([['set-default-sink', 'headset']]);
  });

  it('applies app volume, mute and output to every stream of the app', () => {
    expect(pulseCommands({ action: 'app_volume', app: 'spotify', level: 30 }, SNAPSHOT)).toEqual([
      ['set-sink-input-volume', '100', '30%'],
      ['set-sink-input-volume', '101', '30%'],
    ]);
    expect(pulseCommands({ action: 'app_mute', app: 'Spotify', muted: true }, SNAPSHOT)).toEqual([
      ['set-sink-input-mute', '100', '1'],
      ['set-sink-input-mute', '101', '1'],
    ]);
    expect(
      pulseCommands({ action: 'app_output', app: 'Spotify', output: 'headset' }, SNAPSHOT),
    ).toEqual([
      ['move-sink-input', '100', 'headset'],
      ['move-sink-input', '101', 'headset'],
    ]);
  });

  it('names what it could not find', () => {
    expect(() =>
      pulseCommands({ action: 'default', kind: 'output', device: 'nope' }, SNAPSHOT),
    ).toThrow('No output device matches "nope".');
    expect(() =>
      pulseCommands({ action: 'app_mute', app: 'Ghost', muted: true }, SNAPSHOT),
    ).toThrow('No app named "Ghost" is playing sound.');
  });
});

describe('PulseAudio', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function audio(programs: string[] = ['pactl']): {
    audio: PulseAudio;
    system: ReturnType<typeof recorder>;
    lines: ReturnType<typeof fakeLines>;
    failures: unknown[];
  } {
    const system = recorder({ ...PACTL_ANSWERS, 'pactl set-': '' });
    const lines = fakeLines();
    const failures: unknown[] = [];
    return {
      audio: new PulseAudio({
        run: system.run,
        probe: installed(...programs),
        lines: lines.subscriber,
        failed: (cause): void => {
          failures.push(cause);
        },
      }),
      system,
      lines,
      failures,
    };
  }

  it('is unsupported without pactl, with no feature and a plain explanation', async () => {
    const { audio: missing } = audio([]);
    await expect(missing.features()).resolves.toEqual([]);
    await expect(missing.read()).rejects.toMatchObject({
      code: 'not_supported',
      message: "Sound control isn't available on this computer yet.",
    });
  });

  it('offers the audio features when pactl exists', async () => {
    await expect(audio().audio.features()).resolves.toEqual(['audio', 'audio_apps', 'microphone']);
  });

  it('applies a change and answers with the state read afterwards', async () => {
    const { audio: control, system } = audio();
    const state = await control.change({ action: 'mute', muted: true, kind: 'output' });
    expect(system.calls).toContain('pactl set-sink-mute @DEFAULT_SINK@ 1');
    expect(state.outputs).toHaveLength(3);
  });

  it('listens to pactl subscribe only while watched and reads just the facility that changed', async () => {
    const { audio: control, system, lines } = audio();
    const seen: AudioState[] = [];
    const stop = control.watch((state) => seen.push(state));
    await vi.advanceTimersByTimeAsync(0);
    expect(lines.started).toHaveLength(1);
    expect(lines.started[0]).toMatchObject({ program: 'pactl', args: ['subscribe'] });
    expect(seen).toHaveLength(1);
    system.calls.length = 0;
    lines.emit("Event 'change' on sink-input #100");
    lines.emit("Event 'change' on sink-input #101");
    await vi.advanceTimersByTimeAsync(60);
    expect(system.calls).toEqual(['pactl -f json list sink-inputs']);
    expect(seen).toHaveLength(1);
    stop();
    expect(lines.stopped).toHaveLength(1);
    lines.emit("Event 'change' on sink #1");
    await vi.advanceTimersByTimeAsync(60);
    expect(system.calls).toHaveLength(1);
  });

  it('delivers a new state when a stream appears and none when nothing changed', async () => {
    let inputs = SINK_INPUTS;
    const lines = fakeLines();
    const control = new PulseAudio({
      run: recorder({ ...PACTL_ANSWERS, 'pactl -f json list sink-inputs': () => inputs }).run,
      probe: installed('pactl'),
      lines: lines.subscriber,
      failed: (): undefined => undefined,
    });
    const seen: AudioState[] = [];
    control.watch((state) => seen.push(state));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen[0]?.apps).toHaveLength(2);
    lines.emit("Event 'change' on sink-input #100");
    await vi.advanceTimersByTimeAsync(60);
    expect(seen).toHaveLength(1);
    inputs = JSON.stringify([
      ...parseStreams(SINK_INPUTS, 'x'),
      stream(300, 1, { 'application.name': 'Chrome' }),
    ]);
    lines.emit("Event 'new' on sink-input #300");
    await vi.advanceTimersByTimeAsync(60);
    expect(seen).toHaveLength(2);
    expect(seen[1]?.apps.map((app) => app.app)).toEqual(['Chrome', 'firefox', 'Spotify']);
  });

  it('master watchers only read the default sink facilities', async () => {
    const { audio: control, system, lines } = audio();
    const readings: unknown[] = [];
    control.watchMaster((reading) => readings.push(reading));
    await vi.advanceTimersByTimeAsync(0);
    expect(readings).toEqual([{ volume: 40, muted: false }]);
    system.calls.length = 0;
    lines.emit("Event 'change' on source-output #200");
    lines.emit("Event 'change' on sink #1");
    await vi.advanceTimersByTimeAsync(60);
    expect(system.calls).toEqual(['pactl -f json list sinks']);
    expect(readings).toHaveLength(1);
  });

  it('reports a failed read through the failure callback and keeps listening', async () => {
    const lines = fakeLines();
    const failures: unknown[] = [];
    const control = new PulseAudio({
      run: recorder({}).run,
      probe: installed('pactl'),
      lines: lines.subscriber,
      failed: (cause): void => {
        failures.push(cause);
      },
    });
    control.watch(() => undefined);
    await settle();
    expect(failures).toHaveLength(1);
    expect(lines.stopped).toHaveLength(0);
  });
});
