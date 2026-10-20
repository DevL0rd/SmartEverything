import { tankEdge } from '@smarteverything/domain';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useUniwind } from 'uniwind';
import { useColour } from '../../../design/colour';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { useOnScreenGate } from '../../../design/visibility';
import { rounded, type PrinterLive } from '../../../features/device-visuals';
import { lowestLine } from '../model/chips';
import { supplyCopy } from '../model/supply-copy';
import { SupplyTank } from './supply-tank';

const WASTE_BAR = '#7a7468';

export interface SupplyBandProps {
  readonly live: PrinterLive;
  readonly compact?: boolean;
}

function Empty({ reports }: { readonly reports: boolean }): ReactNode {
  return (
    <Text variant="callout" tone="variant">
      {reports ? 'No supplies listed yet.' : 'This printer does not report ink.'}
    </Text>
  );
}

export function SupplyTanks({ live, compact = false }: SupplyBandProps): ReactNode {
  const frame = useRef<View>(null);
  const gate = useOnScreenGate(frame, live.state === 'printing');
  const running = gate.moving ? !gate.reduced : false;
  return (
    <View ref={frame} onLayout={gate.onLayout} className="flex-row flex-wrap gap-x-2 gap-y-4">
      {live.supplies.map((supply) => (
        <SupplyTank
          key={supply.detail.key}
          supply={supply}
          running={running}
          compact={compact || live.supplies.length > 6}
        />
      ))}
    </View>
  );
}

export function SupplyBars({ live }: { readonly live: PrinterLive }): ReactNode {
  const track = useColour('surface-3');
  const theme = useUniwind().theme === 'light' ? 'light' : 'dark';
  const stacked = live.supplies.length > 4;
  return (
    <View className="min-w-0 flex-row gap-3">
      {live.supplies.map((supply) => {
        const copy = supplyCopy(supply.detail, supply.level, supply.standing);
        const colour = supply.detail.consumed ? supply.detail.colour : WASTE_BAR;
        return (
          <View key={supply.detail.key} className="min-w-0 flex-1 gap-1">
            {stacked ? (
              <View>
                <Text variant="caption" tone="variant" numberOfLines={1}>
                  {copy.code}
                </Text>
                <Text variant="caption" numberOfLines={1} className="tabular">
                  {copy.value}
                </Text>
              </View>
            ) : (
              <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
                {copy.code} {copy.value}
              </Text>
            )}
            <Svg width="100%" height={8} viewBox="0 0 100 8" preserveAspectRatio="none">
              <Path d={rounded({ x: 0, y: 0, w: 100, h: 8, r: 4 })} fill={track} />
              {(supply.level ?? 0) < 2 ? null : (
                <Path
                  d={rounded({ x: 0.5, y: 0.5, w: (supply.level ?? 0) - 1, h: 7, r: 3.5 })}
                  fill={colour}
                  stroke={tankEdge(colour, theme)}
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </Svg>
          </View>
        );
      })}
    </View>
  );
}

export function SupplyBand({
  live,
  deviceId,
}: SupplyBandProps & { readonly deviceId: string }): ReactNode {
  const line = lowestLine(live);
  return (
    <Card title="Supplies" icon="droplet">
      <View className="gap-3">
        {live.supplies.length === 0 ? (
          <Empty reports={live.details.reportsSupplies} />
        ) : (
          <SupplyTanks live={live} />
        )}
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          {line === null ? (
            <View />
          ) : (
            <Text variant="callout" tone="warning">
              {line}
            </Text>
          )}
          <Button
            label="Levels and forecast"
            icon="droplet"
            variant="text"
            href={href.deviceSection(deviceId, 'supplies')}
          />
        </View>
      </View>
    </Card>
  );
}
