import { CommandRefusedError, type ProviderAdapter } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TvArtModeError } from '../../src/adapters/samsung-tv/art-mode';
import { TvConnectionError } from '../../src/adapters/samsung-tv/connection';
import { createSamsungTvModule } from '../../src/adapters/samsung-tv/index';
import { contextFor, type ContextRecord } from '../smartthings/fake-cloud';
import { FakeTv, subscribe, until } from './fake-tv';

const TELEVISION = {
  host: 'tv.test',
  macAddress: 'a1:b2:c3:d4:e5:f6',
  name: 'Living room TV',
  model: 'QE65S95C',
  token: 'token-1',
  frame: true,
};

const FRAME = { label: 'Living room TV', secrets: { televisions: [TELEVISION] } };

const COMMAND = {
  commandId: '00000000-0000-4000-8000-000000000002',
  externalId: 'a1:b2:c3:d4:e5:f6',
};

const ART_URL = '/api/v2/channels/com.samsung.art-app?name=U21hcnRFdmVyeXRoaW5n&token=token-1';

let tv: FakeTv;
let record: ContextRecord;

beforeEach(async () => {
  tv = await FakeTv.start();
  tv.frameSupport = 'true';
  record = contextFor('/nonexistent');
});

afterEach(async () => {
  vi.useRealTimers();
  Logger.reset();
  await tv.stop();
});

function start(): Promise<ProviderAdapter> {
  return createSamsungTvModule(tv.io).start(FRAME, record.context);
}

function artStates(states: readonly { capability: string; value: unknown }[]): unknown[] {
  return states.filter((state) => state.capability === 'art_mode').map((state) => state.value);
}

function powerKeys(): unknown[] {
  return tv.messages.filter((message) => JSON.stringify(message).includes('KEY_POWER'));
}

describe('linking a Frame TV', () => {
  it('remembers that the TV is a Frame from its device information', async () => {
    const account = await createSamsungTvModule(tv.io).link(
      { provider: 'samsung_tv', host: 'tv.test', name: 'Living room TV' },
      record.context,
    );
    expect(account).toEqual(FRAME);
    expect(record.logs.find((line) => line.event === 'television.linked')?.payload).toEqual({
      model: 'QE65S95C',
      frame: true,
      attached: false,
      televisions: 1,
    });
  });
});

describe('the Frame TV adapter', () => {
  it('offers art mode and says the TV is a Frame', async () => {
    const [device] = await (await start()).discover();
    expect(device?.capabilities.at(-1)?.key).toBe('art_mode');
    expect(device?.details).toMatchObject({ frameTv: true });
  });

  it('reads the art mode over the art channel once the TV is on', async () => {
    tv.artMode = true;
    const { states, stop } = await subscribe(await start());
    await until(() => artStates(states).length === 1);
    expect(artStates(states)).toEqual([true]);
    expect(tv.connections).toContain(ART_URL);
    const [request] = tv.artRequests;
    expect(request).toMatchObject({ request: 'get_artmode_status' });
    expect(request?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(request?.request_id).toBe(request?.id);
    await stop();
    await until(() => tv.openArtSockets === 0);
  });

  it('follows art mode changes the TV pushes, without asking again', async () => {
    const { states, stop } = await subscribe(await start());
    await until(() => artStates(states).length === 1);
    tv.sendArt({ event: 'art_mode_changed', status: 'on' });
    tv.sendArt({ event: 'art_mode_changed', status: 'off' });
    await until(() => artStates(states).length === 3);
    expect(artStates(states)).toEqual([false, true, false]);
    expect(tv.artRequests).toHaveLength(1);
    await stop();
  });

  it('switches art mode on and off over the same art connection', async () => {
    const adapter = await start();
    const { states, stop } = await subscribe(adapter);
    await until(() => artStates(states).length === 1);
    await adapter.execute({ ...COMMAND, capability: 'art_mode', value: true });
    await until(() => artStates(states).length === 2);
    expect(tv.artMode).toBe(true);
    await adapter.execute({ ...COMMAND, capability: 'art_mode', value: false });
    await until(() => artStates(states).length === 3);
    expect(artStates(states)).toEqual([false, true, false]);
    expect(tv.artRequests.map((request) => [request.request, request.value])).toEqual([
      ['get_artmode_status', undefined],
      ['set_artmode_status', 'on'],
      ['set_artmode_status', 'off'],
    ]);
    expect(tv.connections.filter((url) => url === ART_URL)).toHaveLength(1);
    await stop();
  });

  it('powers off by holding the power key for three seconds', async () => {
    const adapter = await start();
    await adapter.execute({ ...COMMAND, capability: 'power', value: false });
    await until(() => powerKeys().length === 2);
    expect(powerKeys()).toEqual(
      ['Press', 'Release'].map((cmd) => ({
        method: 'ms.remote.control',
        params: {
          Cmd: cmd,
          DataOfCmd: 'KEY_POWER',
          Option: 'false',
          TypeOfRemote: 'SendRemoteKey',
        },
      })),
    );
    expect(tv.sleeps).toEqual([3000]);
  });

  it('reports art mode off and closes the art channel when the TV goes to standby', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    tv.artMode = true;
    const { states, stop } = await subscribe(await start());
    await until(() => artStates(states).length === 1 && tv.openArtSockets === 1);
    tv.power = 'standby';
    await vi.advanceTimersByTimeAsync(5000);
    await until(() => tv.openArtSockets === 0);
    expect(states.map((state) => [state.capability, state.value])).toEqual([
      ['power', true],
      ['art_mode', true],
      ['power', false],
      ['art_mode', false],
    ]);
    await stop();
  });

  it('refuses art mode while the TV is off', async () => {
    tv.power = 'standby';
    const adapter = await start();
    await expect(
      adapter.execute({ ...COMMAND, capability: 'art_mode', value: true }),
    ).rejects.toThrow(new CommandRefusedError('art_mode', 'the television is off'));
    expect(tv.artRequests).toEqual([]);
  });

  it('reads power and art mode on refresh', async () => {
    tv.artMode = true;
    const adapter = await start();
    const observedAt = '2026-10-08T12:00:00.000Z';
    const externalId = 'a1:b2:c3:d4:e5:f6';
    expect(await adapter.refresh([externalId])).toEqual([
      { externalId, capability: 'power', value: true, observedAt },
      { externalId, capability: 'art_mode', value: true, observedAt },
    ]);
    const asked = tv.artRequests.length;
    tv.power = 'standby';
    expect((await adapter.refresh([externalId])).map((update) => update.value)).toEqual([
      false,
      false,
    ]);
    expect(tv.artRequests).toHaveLength(asked);
  });

  it('fails visibly when the TV answers an art request with an error', async () => {
    tv.artAnswers = 'error';
    const adapter = await start();
    await expect(
      adapter.execute({ ...COMMAND, capability: 'art_mode', value: true }),
    ).rejects.toThrow(
      new TvArtModeError('tv.test', 'set_artmode_status', 'the TV answered with error -7'),
    );
    tv.artAnswers = 'error_without_code';
    await expect(adapter.refresh([COMMAND.externalId])).rejects.toThrow(
      'The Frame TV at tv.test did not complete the art mode request get_artmode_status: the TV answered with an error without a code.',
    );
  });

  it('fails visibly when the status answer carries no art mode', async () => {
    tv.artAnswers = 'without_value';
    const { stop } = await subscribe(await start());
    await until(() => record.logs.some((line) => line.event === 'art.status_failed'));
    expect(record.logs.find((line) => line.event === 'art.status_failed')?.payload).toEqual({
      host: 'tv.test',
      reason:
        'TvArtModeError: The Frame TV at tv.test did not complete the art mode request get_artmode_status: the answer artmode_status carried no art mode.',
    });
    await stop();
  });

  it('gives up on an art request the TV never answers', async () => {
    tv.artAnswers = 'silent';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const adapter = await start();
    const setting = adapter.execute({ ...COMMAND, capability: 'art_mode', value: true });
    const failure = expect(setting).rejects.toThrow(
      new TvConnectionError('tv.test', 'the TV did not answer set_artmode_status in time'),
    );
    await until(() => tv.artRequests.some((request) => request.request === 'set_artmode_status'));
    await vi.advanceTimersByTimeAsync(5000);
    await failure;
  });

  it('logs art messages it cannot read, and keeps the art connection', async () => {
    const { states, stop } = await subscribe(await start());
    await until(() => artStates(states).length === 1);
    tv.sendArt('not json');
    await until(() => record.logs.some((line) => line.event === 'art.problem'));
    expect(tv.openArtSockets).toBe(1);
    await stop();
  });

  it('keeps a token the TV rotates on the art channel', async () => {
    tv.issuedToken = 'token-2';
    const adapter = await start();
    await adapter.refresh([COMMAND.externalId]);
    expect(record.saved).toEqual([
      { label: 'Living room TV', secrets: { televisions: [{ ...TELEVISION, token: 'token-2' }] } },
    ]);
  });

  it('refuses art mode on a television that is not a Frame', async () => {
    const adapter = await createSamsungTvModule(tv.io).start(
      { ...FRAME, secrets: { televisions: [{ ...TELEVISION, frame: false }] } },
      record.context,
    );
    await expect(
      adapter.execute({ ...COMMAND, capability: 'art_mode', value: true }),
    ).rejects.toThrow(new CommandRefusedError('art_mode', 'the television does not have it'));
    expect(await adapter.refresh([COMMAND.externalId])).toHaveLength(1);
  });
});
