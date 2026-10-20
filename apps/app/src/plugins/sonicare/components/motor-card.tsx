import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { WeekBars } from '../../toothbrush/charts/care-charts';
import { useBrushView } from '../../toothbrush/data/brush-data';
import type { DeviceProps } from '../../toothbrush/brand-ui';
import { handleFault, odometer, weekBars } from '../../toothbrush/model/care-model';

function MotorCard({ deviceId }: { readonly deviceId: string }): ReactNode {
  const handle = useBrushView(deviceId, 'handle');
  return (
    <Card title="Handle" icon="wrench">
      <LoadedQuery query={handle}>
        {(loaded) => (
          <View className="gap-3">
            <View
              accessible
              accessibilityLabel={`Motor ran ${String(Math.round(loaded.handle.motorHours ?? 0))} hours`}
              className="flex-row gap-1"
            >
              {odometer(loaded.handle.motorHours).map((digit, index) => (
                <View
                  key={index}
                  className="size-9 items-center justify-center rounded-sm bg-surface-3"
                >
                  <Text variant="title-3" className="tabular">
                    {digit}
                  </Text>
                </View>
              ))}
              <Text variant="caption" tone="variant" className="self-end pl-1">
                hours
              </Text>
            </View>
            <Text variant="callout" tone={loaded.handle.faultHex === null ? 'variant' : 'critical'}>
              {handleFault(loaded.handle)}
            </Text>
            {loaded.handle.firmware === null ? null : (
              <Text variant="footnote" tone="variant">
                Firmware {loaded.handle.firmware}
              </Text>
            )}
            {loaded.sessionsByWeek.length < 2 ? null : (
              <WeekBars bars={weekBars(loaded)} label="Brushes per week on this handle" />
            )}
          </View>
        )}
      </LoadedQuery>
    </Card>
  );
}

export function SonicareCareCards({ deviceId, view }: DeviceProps): ReactNode {
  return view.profile.brand === 'sonicare' && view.profile.motorRuntime ? (
    <MotorCard deviceId={deviceId} />
  ) : null;
}
