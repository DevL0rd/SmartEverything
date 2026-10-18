import { describe, expect, it } from 'vitest';
import { FrameTally } from './frame-probe';
import { gcFields } from './gc-probe';
import { inboundVideo, mediaFields } from './media-probe';
import { nativeFields, topThreads, type NativeSnapshot } from './native-probe';
import { AliveTimers } from './timer-probe';
import { countTree, ListenerTable } from './leak-probe';
import { keyLabel, textBytes } from './storage-probe';
import { pathLabel } from './wire-probe';
import { topRequires } from './startup-probe';

describe('frame tally', () => {
  it('derives JavaScript responsiveness and long tasks from timer lateness, UI frames from native counts', () => {
    const tally = new FrameTally();
    [1, 2, 20, 40, 150].forEach((late) => {
      tally.tick(late);
    });
    tally.tick(80);
    tally.tick(120);
    tally.commit(4);
    const fields = tally.fields(1000, {
      frames: 100,
      slow16: 2,
      slow33: 1,
      slow100: 0,
      worstMs: 40,
    });
    expect(fields).toMatchObject({
      fps: 13,
      slow16: 5,
      slow33: 4,
      slow100: 2,
      worstMs: 150,
      jsJankPct: 57.1,
      longTaskMs: 150,
      ltN: 3,
      ltMs: 350,
      commits: 1,
      uiFrames: 100,
      uiFps: 100,
      uiJankPct: 2,
      uiWorstMs: 40,
    });
    tally.clear();
    expect(tally.fields(1000, null)).toMatchObject({ fps: 0, ltN: 0, commits: 0 });
  });

  it('reports a resting JavaScript thread as full rate and an idle UI thread as zero frames', () => {
    const tally = new FrameTally();
    [0, 1, 0, 2].forEach((late) => {
      tally.tick(late);
    });
    const idle = { frames: 0, slow16: 0, slow33: 0, slow100: 0, worstMs: 0 };
    const fields = tally.fields(5000, idle);
    expect(fields).toMatchObject({ fps: 57, slow16: 0, uiFrames: 0, uiFps: 0, uiJankPct: 0 });
  });

  it('leaves UI fields out when the app build has no native frame statistics', () => {
    expect(new FrameTally().fields(1000, null)['uiFrames']).toBeUndefined();
  });
});

describe('gc fields', () => {
  it('scales Hermes bytes to megabytes and seconds to milliseconds', () => {
    const fields = gcFields(
      { js_heapSize: 104857600, js_externalBytes: 1048576 },
      { js_numGCs: 3, js_gcTime: 0.025, js_totalAllocatedBytes: 5242880 },
    );
    expect(fields).toEqual({ heapMb: 100, extMb: 1, gcN: 3, gcMs: 25, allocMb: 5 });
  });
});

describe('timers alive', () => {
  it('counts alive timers and intervals left running by another screen', () => {
    const timers = new AliveTimers();
    timers.open(1, 'interval', 'home');
    timers.open(2, 'interval', 'devices');
    timers.open(3, 'timeout', 'devices');
    timers.open(4, 'frame', 'devices');
    timers.done(4);
    expect(timers.fields(1000, 'devices')).toMatchObject({
      tAlive: 1,
      iAlive: 2,
      iLeft: 1,
      tNewPerS: 1,
      rafPerS: 1,
    });
    expect(timers.intervalsByScreen()).toBe('home:1,devices:1');
    timers.done(1);
    expect(timers.fields(1000, 'devices')).toMatchObject({ iAlive: 1, iLeft: 0, tNewPerS: 0 });
  });
});

describe('leaks', () => {
  it('counts listeners per event and those left by other screens, closing each once', () => {
    const table = new ListenerTable();
    const close = table.open('keyboardDidShow', 'chat');
    table.open('appStateDidChange', 'home');
    expect(table.total()).toBe(2);
    expect(table.left('home')).toBe(1);
    close();
    close();
    expect(table.total()).toBe(1);
    expect(table.topEvents()).toBe('appStateDidChange:1');
  });

  it('counts fibers and host views of a tree', () => {
    const tree = { tag: 3, child: { tag: 0, sibling: { tag: 5, child: { tag: 6 } } } };
    expect(countTree(tree)).toEqual({ fibers: 4, host: 2 });
  });
});

describe('media fields', () => {
  it('sums inbound video and computes rates', () => {
    const report = new Map<string, unknown>([
      [
        'a',
        {
          type: 'inbound-rtp',
          kind: 'video',
          framesDecoded: 50,
          framesReceived: 52,
          framesDropped: 2,
          totalDecodeTime: 0.25,
          bytesReceived: 125000,
          freezeCount: 1,
          totalFreezesDuration: 0.5,
        },
      ],
      ['b', { type: 'inbound-rtp', kind: 'audio', bytesReceived: 9999 }],
    ]);
    const inbound = inboundVideo(report);
    expect(inbound.bytesReceived).toBe(125000);
    expect(mediaFields(inbound, 1, 5000)).toEqual({
      camPeers: 1,
      camFps: 10,
      camDropPct: 3.8,
      camDecodeMs: 5,
      camFreezes: 1,
      camFreezeMs: 500,
      camKbps: 200,
    });
  });
});

function snapshot(uptimeMs: number, processTicks: number, js: number): NativeSnapshot {
  return {
    memory: { rssKb: 512000, pssKb: 409600, graphicsKb: 10240 },
    power: { thermal: 1, batteryUa: -350000, batteryTempC: 31.5 },
    threads: { mqt_v_js: js, RenderThread: 10, main: 5 },
    processTicks,
    ticksPerSecond: 100,
    uptimeMs,
    frames: { frames: 600, janky: 6, slow: 2, frozen: 0, worstMs: 48.2, totalMs: 4000 },
  };
}

describe('native fields', () => {
  it('turns two snapshots into memory, CPU and frame fields', () => {
    const fields = nativeFields(snapshot(10000, 300, 150), snapshot(5000, 100, 50));
    expect(fields).toMatchObject({
      rssMb: 500,
      pssMb: 400,
      gfxMb: 10,
      cpuPct: 40,
      jsCpu: 20,
      renderCpu: 0,
      nFrames: 600,
      nJankPct: 1,
      nWorstMs: 48,
      thermal: 1,
      battMa: -350,
    });
    expect(topThreads(snapshot(10000, 300, 150), snapshot(5000, 100, 50))).toBe('mqt_v_js:20');
  });
});

describe('labels', () => {
  it('normalises request paths', () => {
    expect(pathLabel('https://hub.local:8443/api/devices/12/values?x=1')).toBe(
      '/api/devices/:n/values',
    );
    expect(pathLabel('/api/chats/0f8fad5b-d9cb-469f-a165-70867728950e')).toBe('/api/chats/:id');
  });

  it('labels storage calls and measures their text', () => {
    expect(keyLabel('setItem', ['snapshot.tables.devices', 'x'])).toBe(
      'setItem:snapshot.tables.de',
    );
    expect(keyLabel('multiGet', [['a', 'b']])).toBe('multiGet:2 keys');
    expect(
      textBytes([
        ['a', 'bcd'],
        ['e', null],
      ]),
    ).toBe(5);
  });

  it('lists the slowest module requires first', () => {
    expect(
      topRequires(
        [
          ['a.js', 1],
          ['node_modules/zod/v4/index.js', 9],
        ],
        1,
      ),
    ).toBe('~zod/v4/index.js:9');
  });
});
