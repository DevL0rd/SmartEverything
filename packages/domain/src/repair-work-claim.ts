import { z } from 'zod';
import { PLUGIN_ID } from './plugin-parts';

export const REPAIR_WORK_COMPONENT = z.union([
  z.enum(['hub.service', 'hub.go2rtc']),
  z.templateLiteral(['plugin:', PLUGIN_ID]),
  z.templateLiteral([z.enum(['node:', 'app:', 'desktop:']), z.uuid()]),
]);

export const REPAIR_WORK_CLAIM_INPUT = z.strictObject({
  component: REPAIR_WORK_COMPONENT.describe(
    'Component being worked on. Use hub.service, hub.go2rtc or the exact plugin, node, app or desktop source ID from logs.',
  ),
});

export type RepairWorkComponent = z.infer<typeof REPAIR_WORK_COMPONENT>;
