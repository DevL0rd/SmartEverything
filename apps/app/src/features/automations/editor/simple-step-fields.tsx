import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { StepV2 } from '@smarteverything/domain';
import { Select } from '../../../components/select';
import { TextField } from '../../../components/text-field';
import type { Catalog } from '../data/use-automations';
import { DAY_MS } from '../../../format/time';
import { MILLISECOND_UNITS } from './duration-units';
import { DurationField } from './time-fields';
import { speechOf, speechStep } from '../model/speak-step';
import { ToolForm } from './tool-fields';
import { WakeForm } from './wake-fields';

type Step<K extends StepV2['do']> = Extract<StepV2, { do: K }>;

interface FieldsProps<K extends StepV2['do']> {
  readonly catalog: Catalog;
  readonly step: Step<K>;
  readonly onChange: (step: Step<K>) => void;
}

export function SceneStepFields({ catalog, step, onChange }: FieldsProps<'scene'>): ReactNode {
  return (
    <Select
      label="Scene"
      placeholder="Pick a scene"
      value={catalog.scenes.some((scene) => scene.id === step.scene) ? step.scene : null}
      options={catalog.scenes.map((scene) => ({ value: scene.id, label: scene.name }))}
      onChange={(scene) => {
        onChange({ ...step, scene });
      }}
    />
  );
}

export function WaitStepFields({ step, onChange }: FieldsProps<'wait'>): ReactNode {
  return (
    <DurationField
      label="Wait"
      value={step.ms}
      units={MILLISECOND_UNITS}
      max={DAY_MS}
      onChange={(ms) => {
        onChange({ ...step, ms });
      }}
    />
  );
}

export function NoticeStepFields({ step, onChange }: FieldsProps<'notify'>): ReactNode {
  return (
    <TextField
      label="Message"
      value={step.message}
      helper="Shows on your phones and in Activity."
      onChange={(message) => {
        onChange({ ...step, message });
      }}
    />
  );
}

export function AiStepFields({ catalog, step, onChange }: FieldsProps<'ai'>): ReactNode {
  return (
    <WakeForm
      catalog={catalog}
      wake={{ profileId: step.person, chatId: step.chat ?? null, instruction: step.instruction }}
      onChange={(wake) => {
        const { chat: _chat, ...rest } = step;
        onChange({
          ...rest,
          person: wake.profileId,
          instruction: wake.instruction,
          ...(wake.chatId === null ? {} : { chat: wake.chatId }),
        });
      }}
    />
  );
}

function GenericToolFields({ catalog, step, onChange }: FieldsProps<'tool'>): ReactNode {
  return (
    <ToolForm
      catalog={catalog}
      call={{ profileId: step.person, tool: step.tool, args: step.args ?? {} }}
      onChange={(call) => {
        const { args: _args, ...rest } = step;
        onChange({
          ...rest,
          person: call.profileId,
          tool: call.tool,
          ...(Object.keys(call.args).length === 0 ? {} : { args: call.args }),
        });
      }}
    />
  );
}

function SpeakStepFields({ catalog, step, onChange }: FieldsProps<'tool'>): ReactNode {
  const speech = speechOf(step) ?? { deviceId: '', text: '' };
  return (
    <View className="gap-3">
      <Select
        label="Speaker"
        placeholder="Pick a camera"
        value={
          catalog.speakers.some((device) => device.id === speech.deviceId) ? speech.deviceId : null
        }
        options={catalog.speakers.map((device) => ({ value: device.id, label: device.label }))}
        onChange={(deviceId) => {
          onChange(speechStep(step, { ...speech, deviceId }));
        }}
      />
      <TextField
        label="Words to say"
        value={speech.text}
        multiline
        helper="Said once, word for word, through the camera’s speaker."
        onChange={(text) => {
          onChange(speechStep(step, { ...speech, text }));
        }}
      />
    </View>
  );
}

export function ToolStepFields(props: FieldsProps<'tool'>): ReactNode {
  return speechOf(props.step) === null ? (
    <GenericToolFields {...props} />
  ) : (
    <SpeakStepFields {...props} />
  );
}

export function StopStepFields({ catalog, step, onChange }: FieldsProps<'stop'>): ReactNode {
  const { automation: _automation, key: _key, ...bare } = step;
  return (
    <View className="gap-3">
      <Select
        label="Stop"
        value={step.automation === undefined ? 'this' : 'other'}
        options={[
          { value: 'this', label: 'This run' },
          { value: 'other', label: 'Another automation’s runs' },
        ]}
        onChange={(kind) => {
          const first = catalog.automations[0];
          onChange(
            kind === 'this' || first === undefined ? bare : { ...bare, automation: first.id },
          );
        }}
      />
      {step.automation === undefined ? null : (
        <>
          <Select
            label="Automation"
            searchable
            value={step.automation}
            options={catalog.automations.map((row) => ({ value: row.id, label: row.name }))}
            onChange={(automation) => {
              onChange({ ...step, automation });
            }}
          />
          <TextField
            label="Only runs with this key (optional)"
            value={step.key ?? ''}
            helper="Matches the key set under Advanced on those automations."
            onChange={(key) => {
              const { key: _old, ...rest } = step;
              onChange(key.trim() === '' ? rest : { ...rest, key });
            }}
          />
        </>
      )}
    </View>
  );
}
