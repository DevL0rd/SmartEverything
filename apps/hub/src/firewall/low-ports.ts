import type { LowPorts } from '@smarteverything/domain';
import { z } from 'zod';
import type { FirewallSystem } from './system';

const UNPRIVILEGED_PORT_FILE = '/proc/sys/net/ipv4/ip_unprivileged_port_start';

const FIRST_UNPRIVILEGED = 1024;

const PORT_START = z
  .string()
  .trim()
  .regex(/^\d{1,5}$/)
  .transform(Number);

export async function lowPortsOf(
  system: FirewallSystem,
  ports: readonly number[],
): Promise<LowPorts | null> {
  const lowest = Math.min(...ports.filter((port) => port < FIRST_UNPRIVILEGED));
  if (system.platform !== 'linux' || !Number.isFinite(lowest)) {
    return null;
  }
  const text = await system.read(UNPRIVILEGED_PORT_FILE);
  const current = PORT_START.safeParse(text);
  if (!current.success) {
    return { start: lowest, state: 'unknown' };
  }
  return { start: lowest, state: current.data <= lowest ? 'open' : 'missing' };
}
