import type { ShellyOperationResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { List } from '../../components/section';
import { ValueRow } from '../../components/rows';

function optionalNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Unknown' : String(value);
}
export function timestamp(value: number | undefined): string {
  return value === undefined ? 'None' : new Date(value * 1000).toLocaleString();
}

export function SystemResult({ result }: { readonly result: ShellyOperationResult }): ReactNode {
  if (result.kind === 'firmware_upload_write' || result.kind === 'firmware_alternatives')
    return <FirmwareTransferResult result={result} />;
  if (result.kind === 'schedule_eval')
    return (
      <List title="Schedule preview">
        <ValueRow title="Next occurrence" value={timestamp(result.value.next)} />
        <ValueRow title="Previous occurrence" value={timestamp(result.value.prev)} />
      </List>
    );
  if (result.kind === 'device_timezones')
    return (
      <List title="Time zones">
        {result.value.timezones.map((zone) => (
          <ValueRow key={zone} title={zone} value="Available" />
        ))}
      </List>
    );
  if (result.kind === 'device_detect_location')
    return (
      <List title="Detected location">
        <ValueRow title="Time zone" value={result.value.tz ?? 'Unknown'} />
        <ValueRow title="Latitude" value={optionalNumber(result.value.lat)} />
        <ValueRow title="Longitude" value={optionalNumber(result.value.lon)} />
      </List>
    );
  if (result.kind === 'device_profiles')
    return (
      <List title="Operating modes">
        {Object.entries(result.value.profiles).map(([name, modes]) => (
          <ValueRow
            key={name}
            title={name}
            value={modes.components
              .map((entry) => `${entry.type}: ${String(entry.count)}`)
              .join(', ')}
          />
        ))}
      </List>
    );
  if (result.kind === 'firmware_check') return <FirmwareResult result={result} />;
  return null;
}
function FirmwareResult({
  result,
}: {
  readonly result: Extract<ShellyOperationResult, { readonly kind: 'firmware_check' }>;
}): ReactNode {
  return (
    <List title="Available firmware">
      <ValueRow title="Stable" value={result.value.stable?.version ?? 'No update'} />
      <ValueRow title="Beta" value={result.value.beta?.version ?? 'No update'} />
      {Object.entries(result.value.alt ?? {}).map(([id, update]) => (
        <ValueRow
          key={id}
          title={update.name}
          value={update.stable?.version ?? update.beta?.version ?? 'No release'}
        />
      ))}
    </List>
  );
}

function FirmwareTransferResult({ result }: { readonly result: ShellyOperationResult }): ReactNode {
  if (result.kind === 'firmware_upload_write')
    return <ValueRow title="Accepted bytes" value={String(result.value.offset)} />;
  if (result.kind === 'firmware_alternatives')
    return (
      <List title="Alternative applications">
        {Object.entries(result.value).map(([name, build]) => (
          <ValueRow key={name} title={name} value={build} />
        ))}
      </List>
    );
  return null;
}
