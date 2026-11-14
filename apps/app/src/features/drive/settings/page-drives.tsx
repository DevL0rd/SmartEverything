import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { useIsOwner } from '../../../store/selectors';
import { useDriveRoots, useViewerId } from '../data';
import { DriveCard } from './drive-card';
import { NO_DRIVES, driveSettingsCardsOf } from './drive-card-model';
import { DriveSettingsSection } from './page';

export function DrivesSection(): ReactNode {
  const cards = driveSettingsCardsOf(useDriveRoots(), useViewerId(), useIsOwner());
  return (
    <DriveSettingsSection section="drives">
      {cards.length === 0 ? (
        <EmptyState
          compact
          icon="hardDrive"
          title={NO_DRIVES}
          body="My Drive and the Shared Drive appear here as soon as the Hub has made them."
        />
      ) : (
        <View className="gap-4">
          {cards.map((card) => (
            <DriveCard key={card.root.id} card={card} />
          ))}
        </View>
      )}
    </DriveSettingsSection>
  );
}
