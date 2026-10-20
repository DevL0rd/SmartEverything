import {
  CONDOR_SERVICE,
  CLASSIC_SERVICE,
  SONICARE_IDENTITY,
  type BrushGattDump,
  type SonicareIdentity,
} from '@smarteverything/domain';
import { hexToBytes } from '../bytes';
import { clockIsUnix } from './records';
import { KEY, fullOf, shortOf } from './uuids';

export class NotASonicareError extends Error {
  override readonly name = 'NotASonicareError';

  constructor(name: string) {
    super(`${name} offers neither the Sonicare service nor the Condor service.`);
  }
}

export interface IdentityFacts {
  readonly address: string;
  readonly bonded: boolean;
  readonly ports: readonly string[];
}

const DECODER = new TextDecoder();

function valueOf(dump: BrushGattDump, key: string): Uint8Array | null {
  const wanted = fullOf(key);
  for (const service of dump.services) {
    const found = service.characteristics.find(
      (characteristic) => shortOf(characteristic.uuid) === shortOf(wanted),
    );
    if (found?.value !== undefined) {
      return hexToBytes(found.value);
    }
  }
  return null;
}

function textOf(dump: BrushGattDump, key: string): string | null {
  const bytes = valueOf(dump, key);
  const text = bytes === null ? '' : DECODER.decode(bytes).replaceAll('\0', '').trim();
  return text === '' ? null : text;
}

function stackOf(dump: BrushGattDump): SonicareIdentity['stack'] {
  const services = dump.services.map((service) => service.uuid);
  if (services.includes(CONDOR_SERVICE)) {
    return 'condor';
  }
  if (services.includes(CLASSIC_SERVICE)) {
    return 'classic';
  }
  throw new NotASonicareError(dump.name);
}

function clockOf(dump: BrushGattDump): boolean | null {
  const bytes = valueOf(dump, KEY.handleClock);
  if (bytes === null || bytes.length < 4) {
    return null;
  }
  return clockIsUnix(
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true),
  );
}

export function brushIdentityOf(dump: BrushGattDump, facts: IdentityFacts): SonicareIdentity {
  const pnp = valueOf(dump, KEY.pnp);
  const routines = valueOf(dump, KEY.routineIds);
  return SONICARE_IDENTITY.parse({
    model: textOf(dump, KEY.model),
    serial: textOf(dump, KEY.serial),
    firmware: textOf(dump, KEY.firmware),
    manufacturer: textOf(dump, KEY.manufacturer),
    pnp: pnp === null ? null : pnp.toHex(),
    stack: stackOf(dump),
    bonded: facts.bonded,
    address: facts.address,
    gapName: dump.name,
    services: dump.services.map((service) => service.uuid),
    ports: [...facts.ports],
    routineIds: routines === null ? null : [...routines],
    clockIsUnix: clockOf(dump),
  });
}
