import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Head from 'expo-router/head';
import { Redirect, useRouter } from 'expo-router';
import { useConnection } from '../../api/transport';
import { chooseThisComputer } from '../../api/transport';
import type { StoredKind } from '../../api/transport';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { Icon } from '../../components/icon';
import { Text } from '../../components/text';
import { appPlatform } from '../../design/platform';
import { useValue } from '../../design/external-store';
import { useLoaded, useSettings } from '../../store/selectors';
import { List } from '../../components/section';
import { ProfileSwitcher } from '../profiles';
import { CodeForm } from './code-form';
import { usePairing } from './pairing';
import { QrScanner } from './qr-scanner';
import { welcome, type Welcome } from './welcome';
import { rawErrorText } from '../../format/errors';

type Mode = 'welcome' | 'code' | 'scan';

function Frame({
  title,
  body,
  children,
}: {
  readonly title: string;
  readonly body: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="grow items-center justify-center px-gutter pt-safe-offset-8 pb-safe-offset-8"
      keyboardShouldPersistTaps="handled"
    >
      <Head>
        <title>Connect · SmartEverything</title>
      </Head>
      <View className="w-full max-w-dialog gap-8">
        <View className="items-center gap-3">
          <View className="size-16 items-center justify-center rounded-full bg-primary-container">
            <Icon name="home" size={32} tone="primary" />
          </View>
          <Text variant="title-1" align="center" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="body" tone="variant" align="center">
            {body}
          </Text>
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

function ThisComputerButton(): ReactNode {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <View className="gap-3">
      <Button
        label="Use this computer"
        icon="monitor"
        size="lg"
        loading={busy}
        onPress={() => {
          setBusy(true);
          setProblem(null);
          chooseThisComputer().then(
            () => {
              setBusy(false);
            },
            (error: unknown) => {
              setBusy(false);
              setProblem(rawErrorText(error));
            },
          );
        }}
      />
      {problem === null ? null : <Banner tone="critical" title={problem} />}
    </View>
  );
}

function PhoneWelcome({ onMode }: { readonly onMode: (mode: Mode) => void }): ReactNode {
  return (
    <View className="gap-3">
      <Button
        label="Scan pairing code"
        icon="qr"
        size="lg"
        onPress={() => {
          onMode('scan');
        }}
      />
      <Button
        label="Enter code instead"
        variant="text"
        onPress={() => {
          onMode('code');
        }}
      />
    </View>
  );
}

function DesktopWelcome({ onMode }: { readonly onMode: (mode: Mode) => void }): ReactNode {
  return (
    <View className="gap-3">
      <ThisComputerButton />
      <Button
        label="Connect to another server"
        variant="text"
        onPress={() => {
          onMode('code');
        }}
      />
    </View>
  );
}

function Scanning({
  kind,
  onMode,
}: {
  readonly kind: StoredKind;
  readonly onMode: (mode: Mode) => void;
}): ReactNode {
  const pairing = usePairing(kind);
  if (pairing.problem !== null || pairing.busy) {
    return (
      <Frame title="Pairing…" body="Connecting to your server">
        {pairing.problem === null ? null : <Banner tone="critical" title={pairing.problem} />}
        <Button
          label="Try again"
          variant="tonal"
          disabled={pairing.busy}
          onPress={() => {
            onMode('welcome');
          }}
        />
      </Frame>
    );
  }
  return (
    <QrScanner
      onTarget={(target) => {
        pairing.pair(target, '');
      }}
      onClose={() => {
        onMode('welcome');
      }}
    />
  );
}

function Unpaired({
  kind,
  fixedUrl,
}: {
  readonly kind: StoredKind;
  readonly fixedUrl: string | null;
}): ReactNode {
  const platform = appPlatform();
  const [mode, setMode] = useState<Mode>(platform === 'web' ? 'code' : 'welcome');
  if (mode === 'scan') {
    return <Scanning kind={kind} onMode={setMode} />;
  }
  if (mode === 'code') {
    return (
      <Frame title="Enter pairing code" body="Find it on your desktop in Settings › Paired devices">
        <CodeForm
          kind={kind}
          fixedUrl={fixedUrl}
          onBack={
            platform === 'web'
              ? null
              : (): void => {
                  setMode('welcome');
                }
          }
        />
      </Frame>
    );
  }
  return (
    <Frame
      title="Welcome to SmartEverything"
      body={
        platform === 'desktop'
          ? 'Run your home from this computer, or join one that runs elsewhere'
          : 'On your desktop, open Settings › Paired devices › Pair a phone'
      }
    >
      {platform === 'desktop' ? (
        <DesktopWelcome onMode={setMode} />
      ) : (
        <PhoneWelcome onMode={setMode} />
      )}
    </Frame>
  );
}

function OpenHome({
  title,
  joined,
}: {
  readonly title: string;
  readonly joined: Welcome;
}): ReactNode {
  const router = useRouter();
  return (
    <Frame
      title={title}
      body={joined.role === null ? 'Opening your home…' : `You joined as ${joined.role}.`}
    >
      <View className="gap-2">
        <List inset>
          <ProfileSwitcher />
        </List>
        <Text variant="footnote" tone="variant">
          Add more people later in Settings › Profiles.
        </Text>
      </View>
      <Button
        label="Open your home"
        size="lg"
        onPress={() => {
          welcome.set(null);
          router.replace('/');
        }}
      />
    </Frame>
  );
}

function LoadedWelcome({ joined }: { readonly joined: Welcome }): ReactNode {
  return <OpenHome title={`Welcome to ${useSettings().home_name}`} joined={joined} />;
}

function Welcomed({ joined }: { readonly joined: Welcome }): ReactNode {
  if (!useLoaded()) {
    return (
      <Frame title="You are in" body="Opening your home…">
        {null}
      </Frame>
    );
  }
  return <LoadedWelcome joined={joined} />;
}

export function PairScreen(): ReactNode {
  const state = useConnection();
  const joined = useValue(welcome);
  if (state.status === 'loading') {
    return null;
  }
  if (state.status === 'paired' && joined !== null) {
    return <Welcomed joined={joined} />;
  }
  if (state.status === 'unpaired') {
    return <Unpaired kind={state.kind} fixedUrl={state.fixedUrl} />;
  }
  return <Redirect href="/" />;
}
