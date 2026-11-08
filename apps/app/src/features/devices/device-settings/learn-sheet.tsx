import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import { isButtonName } from '../model/remote-layout';
import {
  useIrLearning,
  type IrLearning,
  type LearnTarget,
  type SavedButton,
} from '../model/use-ir-learning';
import { background } from '@smarteverything/logging';

function Suggestions({
  names,
  onPick,
}: {
  readonly names: readonly string[];
  readonly onPick: (name: string) => void;
}): ReactNode {
  if (names.length === 0) {
    return null;
  }
  return (
    <View accessibilityRole="toolbar" accessibilityLabel="Suggested buttons" className="gap-2">
      <Text variant="label" tone="variant">
        Buttons this remote usually has
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {names.map((name) => (
          <Button
            key={name}
            label={name}
            variant="tonal"
            onPress={() => {
              onPick(name);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function Ask({
  suggestions,
  initial,
  onStart,
}: {
  readonly suggestions: readonly string[];
  readonly initial: string;
  readonly onStart: (button: string) => void;
}): ReactNode {
  const [button, setButton] = useState(initial);
  const start = (): void => {
    if (isButtonName(button)) {
      onStart(button.trim());
    }
  };
  return (
    <View className="gap-4">
      <TextField
        label="Button name"
        placeholder="Name of the button"
        value={button}
        onChange={setButton}
        onSubmit={start}
        focusOnMount
      />
      <Suggestions names={suggestions} onPick={setButton} />
      <Button
        label="Start learning"
        icon="remote"
        disabled={!isButtonName(button)}
        onPress={start}
      />
    </View>
  );
}

function Status({
  icon,
  title,
  body,
  children,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly body?: string;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <View className="items-center gap-3 py-4">
      {icon}
      <Text variant="title-3" align="center">
        {title}
      </Text>
      {body === undefined ? null : (
        <Text variant="callout" tone="variant" align="center">
          {body}
        </Text>
      )}
      {children}
    </View>
  );
}

function Saved({
  blaster,
  saved,
  onAnother,
}: {
  readonly blaster: Device;
  readonly saved: SavedButton;
  readonly onAnother: () => void;
}): ReactNode {
  const send = useControl(blaster.id, 'ir_send');
  const { code } = saved;
  return (
    <Status
      icon={<Icon name="circleCheck" size={32} tone="positive" />}
      title={`${saved.button} is saved`}
    >
      <View className="flex-row gap-2">
        <Button
          label="Try it"
          onPress={() => {
            background(send.set({ format: code.format, code: code.code }), 'send.set_failed');
          }}
        />
        <Button label="Learn another" variant="tonal" onPress={onAnother} />
      </View>
    </Status>
  );
}

function Step({
  blaster,
  learning,
  target,
  suggestions,
  initial,
}: {
  readonly blaster: Device;
  readonly learning: IrLearning;
  readonly target: LearnTarget;
  readonly suggestions: readonly string[];
  readonly initial: string;
}): ReactNode {
  const phase = learning.phase;
  switch (phase.kind) {
    case 'idle':
      return (
        <Ask
          suggestions={suggestions}
          initial={initial}
          onStart={(button) => {
            learning.start(target, button);
          }}
        />
      );
    case 'listening':
    case 'saving':
      return (
        <Status
          icon={<ActivityIndicator size="large" />}
          title={`Press ${phase.button} on your remote`}
          body={`Point it at ${blaster.label} from close by.`}
        />
      );
    case 'saved':
      return <Saved blaster={blaster} saved={phase} onAnother={learning.reset} />;
    case 'failed':
      return (
        <Status
          icon={<Icon name="alert" size={32} tone="critical" />}
          title="Nothing was learned"
          body={phase.message}
        >
          <Button label="Try again" variant="tonal" onPress={learning.reset} />
        </Status>
      );
  }
}

export function LearnSheet({
  blaster,
  name,
  target,
  suggestions,
  initial = '',
  onClose,
}: {
  readonly blaster: Device;
  readonly name: string;
  readonly target: LearnTarget;
  readonly suggestions: readonly string[];
  readonly initial?: string;
  readonly onClose: () => void;
}): ReactNode {
  const learning = useIrLearning(blaster);
  return (
    <Sheet open onClose={onClose} title={`Learn a button for ${name}`} detents={['fit']}>
      <Step
        blaster={blaster}
        learning={learning}
        target={target}
        suggestions={suggestions}
        initial={initial}
      />
    </Sheet>
  );
}
