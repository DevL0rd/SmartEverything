import { useMemo, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import type { OptionSourceId } from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { usePausable } from '../../../design/external-store';
import { useStableCallback } from '../../../design/use-stable-callback';
import { useDevices, useIsOwner } from '../../../store/selectors';
import { useSecrets } from '../data/use-secrets';
import { InstanceHostProvider, type InstanceHost } from '../functions/edit/instance-host';
import { applyGraphIntent, type GraphIntent } from '../editor/host/apply-intents';
import { deviceClipboard } from '../editor/host/clipboard-port';
import { runInsertion, type InsertEnv } from '../editor/host/insert-choice';
import type { IntentEnv, IntentOutcome } from '../editor/host/intent-env';
import { NOTHING_MEASURED, useIntentRuntime } from '../editor/host/use-intent-runtime';
import type { DeviceScope } from '../editor/inspector/values/literal-model';
import {
  ValueServicesContext,
  type DeviceChoices,
  type ValueServices,
} from '../editor/inspector/values/value-services';
import type { Insertion } from '../editor/palette/armed-insert';
import type { InspectorBinding } from '../editor/screen/editor-panes';
import type { DocumentStore } from '../model/editor/document-store';
import { snippetsFor } from '../model/templates/snippets';
import { links } from '../routes';
import { inspectorEnvOf, type EditorContext } from './editor-context';
import { resolveOptions } from './option-sources';
import type { HomeData, OptionResult } from './option-types';
import { useAutomationHome, useReferenceCatalogue } from './use-environment';

const log = new Logger('app.automations');

const IDLE = { status: 'idle' } as const;

function deviceChoices(result: OptionResult): DeviceChoices {
  if (result.status !== 'ready') return result;
  return {
    status: 'ready',
    options: result.options.map((row) => ({
      id: row.id,
      label: row.label,
      ...(row.detail === undefined ? {} : { description: row.detail }),
    })),
  };
}

function optionChoices(source: OptionSourceId, scope: DeviceScope, home: HomeData): DeviceChoices {
  const context = { values: {}, target: scope.target, wholeHome: scope.wholeHome, search: '' };
  return deviceChoices(resolveOptions(source, context, home, IDLE));
}

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
  const home = useAutomationHome();
  const owner = useIsOwner();
  const secrets = useSecrets(owner).data;
  const services = useMemo(
    (): ValueServices => ({
      env: inspectorEnvOf({ program, layout, target: null, findings: [] }, context).steps,
      references,
      secrets: {
        options: (secrets ?? []).map((secret) => ({ id: secret.id, label: secret.name })),
        owner,
        onAdd: (): void => {
          router.push(links.secrets());
        },
      },
      deviceOptions: (source, scope): DeviceChoices => optionChoices(source, scope, home),
    }),
    [program, layout, context, references, home, secrets, owner, router],
  );
  const instances = useMemo(
    (): InstanceHost => ({
      openSameSteps: (functionId): void => {
        router.push(links.node(functionId));
      },
    }),
    [router],
  );
  return (
    <ValueServicesContext value={services}>
      <InstanceHostProvider value={instances}>{children}</InstanceHostProvider>
    </ValueServicesContext>
  );
}

function reportOutcome(outcome: IntentOutcome): void {
  if (!outcome.ok) notify({ message: outcome.toast });
  else if (outcome.toast !== undefined) notify({ message: outcome.toast });
}

function runIntent(intent: GraphIntent, env: IntentEnv): void {
  background(applyGraphIntent(intent, env).then(reportOutcome), 'automations.inspector_intent');
}

function deleteWithUndo(id: string, env: IntentEnv & { readonly store: DocumentStore }): void {
  background(
    applyGraphIntent({ type: 'delete', request: { ids: [id] } }, env).then((outcome) => {
      if (!outcome.ok) notify({ message: outcome.toast });
      else if (outcome.changed) notify({ message: outcome.announcement, undo: env.store.undo });
    }),
    'automations.inspector_delete',
  );
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
  const runtime = useIntentRuntime(context.lint, context.registry, NOTHING_MEASURED);
  const onInterface = useStableCallback(input.onInterface);
  const onUnavailable = useStableCallback(input.onUnavailable);
  return useMemo(
    (): InspectorBinding => ({
      actions: {
        apply: (ops): void => {
          store.apply(ops);
        },
        intent: (intent): void => {
          runIntent(intent, { store, clipboard: deviceClipboard, runtime });
        },
        jump: (nodeId): void => {
          store.select(nodeId);
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
        deleteStep: (id): void => {
          deleteWithUndo(id, { store, clipboard: deviceClipboard, runtime });
        },
      },
      buildEnv: (envInput) => inspectorEnvOf(envInput, context),
    }),
    [store, context, gestures, runtime, onInterface, onUnavailable],
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
  const runtime = useIntentRuntime(context.lint, context.registry, NOTHING_MEASURED);
  const env = useMemo(
    (): InsertEnv => ({
      intent: { store, clipboard: deviceClipboard, runtime },
      snippet: (id) =>
        snippetsFor(devices)
          .find((snippet) => snippet.id === id)
          ?.build(),
    }),
    [store, runtime, devices],
  );
  return useStableCallback((insertion: Insertion): void => {
    try {
      const result = runInsertion(insertion, env);
      if (result.t === 'reusable') onReusable();
      else reportOutcome(result.outcome);
    } catch (error) {
      log.error('automations.insert_failed', error);
      notify({ message: 'That step wasn’t added', tone: 'critical', error });
    }
  });
}
