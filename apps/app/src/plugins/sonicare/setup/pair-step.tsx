import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import type { PairStepProps } from '../../toothbrush/brand-ui';
import { PAIR_HELP, needsBond } from '../../toothbrush/model/setup-model';
import { Status } from '../../toothbrush/setup/find-steps';

export function SonicarePairStep({ state, progress, onPair }: PairStepProps): ReactNode {
  if (!needsBond(state)) {
    return (
      <Banner
        tone="positive"
        title="No pairing needed"
        body="This brush connects without pairing. Continue to the next step."
        wrapBody
      />
    );
  }
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        {PAIR_HELP}
      </Text>
      <Status progress={progress} failure="Pairing did not finish" working="Pairing…" />
      {state.bonded ? (
        <Banner tone="positive" title="Paired" body="Continue to the next step." wrapBody />
      ) : (
        <Button
          label={progress.kind === 'failed' ? 'Try again' : 'Pair the brush'}
          size="lg"
          loading={progress.kind === 'working'}
          onPress={onPair}
        />
      )}
    </View>
  );
}
