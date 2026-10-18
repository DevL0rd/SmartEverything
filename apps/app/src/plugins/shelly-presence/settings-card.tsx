import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { ShellyDevice } from '@smarteverything/shelly';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { Text } from '../../components/text';
import { atPath, recordOf } from './form-model';
import { OperationFeedback } from './operation-feedback';
import { SettingField } from './setting-field';
import { ValueTree } from './result-view';
import { statusShown, type SettingCard, type SettingSection } from './settings-model';
import { rowPath, type SettingsDraft } from './settings-patch';
import { useCanOperate } from './use-can-operate';
import { useSettingsDraft } from './use-settings-draft';

interface SectionProps {
  readonly section: SettingSection;
  readonly accepted: unknown;
  readonly draft: SettingsDraft;
  readonly disabled: boolean;
  readonly highlighted: boolean;
  readonly titled: boolean;
  readonly change: (path: string, value: SettingsDraft[string]) => void;
}

function Section({
  section,
  accepted,
  draft,
  disabled,
  highlighted,
  titled,
  change,
}: SectionProps): ReactNode {
  return (
    <View className={highlighted ? 'gap-3 rounded-md bg-primary-container p-2' : 'gap-3'}>
      {titled ? <Text variant="body-strong">{section.title}</Text> : null}
      {section.rows.map((row) => {
        const path = rowPath(row);
        return (
          <SettingField
            key={row.id}
            row={row}
            disabled={disabled}
            value={Object.hasOwn(draft, path) ? draft[path] : atPath(accepted, row.path)}
            change={(value) => {
              change(path, value);
            }}
          />
        );
      })}
    </View>
  );
}

export function SettingsCard({
  sensor,
  card,
  focus,
}: {
  readonly sensor: ShellyDevice;
  readonly card: SettingCard;
  readonly focus: string | undefined;
}): ReactNode {
  const editor = useSettingsDraft(sensor, card);
  const canOperate = useCanOperate();
  const action = card.sections[0]?.rows[0]?.action;
  const writable = action !== undefined && canOperate(action);
  const offline = sensor.connection.state !== 'online' || !writable;
  const status = statusShown(card) ? recordOf(card.instance.status) : null;
  return (
    <Card title={card.title}>
      <View className="gap-4">
        {card.sections.map((section) => (
          <Section
            key={section.group}
            section={section}
            accepted={card.instance.config}
            draft={editor.draft}
            disabled={offline}
            highlighted={focus === section.group}
            titled={card.sections.length > 1}
            change={editor.change}
          />
        ))}
        {status === null ? null : <ValueTree value={status} />}
        <OperationFeedback operation={editor.operation} />
        {writable ? (
          <Button
            label="Save"
            loading={editor.operation.busy}
            disabled={offline || Object.keys(editor.draft).length === 0}
            onPress={editor.save}
          />
        ) : (
          <Text variant="footnote" tone="variant">
            Only the home owner can change these settings.
          </Text>
        )}
      </View>
    </Card>
  );
}
