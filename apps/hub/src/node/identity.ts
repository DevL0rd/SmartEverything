import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { cpus, hostname, networkInterfaces, platform, release, totalmem, uptime } from 'node:os';
import { NODE_HELLO, NODE_PROTOCOL_VERSION, type NodeHello } from '@smarteverything/domain';
import { readIdentity } from './collectors/linux/identity';
import { isMissing } from '../fs-util';

const MACHINE_ID_FILE = '/etc/machine-id';

async function installationId(file: string): Promise<string> {
  try {
    return (await readFile(file, 'utf8')).trim();
  } catch (cause) {
    if (!isMissing(cause)) throw cause;
    const id = randomBytes(16).toString('hex');
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, `${id}\n`, { mode: 0o600, flag: 'wx' });
    return id;
  }
}

export async function computerMachineId(installationFile: string): Promise<string> {
  return platform() === 'linux'
    ? (await readFile(MACHINE_ID_FILE, 'utf8')).trim()
    : installationId(installationFile);
}

export async function nodeIdentity(installationFile: string): Promise<NodeHello> {
  const now = new Date();
  if (platform() === 'linux') return readIdentity(false, uptime(), now);
  const processors = cpus();
  const interfaces = Object.entries(networkInterfaces()).flatMap(([name, addresses]) => {
    const external =
      addresses?.filter((address) => !address.internal && address.mac !== '00:00:00:00:00:00') ??
      [];
    const first = external.at(0);
    return first === undefined
      ? []
      : [
          {
            name,
            mac: first.mac.toLowerCase(),
            addresses: external.map((address) => address.address),
          },
        ];
  });
  return NODE_HELLO.parse({
    protocol: NODE_PROTOCOL_VERSION,
    machineId: await installationId(installationFile),
    hostname: hostname(),
    os: { name: platform(), kernel: release() },
    hardware: { vendor: null, product: null, portable: false },
    cpu: {
      model: processors.at(0)?.model ?? 'Processor',
      threads: Math.max(processors.length, 1),
      hybrid: false,
    },
    memoryBytes: totalmem(),
    interfaces,
    bootedAt: new Date(now.getTime() - uptime() * 1000).toISOString(),
  });
}
