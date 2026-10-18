import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SpeechSourceV2, TriggerV2 } from '@smarteverything/domain';
import { SwitchRow } from '../../../components/rows';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import { useSpeechSources } from '../data/use-speech-sources';
import { speechSourceKey } from '../model/speech-sources';

type Speech = Extract<TriggerV2, { on: 'speech' }>;

const ANYWHERE = 'anywhere';

function withoutKey(trigger: Speech, key: 'source' | 'caseSensitive' | 'includeBots'): Speech {
  const { [key]: _removed, ...rest } = trigger;
  return rest;
}

function flag(trigger: Speech, key: 'caseSensitive' | 'includeBots', value: boolean): Speech {
  return value ? { ...trigger, [key]: true } : withoutKey(trigger, key);
}

function SourcePicker({
  trigger,
  onChange,
}: {
  readonly trigger: Speech;
  readonly onChange: (trigger: Speech) => void;
}): ReactNode {
  const sources = useSpeechSources();
  const current: SpeechSourceV2 | undefined = trigger.source;
  const saved =
    current !== undefined &&
    !sources.some((entry) => speechSourceKey(entry.source) === speechSourceKey(current))
      ? [{ value: speechSourceKey(current), label: 'Saved source' }]
      : [];
  return (
    <Select
      label="Listen to"
      value={current === undefined ? ANYWHERE : speechSourceKey(current)}
      options={[
        { value: ANYWHERE, label: 'Any listening source' },
        ...sources.map((entry) => ({ value: speechSourceKey(entry.source), label: entry.label })),
        ...saved,
      ]}
      searchable
      onChange={(key) => {
        const picked = sources.find((entry) => speechSourceKey(entry.source) === key);
        if (key === ANYWHERE) onChange(withoutKey(trigger, 'source'));
        else if (picked !== undefined) onChange({ ...trigger, source: picked.source });
      }}
    />
  );
}

export function SpeechFields({
  trigger,
  onChange,
}: {
  readonly trigger: Speech;
  readonly onChange: (trigger: Speech) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <TextField
        label="Words to listen for"
        value={trigger.phrase}
        helper="A word or a short phrase, matched exactly as spoken."
        onChange={(phrase) => {
          onChange({ ...trigger, phrase });
        }}
      />
      <SourcePicker trigger={trigger} onChange={onChange} />
      <SwitchRow
        title="Match capital letters"
        subtitle="“Lights” and “lights” count as different words."
        value={trigger.caseSensitive === true}
        onChange={(value) => {
          onChange(flag(trigger, 'caseSensitive', value));
        }}
      />
      <SwitchRow
        title="Include speech from bots"
        subtitle="Also react to voices from other assistants."
        value={trigger.includeBots === true}
        onChange={(value) => {
          onChange(flag(trigger, 'includeBots', value));
        }}
      />
    </View>
  );
}
