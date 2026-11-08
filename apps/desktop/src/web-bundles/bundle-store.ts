import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { WEB_RUNTIME } from './packaged-manifest.js';

const log = new Logger('desktop.web-update');

export const EMBEDDED = 'embedded';
const STATE_FILE = 'state.json';
const STATE_NEXT_FILE = 'state.json.next';
const BUNDLE_FILE = 'bundle.json';

const BUNDLE_ID = z.string().regex(/^[A-Za-z0-9_-]+$/u);
const BUNDLE_REF = z.union([z.literal(EMBEDDED), BUNDLE_ID]);
const ISO_DATE = z.iso.datetime({ offset: true });

const STATE = z.object({
  active: BUNDLE_REF,
  previous: BUNDLE_REF,
  trial: z.boolean(),
  failed: z.array(BUNDLE_ID),
});

const BUNDLE_MANIFEST = z.object({
  id: BUNDLE_ID,
  runtimeVersion: WEB_RUNTIME,
  createdAt: ISO_DATE,
});

type State = z.infer<typeof STATE>;

const FRESH_STATE: State = { active: EMBEDDED, previous: EMBEDDED, trial: false, failed: [] };

export interface WebBuild {
  readonly runtime: string;
  readonly embeddedCreatedAt: string;
  readonly embeddedRoot: string;
}

export type RevertResult =
  | { readonly kind: 'reverted'; readonly failedId: string; readonly restored: string }
  | { readonly kind: 'not_in_trial' };

export class WebBundleIdError extends Error {
  override readonly name = 'WebBundleIdError';

  constructor(received: string) {
    super(
      `A web bundle id must be letters, digits, underscores or hyphens and not "${EMBEDDED}"; received ${JSON.stringify(received)}`,
    );
  }
}

class WebBundleRollbackError extends Error {
  override readonly name = 'WebBundleRollbackError';

  constructor(expected: string, active: string, trial: boolean) {
    super(
      `Cannot return to the built-in bundle: expected confirmed bundle ${expected}, received ${active} (trial: ${String(trial)})`,
    );
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isUnreadable(error: unknown): boolean {
  return error instanceof SyntaxError || error instanceof z.ZodError;
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error: unknown) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }
}

async function writeAtomically(directory: string, state: State): Promise<void> {
  await mkdir(directory, { recursive: true });
  const next = path.join(directory, STATE_NEXT_FILE);
  const handle = await open(next, 'w');
  try {
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(next, path.join(directory, STATE_FILE));
}

async function readState(directory: string): Promise<State> {
  const file = path.join(directory, STATE_FILE);
  try {
    return STATE.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch (error: unknown) {
    if (isMissing(error)) {
      return FRESH_STATE;
    }
    if (isUnreadable(error)) {
      log.warn('web_bundle.state_unreadable', {
        file,
        expected: 'state.json',
        error: String(error),
      });
      await writeAtomically(directory, FRESH_STATE);
      return FRESH_STATE;
    }
    throw error;
  }
}

type Unfit = 'missing_folder' | 'unreadable_bundle' | 'other_id' | 'runtime_mismatch' | 'not_newer';

async function unfitReason(directory: string, id: string, build: WebBuild): Promise<Unfit | null> {
  const folder = path.join(directory, id);
  if (!(await exists(folder))) {
    return 'missing_folder';
  }
  let manifest: z.infer<typeof BUNDLE_MANIFEST>;
  try {
    manifest = BUNDLE_MANIFEST.parse(
      JSON.parse(await readFile(path.join(folder, BUNDLE_FILE), 'utf8')),
    );
  } catch (error: unknown) {
    if (isMissing(error) || isUnreadable(error)) {
      return 'unreadable_bundle';
    }
    throw error;
  }
  if (manifest.id !== id) {
    return 'other_id';
  }
  if (manifest.runtimeVersion !== build.runtime) {
    return 'runtime_mismatch';
  }
  return Date.parse(manifest.createdAt) > Date.parse(build.embeddedCreatedAt) ? null : 'not_newer';
}

function requireBundleId(id: string): void {
  if (id === EMBEDDED || !BUNDLE_ID.safeParse(id).success) {
    throw new WebBundleIdError(id);
  }
}

export class WebBundleStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly directory: string) {}

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work, work);
    this.queue = result;
    return result;
  }

  rootFor(build: WebBuild): Promise<string> {
    return this.serialized(async () => {
      const state = await readState(this.directory);
      if (state.active === EMBEDDED) {
        return build.embeddedRoot;
      }
      const reason = await unfitReason(this.directory, state.active, build);
      if (reason === null) {
        return path.join(this.directory, state.active);
      }
      log.warn('web_bundle.reset', { id: state.active, reason, runtime: build.runtime });
      await writeAtomically(this.directory, {
        ...state,
        active: EMBEDDED,
        previous: EMBEDDED,
        trial: false,
      });
      return build.embeddedRoot;
    });
  }

  begin(id: string): Promise<void> {
    return this.serialized(async () => {
      requireBundleId(id);
      const state = await readState(this.directory);
      const previous = state.trial ? state.previous : state.active;
      await writeAtomically(this.directory, {
        active: id,
        previous,
        trial: true,
        failed: state.failed.filter((failed) => failed !== id),
      });
      log.info('web_bundle.begin', { id, previous });
    });
  }

  confirm(): Promise<void> {
    return this.serialized(async () => {
      const state = await readState(this.directory);
      if (!state.trial) {
        return;
      }
      await writeAtomically(this.directory, { ...state, trial: false });
      log.info('web_bundle.confirm', { id: state.active });
    });
  }

  restoreEmbedded(expected: string): Promise<void> {
    return this.serialized(async () => {
      const state = await readState(this.directory);
      if (state.active !== expected || state.trial) {
        throw new WebBundleRollbackError(expected, state.active, state.trial);
      }
      await writeAtomically(this.directory, { ...FRESH_STATE, failed: state.failed });
      log.info('web_bundle.embedded_restored', { previous: expected });
    });
  }

  revert(reason: string): Promise<RevertResult> {
    return this.serialized(async () => {
      const state = await readState(this.directory);
      if (!state.trial) {
        return { kind: 'not_in_trial' } as const;
      }
      const failed = state.active === EMBEDDED ? state.failed : [...state.failed, state.active];
      await writeAtomically(this.directory, {
        active: state.previous,
        previous: state.previous,
        trial: false,
        failed,
      });
      log.warn('web_bundle.revert', { failedId: state.active, restored: state.previous, reason });
      return { kind: 'reverted', failedId: state.active, restored: state.previous } as const;
    });
  }

  trialId(): Promise<string | null> {
    return this.serialized(async () => {
      const state = await readState(this.directory);
      return state.trial ? state.active : null;
    });
  }

  failed(): Promise<readonly string[]> {
    return this.serialized(async () => (await readState(this.directory)).failed);
  }

  removeSuperseded(): Promise<void> {
    return this.serialized(async () => {
      const state = await readState(this.directory);
      const entries = await readdir(this.directory, { withFileTypes: true }).catch(
        (error: unknown) => {
          if (isMissing(error)) {
            return [];
          }
          throw error;
        },
      );
      for (const entry of entries) {
        const kept = entry.name === state.active || entry.name === state.previous;
        if (entry.isDirectory() && BUNDLE_ID.safeParse(entry.name).success && !kept) {
          await rm(path.join(this.directory, entry.name), { recursive: true, force: true });
          log.info('web_bundle.removed', { id: entry.name });
        }
      }
    });
  }
}
