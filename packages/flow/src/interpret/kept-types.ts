import type { FlowType, JsonValue } from '@smarteverything/domain';

export interface KeptScope {
  readonly instance: string;
  readonly type: FlowType;
}

export interface KeptStart extends KeptScope {
  readonly start: JsonValue;
}
