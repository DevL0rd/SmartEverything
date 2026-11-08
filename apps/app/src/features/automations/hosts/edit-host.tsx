import { useAutomationsSource } from '../data/source';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import {
  AUTOMATION_NAME_LENGTH,
  automationSentence,
  type AutomationV4,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useConnection } from '../../../api/connection/provider';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import { LoadedQuery } from '../../../components/loaded-query';
import { Sheet } from '../../../components/sheet';
import { usePausable } from '../../../design/external-store';
import { useSizeClass } from '../../../design/size-class';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { useProfiles } from '../../../store/people';
import { useAutomationActions } from '../data/use-automation';
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
import { structuredPart } from '@smarteverything/flow/graph/layout-prune';
import { links } from '../routes';
import { notify } from '../../../components/toast-store';
import { OFFLINE_TEST } from '../editor/screen/screen-model';
import { EditorValueServices, unavailable, useInsert, useInspectorBinding } from './editor-binding';
import { useEditorContext, type EditorContext } from './editor-context';
import { EditorTest } from './editor-test';
import { LIST_LINKS } from './host-links';
import { NotFound, PageShell } from './page-shell';
import { usePlace } from './use-environment';

const PARAMS = z.object({ automationId: z.string() });

function useAutomationProgram(store: DocumentStore): AutomationV4 | null {
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

function EditorTesting({
  automationId,
  name,
  store,
  open,
  onClose,
}: {
  readonly automationId: string;
  readonly name: string;
  readonly store: DocumentStore;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const program = useAutomationProgram(store);
  return (
    <EditorTest
      automationId={automationId}
      name={name}
      program={program}
      open={open}
      onClose={onClose}
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
  readonly testing: boolean;
  readonly setTesting: (open: boolean) => void;
  readonly renaming: TextEditRequest | null;
  readonly setRenaming: (request: TextEditRequest | null) => void;
  readonly online: boolean;
}

function useEditingParts(load: DraftLoad): EditingParts {
  const kinds = useAutomationsSource().lookup;
  const [store] = useState(() => new DocumentStore(load.view.program, kinds, load.view.layout));
  const paired = useConnection().status === 'paired';
  const sync = useDraftSync(store, load, paired);
  const flow = usePublishFlow(sync.model);
  const context = useEditorContext();
  useEffect(() => {
    store.setKinds(context.registry);
  }, [store, context.registry]);
  const [header, setHeader] = useState(false);
  const [testing, setTesting] = useState(false);
  const [renaming, setRenaming] = useState<TextEditRequest | null>(null);
  const online = paired && sync.state.status !== 'offline';
  return {
    store,
    sync,
    flow,
    context,
    header,
    setHeader,
    testing,
    setTesting,
    renaming,
    setRenaming,
    online,
  };
}

function useEditing(
  parts: EditingParts,
): Pick<EditorScreenProps, 'inspector' | 'onInsert' | 'sentence' | 'onInterface'> {
  const kinds = useAutomationsSource().lookup;
  const router = useRouter();
  const { store, sync, context, setHeader } = parts;
  const onInterface = (): void => {
    setHeader(true);
  };
  const inspector = useInspectorBinding({
    store,
    context,
    gestures: sync.model,
    onInterface,
    onUnavailable: unavailable,
  });
  const onInsert = useInsert(store, context, () => {
    router.push(links.nodes());
  });
  const program = useAutomationProgram(store);
  const sentence = useMemo(() => {
    const tree = program === null ? undefined : structuredPart(program, kinds).tree;
    return tree?.kind === 'automation' ? automationSentence(tree, context.describe) : null;
  }, [program, context.describe, kinds]);
  return { inspector, onInsert, sentence, onInterface };
}

function renameRequest(
  name: string,
  rename: (automationId: string, name: string) => Promise<unknown>,
  automationId: string,
): TextEditRequest {
  return {
    title: 'Rename automation',
    label: 'Automation name',
    initial: name,
    placeholder: 'Automation name',
    confirmLabel: 'Save',
    maxLength: AUTOMATION_NAME_LENGTH,
    save: async (value): Promise<void> => {
      await rename(automationId, value);
    },
  };
}

function useScreenProps(
  automationId: string,
  load: DraftLoad,
  parts: EditingParts,
): EditorScreenProps {
  const router = useRouter();
  const { store, sync, flow, context } = parts;
  const editing = useEditing(parts);
  const actions = useAutomationActions();
  return {
    ...editing,
    notice: <Conflict model={sync.model} state={sync.state} />,
    store,
    name: load.view.name,
    status: chipLook(sync.state).label,
    reusable: false,
    online: parts.online,
    run: null,
    onScreen: useIsFocused(),
    options: context.options,
    lint: context.lint,
    onBack: (): void => {
      router.back();
    },
    onPublish: flow.start,
    onTest: (): void => {
      if (!parts.online) notify({ message: OFFLINE_TEST });
      else parts.setTesting(true);
    },
    onRuns: (): void => {
      router.push(LIST_LINKS.runs(automationId));
    },
    onRename: (): void => {
      parts.setRenaming(renameRequest(load.view.name, actions.rename, automationId));
    },
    onGroupSelection: (): void => {
      unavailable('Making a Custom Node from a selection');
    },
  };
}

function RenameSheet({ parts }: { readonly parts: EditingParts }): ReactNode {
  return (
    <TextEditSheet
      request={parts.renaming}
      onClose={() => {
        parts.setRenaming(null);
      }}
    />
  );
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
  const { store, sync, flow, context, header, setHeader, testing, setTesting } = parts;
  return (
    <EditorValueServices store={store} context={context}>
      <View className="min-h-0 flex-1 bg-bg">
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
      <RenameSheet parts={parts} />
      <Publish
        automationId={automationId}
        flow={flow}
        revision={sync.state.revision}
        store={store}
      />
      <EditorTesting
        automationId={automationId}
        name={load.view.name}
        store={store}
        open={testing}
        onClose={() => {
          setTesting(false);
        }}
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
