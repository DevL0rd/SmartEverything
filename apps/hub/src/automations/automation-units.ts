import type { FunctionV3 } from '@smarteverything/domain';
import { flatFunction } from '../store/repositories/automation-trees';
import { storeUnit } from '../store/host/unit';

export interface FunctionPin {
  readonly id: string;
  readonly pin: number | null;
}

export interface FunctionBody extends FunctionPin {
  readonly body: FunctionV3 | null;
}

export const AUTOMATION_FUNCTION_BODIES_UNIT = storeUnit(
  (store, pins: readonly FunctionPin[]): FunctionBody[] =>
    pins.map(({ id, pin }) => {
      const functions = store.automationFunctions;
      const row =
        pin !== null
          ? functions.findRevision(id, pin)
          : functions.find(id) === undefined
            ? undefined
            : functions.latest(id);
      return { id, pin, body: row === undefined ? null : flatFunction(row.definition) };
    }),
);
