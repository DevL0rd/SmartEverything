import type { ShellyOperationResult } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { ValueRow } from '../../components/rows';
import { List } from '../../components/section';

export function DynamicResult({ result }: { readonly result: ShellyOperationResult }): ReactNode {
  if (result.kind === 'bthome_objects')
    return (
      <List title="Bluetooth objects">
        {result.value.objects.map((entry) => (
          <ValueRow
            key={entry.obj_id}
            title={entry.obj_name ?? `Object ${String(entry.obj_id)}`}
            value={[entry.type, entry.unit].filter((part) => part !== undefined).join(' · ')}
          />
        ))}
      </List>
    );
  if (result.kind === 'bthome_known_objects')
    return (
      <List title="Known Bluetooth objects">
        {result.value.objects.map((entry, index) => (
          <ValueRow
            key={index}
            title={`Object ${String(entry.obj_id)}`}
            value={`Index ${String(entry.idx)}`}
          />
        ))}
      </List>
    );
  return null;
}
