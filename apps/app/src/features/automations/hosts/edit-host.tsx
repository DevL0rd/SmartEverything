import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import { automationSentence, type AutomationV3 } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useConnection } from '../../../api/connection/provider';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import { LoadedQuery } from '../../../components/loaded-query';
import { Sheet } from '../../../components/sheet';
import { usePausable } from '../../../design/external-store';
import { useSizeClass } from '../../../design/size-class';
import { useProfiles } from '../../../store/people';
import { authorLabel } from '../detail/detail-model';
import { ConflictBanner } from '../editor/drafts/conflict-banner';
import { PublishSheet } from '../editor/drafts/publish-sheet';
import type { DraftSyncModel, SyncState } from '../editor/drafts/draft-sync-model';
import { chipLook } from '../editor/drafts/sync-copy';
import { usePublishFlow, type PublishFlow } from '../editor/drafts/use-publish-flow';
import {
  useDraftChanges,
  useDraftLoad,
  useDraftSync,
  type DraftLoad,
} from '../editor/drafts/use-draft-sync';
import { headerAnchorKey } from '../editor/header/anchor-model';
import { HeaderPanel } from '../editor/header/header-panel';
import { renderPortValue } from '../editor/inspector/values/render-port-value';
import { EditorScreen, type EditorScreenProps } from '../editor/screen/editor-screen';
import { DocumentStore } from '../model/editor/document-store';
import { links } from '../routes';
import { EditorValueServices, unavailable, useInsert, useInspectorBinding } from './editor-binding';
import { useEditorContext, type EditorContext } from './editor-context';
import { LIST_LINKS } from './host-links';
import { NotFound, PageShell } from './page-shell';
import { usePlace } from './use-environment';

const PARAMS = z.object({ automationId: z.string() });

function useAutomationProgram(store: DocumentStore): AutomationV3 | null {
  const program = usePausable(store.state.subscribe, () => store.state.get().program);
  return program.kind === 'automation' ? program : null;
}

function HeaderSheet({
  store,
  context,
  open,
  onClose,
}: {
  readonly store: DocumentStore;
  readonly context: EditorContext;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const program = useAutomationProgram(store);
  if (program === null) return null;
  const env = {
    program,
    registry: context.registry,
    renderValue: renderPortValue,
    anchorKey: headerAnchorKey(program),
    locked: false,
    apply: (ops: Parameters<DocumentStore['apply']>[0]): void => {
      store.apply(ops);
    },
  };
  return (
    <Sheet open={open} onClose={onClose} title="Automation settings" wide>
      <HeaderPanel env={env} />
    </Sheet>
  );
}

function Conflict({
  model,
  state,
}: {
  readonly model: DraftSyncModel;
  readonly state: SyncState;
}): ReactNode {
  const people = useProfiles();
  const { timeZone } = usePlace();
  const narrow = useSizeClass().width === 'compact';
  const { conflict } = state;
  if (conflict === null) return null;
  const by = authorLabel(
    conflict.author,
    (profileId) => people.find((person) => person.id === profileId)?.name ?? null,
  );
  return (
    <ConflictBanner
      conflict={conflict}
      by={by}
      timeZone={timeZone}
      narrow={narrow}
      onCompare={() => {
        unavailable('Comparing versions');
      }}
      onKeepMine={model.keepMine}
      onUseTheirs={() => {
        background(model.useTheirs(), 'automations.use_theirs');
      }}
    />
  );
}

function Publish({
  automationId,
  flow,
  revision,
  store,
}: {
  readonly automationId: string;
  readonly flow: PublishFlow;
  readonly revision: number;
  readonly store: DocumentStore;
}): ReactNode {
  const changes = useDraftChanges(automationId, revision, flow.stage.kind === 'review');
  return (
    <PublishSheet
      stage={flow.stage}
      changes={changes}
      onGoTo={(nodeId) => {
        flow.close();
        store.select(nodeId);
      }}
      onBack={flow.close}
      onPublish={flow.confirm}
    />
  );
}

interface EditingParts {
  readonly store: DocumentStore;
  readonly sync: ReturnType<typeof useDraftSync>;
  readonly flow: PublishFlow;
  readonly context: EditorContext;
  readonly header: boolean;
  readonly setHeader: (open: boolean) => void;
}

function useEditingParts(load: DraftLoad): EditingParts {
  const [store] = useState(() => new DocumentStore(load.view.program, load.view.layout));
  const sync = useDraftSync(store, load, useConnection().status === 'paired');
  const flow = usePublishFlow(sync.model);
  const context = useEditorContext();
  const [header, setHeader] = useState(false);
  return { store, sync, flow, context, header, setHeader };
}

function useEditing(
  parts: EditingParts,
): Pick<EditorScreenProps, 'inspector' | 'onInsert' | 'sentence' | 'onRename'> {
  const router = useRouter();
  const { store, sync, context, setHeader } = parts;
  const onRename = (): void => {
    setHeader(true);
  };
  const inspector = useInspectorBinding({
    store,
    context,
    gestures: sync.model,
    onInterface: onRename,
    onUnavailable: unavailable,
  });
  const onInsert = useInsert(store, context, () => {
    router.push(links.nodes());
  });
  const program = useAutomationProgram(store);
  const sentence = useMemo(
    () => (program === null ? null : automationSentence(program, context.describe)),
    [program, context.describe],
  );
  return { inspector, onInsert, sentence, onRename };
}

function useScreenProps(
  automationId: string,
  load: DraftLoad,
  parts: EditingParts,
): EditorScreenProps {
  const router = useRouter();
  const { store, sync, flow, context } = parts;
  const editing = useEditing(parts);
  return {
    ...editing,
    store,
    name: load.view.name,
    status: chipLook(sync.state).label,
    reusable: false,
    online: sync.state.status !== 'offline',
    run: null,
    onScreen: useIsFocused(),
    options: context.options,
    lint: context.lint,
    onBack: (): void => {
      router.back();
    },
    onPublish: flow.start,
    onTest: (): void => {
      unavailable('Testing');
    },
    onRuns: (): void => {
      router.push(LIST_LINKS.runs(automationId));
    },
    onInterface: editing.onRename,
    onGroupSelection: (): void => {
      unavailable('Making a Custom Node from a selection');
    },
  };
}

function Editing({
  automationId,
  load,
}: {
  readonly automationId: string;
  readonly load: DraftLoad;
}): ReactNode {
  useHideNavigation();
  const parts = useEditingParts(load);
  const screen = useScreenProps(automationId, load, parts);
  const { store, sync, flow, context, header, setHeader } = parts;
  return (
    <EditorValueServices store={store} context={context}>
      <View className="min-h-0 flex-1 bg-bg">
        <Conflict model={sync.model} state={sync.state} />
        <EditorScreen {...screen} />
      </View>
      <HeaderSheet
        store={store}
        context={context}
        open={header}
        onClose={() => {
          setHeader(false);
        }}
      />
      <Publish
        automationId={automationId}
        flow={flow}
        revision={sync.state.revision}
        store={store}
      />
    </EditorValueServices>
  );
}

function Load({ automationId }: { readonly automationId: string }): ReactNode {
  const { load, query } = useDraftLoad(automationId);
  if (load === null) {
    return (
      <PageShell title="Automation">
        <LoadedQuery query={query}>{() => null}</LoadedQuery>
      </PageShell>
    );
  }
  return <Editing automationId={automationId} load={load} />;
}

export function AutomationEditHost(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <Load key={params.data.automationId} automationId={params.data.automationId} />
  ) : (
    <NotFound title="Automation not found" body="This link doesn’t point to an automation." />
  );
}
