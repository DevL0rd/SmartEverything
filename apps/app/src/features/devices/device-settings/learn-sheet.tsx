import type { ReactNode } from 'react';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { IrCodeRow, IrRemoteRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useControl } from '../../../store/control';
import type { Device } from '../../../store/state';
import { isButtonName } from '../model/remote-layout';
import { useIrLearning, type IrLearning } from '../model/use-ir-learning';

function Ask({ onStart }: { readonly onStart: (button: string) => void }): ReactNode {
  const [button, setButton] = useState('');
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
  code,
  onAnother,
}: {
  readonly blaster: Device;
  readonly code: IrCodeRow;
  readonly onAnother: () => void;
}): ReactNode {
  const send = useControl(blaster.id, 'ir_send');
  return (
    <Status
      icon={<Icon name="circleCheck" size={32} tone="positive" />}
      title={`${code.button} is saved`}
    >
      <View className="flex-row gap-2">
        <Button
          label="Try it"
          onPress={() => {
            void send.set({ format: code.format, code: code.code });
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
  remote,
}: {
  readonly blaster: Device;
  readonly learning: IrLearning;
  readonly remote: IrRemoteRow;
}): ReactNode {
  const phase = learning.phase;
  switch (phase.kind) {
    case 'idle':
      return (
        <Ask
          onStart={(button) => {
            learning.start(remote, button);
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
      return <Saved blaster={blaster} code={phase.code} onAnother={learning.reset} />;
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
  remote,
  onClose,
}: {
  readonly blaster: Device;
  readonly remote: IrRemoteRow;
  readonly onClose: () => void;
}): ReactNode {
  const learning = useIrLearning(blaster);
  return (
    <Sheet open onClose={onClose} title={`Learn a ${remote.name} button`} detents={['fit']}>
      <Step blaster={blaster} learning={learning} remote={remote} />
    </Sheet>
  );
}
