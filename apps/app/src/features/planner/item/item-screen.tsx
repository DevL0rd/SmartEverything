import type { PlannerItemRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { closeFlow } from '../../../app-shell/close-flow';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import type { MenuItem } from '../../../components/menu-rows';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { notify } from '../../../components/toast-store';
import { useHubOffline } from '../../clock/frame/hub-status';
import { usePlannerItems, usePlannerWrites, type PlannerWrites } from '../data';
import { usePlannerShownPerson } from '../frame/person';
import { askAboutItem } from './item-ask';
import { deleteChoicesOf, type DeleteChoice } from './item-delete';
import { ItemBody, itemIn, useItemEditor, type ItemTarget } from './item-sheet';

export interface ItemScreenProps {
  readonly itemId: string;
  readonly occurrenceKey: string | null;
}

function leaveItem(item: PlannerItemRow): void {
  closeFlow(item.kind === 'event' ? href.planner.calendar() : href.planner.tasks());
}

function OfflineBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Can’t reach the hub"
      body="Edits are paused until the hub is back."
      wrapBody
    />
  );
}

interface DeleteInput {
  readonly writes: PlannerWrites;
  readonly item: PlannerItemRow;
  readonly choice: DeleteChoice;
  readonly onLeave: (item: PlannerItemRow) => void;
}

async function deleteAfterConfirm({ writes, item, choice, onLeave }: DeleteInput): Promise<void> {
  const accepted = await confirm({
    title: `Delete “${item.title}”?`,
    body: choice.question,
    confirmLabel: choice.label,
    tone: 'destructive',
  });
  if (!accepted) return;
  onLeave(item);
  leaveItem(item);
  await writes.deleteItem(item, choice.scope);
}

function deleteReported(input: DeleteInput): void {
  background(
    deleteAfterConfirm(input).catch((error: unknown) => {
      notify({ message: 'Couldn’t delete that', error, tone: 'critical' });
    }),
    'planner.item_delete_failed',
  );
}

interface OverflowInput {
  readonly item: PlannerItemRow;
  readonly target: ItemTarget;
  readonly offline: boolean;
  readonly onLeave: (item: PlannerItemRow) => void;
}

function useItemOverflow({ item, target, offline, onLeave }: OverflowInput): readonly MenuItem[] {
  const writes = usePlannerWrites(target.person);
  return [
    {
      id: 'ask',
      label: 'Ask AI',
      icon: 'sparkles',
      onPress: (): void => {
        askAboutItem(item, target.occurrenceKey);
      },
    },
    ...deleteChoicesOf(item, target.occurrenceKey).map((choice): MenuItem => ({
      id: choice.id,
      label: choice.label,
      icon: 'trash',
      destructive: true,
      disabled: offline,
      onPress: (): void => {
        deleteReported({ writes, item, choice, onLeave });
      },
    })),
  ];
}

interface OpenItemScreenProps {
  readonly item: PlannerItemRow;
  readonly target: ItemTarget;
  readonly onLeave: (item: PlannerItemRow) => void;
}

function OpenItemScreen({ item, target, onLeave }: OpenItemScreenProps): ReactNode {
  const offline = useHubOffline();
  const editor = useItemEditor(item, target, offline);
  const overflow = useItemOverflow({ item, target, offline, onLeave });
  return (
    <Screen
      maxWidth="reading"
      header={<PageHeader title={editor.shown.title} titleLines="wrap" overflow={overflow} />}
      {...(offline ? { banner: <OfflineBanner /> } : {})}
      {...(editor.bar === null ? {} : { footer: editor.bar })}
    >
      <ItemBody
        item={item}
        editor={editor}
        target={target}
        offline={offline}
        onClose={() => {
          leaveItem(item);
        }}
      />
    </Screen>
  );
}

function GoneItemScreen(): ReactNode {
  return (
    <Screen maxWidth="reading" header={<PageHeader title="Planner item" />}>
      <EmptyState
        icon="calendar"
        title="This item is gone"
        body="It was deleted, or it belongs to someone else."
        action={<Button label="Open Planner" variant="tonal" href={href.planner.index()} />}
      />
    </Screen>
  );
}

export function ItemScreen({ itemId, occurrenceKey }: ItemScreenProps): ReactNode {
  const person = usePlannerShownPerson();
  const [leaving, setLeaving] = useState<PlannerItemRow | null>(null);
  const item = itemIn(usePlannerItems(person), itemId) ?? leaving;
  if (item === null) return <GoneItemScreen />;
  return (
    <OpenItemScreen
      key={item.id}
      item={item}
      target={{ itemId, occurrenceKey, person }}
      onLeave={setLeaving}
    />
  );
}
