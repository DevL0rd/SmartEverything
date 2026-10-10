import { PROVIDER_INFO, type Provider } from '@smarteverything/domain';
import type { Brand } from '../../../components/brand-glyphs';

export const PROVIDER_BRAND: Readonly<Record<Provider, Brand>> = {
  xiaomi: 'xiaomi',
  tuya: 'tuya',
  smartthings: 'smartthings',
  samsung_tv: 'samsung',
  local: 'smarteverything',
};

export const CONNECT_FLOW = {
  xiaomi: 'xiaomi',
  tuya: 'tuya',
  smartthings: 'smartthings',
} as const;

export type AddableProvider = keyof typeof CONNECT_FLOW;

export function isAddable(provider: Provider): provider is AddableProvider {
  return PROVIDER_INFO[provider].addable && Object.hasOwn(CONNECT_FLOW, provider);
}
