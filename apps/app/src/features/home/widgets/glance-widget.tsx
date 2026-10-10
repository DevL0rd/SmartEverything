import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { WidgetFrame, type WidgetSize } from '../../../components/widget-board';
import type { ColourRole } from '../../../design/tokens';
import { ReadingsRow, metricColour, type MetricReading } from '../../climate';
import { useHome } from '../data/home-data';

function glowOf(readings: readonly MetricReading[]): ColourRole | null {
  const air = readings.find((reading) => reading.metric === 'pm25' && !reading.stale);
  return air === undefined ? null : metricColour(air);
}

export function GlanceWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const readings = useHome((view) => view.readings);
  return (
    <WidgetFrame
      title="Indoors"
      icon="thermometer"
      accent="temp-warm"
      size={size}
      glow={glowOf(readings)}
      href={href.devices()}
    >
      <ReadingsRow readings={readings} />
    </WidgetFrame>
  );
}
