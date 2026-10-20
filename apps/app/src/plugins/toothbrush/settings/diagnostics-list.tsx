import type { ReactNode } from 'react';
import { useState } from 'react';
import { Badge } from '../../../components/badge';
import { Disclosure } from '../../../components/disclosure';
import { brandUi } from '../brands';
import { Anchored } from './anchored';
import type { SettingsProps } from './settings-props';

export function DiagnosticsList({ deviceId, state }: SettingsProps): ReactNode {
  const [open, setOpen] = useState(false);
  const { Diagnostics } = brandUi(state.profile.brand);
  const fetching = state.link.fetching;
  if (Diagnostics === null || !state.mayConfigure) {
    return null;
  }
  return (
    <Anchored deviceId={deviceId} id="diagnostics" label="Toothbrush diagnostics">
      <Disclosure
        label="Toothbrush diagnostics"
        open={open}
        hint="Shows technical details about the brush"
        onToggle={() => {
          setOpen((now) => !now);
        }}
        trailing={
          fetching > 0 ? (
            <Badge label={`Fetching ${String(fetching)} sessions`} tone="info" />
          ) : undefined
        }
      >
        <Diagnostics deviceId={deviceId} mayConfigure={state.mayConfigure} />
      </Disclosure>
    </Anchored>
  );
}
