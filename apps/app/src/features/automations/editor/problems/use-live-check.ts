import type { NodeRegistry } from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { useMemo } from 'react';
import { useStableValue } from '../../../../components/use-stable-value';
import { usePausable } from '../../../../design/external-store';
import type { DocumentStore } from '../../model/editor/document-store';
import { deepEqual } from '../../model/editor/deep-equal';
import type { LiveCheck } from './problem-model';
import { runLiveCheck } from './problem-model';

export function useLiveCheck(
  store: DocumentStore,
  context: LintContext,
  registry: NodeRegistry,
): LiveCheck {
  const program = usePausable(store.state.subscribe, () => store.state.get().program);
  const check = useMemo(
    () => runLiveCheck(program, context, registry),
    [program, context, registry],
  );
  return useStableValue(check, deepEqual);
}
