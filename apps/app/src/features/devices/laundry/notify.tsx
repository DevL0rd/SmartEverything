import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Logger, background } from '@smarteverything/logging';
import { createAutomation, setAutomationEnabled } from '../../../api/automations';
import { Card } from '../../../components/card';
import { IconWell } from '../../../components/icon-well';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { rowsOf } from '../../../store/state';
import { sameJson } from '../../../store/same-json';
import { useStoreSelector } from '../../../store/store-context';
import { templatesFor, type Template } from '../../automations';
import type { Device } from '../../../store/state';

const log = new Logger('app.devices');

interface Existing {
  readonly id: string;
  readonly enabled: boolean;
}

export function templateStates(
  names: readonly string[],
  rows: readonly { readonly id: string; readonly name: string; readonly enabled: boolean }[],
): readonly (Existing | null)[] {
  return names.map((name) => {
    const found = rows.find((row) => row.name.toLowerCase() === name.toLowerCase());
    return found === undefined ? null : { id: found.id, enabled: found.enabled };
  });
}

export function notifyTemplates(device: Parameters<typeof templatesFor>[0][number]): Template[] {
  return templatesFor([device]).filter((template) => template.deviceId === device.id);
}

export async function setTemplate(
  template: Template,
  existing: Existing | null,
  on: boolean,
): Promise<void> {
  if (existing !== null) {
    await setAutomationEnabled(existing.id, on);
  } else if (on) {
    await createAutomation({ name: template.name, enabled: true, definition: template.build() });
  }
}

function Row({
  template,
  existing,
}: {
  readonly template: Template;
  readonly existing: Existing | null;
}): ReactNode {
  const on = existing?.enabled === true;
  const label = template.short ?? template.title;
  return (
    <View className="min-h-touch-min flex-row items-center gap-3">
      <IconWell icon={on ? 'bell' : 'bellOff'} colour={on ? 'primary' : 'on-surface-variant'} />
      <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
        {label}
      </Text>
      <Switch
        label={`Notify me: ${label}`}
        value={on}
        onChange={(next) => {
          background(
            setTemplate(template, existing, next).then(
              () => {
                notify({
                  message: next ? 'Automation turned on' : 'Automation turned off',
                  detail: template.name,
                  tone: 'positive',
                });
              },
              (error: unknown) => {
                log.error('laundry.template_failed', error, { template: template.id });
                notify({ message: 'The automation didn’t change', tone: 'critical', error });
              },
            ),
            'laundry.template_failed',
          );
        }}
      />
    </View>
  );
}

export function DeviceNotifyCard({ device }: { readonly device: Device }): ReactNode {
  const templates = useMemo(() => notifyTemplates(device), [device]);
  const names = useMemo(() => templates.map((template) => template.name), [templates]);
  const states = useStoreSelector(
    (state) => templateStates(names, rowsOf(state.tables.automations)),
    sameJson,
    [names],
  );
  if (templates.length === 0) {
    return null;
  }
  return (
    <Card title="Notify me">
      <View className="gap-2">
        {templates.map((template, index) => (
          <Row key={template.id} template={template} existing={states[index] ?? null} />
        ))}
        <Text variant="footnote" tone="variant">
          Sends a notice to your phone. Each switch is an automation you can edit in Automations.
        </Text>
      </View>
    </Card>
  );
}
