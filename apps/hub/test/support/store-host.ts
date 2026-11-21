import { inject } from 'vitest';
import type { StoreHostSetup } from '../../src/store/store';

declare module 'vitest' {
  export interface ProvidedContext {
    readonly storeHostScript: string;
  }
}

export function testStoreHost(): StoreHostSetup {
  return { script: inject('storeHostScript'), readers: 1 };
}
