import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import type { AutomationFunctionDetail, FunctionV3 } from '@smarteverything/domain';
import { LoadedQuery } from '../../../components/loaded-query';
import { Sheet } from '../../../components/sheet';
import { usePausable } from '../../../design/external-store';
import { useActiveProfile } from '../../../store/people';
import { useFunction } from '../data/use-functions';
import { EditorScreen, type EditorScreenProps } from '../editor/screen/editor-screen';
import { UsersBanner } from '../functions/edit/users-banner';
import { InterfacePanel } from '../functions/edit/interface-panel';
import { heroModel } from '../functions/detail/detail-model';
import { MappingSheet } from '../functions/mapping/mapping-sheet';
import { DocumentStore } from '../model/editor/document-store';
import { links } from '../routes';
import {
  EditorValueServices,
  unavailable,
  useInsert,
  useInspectorBinding,
  type GesturePort,
} from './editor-binding';
import { useEditorContext, type EditorContext } from './editor-context';
import { NotFound, PageShell } from './page-shell';
import { useNodeSave, type NodeSave } from './use-node-save';

const PARAMS = z.object({ functionId: z.string() });

const NO_GESTURES: GesturePort = { beginGesture: () => undefined, endGesture: () => undefined };

function useFunctionProgram(store: DocumentStore): FunctionV3 | null {
  const program = usePausable(store.state.subscribe, () => store.state.get().program);
  return program.kind === 'function' ? program : null;
}

interface NodeParts {
  readonly store: DocumentStore;
  readonly context: EditorContext;
  readonly name: string;
  readonly setName: (name: string) => void;
  readonly panel: boolean;
  readonly setPanel: (open: boolean) => void;
}

function useNodeParts(detail: AutomationFunctionDetail): NodeParts {
  const [store] = useState(() => new DocumentStore(detail.program, detail.layout));
  const context = useEditorContext();
  const [name, setName] = useState(detail.name);
  const [panel, setPanel] = useState(false);
  return { store, context, name, setName, panel, setPanel };
}

function useScreenProps(
  detail: AutomationFunctionDetail,
  parts: NodeParts,
  save: NodeSave,
): EditorScreenProps {
  const router = useRouter();
  const { store, context, setPanel } = parts;
  const openPanel = (): void => {
    setPanel(true);
  };
  const inspector = useInspectorBinding({
    store,
    context,
    gestures: NO_GESTURES,
    onInterface: openPanel,
    onUnavailable: unavailable,
  });
  const onInsert = useInsert(store, context, () => {
    router.push(links.nodes());
  });
  return {
    store,
    name: parts.name,
    status: store.state.get().dirty ? 'Unsaved changes' : 'Saved',
    reusable: true,
    online: true,
    sentence: null,
    run: null,
    onScreen: useIsFocused(),
    options: context.options,
    lint: context.lint,
    inspector,
    onInsert,
    onBack: (): void => {
      router.back();
    },
    onRename: openPanel,
    onInterface: openPanel,
    onPublish: save.start,
    onTest: (): void => {
      unavailable('Testing');
    },
    onRuns: (): void => {
      router.push(links.node(detail.id));
    },
    onGroupSelection: (): void => {
      unavailable('Making a Custom Node from a selection');
    },
  };
}

function InterfaceSheet({
  detail,
  parts,
  program,
}: {
  readonly detail: AutomationFunctionDetail;
  readonly parts: NodeParts;
  readonly program: FunctionV3;
}): ReactNode {
  const userId = useActiveProfile()?.id ?? null;
  const { store, name, setName, panel, setPanel } = parts;
  return (
    <Sheet
      open={panel}
      onClose={() => {
        setPanel(false);
      }}
      title="Custom Node settings"
      wide
    >
      <InterfacePanel
        saved={detail.program}
        program={program}
        name={name}
        version={detail.revision}
        ownership={heroModel(detail, userId).ownershipLabel}
        users={detail.usedBy}
        locked={!detail.editable}
        onName={setName}
        onProgram={(next) => {
          store.replace(next, store.state.get().layout);
        }}
      />
    </Sheet>
  );
}

function Mapping({
  detail,
  program,
  save,
}: {
  readonly detail: AutomationFunctionDetail;
  readonly program: FunctionV3;
  readonly save: NodeSave;
}): ReactNode {
  const reply = save.breaking;
  return (
    <MappingSheet
      open={reply !== null}
      functionName={detail.name}
      version={detail.revision + 1}
      callersOn={detail.revision}
      changes={reply?.changes ?? []}
      callers={reply?.affected ?? []}
      next={{
        flavour: program.flavour,
        inputs: program.inputs,
        outputs: program.outputs,
        exits: program.exits,
      }}
      busy={save.busy}
      failure={save.failure}
      onClose={save.close}
      onKeep={save.keep}
      onUpdateAll={save.updateAll}
    />
  );
}

function Editing({ detail }: { readonly detail: AutomationFunctionDetail }): ReactNode {
  const parts = useNodeParts(detail);
  const save = useNodeSave(detail, parts.store, parts.name);
  const screen = useScreenProps(detail, parts, save);
  const program = useFunctionProgram(parts.store);
  return (
    <EditorValueServices store={parts.store} context={parts.context}>
      <View className="min-h-0 flex-1 bg-bg">
        <UsersBanner builtin={detail.builtin} users={detail.users} onCopy={screen.onRuns} />
        <EditorScreen {...screen} />
      </View>
      {program === null ? null : (
        <>
          <InterfaceSheet detail={detail} parts={parts} program={program} />
          <Mapping detail={detail} program={program} save={save} />
        </>
      )}
    </EditorValueServices>
  );
}

function Load({ functionId }: { readonly functionId: string }): ReactNode {
  const query = useFunction(functionId);
  return (
    <PageShell title={query.data?.name ?? 'Custom Node'}>
      <LoadedQuery query={query}>
        {(detail) =>
          detail.editable ? (
            <Editing key={detail.id} detail={detail} />
          ) : (
            <NotFound
              title="Read only"
              body="Make your own copy of this Custom Node to change it."
            />
          )
        }
      </LoadedQuery>
    </PageShell>
  );
}

export function NodeEditHost(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  return params.success ? (
    <Load key={params.data.functionId} functionId={params.data.functionId} />
  ) : (
    <NotFound title="Custom Node not found" body="This link doesn’t point to a node." />
  );
}
