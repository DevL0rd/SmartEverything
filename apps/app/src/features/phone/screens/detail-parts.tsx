import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CardGrid } from '../../../components/card-grid';
import { ReasonLine } from '../../../components/reason-line';
import { Skeleton } from '../../../components/skeleton';
import { useAreaWidth } from '../../../design/size-class';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { bodyWidthOf, twoColumnsAt } from '../model/sections';

export function NeedLine({ text }: { readonly text: string }): ReactNode {
  return <ReasonLine icon="warning" tone="warning" text={text} />;
}

export function LockLine({ text }: { readonly text: string }): ReactNode {
  return <ReasonLine icon="lock" text={text} />;
}

export function usePersonName(device: Device): string {
  const profileId = device.details['profileId'];
  const name = useRow('profiles', typeof profileId === 'string' ? profileId : null)?.name;
  return name ?? 'the owner of this phone';
}

export function PendingCards(): ReactNode {
  return (
    <View className="gap-4">
      <Skeleton shape="block" />
      <Skeleton shape="block" />
    </View>
  );
}

export function useBodyWidth(): number {
  return bodyWidthOf(useAreaWidth());
}

export function useTwoColumns(): boolean {
  return twoColumnsAt(useAreaWidth());
}

export interface PageCard {
  readonly key: string;
  readonly node: ReactNode;
}

export function PageCards({ cards }: { readonly cards: readonly (PageCard | null)[] }): ReactNode {
  const two = useTwoColumns();
  const shown = cards.filter((card): card is PageCard => card !== null);
  return (
    <CardGrid
      items={shown}
      columns={two ? 2 : 1}
      keyOf={(card) => card.key}
      render={(card) => card.node}
    />
  );
}
