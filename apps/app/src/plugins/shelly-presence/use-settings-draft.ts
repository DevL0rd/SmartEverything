import { useState } from 'react';
import type { ShellyDevice } from '@smarteverything/shelly';
import type { SettingCard } from './settings-model';
import { settingParams, settingsPatch, type SettingsDraft } from './settings-patch';
import { usePresenceOperation, type PresenceOperation } from './use-presence-operation';
import { background } from '@smarteverything/logging';

export interface SettingsEditor {
  readonly draft: SettingsDraft;
  readonly operation: PresenceOperation;
  readonly change: (path: string, value: SettingsDraft[string]) => void;
  readonly save: () => void;
}

export function useSettingsDraft(sensor: ShellyDevice, card: SettingCard): SettingsEditor {
  const [draft, setDraft] = useState<SettingsDraft>({});
  const operation = usePresenceOperation(sensor);
  const rows = card.sections.flatMap((section) => section.rows);
  const action = rows[0]?.action;
  return {
    draft,
    operation,
    change: (path, value): void => {
      setDraft({ ...draft, [path]: value });
    },
    save: (): void => {
      if (action === undefined) return;
      const params = settingParams(
        action,
        { component: card.component, id: card.instance.id },
        settingsPatch(rows, draft, card.instance.config),
      );
      background(
        operation.run({ action, params }).then((saved) => {
          if (saved) setDraft({});
        }),
        'operation.run_failed',
      );
    },
  };
}
