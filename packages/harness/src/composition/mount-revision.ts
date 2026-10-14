import { AsyncLocalStorage } from 'node:async_hooks';
import { HarnessRuntimeError } from '../host/errors';

export class HarnessMountRevisionBinding {
  constructor(private current: string) {}
  revision(): string {
    return this.current;
  }
  refresh(revision: string): void {
    this.current = revision;
  }
}
const revisions = new AsyncLocalStorage<HarnessMountRevisionBinding>();
export function withHarnessMountRevision<T>(
  revision: string | HarnessMountRevisionBinding,
  work: () => Promise<T>,
): Promise<T> {
  const binding =
    typeof revision === 'string' ? new HarnessMountRevisionBinding(revision) : revision;
  return revisions.run(binding, work);
}
export function harnessMountRevisionBinding(): HarnessMountRevisionBinding {
  const binding = revisions.getStore();
  if (binding === undefined)
    throw new HarnessRuntimeError(
      'composition_incompatible',
      'Managed package has no verified applied configuration revision.',
    );
  return binding;
}
export function harnessMountRevision(): string {
  return harnessMountRevisionBinding().revision();
}
