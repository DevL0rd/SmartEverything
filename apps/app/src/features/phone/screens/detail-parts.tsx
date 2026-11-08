import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { Grid } from '../../../components/grid';
import { ReasonLine } from '../../../components/reason-line';
import { Skeleton } from '../../../components/skeleton';
import { useFrameBodyWidth } from '../../../components/section-body';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';

const CARD_MIN_WIDTH = 320;

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
    <PageCards
      cards={[
        { key: 'first', node: <Skeleton shape="block" /> },
        { key: 'second', node: <Skeleton shape="block" /> },
      ]}
    />
  );
}

export interface PageCard {
  readonly key: string;
  readonly node: ReactNode;
}

export function PageCards({ cards }: { readonly cards: readonly (PageCard | null)[] }): ReactNode {
  const width = useFrameBodyWidth();
  const shown = cards.filter((card): card is PageCard => card !== null);
  return (
    <Grid
      measuredWidth={width}
      minItemWidth={CARD_MIN_WIDTH}
      maxColumns={shown.length}
      cellClassName="max-w-reading"
      stretchLastRow={false}
    >
      {shown.map((card) => (
        <Fragment key={card.key}>{card.node}</Fragment>
      ))}
    </Grid>
  );
}
