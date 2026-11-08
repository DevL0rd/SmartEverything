import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { List, Section } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Skeleton } from '../../../components/skeleton';
import { useIsOwner } from '../../../store/selectors';
import { PairComputerSheet } from '../../computers/components/pair-computer-sheet';
import { PlacementRow } from './placement-row';
import { usePlacements, type PlacementTarget } from './use-placements';

export const PLACEMENT_SECTION_TITLE = 'On your computers';

export function placementFooterOf(target: PlacementTarget): string {
  return target.folderItemId === null
    ? 'Synced keeps a full copy on the computer that works offline. Mounted only opens files from the hub as you use them and keeps only what you read.'
    : 'Mounted only opens files from the hub as you use them and keeps only what you read. Sync the whole library folder to keep a full copy.';
}

function NoComputers(): ReactNode {
  const owner = useIsOwner();
  const [pair, setPair] = useState(false);
  return (
    <>
      <EmptyState
        compact
        icon="monitor"
        title="Pair a computer"
        body={
          owner
            ? 'Pair a computer to put this folder on it, synced or mounted only.'
            : 'Ask the owner of the home to pair your computer, then put this folder on it.'
        }
        {...(owner
          ? {
              action: (
                <Button
                  label="Pair a computer"
                  icon="plus"
                  onPress={() => {
                    setPair(true);
                  }}
                />
              ),
            }
          : {})}
      />
      {owner ? (
        <PairComputerSheet
          open={pair}
          onClose={() => {
            setPair(false);
          }}
        />
      ) : null}
    </>
  );
}

function LoadingRows(): ReactNode {
  return (
    <View className="gap-2">
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </View>
  );
}

export function PlacementSection({ target }: { readonly target: PlacementTarget }): ReactNode {
  const view = usePlacements(target);
  if (view.loading || view.rows.length === 0) {
    return (
      <Section title={PLACEMENT_SECTION_TITLE}>
        {view.loading ? <LoadingRows /> : <NoComputers />}
      </Section>
    );
  }
  return (
    <List title={PLACEMENT_SECTION_TITLE} footer={placementFooterOf(target)}>
      {view.rows.map((row) => (
        <PlacementRow key={row.computer.deviceId} row={row} target={target} live={view.live} />
      ))}
    </List>
  );
}

export function PlacementSheet({
  open,
  target,
  onClose,
}: {
  readonly open: boolean;
  readonly target: PlacementTarget;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Use ${target.name} on a computer`}
      detents={['fit']}
    >
      {open ? <PlacementSection target={target} /> : null}
    </Sheet>
  );
}
