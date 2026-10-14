import { AsyncLocalStorage } from 'node:async_hooks';
interface ProviderToolAuthority {
  readonly validate: (write: boolean) => void;
  readonly hubOsBan: boolean;
}
const context = new AsyncLocalStorage<ProviderToolAuthority>();
export function withProviderToolAuthority<T>(authority: ProviderToolAuthority, work: () => T): T {
  authority.validate(false);
  return context.run(authority, work);
}
export function currentProviderToolAuthority(): ProviderToolAuthority | undefined {
  return context.getStore();
}
export function providerHubOsBan(): boolean {
  return context.getStore()?.hubOsBan === true;
}
