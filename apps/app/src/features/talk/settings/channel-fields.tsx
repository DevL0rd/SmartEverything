import type { ReactNode } from 'react';
import { View } from 'react-native';
import { TALK_ICONS, TALK_KEEP_HOURS, type TalkKeepHours } from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List, Section } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { TextField } from '../../../components/text-field';
import { KEEP_OPTIONS, PRIORITY_OPTIONS, type ChannelFields } from './channel-draft';
import { ICON_LABELS } from './channel-icon-labels';

export interface ChannelFieldsProps {
  readonly fields: ChannelFields;
  readonly onChange: (change: Partial<ChannelFields>) => void;
  readonly onNameDone?: () => void;
  readonly nameError: string | null;
}

function keepOf(value: string): TalkKeepHours | null {
  return TALK_KEEP_HOURS.find((hours) => String(hours) === value) ?? null;
}

function NameAndIcon({ fields, onChange, onNameDone, nameError }: ChannelFieldsProps): ReactNode {
  return (
    <>
      <Section>
        <TextField
          label="Name"
          value={fields.name}
          placeholder="Family"
          error={nameError}
          onChange={(name) => {
            onChange({ name });
          }}
          {...(onNameDone === undefined ? {} : { onBlur: onNameDone, onSubmit: onNameDone })}
        />
      </Section>
      <Section title="Icon">
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Icon"
          className="flex-row flex-wrap gap-1"
        >
          {TALK_ICONS.map((icon) => (
            <IconButton
              key={icon}
              icon={icon}
              label={ICON_LABELS[icon]}
              variant={fields.icon === icon ? 'filled' : 'tonal'}
              selected={fields.icon === icon}
              onPress={() => {
                onChange({ icon });
              }}
            />
          ))}
        </View>
      </Section>
    </>
  );
}

function AiListens({
  fields,
  onChange,
}: Pick<ChannelFieldsProps, 'fields' | 'onChange'>): ReactNode {
  return (
    <List
      inset
      footer="The AI hears this channel, writes down what is said and answers when it hears its name. Turn it off to keep the AI out."
    >
      <SwitchRow
        title="AI listens"
        subtitle="Transcribes messages and answers to its name"
        icon="sparkles"
        value={fields.ai_listens}
        onChange={(ai_listens) => {
          onChange({ ai_listens });
        }}
      />
    </List>
  );
}

function PriorityAndKeep({
  fields,
  onChange,
}: Pick<ChannelFieldsProps, 'fields' | 'onChange'>): ReactNode {
  return (
    <>
      <Section
        title="Priority"
        footer="A priority channel interrupts other channels on every member."
      >
        <Segmented
          label="Priority"
          options={PRIORITY_OPTIONS}
          value={fields.priority}
          onChange={(priority) => {
            onChange({ priority });
          }}
        />
      </Section>
      <List inset footer="Messages are saved on your server only.">
        <SelectRow
          title="Keep messages"
          subtitle="So members can replay what they missed"
          icon="clock"
          options={KEEP_OPTIONS}
          value={String(fields.keep_hours)}
          onChange={(value) => {
            const keep = keepOf(value);
            if (keep !== null) {
              onChange({ keep_hours: keep });
            }
          }}
        />
      </List>
      <AiListens fields={fields} onChange={onChange} />
    </>
  );
}

export function ChannelFieldsBlock(props: ChannelFieldsProps): ReactNode {
  return (
    <>
      <NameAndIcon {...props} />
      <PriorityAndKeep fields={props.fields} onChange={props.onChange} />
    </>
  );
}
