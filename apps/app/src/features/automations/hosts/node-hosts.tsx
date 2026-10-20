import { useMemo, useState, type ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import type {
  AutomationFunctionDetail,
  AutomationFunctionSummary,
  AutomationFunctionUser,
} from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { LoadedQuery } from '../../../components/loaded-query';
import { notify } from '../../../components/toast-store';
import { useActiveProfile } from '../../../store/people';
import { useAutomations } from '../data/use-automations';
import {
  useFunction,
  useFunctionActions,
  useFunctions,
  type FunctionActions,
} from '../data/use-functions';
import { NewNodeDialog } from '../functions/edit/new-node-dialog';
import { FunctionDetailScreen } from '../functions/detail/detail-screen';
import { LibraryScreen } from '../functions/library/library-screen';
import { callersBehind } from '../functions/library/callers-behind';
import { copyName } from '../list/copy-name';
import { links } from '../routes';
import { NotFound, PageShell } from './page-shell';

const log = new Logger('app.automations');

const PARAMS = z.object({ functionId: z.string() });

type Router = ReturnType<typeof useRouter>;

function useNeedsMapping(functions: readonly AutomationFunctionSummary[]): ReadonlySet<string> {
  const { rows } = useAutomations();
  return useMemo(
    () =>
      callersBehind(
        rows.map((row) => row.definition),
        functions,
      ),
    [rows, functions],
  );
}

function Library({
  functions,
  onOpen,
  onCreate,
}: {
  readonly functions: readonly AutomationFunctionSummary[];
  readonly onOpen: (functionId: string) => void;
  readonly onCreate: () => void;
}): ReactNode {
  const userId = useActiveProfile()?.id ?? null;
  const needsMapping = useNeedsMapping(functions);
  return (
    <LibraryScreen
      functions={functions}
      userId={userId}
      needsMapping={needsMapping}
      onOpen={onOpen}
      onCreate={onCreate}
    />
  );
}

export function NodesHost(): ReactNode {
  const router = useRouter();
  const functions = useFunctions();
  const actions = useFunctionActions();
  const [creating, setCreating] = useState(false);
  return (
    <PageShell title="Custom Nodes">
      <LoadedQuery query={functions}>
        {(entries) => (
          <Library
            functions={entries}
            onOpen={(functionId) => {
              router.push(links.node(functionId));
            }}
            onCreate={() => {
              setCreating(true);
            }}
          />
        )}
      </LoadedQuery>
      <NewNodeDialog
        open={creating}
        onCancel={() => {
          setCreating(false);
        }}
        onCreate={async (request) => {
          const reply = await actions.create(request);
          if (!reply.ok || reply.id === null) throw new Error(reply.summary);
          setCreating(false);
          router.push(links.nodeEdit(reply.id));
        }}
      />
    </PageShell>
  );
}

interface DetailHandlers {
  readonly onEdit: () => void;
  readonly onCopy: () => void;
  readonly onDelete: () => void;
  readonly onOpenUser: (user: AutomationFunctionUser) => void;
  readonly onOpenAutomation: (automationId: string) => void;
}

function copyNode(
  detail: AutomationFunctionDetail,
  names: readonly string[],
  actions: FunctionActions,
  router: Router,
): void {
  background(
    actions
      .create({
        name: copyName(detail.name, names),
        definition: detail.program,
        layout: detail.layout,
      })
      .then((reply) => {
        if (reply.ok && reply.id !== null) router.replace(links.nodeEdit(reply.id));
        else notify({ message: reply.summary, tone: 'critical' });
      }),
    'automations.copy_node',
  );
}

async function deleteNode(
  detail: AutomationFunctionDetail,
  actions: FunctionActions,
  router: Router,
): Promise<void> {
  const accepted = await confirm({
    title: `Delete ${detail.name}?`,
    body: 'Automations that use it keep running the version they were saved with.',
    confirmLabel: 'Delete',
  });
  if (!accepted) return;
  try {
    await actions.remove(detail.id);
    router.replace(links.nodes());
  } catch (error) {
    log.error('automations.delete_node_failed', error);
    notify({ message: 'The Custom Node wasn’t deleted', tone: 'critical', error });
  }
}

function useDetailActions(detail: AutomationFunctionDetail): DetailHandlers {
  const router = useRouter();
  const actions = useFunctionActions();
  const names = useFunctions().data?.map((entry) => entry.name) ?? [];
  return {
    onEdit: (): void => {
      router.push(links.nodeEdit(detail.id));
    },
    onCopy: (): void => {
      copyNode(detail, names, actions, router);
    },
    onDelete: (): void => {
      background(deleteNode(detail, actions, router), 'automations.delete_node');
    },
    onOpenUser: (user): void => {
      router.push(user.kind === 'automation' ? links.detail(user.id) : links.node(user.id));
    },
    onOpenAutomation: (automationId): void => {
      router.push(links.detail(automationId));
    },
  };
}

function Detail({ detail }: { readonly detail: AutomationFunctionDetail }): ReactNode {
  const userId = useActiveProfile()?.id ?? null;
  const handlers = useDetailActions(detail);
  return <FunctionDetailScreen detail={detail} userId={userId} {...handlers} />;
}

export function NodeDetailHost(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  const functionId = params.success ? params.data.functionId : '';
  const query = useFunction(functionId);
  const title = useMemo(() => query.data?.name ?? 'Custom Node', [query.data]);
  if (!params.success) {
    return <NotFound title="Custom Node not found" body="This link doesn’t point to a node." />;
  }
  return (
    <PageShell title={title}>
      <LoadedQuery query={query}>{(detail) => <Detail detail={detail} />}</LoadedQuery>
    </PageShell>
  );
}
