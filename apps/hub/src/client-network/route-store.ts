import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import {
  NATIVE_HUB_ROUTE_CONFIGURATION,
  type NativeHubRouteConfiguration,
} from '@smarteverything/domain';

const STORED_ROUTE = z.strictObject({
  version: z.literal(1),
  credentialDigest: z.string().regex(/^[0-9a-f]{64}$/),
  configuration: NATIVE_HUB_ROUTE_CONFIGURATION.nullable(),
});
export class NodeRouteStore {
  private readonly path: string;
  private readonly credentialDigest: string;
  private generation = 0;
  private writing: Promise<void> = Promise.resolve();
  constructor(directory: string, token: string) {
    this.path = join(directory, 'node-route.json');
    this.credentialDigest = createHash('sha256').update(token).digest('hex');
  }
  async read(): Promise<NativeHubRouteConfiguration | null> {
    try {
      const stored = STORED_ROUTE.parse(JSON.parse(await readFile(this.path, 'utf8')));
      return stored.credentialDigest === this.credentialDigest ? stored.configuration : null;
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return null;
      throw cause;
    }
  }
  write(configuration: NativeHubRouteConfiguration): Promise<void> {
    const generation = this.generation;
    const data = STORED_ROUTE.parse({
      version: 1,
      credentialDigest: this.credentialDigest,
      configuration,
    });
    return this.enqueue(async (): Promise<void> => {
      if (generation === this.generation) await this.persist(data);
    });
  }
  withdraw(): Promise<void> {
    this.generation += 1;
    const data = STORED_ROUTE.parse({
      version: 1,
      credentialDigest: this.credentialDigest,
      configuration: null,
    });
    return this.enqueue(() => this.persist(data));
  }
  private enqueue(operation: () => Promise<void>): Promise<void> {
    this.writing = this.writing.then(operation, operation);
    return this.writing;
  }
  private async persist(data: z.infer<typeof STORED_ROUTE>): Promise<void> {
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    try {
      await writeFile(temporary, `${JSON.stringify(data)}\n`, { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
