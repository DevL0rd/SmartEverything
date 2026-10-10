import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { Card } from '../../components/card';
import { EmptyState } from '../../components/empty-state';
import { FlowFrame } from '../../components/flow-frame';
import { Text } from '../../components/text';
import { TextField } from '../../components/text-field';
import type { Device } from '../../store/state';
import { useFitnessReady } from './fitness-ready';
import {
  EMPTY_FORM,
  useAddedScale,
  useAddScale,
  useXiaomiScale,
  type ManualForm,
} from './scale-setup';

function ManualFields({
  form,
  onForm,
}: {
  readonly form: ManualForm;
  readonly onForm: (form: ManualForm) => void;
}): ReactNode {
  return (
    <View className="gap-4">
      <TextField
        label="Name"
        value={form.name}
        onChange={(name) => {
          onForm({ ...form, name });
        }}
      />
      <TextField
        label="Bluetooth address"
        kind="code"
        value={form.address}
        onChange={(address) => {
          onForm({ ...form, address });
        }}
        placeholder="D0:7B:6F:A6:AB:45"
      />
      <TextField
        label="Bluetooth key"
        kind="password"
        value={form.bindKey}
        onChange={(bindKey) => {
          onForm({ ...form, bindKey });
        }}
        helper="32 characters, from a Xiaomi token extractor. It stays on your server."
      />
    </View>
  );
}

function FromXiaomi({ scale }: { readonly scale: Device }): ReactNode {
  return (
    <Card title={scale.display_name ?? scale.name} icon="scale">
      <Text variant="callout" tone="variant">
        Found in your Xiaomi account. Your server reads its Bluetooth key from there.
      </Text>
    </Card>
  );
}

function Added({ name }: { readonly name: string }): ReactNode {
  return (
    <EmptyState
      icon="scale"
      title={`${name} added`}
      body="Phones with SmartEverything hear each weigh-in in the background and save it to the right person."
    />
  );
}

function AddFooter({
  canSwitch,
  manual,
  busy,
  onSwitch,
  onAdd,
}: {
  readonly canSwitch: boolean;
  readonly manual: boolean;
  readonly busy: boolean;
  readonly onSwitch: () => void;
  readonly onAdd: () => void;
}): ReactNode {
  return (
    <>
      {canSwitch ? (
        <Button
          label={manual ? 'Use the Xiaomi account' : 'Enter the key by hand'}
          variant="text"
          onPress={onSwitch}
        />
      ) : null}
      <Button label="Add scale" loading={busy} onPress={onAdd} />
    </>
  );
}

function FinishButton({ onClose }: { readonly onClose: () => void }): ReactNode {
  const router = useRouter();
  const ready = useFitnessReady();
  return (
    <Button
      label={ready ? 'Done' : 'Next: your details'}
      onPress={() => {
        if (ready) {
          onClose();
        } else {
          router.replace(href.fitnessSetup());
        }
      }}
    />
  );
}

function AlreadyAdded({ scale }: { readonly scale: Device }): ReactNode {
  const router = useRouter();
  return (
    <FlowFrame
      title="Add a Bluetooth scale"
      onCancel={() => {
        router.back();
      }}
      footer={
        <Button
          label="Done"
          onPress={() => {
            router.back();
          }}
        />
      }
    >
      <EmptyState
        icon="scale"
        title={`${scale.display_name ?? scale.name} is already set up`}
        body="Its weigh-ins arrive on their own. Remove it in its settings on the Devices page to add it again."
      />
    </FlowFrame>
  );
}

export function ScaleSetupFlow(): ReactNode {
  const added = useAddedScale();
  return added === null ? <NewScaleFlow /> : <AlreadyAdded scale={added} />;
}

function NewScaleFlow(): ReactNode {
  const router = useRouter();
  const xiaomi = useXiaomiScale();
  const [manual, setManual] = useState(xiaomi === null);
  const [form, setForm] = useState<ManualForm>(EMPTY_FORM);
  const setup = useAddScale();
  const close = (): void => {
    router.back();
  };
  const add = (): void => {
    if (manual || xiaomi === null) {
      setup.manual(form);
    } else {
      setup.fromXiaomi(xiaomi.id);
    }
  };
  const footer =
    setup.added === null ? (
      <AddFooter
        canSwitch={xiaomi !== null}
        manual={manual}
        busy={setup.busy}
        onSwitch={() => {
          setManual(!manual);
        }}
        onAdd={add}
      />
    ) : (
      <FinishButton onClose={close} />
    );
  return (
    <FlowFrame title="Add a Bluetooth scale" onCancel={close} footer={footer}>
      {setup.added === null ? (
        <View className="gap-4">
          {manual || xiaomi === null ? (
            <ManualFields form={form} onForm={setForm} />
          ) : (
            <FromXiaomi scale={xiaomi} />
          )}
          {setup.problem === null ? null : <Banner tone="critical" title={setup.problem} />}
        </View>
      ) : (
        <Added name={setup.added} />
      )}
    </FlowFrame>
  );
}
