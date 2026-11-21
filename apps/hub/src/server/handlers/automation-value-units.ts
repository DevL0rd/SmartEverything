import {
  ApiError,
  AutomationValueError,
  type AutomationValueContent,
  type AutomationValueOperation,
} from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';

export function valueWrite<T>(work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof AutomationValueError) throw new ApiError('invalid_request', cause.message);
    throw cause;
  }
}

export const AUTOMATION_VALUE_WRITE_UNITS = {
  automationValueCreate: storeUnit(
    (store, { content }: { readonly content: AutomationValueContent }) =>
      valueWrite(() => store.automationValues.create(content)),
  ),
  automationValueApply: storeUnit(
    (store, input: { readonly valueId: string; readonly operation: AutomationValueOperation }) =>
      valueWrite(() => store.automationValues.apply(input.valueId, input.operation)),
  ),
} as const;
