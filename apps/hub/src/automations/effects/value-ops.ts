import {
  ApiError,
  AUTOMATION_VALUE_OPERATION,
  type AutomationValueContent,
  type AutomationValueOperation,
  type AutomationValueRow,
  type JsonValue,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';

export interface ValueChange {
  readonly valueId: string;
  readonly op: string;
  readonly amount: JsonValue | undefined;
}

function operationOf(
  content: AutomationValueContent,
  change: ValueChange,
): AutomationValueOperation {
  const parsed = AUTOMATION_VALUE_OPERATION.safeParse({
    kind: content.kind,
    operation: {
      type: change.op,
      ...(change.amount === undefined ? {} : { value: change.amount }),
    },
  });
  if (!parsed.success)
    throw new ApiError(
      'invalid_request',
      `The Value ${content.name} does not accept ${change.op}.`,
    );
  return parsed.data;
}

export function applyValueChange(
  store: Pick<Store, 'automationValues'>,
  change: ValueChange,
): AutomationValueRow {
  const { content } = store.automationValues.byId(change.valueId);
  return store.automationValues.apply(change.valueId, operationOf(content, change));
}
