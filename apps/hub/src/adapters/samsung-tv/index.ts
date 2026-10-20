import type { ProviderModule } from '../contract';
import { createSamsungTvAdapter } from './adapter';
import { SAMSUNG_TV_IO, type SamsungTvIo } from './io';
import { linkSamsungTv, televisionsOf } from './link';

export function createSamsungTvModule(io: SamsungTvIo): ProviderModule<'samsung_tv'> {
  return {
    provider: 'samsung_tv',
    link: (credentials, context) => linkSamsungTv(credentials, io, context),
    start: (account, context) =>
      Promise.resolve(createSamsungTvAdapter(televisionsOf(account), io, context)),
  };
}

export const samsungTvModule: ProviderModule<'samsung_tv'> = createSamsungTvModule(SAMSUNG_TV_IO);
