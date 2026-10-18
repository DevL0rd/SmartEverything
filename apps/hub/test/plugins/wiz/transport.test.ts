import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WizProtocolError, type WizFrame } from '../../../src/plugins/builtin/wiz/protocol';
import { WizTransport } from '../../../src/plugins/builtin/wiz/transport';
import { FakeBulb, FakeNetwork } from './fake-wiz';

let bulb: FakeBulb;
let network: FakeNetwork;
let transport: WizTransport;
let heard: { frame: WizFrame; address: string }[];

beforeEach(async () => {
  bulb = await FakeBulb.start();
  network = new FakeNetwork();
  heard = [];
  transport = await WizTransport.open(network, {
    ports: { control: bulb.port, push: 38900 },
    receive: (frame, address) => {
      heard.push({ frame, address });
    },
    failure: () => undefined,
  });
});

afterEach(() => {
  vi.useRealTimers();
  transport.close();
  bulb.close();
});

describe('WiZ requests', () => {
  it('answers a request with the light reply and also reports it to the listener', async () => {
    const frame = await transport.request('127.0.0.1', 'getPilot', {});
    expect(frame.result).toMatchObject({ state: true, dimming: 60 });
    expect(heard.map((entry) => entry.frame.method)).toEqual(['getPilot']);
    expect(heard[0]?.address).toBe('127.0.0.1');
  });

  it('keeps simultaneous requests to one light apart', async () => {
    const [first, second] = await Promise.all([
      transport.request('127.0.0.1', 'getSystemConfig', {}),
      transport.request('127.0.0.1', 'getModelConfig', {}),
    ]);
    expect(first.result).toMatchObject({ moduleName: 'ESP01_SHRGB_03' });
    expect(second.result).toMatchObject({ extRange: [2200, 6500] });
  });

  it('sends the same request again when a datagram is lost', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    bulb.ignoring = 1;
    const pending = transport.request('127.0.0.1', 'setPilot', { dimming: 30 });
    await vi.waitFor(() => {
      expect(bulb.received).toHaveLength(1);
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toMatchObject({ method: 'setPilot' });
    expect(bulb.received.map((entry) => entry.id)).toEqual([
      bulb.received[0]?.id,
      bulb.received[0]?.id,
    ]);
    expect(bulb.received[1]?.params).toEqual({ dimming: 30 });
  });

  it('gives up after three unanswered attempts and says the outcome is unknown', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    bulb.ignoring = 10;
    const pending = transport.request('127.0.0.1', 'setPilot', { state: false });
    const failure = expect(pending).rejects.toThrow(WizProtocolError);
    await vi.waitFor(() => {
      expect(bulb.received).toHaveLength(1);
    });
    await vi.advanceTimersByTimeAsync(3000);
    await failure;
    expect(bulb.received).toHaveLength(3);
  });

  it('fails a request the light rejects', async () => {
    bulb.rejecting.add('setPilot');
    await expect(transport.request('127.0.0.1', 'setPilot', { state: true })).rejects.toThrow(
      'the light rejected the request',
    );
  });

  it('reports pushed updates and ignores datagrams that are not WiZ messages', async () => {
    const push = network.portOf(38900);
    bulb.sendRaw(push, Buffer.from('not json at all'));
    bulb.sendRaw(push, Buffer.from(JSON.stringify({ unrelated: true })));
    bulb.push(push, { dimming: 80 });
    await vi.waitFor(() => {
      expect(heard).toHaveLength(1);
    });
    expect(heard[0]?.frame).toMatchObject({ method: 'syncPilot', params: { dimming: 80 } });
  });

  it('fails pending requests when it closes', async () => {
    bulb.ignoring = 10;
    const pending = transport.request('127.0.0.1', 'getPilot', {});
    const failure = expect(pending).rejects.toThrow('the plugin has stopped');
    await vi.waitFor(() => {
      expect(bulb.received).toHaveLength(1);
    });
    transport.close();
    await failure;
    await expect(transport.request('127.0.0.1', 'getPilot', {})).rejects.toThrow(
      'the plugin has stopped',
    );
  });
});
