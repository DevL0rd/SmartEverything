import type { BrushView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { LoadedQuery } from '../../../components/loaded-query';
import { SwitchRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { useBrushAct } from '../../toothbrush/data/brush-act';
import { useBrushView } from '../../toothbrush/data/brush-data';
import type { DiagnosticsProps } from '../../toothbrush/brand-ui';

const UNKNOWN = 'Not read';

function text(value: string | number | null): string {
  return value === null ? UNKNOWN : String(value);
}

type SonicareBrand = Extract<
  Extract<BrushView, { view: 'diagnostics' }>['brand'],
  { brand: 'sonicare' }
>;

function readings(brand: SonicareBrand): ReactNode[] {
  const rows: readonly (readonly [string, string | number | null])[] = [
    ['Model', brand.identity.model],
    ['Serial', brand.identity.serial],
    ['Firmware', brand.identity.firmware],
    ['Brush head serial', brand.headSerial],
    ['Brush head ring', brand.headRing],
    ['NFC tag version', brand.nfcVersion],
    ['NFC tag address', brand.nfcUrl],
    ['Error bits, lasting', brand.errorPersistent],
    ['Error bits, last brushing', brand.errorVolatile],
  ];
  return [
    ...rows.map(([title, value]) => <ValueRow key={title} title={title} value={text(value)} />),
    <ValueRow
      key="Calibration"
      title="Calibration"
      value={brand.calibration.length === 0 ? UNKNOWN : brand.calibration.join(', ')}
    />,
  ];
}

export function SonicareDiagnostics({ deviceId, mayConfigure }: DiagnosticsProps): ReactNode {
  const diagnostics = useBrushView(deviceId, 'diagnostics');
  const { act } = useBrushAct(deviceId);
  return (
    <LoadedQuery query={diagnostics}>
      {(view) => {
        const { brand } = view;
        if (brand.brand !== 'sonicare') {
          return null;
        }
        return (
          <List inset>
            {readings(brand)}
            <ValueRow
              title="Pressure in grams"
              subtitle="Not shown. The handle gives no grams until its sensor is calibrated."
              wrapSubtitle
              value=""
            />
            {mayConfigure ? (
              <SwitchRow
                title="Record raw frames"
                subtitle={`${String(view.rawLog.frames.length)} frames kept in memory for support`}
                wrapSubtitle
                value={view.rawLog.enabled}
                onChange={(next) => {
                  act({ action: 'raw_log', enabled: next }, 'The raw log could not be changed');
                }}
              />
            ) : null}
          </List>
        );
      }}
    </LoadedQuery>
  );
}
