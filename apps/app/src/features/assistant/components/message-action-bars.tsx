import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { AssistantMessageRow } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { cn } from '../../../design/cn';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { useSizeClass } from '../../../design/size-class';
import { MORE_LABEL, type ActionId, type ActionSpec } from '../model/message-actions';
import { Rise } from './rise';
import { RISE_PX } from './thread-motion';
import { ReplyMeta } from './message-meta';
import { useTimeout } from './use-timeout';

const CONFIRM_MS = 1400;

function useConfirmed(): {
  readonly confirmed: ActionId | null;
  readonly confirm: (id: ActionId) => void;
} {
  const [confirmed, setConfirmed] = useState<ActionId | null>(null);
  const timeout = useTimeout();
  return {
    confirmed,
    confirm: (id): void => {
      setConfirmed(id);
      timeout.start(CONFIRM_MS, () => {
        setConfirmed(null);
      });
    },
  };
}

function MoreButton({
  items,
  quick,
}: {
  readonly items: readonly MenuItem[];
  readonly quick: readonly MenuItem[];
}): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(items, MORE_LABEL, { quick });
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon="ellipsis" label={MORE_LABEL} onPress={open} />
      {menu}
    </View>
  );
}

interface BarProps {
  readonly specs: readonly ActionSpec[];
  readonly run: (id: ActionId) => void;
  readonly quick: readonly MenuItem[];
  readonly list: readonly MenuItem[];
}

function Buttons({ specs, run, quick, list }: BarProps): ReactNode {
  const { confirmed, confirm } = useConfirmed();
  return (
    <>
      {specs.map((spec) => (
        <IconButton
          key={spec.id}
          icon={confirmed === spec.id ? 'check' : spec.icon}
          label={spec.label}
          selected={confirmed === spec.id}
          {...(spec.shortcut === null ? {} : { shortcut: spec.shortcut })}
          onPress={() => {
            run(spec.id);
            if (spec.id === 'copy') {
              confirm(spec.id);
            }
          }}
        />
      ))}
      <MoreButton
        items={list}
        quick={quick.filter((item) => !specs.some((spec) => spec.label === item.label))}
      />
    </>
  );
}

export function ActionRow({
  specs,
  run,
  quick,
  list,
  row,
  onMeta,
}: BarProps & { readonly row: AssistantMessageRow; readonly onMeta: () => void }): ReactNode {
  const compact = useSizeClass().width === 'compact';
  const shown = compact ? specs.filter((spec) => spec.id !== 'branch') : specs;
  return (
    <Rise from={RISE_PX.reply} duration={250}>
      <View className="-ml-3 min-h-touch-min flex-row items-center">
        <Buttons specs={shown} run={run} quick={quick} list={list} />
        <View className="min-w-0 flex-1 items-end pl-3">
          <ReplyMeta row={row} onPress={onMeta} />
        </View>
      </View>
    </Rise>
  );
}

export function HoverBar({
  specs,
  run,
  quick,
  list,
  visible,
  align,
  meta,
  reserve,
}: BarProps & {
  readonly visible: boolean;
  readonly align: 'start' | 'end';
  readonly meta: ReactNode;
  readonly reserve: boolean;
}): ReactNode {
  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      className={cn(
        align === 'end' ? 'items-end' : 'items-start',
        !reserve && 'absolute inset-x-0 top-full z-10',
      )}
    >
      {visible ? (
        <Rise from={RISE_PX.bar} duration={100}>
          <View className="h-8 max-w-full flex-row items-center gap-0.5">
            {align === 'end' ? meta : null}
            <Buttons specs={specs} run={run} quick={quick} list={list} />
            {align === 'start' ? meta : null}
          </View>
        </Rise>
      ) : reserve ? (
        <View className="h-8" />
      ) : null}
    </View>
  );
}
