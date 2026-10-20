import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { ProgressSteps } from '../../../components/progress-steps';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { useRow } from '../../../store/selectors';
import { directAddressOf, type LinkProgress } from './direct-link';
import { directLinkRows } from './direct-link-rows';
import { FoundScreens } from './found-screens';
import { useDirectLink, type DirectLinking } from './use-direct-link';

function Linked({ deviceId }: { readonly deviceId: string }): ReactNode {
  const address = directAddressOf(useRow('television_settings', deviceId));
  return <List>{directLinkRows(address)}</List>;
}

function Pick({
  deviceId,
  name,
  attempt,
  linking,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly attempt: number;
  readonly linking: DirectLinking;
}): ReactNode {
  return (
    <View className="gap-4">
      <Text variant="callout" tone="variant">
        {`Turn ${name} on and pick it below. A prompt then appears on the screen: choose Allow with the TV remote. That is the only step.`}
      </Text>
      <FoundScreens
        deviceId={deviceId}
        attempt={attempt}
        disabled={linking.busy}
        onPick={linking.link}
      />
      {linking.problem === null ? null : <Banner tone="critical" title={linking.problem} />}
    </View>
  );
}

function Body({
  progress,
  ...pick
}: {
  readonly progress: LinkProgress;
  readonly deviceId: string;
  readonly name: string;
  readonly attempt: number;
  readonly linking: DirectLinking;
}): ReactNode {
  switch (progress.kind) {
    case 'pick':
      return <Pick {...pick} />;
    case 'working':
      return <ProgressSteps steps={progress.steps} />;
    case 'linked':
      return <Linked deviceId={pick.deviceId} />;
    case 'failed':
      return (
        <Banner
          tone="critical"
          title={progress.title}
          {...(progress.detail === null ? {} : { body: progress.detail, wrapBody: true })}
        />
      );
  }
}

function Footer({
  linking,
  onAgain,
  onClose,
}: {
  readonly linking: DirectLinking;
  readonly onAgain: () => void;
  readonly onClose: () => void;
}): ReactNode {
  switch (linking.progress.kind) {
    case 'pick':
      return (
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button label="Look again" icon="refresh" variant="tonal" onPress={onAgain} />
        </>
      );
    case 'working':
      return (
        <Button label="Stop" variant="outlined" loading={linking.busy} onPress={linking.stop} />
      );
    case 'linked':
      return <Button label="Done" onPress={onClose} />;
    case 'failed':
      return (
        <>
          <Button label="Close" variant="text" onPress={onClose} />
          <Button label="Try again" onPress={linking.again} />
        </>
      );
  }
}

export function DirectLinkSheet({
  deviceId,
  name,
  onClose,
}: {
  readonly deviceId: string;
  readonly name: string;
  readonly onClose: () => void;
}): ReactNode {
  const linking = useDirectLink(deviceId);
  const [attempt, setAttempt] = useState(0);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Link directly"
      detents={['full']}
      footer={
        <Footer
          linking={linking}
          onAgain={() => {
            setAttempt(attempt + 1);
          }}
          onClose={onClose}
        />
      }
    >
      <Body
        progress={linking.progress}
        deviceId={deviceId}
        name={name}
        attempt={attempt}
        linking={linking}
      />
    </Sheet>
  );
}
