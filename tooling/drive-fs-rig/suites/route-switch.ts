import { execPath } from 'node:process';
import { join } from 'node:path';
import { SCRATCH, files, type RigState } from '../paths.ts';
import { sleep } from '../processes.ts';
import { buildBig, type Fixture } from './recovery-fixtures.ts';
import { inside, withTimeout, type Running } from './recovery-inside.ts';
import { runSuite, type Context, type SuiteCase } from './recovery-runner.ts';
import { ensureMounted } from './recovery-standin.ts';
import {
  awaitProgress,
  finishWriter,
  net,
  prepareDelivery,
  setRoute,
  startWriter,
  verifyDelivered,
  type Delivery,
} from './recovery-steps.ts';

const SWITCH_EVERY_MS = 150;
const DISCONNECT_MS = 5000;
const MINIMUM_SWITCHES = 3;
const READ_LIMIT_MS = 600_000;
const READ_CHUNK_BYTES = 8 << 20;
const READ_PAUSE_MS = 40;
const SETTLE_AFTER_ROUTE_MS = 2000;
const UPLOAD_SWITCH_FRACTION = 0.1;
const UPLOAD_DISCONNECT_FRACTION = 0.3;

const SLOW_SHA256 = `const fs=require('node:fs'),crypto=require('node:crypto');const hash=crypto.createHash('sha256');const fd=fs.openSync(process.argv[1],'r');const buffer=Buffer.alloc(${String(READ_CHUNK_BYTES)});const gate=new Int32Array(new SharedArrayBuffer(4));for(;;){const n=fs.readSync(fd,buffer,0,buffer.length,null);if(n===0)break;hash.update(buffer.subarray(0,n));Atomics.wait(gate,0,0,${String(READ_PAUSE_MS)})}process.stdout.write(hash.digest('hex'))`;

const sources = new Map<string, Promise<Fixture>>();

function bigFixture(): Promise<Fixture> {
  const known = sources.get('big');
  if (known !== undefined) return known;
  const made = buildBig(join(SCRATCH, 'suites'));
  sources.set('big', made);
  return made;
}

async function ready(): Promise<RigState> {
  await net('restore all');
  await ensureMounted('B');
  const state = await ensureMounted('A');
  await setRoute(state, 'A', 'lan');
  await setRoute(state, 'B', 'lan');
  await sleep(SETTLE_AFTER_ROUTE_MS);
  return state;
}

async function written(context: Context, state: RigState, fixture: Fixture): Promise<Delivery> {
  const delivery = await prepareDelivery(state, fixture, `route-${context.token}`);
  await finishWriter('the setup write', startWriter(state, delivery));
  await verifyDelivered(state, delivery);
  return delivery;
}

function startRead(state: RigState, delivery: Delivery): Running {
  return inside(state.computers.B, [
    execPath,
    '-e',
    SLOW_SHA256,
    join(files.mountPoint('B'), delivery.folder, 'big.bin'),
  ]);
}

async function alternate(
  state: RigState,
  name: 'A' | 'B',
  until: Promise<unknown>,
): Promise<number> {
  const ended = until.then(
    () => true,
    () => true,
  );
  let switches = 0;
  for (;;) {
    await setRoute(state, name, switches % 2 === 0 ? 'public' : 'lan');
    switches += 1;
    if (await Promise.race([ended, sleep(SWITCH_EVERY_MS).then(() => false)])) break;
  }
  await setRoute(state, name, 'lan');
  return switches;
}

async function expectHash(read: Running, fixture: Fixture): Promise<void> {
  const outcome = await withTimeout('the read', read.done, READ_LIMIT_MS);
  if (outcome.code !== 0)
    throw new Error(`The read exited ${String(outcome.code)}: ${outcome.stderr.trim()}`);
  const wanted = fixture.entries.find((entry) => entry.path === 'big.bin')?.sha256;
  if (outcome.stdout.trim() !== wanted)
    throw new Error(`The read hashed to ${outcome.stdout.trim()}, expected ${String(wanted)}.`);
}

async function readWhileSwitching(context: Context): Promise<void> {
  const fixture = await bigFixture();
  const state = await ready();
  const delivery = await written(context, state, fixture);
  const read = startRead(state, delivery);
  const switches = await alternate(state, 'B', read.done);
  await expectHash(read, fixture);
  if (switches < MINIMUM_SWITCHES)
    throw new Error(`The read ended after ${String(switches)} route switches, too early to count.`);
  context.notes.push(`${String(switches)} route switches during the read`);
}

async function uploadWhileSwitching(context: Context): Promise<void> {
  const fixture = await bigFixture();
  const state = await ready();
  const delivery = await prepareDelivery(state, fixture, `route-${context.token}`);
  const writer = startWriter(state, delivery);
  await awaitProgress(delivery, UPLOAD_SWITCH_FRACTION);
  const delivered = verifyDelivered(state, delivery);
  const switches = await alternate(state, 'A', delivered);
  await delivered;
  await finishWriter('the writer', writer);
  if (switches < MINIMUM_SWITCHES)
    throw new Error(
      `The upload ended after ${String(switches)} route switches, too early to count.`,
    );
  context.notes.push(`${String(switches)} route switches during the upload`);
}

async function readAcrossDisconnect(context: Context): Promise<void> {
  const fixture = await bigFixture();
  const state = await ready();
  const delivery = await written(context, state, fixture);
  const read = startRead(state, delivery);
  await sleep(SWITCH_EVERY_MS);
  await setRoute(state, 'B', 'none');
  await sleep(DISCONNECT_MS);
  await setRoute(state, 'B', 'lan');
  await expectHash(read, fixture);
}

async function uploadAcrossDisconnect(context: Context): Promise<void> {
  const fixture = await bigFixture();
  const state = await ready();
  const delivery = await prepareDelivery(state, fixture, `route-${context.token}`);
  const writer = startWriter(state, delivery);
  await awaitProgress(delivery, UPLOAD_DISCONNECT_FRACTION);
  await setRoute(state, 'A', 'none');
  await sleep(DISCONNECT_MS);
  await setRoute(state, 'A', 'lan');
  await verifyDelivered(state, delivery);
  await finishWriter('the writer', writer);
}

export const CASES: readonly SuiteCase[] = [
  { name: 'read/lan-public-lan', run: readWhileSwitching },
  { name: 'upload/lan-public-lan', run: uploadWhileSwitching },
  { name: 'read/disconnect-reconnect', run: readAcrossDisconnect },
  { name: 'upload/disconnect-reconnect', run: uploadAcrossDisconnect },
];

export function routeSwitch(args: readonly string[]): Promise<number> {
  return runSuite('route-switch', CASES, args);
}
