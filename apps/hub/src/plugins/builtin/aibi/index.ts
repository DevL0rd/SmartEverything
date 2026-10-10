import { cloudVia } from './cloud';
import { lanAddress } from './lan-address';
import { createAibiPlugin } from './plugin';

export const aibiPlugin = createAibiPlugin({
  cloud: cloudVia,
  address: lanAddress,
  now: () => new Date(),
});
