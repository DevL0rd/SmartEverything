import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import type { RecapProps } from '../../toothbrush/brand-ui';
import { archLabel } from '../model/arch-model';
import { recapViewOf } from '../model/recap-model';
import { QuadrantArch, QuarterNotes } from '../charts/quadrant-arch';
import { ResultFace } from '../charts/result-face';

const RECAP_ARCH_PX = 240;

export function OralbRecap({ session }: RecapProps): ReactNode {
  const view = recapViewOf(session);
  return (
    <View className="gap-3">
      {view.faceLine === null ? null : (
        <View className="flex-row items-center gap-3">
          <ResultFace face={view.face} size={48} />
          <Text variant="callout" className="min-w-0 flex-1">
            {view.faceLine}
          </Text>
        </View>
      )}
      {view.quarters === null ? null : (
        <>
          <View className="items-center">
            <QuadrantArch
              quarters={view.quarters}
              big={view.big}
              small={view.small}
              width={RECAP_ARCH_PX}
              moving={false}
              label={archLabel(view.quarters, true)}
            />
          </View>
          <QuarterNotes quarters={view.quarters} />
        </>
      )}
      <Text variant="caption" tone="faint">
        {view.caption}
      </Text>
    </View>
  );
}
