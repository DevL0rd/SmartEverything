import { useMemo, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { background, Logger } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { usePausable } from '../../../design/external-store';
import { useStableCallback } from '../../../design/use-stable-callback';
import { useDevices, useIsOwner } from '../../../store/selectors';
import { useSecrets } from '../data/use-secrets';
import { deviceClipboard } from '../editor/host/clipboard-port';
import { rowOpsOf } from '../editor/host/row-ops';
import type { RowEdit } from '../editor/inspector/sections/rows-model';
import {
  ValueServicesContext,
  type ValueServices,
} from '../editor/inspector/values/value-services';
import type { Insertion } from '../editor/palette/armed-insert';
import type { InspectorBinding } from '../editor/screen/editor-panes';
import type { DocumentStore } from '../model/editor/document-store';
import { insertOps, type InsertEnv } from '../model/editor/insert';
import { snippetsFor } from '../model/templates/snippets';
import { links } from '../routes';
import { inspectorEnvOf, type EditorContext } from './editor-context';
import { useReferenceCatalogue } from './use-environment';

const log = new Logger('app.automations');

export function unavailable(what: string): void {
  notify({ message: `${what} isn’t available in this editor yet.` });
}

export interface GesturePort {
  readonly beginGesture: () => void;
  readonly endGesture: () => void;
}

export function EditorValueServices({
  store,
  context,
  children,
}: {
  readonly store: DocumentStore;
  readonly context: EditorContext;
  readonly children: ReactNode;
}): ReactNode {
  const router = useRouter();
  const program = usePausable(store.state.subscribe, () => store.state.get().program);
  const layout = usePausable(store.state.subscribe, () => store.state.get().layout);
  const references = useReferenceCatalogue();
  const owner = useIsOwner();
  const secrets = useSecrets(owner).data;
  const services = useMemo(
    (): ValueServices => ({
      env: inspectorEnvOf({ program, layout, target: null, findings: [] }, context),
      references,
      secrets: {
        options: (secrets ?? []).map((secret) => ({ id: secret.id, label: secret.name })),
        owner,
        onAdd: (): void => {
          router.push(links.secrets());
        },
      },
    }),
    [program, layout, context, references, secrets, owner, router],
  );
  return <ValueServicesContext value={services}>{children}</ValueServicesContext>;
}

function editRows(store: DocumentStore, key: string, edits: readonly RowEdit[]): void {
  const result = rowOpsOf(key, edits);
  if (result.ok) {
    store.apply(result.ops);
    return;
  }
  log.warn('automations.row_edit_refused', { key, reason: result.reason });
  notify({ message: result.reason });
}

function copyReference(text: string): void {
  background(
    deviceClipboard.write(text).then(() => {
      notify({ message: 'Copied', tone: 'positive' });
    }),
    'automations.copy_reference',
  );
}

export interface BindingInput {
  readonly store: DocumentStore;
  readonly context: EditorContext;
  readonly gestures: GesturePort;
  readonly onInterface: () => void;
  readonly onUnavailable: (what: string) => void;
}

export function useInspectorBinding(input: BindingInput): InspectorBinding {
  const { store, context, gestures } = input;
  const onInterface = useStableCallback(input.onInterface);
  const onUnavailable = useStableCallback(input.onUnavailable);
  return useMemo(
    (): InspectorBinding => ({
      actions: {
        apply: (ops): void => {
          store.apply(ops);
        },
        editRows: (key, edits): void => {
          editRows(store, key, edits);
        },
        gesture: (run): void => {
          gestures.beginGesture();
          store.beginGesture();
          try {
            run();
          } finally {
            store.endGesture();
            gestures.endGesture();
          }
        },
        copyReference,
        openHelp: (): void => {
          onUnavailable('Step help');
        },
        setFreePosition: (id, free): void => {
          if (free) onUnavailable('Placing a step freely');
          else store.editLayout((layout) => ({ ...layout, nodes: withoutKey(layout.nodes, id) }));
        },
        selectIteration: (): void => {
          onUnavailable('Choosing a loop round');
        },
        editInterface: onInterface,
      },
      buildEnv: (envInput) => inspectorEnvOf(envInput, context),
    }),
    [store, context, gestures, onInterface, onUnavailable],
  );
}

function withoutKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([entry]) => entry !== key));
}

export function useInsert(
  store: DocumentStore,
  context: EditorContext,
  onReusable: () => void,
): (insertion: Insertion) => void {
  const devices = useDevices();
  const env = useMemo(
    (): InsertEnv => ({
      kind: (id) => context.registry.get(id),
      snippet: (id) =>
        snippetsFor(devices)
          .find((snippet) => snippet.id === id)
          ?.build(),
    }),
    [context.registry, devices],
  );
  return useStableCallback((insertion: Insertion): void => {
    const outcome = insertOps(insertion.choice, insertion.point, store.state.get().program, env);
    if (outcome.t === 'ops') store.apply(outcome.ops);
    else if (outcome.t === 'reusable') onReusable();
    else notify({ message: outcome.reason });
  });
}
