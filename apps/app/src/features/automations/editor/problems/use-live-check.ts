import type { NodeRegistry } from '@smarteverything/domain';
import type { LintContext } from '@smarteverything/flow/check/lint';
import { useMemo } from 'react';
import { usePausable } from '../../../../design/external-store';
import type { DocumentStore } from '../../model/editor/document-store';
import type { LiveCheck } from './problem-model';
import { runLiveCheck } from './problem-model';

export function useLiveCheck(
  store: DocumentStore,
  context: LintContext,
  registry: NodeRegistry,
): LiveCheck {
  const program = usePausable(store.state.subscribe, () => store.state.get().program);
  return useMemo(() => runLiveCheck(program, context, registry), [program, context, registry]);
}
