import { NODE_HELLO, type NodeHello, type NodeInterface } from '@smarteverything/domain';
import { existsSync, readFileSync } from 'node:fs';
import { cpus, hostname, networkInterfaces, release, totalmem } from 'node:os';
import { physicalInterfaces } from './network';

function osName(): string {
  const match = /^PRETTY_NAME="?([^"\n]+)"?$/m.exec(readFileSync('/etc/os-release', 'utf8'));
  return match?.[1] ?? 'Linux';
}

function cpuModel(): string {
  const match = /^model name\s*:\s*(.+)$/m.exec(readFileSync('/proc/cpuinfo', 'utf8'));
  return match?.[1]?.trim() ?? 'Processor';
}

const DMI_ROOT = '/sys/class/dmi/id';
const PORTABLE_CHASSIS: ReadonlySet<number> = new Set([8, 9, 10, 11, 14, 30, 31, 32]);

function dmi(field: string): string | null {
  const path = `${DMI_ROOT}/${field}`;
  const value = existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
  return value === '' ? null : value;
}

function hardwareOf(): NodeHello['hardware'] {
  return {
    vendor: dmi('sys_vendor'),
    product: dmi('product_name'),
    portable: PORTABLE_CHASSIS.has(Number(dmi('chassis_type'))),
  };
}

function interfacesOf(): NodeInterface[] {
  const addresses = networkInterfaces();
  return [...physicalInterfaces()].map((name) => ({
    name,
    mac: readFileSync(`/sys/class/net/${name}/address`, 'utf8').trim(),
    addresses: (addresses[name] ?? []).map((address) => address.address),
  }));
}

export function readIdentity(hybrid: boolean, uptimeSeconds: number, now: Date): NodeHello {
  return NODE_HELLO.parse({
    machineId: readFileSync('/etc/machine-id', 'utf8').trim(),
    hostname: hostname(),
    os: { name: osName(), kernel: release() },
    hardware: hardwareOf(),
    cpu: { model: cpuModel(), threads: cpus().length, hybrid },
    memoryBytes: totalmem(),
    interfaces: interfacesOf(),
    bootedAt: new Date(now.getTime() - uptimeSeconds * 1000).toISOString(),
  });
}
