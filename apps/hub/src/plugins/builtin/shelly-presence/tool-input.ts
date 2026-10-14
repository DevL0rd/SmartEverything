import {
  ApiError,
  SHELLY_PRESENCE_ACTION,
  SHELLY_PRESENCE_ACTION_REQUEST,
  SHELLY_PRESENCE_OPERATIONS,
  type ShellyPresenceField,
} from '@smarteverything/domain';
import { z } from 'zod';

type ActionOption = (typeof SHELLY_PRESENCE_ACTION.options)[number];
type ActionInput = z.ZodObject<{
  externalId: typeof SHELLY_PRESENCE_ACTION_REQUEST.shape.externalId;
  operation: z.ZodDiscriminatedUnion<[ActionOption, ...ActionOption[]], 'action'>;
}>;

export function shellyActionInput(permission: ShellyPresenceField['permission']): ActionInput {
  const options = SHELLY_PRESENCE_ACTION.options.filter((option) => {
    const action = option.shape.action.value;
    const descriptor = SHELLY_PRESENCE_OPERATIONS.find((entry) => entry.action === action);
    if (descriptor === undefined)
      throw new ApiError('internal', `Shelly action ${action} has no permission descriptor.`);
    return (descriptor.possiblePermissions ?? [descriptor.permission]).includes(permission);
  });
  const [first, ...rest] = options;
  if (first === undefined)
    throw new ApiError('internal', `Shelly permission ${permission} has no actions.`);
  return SHELLY_PRESENCE_ACTION_REQUEST.extend({
    operation: z.discriminatedUnion('action', [first, ...rest]),
  });
}
