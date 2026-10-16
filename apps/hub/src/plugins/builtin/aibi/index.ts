import { cloudVia } from './cloud';
import { watchAibiAddress } from './address-watch';
import { lanAddress } from './lan-address';
import { createAibiPlugin } from './plugin';

export const aibiPlugin = createAibiPlugin({
  cloud: cloudVia,
  address: lanAddress,
  watchAddress: watchAibiAddress,
  now: () => new Date(),
});
