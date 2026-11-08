import {
  API_ENDPOINTS,
  type DeviceCapability,
  type DiscoveredDevice,
  type IrAppliance,
  type IrLibraryModel,
} from '@smarteverything/domain';
import type { LibraryClimate } from '@smarteverything/tuya';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IrLibrary } from '../../src/infrared/library/ir-library';
import { bootServer, linkFakeProvider, type Booted } from '../support/booted';
import { LAMP } from '../support/fake-provider';
import { captureLogs } from '../support/logs';
import { call, temporaryDirectory } from '../support/server';

const SEND: DeviceCapability = {
  key: 'ir_send',
  label: 'Send',
  access: 'write',
  value: { kind: 'action', arguments: ['format', 'code'] },
};

const BLASTER: DiscoveredDevice = {
  ...LAMP,
  externalId: 'ir-1',
  kind: 'ir_blaster',
  name: 'Bedroom IR',
  model: 'tuya.wnykq',
  room: 'Bedroom',
  capabilities: [SEND],
};

const library = new IrLibrary();

let directory: { path: string; remove: () => Promise<void> };
let booted: Booted;

beforeEach(async () => {
  captureLogs();
  directory = await temporaryDirectory();
  booted = await bootServer(directory.path);
  booted.fake.adapter.devices = [LAMP, BLASTER];
  await linkFakeProvider(booted);
});

afterEach(async () => {
  await booted.server.stop();
  await directory.remove();
});

function owner(method: string, path: string, body?: unknown): ReturnType<typeof call> {
  return call(booted.base, booted.owner, { method, path, ...(body === undefined ? {} : { body }) });
}

async function blasterId(): Promise<string> {
  const devices = API_ENDPOINTS.listDevices.response.parse(
    (await owner('GET', '/api/devices')).body,
  );
  const row = devices.find((device) => device.external_id === 'ir-1');
  if (row === undefined) throw new Error('The fake provider did not discover the blaster.');
  return row.id;
}

function sentCodes(): unknown[] {
  return booted.fake.adapter.executed
    .filter((command) => command.capability === 'ir_send')
    .map((command) => command.value);
}

interface CoolingFrame {
  readonly libraryId: string;
  readonly goal: Readonly<Record<string, unknown>>;
  readonly code: string;
  readonly off: string;
}

function coolingOf(libraryId: string, model: LibraryClimate): CoolingFrame | undefined {
  const fans = model.commands['cool'];
  if (fans === undefined) return undefined;
  const pool = Object.keys(fans).filter((name) => name.toLowerCase() !== 'auto');
  const command = fans[(pool.length > 0 ? pool : Object.keys(fans))[0] ?? ''];
  const temperature = typeof command === 'object' ? Object.keys(command)[0] : undefined;
  const code = typeof command === 'object' ? command[temperature ?? ''] : command;
  if (code === undefined) return undefined;
  const temp = temperature === undefined ? {} : { temp: Number(temperature) };
  return { libraryId, goal: { on: true, mode: 'Cool', speed: 1, ...temp }, code, off: model.off };
}

function coolingFrame(): CoolingFrame {
  const entries = library
    .brands('Air conditioner')
    .flatMap((brand) => library.entries('Air conditioner', brand.name));
  for (const entry of entries) {
    const model = library.model(entry.id);
    const frame = model.kind === 'climate' ? coolingOf(entry.id, model) : undefined;
    if (frame !== undefined) return frame;
  }
  throw new Error('The library has no cooling air conditioner.');
}

async function modelsOf(category: string, brand: string): Promise<IrLibraryModel[]> {
  const query = `category=${encodeURIComponent(category)}&brand=${encodeURIComponent(brand)}`;
  return API_ENDPOINTS.listIrLibraryModels.response.parse(
    (await owner('GET', `/api/ir-library/models?${query}`)).body,
  );
}

async function created(libraryId: string, name: string): Promise<IrAppliance> {
  const reply = await owner('POST', '/api/ir-library/appliances', {
    library_id: libraryId,
    blaster_id: await blasterId(),
    name,
  });
  expect(reply.status).toBe(200);
  return API_ENDPOINTS.createIrApplianceFromLibrary.response.parse(reply.body);
}

describe('browsing the infrared library', () => {
  it('walks from categories to brands to models with their buttons', async () => {
    const categories = API_ENDPOINTS.listIrLibraryCategories.response.parse(
      (await owner('GET', '/api/ir-library')).body,
    );
    expect(categories.map((one) => one.category)).toEqual(
      expect.arrayContaining(['Air conditioner', 'TV']),
    );
    const brands = API_ENDPOINTS.listIrLibraryBrands.response.parse(
      (await owner('GET', '/api/ir-library/brands?category=TV')).body,
    );
    expect(brands.find((one) => one.brand === 'Samsung')?.models).toBeGreaterThan(0);
    const models = await modelsOf('TV', 'Samsung');
    expect(models.length).toBe(brands.find((one) => one.brand === 'Samsung')?.models);
    expect(models.every((model) => model.kind === 'keys' && model.buttons.length > 0)).toBe(true);
  });

  it('answers nothing for a category or brand it does not have', async () => {
    expect((await owner('GET', '/api/ir-library/brands?category=Toaster')).body).toStrictEqual([]);
    expect(await modelsOf('TV', 'No such brand')).toStrictEqual([]);
  });
});

describe('adding an appliance from the library', () => {
  it('adds a TV with the library buttons, in the blaster’s room, and presses one through the blaster', async () => {
    const model = (await modelsOf('TV', 'Samsung')).find((one) => one.buttons.includes('Power'));
    if (model === undefined) throw new Error('The library has no Samsung TV with a Power button.');
    const appliance = await created(model.id, 'Living room TV');
    expect(appliance).toMatchObject({ name: 'Living room TV', encoder: 'learned', online: true });
    expect(appliance.keys).toStrictEqual(model.buttons);
    const devices = API_ENDPOINTS.listDevices.response.parse(
      (await owner('GET', '/api/devices')).body,
    );
    const device = devices.find((row) => row.id === appliance.device_id);
    const blaster = devices.find((row) => row.external_id === 'ir-1');
    expect(device).toMatchObject({ kind: 'television', parent_id: null });
    expect(device?.room_id).toBe(blaster?.room_id);
    await owner('POST', '/api/commands', {
      device_id: appliance.device_id,
      capability: 'remote_key',
      value: 'Power',
    });
    const code = library.model(model.id);
    await expect
      .poll(sentCodes)
      .toStrictEqual([{ format: 'pulses', code: code.kind === 'keys' ? code.keys['Power'] : '' }]);
  });

  it('adds an air conditioner that sets mode, temperature and fan in one frame', async () => {
    const wanted = coolingFrame();
    const appliance = await created(wanted.libraryId, 'Bedroom AC');
    expect(appliance).toMatchObject({
      encoder: `library:${wanted.libraryId}`,
      category: 'Air conditioner',
      keys: [],
    });
    const reply = await owner('POST', `/api/ir-appliances/${appliance.id}/apply`, wanted.goal);
    expect(reply.status).toBe(200);
    expect(sentCodes()).toStrictEqual([{ format: 'pulses', code: wanted.code }]);
    const off = await owner('POST', `/api/ir-appliances/${appliance.id}/apply`, { on: false });
    expect(off.status).toBe(200);
    expect(sentCodes()[1]).toStrictEqual({ format: 'pulses', code: wanted.off });
  });

  it('refuses an unknown model, a blaster that cannot send and an unknown room', async () => {
    const lamp = API_ENDPOINTS.listDevices.response
      .parse((await owner('GET', '/api/devices')).body)
      .find((device) => device.external_id !== 'ir-1');
    const base = { library_id: 'flipper:TVs/Nope/Nope', blaster_id: await blasterId(), name: 'X' };
    expect((await owner('POST', '/api/ir-library/appliances', base)).status).toBe(404);
    const model = (await modelsOf('TV', 'Samsung'))[0];
    const known = { ...base, library_id: model?.id };
    expect(
      (await owner('POST', '/api/ir-library/appliances', { ...known, blaster_id: lamp?.id }))
        .status,
    ).toBe(422);
    expect(
      (
        await owner('POST', '/api/ir-library/appliances', {
          ...known,
          room_id: '00000000-0000-4000-8000-000000000999',
        })
      ).status,
    ).toBe(404);
    expect(await owner('GET', '/api/ir-appliances')).toMatchObject({ body: [] });
  });
});
