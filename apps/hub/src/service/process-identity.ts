import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { HubTransportError } from '../client-network/policy';
export async function serviceProcessStart(pid: number): Promise<string> {
  if (process.platform !== 'linux')
    throw new HubTransportError('Verified service process identity requires Linux');
  const validPid = z.int().positive().parse(pid);
  const text = await readFile(`/proc/${String(validPid)}/stat`, 'utf8');
  const fields = text
    .slice(text.lastIndexOf(') ') + 2)
    .trim()
    .split(/\s+/);
  return z.string().regex(/^\d+$/).parse(fields[19]);
}
