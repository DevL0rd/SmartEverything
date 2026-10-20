import { background } from '@smarteverything/logging';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { FlowFrame } from '../../../components/flow-frame';
import { stepsAt } from '../../../components/progress-steps';
import { SelectRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useRooms } from '../../../store/selectors';
import { CredentialsForm } from '../components/credentials-form';
import { STEP_LABELS, nameFor, stepIndex } from '../model/add-model';
import { FindStep } from './find-step';
import { useAddFlow, type AddFlow } from './use-add';

function TrustStep({ flow }: { readonly flow: AddFlow }): ReactNode {
  const { certificate } = flow;
  return (
    <View className="gap-4">
      <Banner
        tone="warning"
        title="Trust this printer's certificate?"
        body="Printers sign their own certificates. Check that the fingerprint below matches the one on the printer's own page, then trust it so the hub can tell if it ever changes."
        wrapBody
      />
      <View className="gap-1 rounded-md bg-surface-2 p-4">
        <Text variant="caption" tone="variant">
          Fingerprint
        </Text>
        <Text variant="callout" className="tabular">
          {certificate?.fingerprint ?? ''}
        </Text>
        <Text variant="caption" tone="variant">
          {certificate?.subject ?? ''} · valid until {certificate?.validTo ?? ''}
        </Text>
      </View>
      {flow.problem === null ? null : (
        <Banner
          tone="critical"
          title="Could not add the printer"
          body={flow.problem}
          wrapBody
          action={{
            label: 'Sign in to the printer',
            onPress: (): void => {
              flow.goto('sign');
            },
          }}
        />
      )}
      <Button
        label="Trust and add"
        loading={flow.busy}
        onPress={() => {
          background(flow.submit(), 'printer.add_failed');
        }}
      />
    </View>
  );
}

function NameStep({ flow }: { readonly flow: AddFlow }): ReactNode {
  const rooms = useRooms();
  return (
    <View className="gap-4">
      <TextField
        label="Name"
        value={flow.name}
        onChange={flow.setName}
        placeholder={nameFor(null, null)}
      />
      <List inset>
        <SelectRow
          icon="door"
          title="Room"
          options={[
            { value: '', label: 'No room' },
            ...rooms.map((room) => ({ value: room.name, label: room.name })),
          ]}
          value={flow.room}
          onChange={flow.setRoom}
        />
      </List>
      {flow.problem === null ? null : (
        <Banner
          tone="critical"
          title="Could not add the printer"
          body={flow.problem}
          wrapBody
          action={{
            label: 'Sign in to the printer',
            onPress: (): void => {
              flow.goto('sign');
            },
          }}
        />
      )}
    </View>
  );
}

function Body({ flow }: { readonly flow: AddFlow }): ReactNode {
  switch (flow.step) {
    case 'find':
      return (
        <FindStep
          uri={flow.uri}
          onUri={flow.setUri}
          onPick={(candidate) => {
            flow.setUri(candidate.uri);
            if (flow.name === '') flow.setName(candidate.name);
          }}
        />
      );
    case 'name':
      return <NameStep flow={flow} />;
    case 'trust':
      return <TrustStep flow={flow} />;
    case 'sign':
      return (
        <View className="gap-4">
          <Banner
            tone="warning"
            title="This printer needs a sign-in"
            body={flow.problem ?? 'Enter the user name and password the printer asks for.'}
            wrapBody
          />
          <CredentialsForm onSubmit={(user, password) => flow.submit({ user, password })} />
        </View>
      );
  }
}

function Footer({ flow }: { readonly flow: AddFlow }): ReactNode {
  if (flow.step === 'find') {
    return (
      <Button
        label="Next"
        disabled={flow.uri.trim() === ''}
        onPress={() => {
          flow.goto('name');
        }}
      />
    );
  }
  if (flow.step === 'name') {
    return (
      <>
        <Button
          label="Back"
          variant="text"
          onPress={() => {
            flow.goto('find');
          }}
        />
        <Button
          label="Test and add"
          icon="check"
          loading={flow.busy}
          onPress={() => {
            background(flow.submit(), 'printer.add_failed');
          }}
        />
      </>
    );
  }
  return (
    <Button
      label="Back"
      variant="text"
      onPress={() => {
        flow.goto('find');
      }}
    />
  );
}

export function PrinterSetupFlow(): ReactNode {
  const router = useRouter();
  const flow = useAddFlow();
  return (
    <FlowFrame
      title="Add a printer"
      steps={stepsAt(STEP_LABELS, stepIndex(flow.step))}
      footer={<Footer flow={flow} />}
      onCancel={() => {
        router.back();
      }}
    >
      <Body flow={flow} />
    </FlowFrame>
  );
}
