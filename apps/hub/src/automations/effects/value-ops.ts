import {
  ApiError,
  AUTOMATION_VALUE_OPERATION,
  type AutomationValueContent,
  type AutomationValueOperation,
  type AutomationValueRow,
  type JsonValue,
} from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';

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
  store: Pick<HostStore, 'automationValues'>,
  change: ValueChange,
): AutomationValueRow {
  const { content } = store.automationValues.byId(change.valueId);
  return store.automationValues.apply(change.valueId, operationOf(content, change));
}

export interface AppliedValueChange {
  readonly before: JsonValue;
  readonly row: AutomationValueRow;
}

export const APPLY_HOME_VALUE_UNIT = storeUnit<ValueChange, AppliedValueChange>(
  (store, change: ValueChange): AppliedValueChange => ({
    before: store.automationValues.byId(change.valueId).content.value,
    row: applyValueChange(store, change),
  }),
);
