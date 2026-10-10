import { getRandomValues } from 'expo-crypto';
import { Logger } from '@smarteverything/logging';

const log = new Logger('app.crypto');

function hasRandomValues(holder: unknown): boolean {
  return (
    typeof holder === 'object' &&
    holder !== null &&
    typeof Reflect.get(holder, 'getRandomValues') === 'function'
  );
}

export function provideRandomValues(): void {
  const existing: unknown = Reflect.get(globalThis, 'crypto');
  if (hasRandomValues(existing)) {
    return;
  }
  if (typeof existing === 'object' && existing !== null) {
    Reflect.set(existing, 'getRandomValues', getRandomValues);
  } else {
    Reflect.set(globalThis, 'crypto', { getRandomValues });
  }
  log.info('crypto.random_values_installed', { source: 'expo-crypto' });
}
