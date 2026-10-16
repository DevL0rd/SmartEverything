import { z } from 'zod';
import { defineBuiltinPlugin } from '../define';
import { WIZ_CONTROL_PORT, WIZ_PUSH_PORT } from './protocol';
import { WizRuntime } from './runtime';

export const wizPlugin = defineBuiltinPlugin({
  manifest: {
    id: 'wiz',
    name: 'WiZ',
    version: '1.0.0',
    publisher: 'SmartEverything',
    icon: 'lightbulb',
    description:
      'Discover and control WiZ lights on your home network, with immediate local updates. In WiZ, enable Local network communication and set Security to Allow all controls.',
    permissions: {
      listen: [
        { protocol: 'udp', port: WIZ_CONTROL_PORT, purpose: 'WiZ discovery and command responses' },
        { protocol: 'udp', port: WIZ_PUSH_PORT, purpose: 'WiZ immediate light state updates' },
      ],
    },
    contributes: { deviceFamilies: ['light'] },
  },
  settings: z.strictObject({}),
  start: (ctx) => new WizRuntime(ctx).start(),
});
