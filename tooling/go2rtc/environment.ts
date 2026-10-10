import { env } from 'node:process';
import { z } from 'zod';

const HOST = z.record(z.string(), z.string());

export function hostEnvironment(): Readonly<Record<string, string>> {
  return HOST.parse(Object.fromEntries(Object.entries(env)));
}
