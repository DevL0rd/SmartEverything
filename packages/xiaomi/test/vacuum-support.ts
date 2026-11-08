import { createCipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { MAP_DOCUMENT, mapKey, type MapDocument } from '../src';

const IV = Uint8Array.from(Buffer.from('ABCDEF1234123412', 'latin1'));

export function fixtureJson(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`fixtures/vacuum/${path}`, import.meta.url), 'utf8'));
}

export function sealMapBytes(plain: Uint8Array, model: string, did: string): Uint8Array {
  const cipher = createCipheriv('aes-128-cbc', mapKey(model, did), IV);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.from(JSON.stringify({ version: 2, data: body.toString('base64') }));
}

export function sealMapDocument(document: unknown, model: string, did: string): Uint8Array {
  return sealMapBytes(deflateSync(Buffer.from(JSON.stringify(document))), model, did);
}

export function pv11glMap(slot: 'current' | 'saved' | 'backup'): MapDocument {
  return MAP_DOCUMENT.parse(fixtureJson(`maps/pv11gl-${slot}.json`));
}
