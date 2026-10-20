import {
  ApiError,
  BOTTLE_ACTION_RESULT,
  BOTTLE_VIEW,
  PHONE_BOTTLES,
  type BottleActResult,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entryConfigOf } from '../../../src/local/bottle/config';
import type { Caller } from '../../../src/server/auth';
import { captureLogs, testLogger } from '../../support/logs';
import { SERIAL, bottleRig, tofRow, type BottleRig } from '../../support/bottle-rig';
import { raw, routeRig, type RouteRig } from '../../support/bottle-routes-rig';

let rig: BottleRig;
let wires: RouteRig;

beforeEach(async () => {
  captureLogs();
  rig = await bottleRig();
  wires = routeRig(rig);
});

afterEach(async () => {
  await rig.close();
});

const log = testLogger('bottle');

function id(): string {
  return rig.device.id;
}

async function bindToMember(): Promise<void> {
  await rig.act(rig.owner, { action: 'bind_person', personId: rig.member.profile.id });
}

describe('the phone’s endpoints', () => {
  it('gives the bound person’s phone the bottle with its plan, and nobody else’s phone', async () => {
    const owners = PHONE_BOTTLES.parse(
      await wires.routes.readPhoneBottles.run(wires.caller(rig.owner), raw({}), log),
    );
    expect(owners.bottles).toHaveLength(1);
    expect(owners.bottles[0]).toMatchObject({ deviceId: id(), serial: SERIAL });
    expect(owners.bottles[0]?.plan.steps[0]).toMatchObject({ kind: 'gatt_read' });
    const members = PHONE_BOTTLES.parse(
      await wires.routes.readPhoneBottles.run(wires.caller(rig.member), raw({}), log),
    );
    expect(members.bottles).toHaveLength(0);
  });

  it('gives the owner’s phone a bottle bound to someone else only after it took the bottle over', async () => {
    await bindToMember();
    const owners = async (): Promise<number> =>
      PHONE_BOTTLES.parse(
        await wires.routes.readPhoneBottles.run(wires.caller(rig.owner), raw({}), log),
      ).bottles.length;
    expect(await owners()).toBe(0);
    await wires.bridges.takeOver(rig.row(), rig.owner.client);
    expect(await owners()).toBe(1);
    const members = PHONE_BOTTLES.parse(
      await wires.routes.readPhoneBottles.run(wires.caller(rig.member), raw({}), log),
    );
    expect(members.bottles).toHaveLength(0);
  });

  it('moves the bottle to the new person’s phone when it is given to them', async () => {
    await bindToMember();
    const members = PHONE_BOTTLES.parse(
      await wires.routes.readPhoneBottles.run(wires.caller(rig.member), raw({}), log),
    );
    const owners = PHONE_BOTTLES.parse(
      await wires.routes.readPhoneBottles.run(wires.caller(rig.owner), raw({}), log),
    );
    expect(members.bottles).toHaveLength(1);
    expect(owners.bottles).toHaveLength(0);
  });

  it('lets the first phone that uploads hold the bottle and sends a second phone away', async () => {
    rig.cap.tof.rows.push(tofRow(rig.seconds(-30), 54));
    const upload = {
      trigger: 'wake',
      startedAt: '2026-10-18T12:00:00.000Z',
      endedAt: '2026-10-18T12:00:03.000Z',
      outcome: 'ok',
      detail: null,
      rssi: -60,
      dis: null,
      batteryReads: [],
      responses: [],
    };
    const result = await wires.routes.uploadBottleSync.run(
      wires.caller(rig.owner),
      raw({ params: { deviceId: id() }, body: upload }),
      log,
    );
    expect(result).toMatchObject({ accepted: 0 });
    const second = rig.test.store.clients.create({
      name: 'Owner tablet',
      platform: 'android',
      role: 'owner',
      tokenHash: 'b'.repeat(64),
      profileId: rig.owner.profile.id,
    });
    await expect(
      wires.routes.uploadBottleSync.run(
        { kind: 'client', client: second },
        raw({ params: { deviceId: id() }, body: upload }),
        log,
      ),
    ).rejects.toThrow(/Take over/u);
  });

  it('refuses an upload from someone the bottle does not belong to', async () => {
    await expect(
      wires.routes.uploadBottleSync.run(
        wires.caller(rig.member),
        raw({
          params: { deviceId: id() },
          body: {
            trigger: 'wake',
            startedAt: '2026-10-18T12:00:00.000Z',
            endedAt: '2026-10-18T12:00:03.000Z',
            outcome: 'ok',
            detail: null,
            rssi: null,
            dis: null,
            batteryReads: [],
            responses: [],
          },
        }),
        log,
      ),
    ).rejects.toThrow('not part of your access');
  });

  it('passes a phone’s answer to the waiting action', async () => {
    const waiting = wires.routes.actBottle.run(
      wires.caller(rig.owner),
      raw({ params: { deviceId: id() }, body: { action: 'sync' } }),
      log,
    );
    await settle();
    const push = rig.pushes.at(-1);
    expect(push?.payload).toMatchObject({ deviceId: id(), action: 'sync_now' });
    await wires.routes.answerBottleAction.run(
      { kind: 'client', client: rig.test.store.clients.byId(push?.clientId ?? '') },
      raw({ body: { requestId: String(push?.payload['requestId']), ok: true, detail: 'Synced.' } }),
      log,
    );
    expect(BOTTLE_ACTION_RESULT.parse(await waiting)).toStrictEqual({
      ok: true,
      detail: 'Synced.',
    });
  });
});

function assistantCaller(): Caller {
  const caller = wires.caller(rig.owner);
  if (caller.kind !== 'client') {
    throw new Error('the owner is a client');
  }
  return { ...caller, via: 'assistant' };
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
}

describe('reading and changing a bottle', () => {
  it('serves the views to the owner and to the person it belongs to, and to nobody else', async () => {
    const read = (person: typeof rig.owner): Promise<unknown> =>
      wires.routes.readBottle.run(
        wires.caller(person),
        raw({ params: { deviceId: id() }, query: { view: 'status' } }),
        log,
      );
    expect(BOTTLE_VIEW.parse(await read(rig.owner)).view).toBe('status');
    await expect(read(rig.member)).rejects.toThrow('not part of your access');
    await bindToMember();
    expect(BOTTLE_VIEW.parse(await read(rig.member)).view).toBe('status');
    expect(BOTTLE_VIEW.parse(await read(rig.owner)).view).toBe('status');
  });

  it('refuses a device that is not a bottle', async () => {
    const [other] = rig.test.store.devices.upsert([
      {
        provider: 'local',
        externalId: 'other:1',
        parentId: null,
        kind: 'sensor',
        name: 'Lamp',
        model: 'x',
        manufacturer: 'x',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    await expect(
      wires.routes.readBottle.run(
        wires.caller(rig.owner),
        raw({ params: { deviceId: other?.id }, query: { view: 'status' } }),
        log,
      ),
    ).rejects.toThrow(ApiError);
  });

  it('lets only the owner give the bottle to someone else, and the person to hand it back', async () => {
    await expect(
      rig.act(rig.member, { action: 'bind_person', personId: rig.member.profile.id }),
    ).rejects.toThrow('belongs to another person');
    await bindToMember();
    await expect(
      rig.act(rig.member, { action: 'bind_person', personId: rig.owner.profile.id }),
    ).rejects.toThrow('Only the owner');
    const handedBack = await rig.act(rig.member, { action: 'bind_person', personId: null });
    expect(handedBack.ok).toBe(true);
    expect(entryConfigOf(rig.entry()).binding.profileId).toBeNull();
  });

  it('tells the person a bottle was given to them, until they keep it', async () => {
    await bindToMember();
    const status = async (): Promise<boolean> => {
      const view = BOTTLE_VIEW.parse(
        await wires.routes.readBottle.run(
          wires.caller(rig.member),
          raw({ params: { deviceId: id() }, query: { view: 'status' } }),
          log,
        ),
      );
      return view.view === 'status' && view.noticePending;
    };
    expect(await status()).toBe(true);
    const kept = await wires.routes.actBottle.run(
      wires.caller(rig.member),
      raw({ params: { deviceId: id() }, body: { action: 'keep_binding' } }),
      log,
    );
    expect(BOTTLE_ACTION_RESULT.parse(kept).ok).toBe(true);
    expect(await status()).toBe(false);
  });

  it('adds and forgets a bottle only for oneself unless the owner does it', async () => {
    const add = {
      serial: 'FEDCBA9876543210',
      name: 'Gym bottle',
      room: null,
      profileId: rig.owner.profile.id,
      body: 1000,
      filter: true,
      dis: null,
    };
    await expect(
      wires.routes.addBottle.run(wires.caller(rig.member), raw({ body: add }), log),
    ).rejects.toThrow('only for yourself');
    const added = await wires.routes.addBottle.run(
      wires.caller(rig.member),
      raw({ body: { ...add, profileId: rig.member.profile.id } }),
      log,
    );
    expect(added).toMatchObject({ name: 'Gym bottle' });
    const entry = rig.test.store.localDevices.byExternalId('larq_bottle:FEDCBA9876543210');
    expect(entryConfigOf(entry).binding).toMatchObject({
      profileId: rig.member.profile.id,
      boundBy: rig.member.profile.id,
    });
    expect(entryConfigOf(entry).filter).toMatchObject({
      installed: true,
      installedOn: '2026-10-18',
    });
    const gym = rig.test.store.devices.byExternal('local', 'larq_bottle:FEDCBA9876543210');
    await expect(
      wires.routes.forgetBottle.run(
        wires.caller(rig.owner),
        raw({ params: { deviceId: id() } }),
        log,
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      wires.routes.forgetBottle.run(
        wires.caller(rig.member),
        raw({ params: { deviceId: id() } }),
        log,
      ),
    ).rejects.toThrow('not part of your access');
    await wires.routes.forgetBottle.run(
      wires.caller(rig.member),
      raw({ params: { deviceId: gym?.id } }),
      log,
    );
    expect(wires.removed).toStrictEqual([id(), gym?.id]);
  });
});

describe('starting a UV clean', () => {
  async function start(
    person: typeof rig.owner,
    caller = wires.caller(person),
  ): Promise<BottleActResult> {
    return BOTTLE_ACTION_RESULT.parse(
      await wires.routes.startBottleUv.run(
        caller,
        raw({ params: { deviceId: id() }, body: { mode: 'normal' } }),
        log,
      ),
    );
  }

  async function answerNext(ok = true): Promise<void> {
    await settle();
    const push = rig.pushes.at(-1);
    rig.broker.answer(push?.clientId ?? '', String(push?.payload['requestId']), {
      ok,
      detail: ok ? 'Cleaning started.' : 'The bottle is asleep.',
    });
  }

  it('asks the phone to start it for the person at the bottle', async () => {
    const started = start(rig.owner);
    await answerNext();
    expect(await started).toStrictEqual({ ok: true, detail: 'Cleaning started.' });
    expect(rig.pushes.at(-1)?.payload).toMatchObject({ action: 'uv_start', uvMode: 'normal' });
  });

  it('is never started for an assistant, or for a person the bottle does not belong to', async () => {
    await expect(start(rig.owner, assistantCaller())).rejects.toThrow('person at the bottle');
    await expect(start(rig.member)).rejects.toThrow('not part of your access');
  });

  it('is refused with a reason while the cap reports a fault, is off a bottle or is locked', async () => {
    rig.cap.uiState = 1;
    await rig.sync();
    await expect(start(rig.owner)).rejects.toThrow('fault');
    rig.cap.uiState = 10;
    await rig.sync(1);
    await expect(start(rig.owner)).rejects.toThrow('off a bottle');
    rig.cap.uiState = 15;
    await rig.sync(2);
    await expect(start(rig.owner)).rejects.toThrow('Travel Lock');
    rig.cap.uiState = 8;
    await rig.sync(3);
    await expect(start(rig.owner)).rejects.toThrow('charges');
  });

  it('can always be stopped, by anyone who can reach the bottle', async () => {
    await bindToMember();
    const stopped = wires.routes.actBottle.run(
      wires.caller(rig.member),
      raw({ params: { deviceId: id() }, body: { action: 'uv_stop' } }),
      log,
    );
    await settle();
    expect(rig.pushes.at(-1)?.payload).toMatchObject({ action: 'uv_stop' });
    const push = rig.pushes.at(-1);
    rig.broker.answer(push?.clientId ?? '', String(push?.payload['requestId']), {
      ok: true,
      detail: 'Stopped.',
    });
    expect(await stopped).toStrictEqual({ ok: true, detail: 'Stopped.' });
  });
});
