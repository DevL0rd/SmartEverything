import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Device } from '../../../store/state';
import { ProgramPicker } from './program-picker';
import { StageActions } from './stage';
import { StartButton } from './start-button';
import { useAdvice } from './use-advice';
import { useLaundryDraft } from './use-draft';
import { useLaundry } from './use-laundry';
import { WhenCard } from './when';

export function LaundryQuick({ device }: { readonly device: Device }): ReactNode {
  const laundry = useLaundry(device);
  const draft = useLaundryDraft(laundry);
  const { runner, sheet } = useAdvice(laundry);
  return (
    <View className="gap-4">
      <StageActions laundry={laundry} runner={runner} center={false} />
      {laundry.state.resting ? (
        <>
          <ProgramPicker laundry={laundry} draft={draft} ground="surface-raised" />
          <WhenCard draft={draft} disabled={laundry.state.offline} />
          <StartButton laundry={laundry} draft={draft} />
        </>
      ) : null}
      {sheet}
    </View>
  );
}
