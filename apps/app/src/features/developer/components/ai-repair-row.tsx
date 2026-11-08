import type { ReactNode } from 'react';
import { SwitchRow } from '../../../components/rows';
import { useAiRepairSettings, useAiRepairUpdate } from '../data/ai-repair-settings';

export const AI_REPAIR_TITLE = 'Send new errors to AI automatically';

export const AI_REPAIR_DESCRIPTION =
  'Sends a repair request to the dedicated AI repair chat using its selected model and tools. Logs stay on the hub even when this is off.';

export function AiRepairRow(): ReactNode {
  const settings = useAiRepairSettings();
  const { save, saving } = useAiRepairUpdate();
  const subtitle = settings.isError
    ? 'Could not read the AI repair setting from the hub.'
    : AI_REPAIR_DESCRIPTION;
  return (
    <SwitchRow
      title={AI_REPAIR_TITLE}
      subtitle={subtitle}
      wrapSubtitle
      icon="sparkles"
      value={settings.data?.enabled ?? false}
      disabled={settings.data === undefined || settings.isError || saving}
      onChange={save}
    />
  );
}
