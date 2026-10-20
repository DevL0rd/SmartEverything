import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useConnection } from '../../api/transport';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { useValue } from '../../design/external-store';
import { useLoaded, useSettings } from '../../store/selectors';
import { List } from '../../components/section';
import { ProfileSwitcher, useMayChoosePerson } from '../profiles';
import { PairingFrame as Frame } from './pairing-frame';
import { Unpaired } from './onboarding';
import { welcome, type Welcome } from './welcome';

function OpenHome({
  title,
  joined,
}: {
  readonly title: string;
  readonly joined: Welcome;
}): ReactNode {
  const router = useRouter();
  const mayChoose = useMayChoosePerson();
  return (
    <Frame
      title={title}
      body={joined.role === null ? 'Opening your home…' : `You joined as ${joined.role}.`}
    >
      <View className="gap-2">
        {mayChoose ? (
          <>
            <List inset>
              <ProfileSwitcher />
            </List>
            <Text variant="footnote" tone="variant">
              Add more people later in Settings › Profiles.
            </Text>
          </>
        ) : null}
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
