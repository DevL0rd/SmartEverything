import type { JsonValue } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { StringPairsInput } from './string-pairs-input';

export function HeaderInput({
  change,
}: {
  readonly change: (value: JsonValue) => void;
}): ReactNode {
  return <StringPairsInput title="Headers" value={{}} change={change} />;
}
