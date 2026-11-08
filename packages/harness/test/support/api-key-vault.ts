import type { ApiKeyVault } from '../../src/plugins/providers';

export class MemoryApiKeyVault implements ApiKeyVault {
  readonly source = 'test-vault';
  private readonly values = new Map<string, string>();
  private readonly listeners = new Set<(reference: string) => void>();

  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [reference, value] of Object.entries(initial)) this.values.set(reference, value);
  }

  read = (reference: string): Promise<string | undefined> =>
    Promise.resolve(this.values.get(reference));

  write = (reference: string, value: string): Promise<void> => {
    this.values.set(reference, value);
    this.changed(reference);
    return Promise.resolve();
  };

  remove = (reference: string): Promise<void> => {
    this.values.delete(reference);
    this.changed(reference);
    return Promise.resolve();
  };

  watch = (listener: (reference: string) => void): (() => void) => {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  };

  private changed(reference: string): void {
    for (const listener of this.listeners) listener(reference);
  }
}
