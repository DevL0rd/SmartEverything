import { z } from 'zod';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING, somethingToChange } from './primitives';
import { BUTTON_NAME, IR_APPLIANCE_ROW, IR_CODE_FORMAT } from './rows-media';
import { IR_AC_MODES, IR_REMOTE_STATE, IR_SPEED, IR_TEMP } from '../ir-remote-state';

export const IR_APPLIANCE = IR_APPLIANCE_ROW.extend({
  device_id: ID.nullable().describe('The device the appliance is shown as; null until published'),
  online: z.boolean().describe('Whether its blaster is bound and online'),
  keys: z.array(BUTTON_NAME).describe('The buttons it has a code for'),
});

export type IrAppliance = z.infer<typeof IR_APPLIANCE>;

export const IR_APPLIANCE_APPLY = somethingToChange({
  on: z.boolean().describe('Turn the appliance on or off'),
  mode: z.enum(IR_AC_MODES).describe('The air conditioner mode'),
  temp: IR_TEMP,
  speed: IR_SPEED,
});

export type IrApplianceApply = z.infer<typeof IR_APPLIANCE_APPLY>;

const APPLIANCE_PARAMS = z.strictObject({ applianceId: ID });

export const IR_APPLIANCE_ENDPOINTS = {
  listIrAppliances: endpoint({
    method: 'GET',
    path: '/api/ir-appliances',
    access: 'member',
    summary:
      'Every infrared appliance shown as its own device, with its blaster, whether it is online and its buttons',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(IR_APPLIANCE),
  }),
  promoteIrRemote: endpoint({
    method: 'POST',
    path: '/api/ir-remotes/:remoteId/promote',
    access: 'member',
    summary:
      'Turn a learned remote into its own device that keeps its name, room, buttons and assumed state and uses its blaster to send; promoting it again answers the same appliance',
    params: z.strictObject({ remoteId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: IR_APPLIANCE,
  }),
  rebindIrAppliance: endpoint({
    method: 'PATCH',
    path: '/api/ir-appliances/:applianceId/blaster',
    access: 'member',
    summary: 'Send an infrared appliance through another IR blaster',
    params: APPLIANCE_PARAMS,
    query: NOTHING,
    body: z.strictObject({ blaster_id: ID }),
    response: IR_APPLIANCE,
  }),
  saveIrApplianceKey: endpoint({
    method: 'PUT',
    path: '/api/ir-appliances/:applianceId/keys',
    access: 'member',
    summary: 'Save the code of a button on an infrared appliance, replacing the one it had',
    params: APPLIANCE_PARAMS,
    query: NOTHING,
    body: z.strictObject({
      button: BUTTON_NAME,
      format: IR_CODE_FORMAT,
      code: z.string().min(1).max(20_000),
    }),
    response: IR_APPLIANCE,
  }),
  applyIrAppliance: endpoint({
    method: 'POST',
    path: '/api/ir-appliances/:applianceId/apply',
    access: 'member',
    summary:
      'Bring an infrared appliance to a state (on, mode, temperature, fan speed) in one request; the hub sends what its buttons need from the state it assumes and answers the new assumed state',
    params: APPLIANCE_PARAMS,
    query: NOTHING,
    body: IR_APPLIANCE_APPLY,
    response: IR_REMOTE_STATE,
  }),
  removeIrAppliance: endpoint({
    method: 'DELETE',
    path: '/api/ir-appliances/:applianceId',
    access: 'member',
    summary: 'Remove an infrared appliance, its device, its buttons and its assumed state',
    params: APPLIANCE_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
