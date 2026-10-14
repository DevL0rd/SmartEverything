import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { EnrollmentState } from '../../api/connection/pairing-enrollment';
import { chooseThisComputer, type StoredKind } from '../../api/transport';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { Text } from '../../components/text';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { useValue } from '../../design/external-store';
import { appPlatform } from '../../design/platform';
import { CodeForm } from './code-form';
import { DiscoveryList } from './discovery-list';
import { IdentityCheck } from './identity-check';
import { InvitationForm } from './invitation-form';
import { PairingFrame } from './pairing-frame';
import type { PairingPresentation } from './pairing-actions';
import { usePairing } from './pairing';
import { QrScanner } from './qr-scanner';

function ThisComputerButton({ pairing }: { readonly pairing: PairingPresentation }): ReactNode {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label="Use this computer"
      icon="monitor"
      size="lg"
      loading={busy}
      onPress={() => {
        if (busy) return;
        setBusy(true);
        void pairing
          .stop()
          .then(chooseThisComputer)
          .then(
            () => {
              setBusy(false);
            },
            (error: unknown) => {
              setBusy(false);
              pairing.cleanupFailed(error);
            },
          );
      }}
    />
  );
}

function Choices({ pairing }: { readonly pairing: PairingPresentation }): ReactNode {
  return (
    <View className="gap-3">
      <DiscoveryList pairing={pairing} />
      <Button
        label="Scan pairing code"
        icon="qr"
        size="lg"
        onPress={() => {
          void pairing.change('scan');
        }}
      />
      <Button
        label="Use invitation"
        variant="text"
        onPress={() => {
          void pairing.change('invitation');
        }}
      />
      {pairing.fixedUrl === null ? null : (
        <Button
          label="Enter pairing code"
          variant="text"
          onPress={() => {
            void pairing.change('code');
          }}
        />
      )}
    </View>
  );
}

function Waiting({
  pairing,
  title,
  body,
}: {
  readonly pairing: PairingPresentation;
  readonly title: string;
  readonly body: string;
}): ReactNode {
  return (
    <PairingFrame title={title} body={body}>
      <Button
        label="Cancel"
        variant="text"
        onPress={() => {
          void pairing.change('welcome');
        }}
      />
    </PairingFrame>
  );
}

function Enrollment({
  pairing,
  state,
}: {
  readonly pairing: PairingPresentation;
  readonly state: EnrollmentState;
}): ReactNode {
  if (state.status === 'ready')
    return (
      <PairingFrame
        title="Enter pairing code"
        body="Find it on your desktop in Settings › Paired devices."
      >
        <CodeForm pairing={pairing} home={state.identity.name} checked />
      </PairingFrame>
    );
  if (state.status === 'verifying')
    return (
      <Waiting
        pairing={pairing}
        title="Checking your home…"
        body="Making sure this is the home you chose."
      />
    );
  if (state.status === 'claiming' || state.status === 'complete')
    return <Waiting pairing={pairing} title="Pairing…" body="Connecting to your home." />;
  return <EnrollmentProblem pairing={pairing} state={state} />;
}

function EnrollmentProblem({
  pairing,
  state,
}: {
  readonly pairing: PairingPresentation;
  readonly state: Exclude<
    EnrollmentState,
    { readonly status: 'ready' | 'verifying' | 'claiming' | 'complete' }
  >;
}): ReactNode {
  const home = useValue(pairing.home);
  return (
    <PairingFrame
      title={state.status === 'recoverable' ? 'Save your connection' : 'Check your pairing'}
      body="Your home stays selected until you choose again."
    >
      <View className="gap-4">
        {home === null ? null : (
          <List inset>
            <ListRow title={home} icon="home" subtitle="Identity checked" />
          </List>
        )}
        {state.status === 'cancelled' ? null : <Banner tone="critical" title={state.problem} />}
        {state.status === 'failed' ? (
          <Text variant="callout" tone="variant">
            Ask the owner to show a new code.
          </Text>
        ) : null}
        {state.status === 'recoverable' ? (
          <Button
            label="Save again"
            size="lg"
            onPress={() => {
              pairing.recover();
            }}
          />
        ) : null}
        <Button
          label={state.status === 'recoverable' ? 'Cancel' : 'Choose again'}
          variant="text"
          onPress={() => {
            void pairing.change('welcome');
          }}
        />
      </View>
    </PairingFrame>
  );
}

function Choosing({ pairing }: { readonly pairing: PairingPresentation }): ReactNode {
  const mode = useValue(pairing.mode);
  const problem = useValue(pairing.problem);
  const busy = useValue(pairing.busy);
  const state = useValue(pairing.controller.state);
  if (busy)
    return (
      <Waiting
        pairing={pairing}
        title="Checking your home…"
        body="Making sure this is the home you chose."
      />
    );
  if (mode === 'scan' && problem === null && state.status === 'choosing' && state.problem === null)
    return (
      <QrScanner
        onTarget={(target) => {
          void pairing.target(target, true);
        }}
        onClose={() => {
          void pairing.change('welcome');
        }}
      />
    );
  if (mode === 'invitation')
    return (
      <PairingFrame title="Use invitation" body="Connect to the home shared with you.">
        <InvitationForm pairing={pairing} />
      </PairingFrame>
    );
  if (mode === 'code' && pairing.fixedUrl !== null)
    return (
      <PairingFrame
        title="Enter pairing code"
        body="Find it on your desktop in Settings › Paired devices."
      >
        <CodeForm pairing={pairing} home={new URL(pairing.fixedUrl).host} checked={false} />
      </PairingFrame>
    );
  return <WelcomeChoices pairing={pairing} />;
}

function WelcomeChoices({ pairing }: { readonly pairing: PairingPresentation }): ReactNode {
  const mode = useValue(pairing.mode);
  return (
    <PairingFrame
      title="Welcome to SmartEverything"
      body={
        appPlatform() === 'desktop'
          ? 'Run your home from this computer, or join one that runs elsewhere.'
          : 'Find your home nearby, or scan the pairing code on your desktop.'
      }
    >
      {appPlatform() === 'desktop' && mode === 'welcome' ? (
        <View className="gap-3">
          <ThisComputerButton pairing={pairing} />
          <Button
            label="Connect to another home"
            variant="text"
            onPress={() => {
              void pairing.change('nearby');
            }}
          />
          <Button
            label="Use invitation"
            variant="text"
            onPress={() => {
              void pairing.change('invitation');
            }}
          />
        </View>
      ) : (
        <Choices pairing={pairing} />
      )}
    </PairingFrame>
  );
}

function OnboardingBody({ pairing }: { readonly pairing: PairingPresentation }): ReactNode {
  const state = useValue(pairing.controller.state);
  switch (state.status) {
    case 'choosing':
      return <Choosing pairing={pairing} />;
    case 'inspecting':
      return (
        <Waiting
          pairing={pairing}
          title="Checking your home…"
          body="Keep your desktop nearby so you can compare its identity."
        />
      );
    case 'observed':
      return (
        <PairingFrame
          title="Check your home"
          body="On your desktop, open Settings › Paired devices › Pair a phone. Check that this home identity matches."
        >
          <IdentityCheck pairing={pairing} observation={state.observation} />
        </PairingFrame>
      );
    case 'enrolling':
      return <Enrollment pairing={pairing} state={state.enrollment} />;
    case 'complete':
      return (
        <PairingFrame title="You are in" body="Opening your home…">
          {null}
        </PairingFrame>
      );
  }
}

export function Unpaired({
  kind,
  fixedUrl,
}: {
  readonly kind: StoredKind;
  readonly fixedUrl: string | null;
}): ReactNode {
  const pairing = usePairing(kind, fixedUrl);
  const state = useValue(pairing.controller.state);
  const problem = useValue(pairing.problem);
  const message = state.status === 'choosing' && state.problem !== null ? state.problem : problem;
  return (
    <View className="flex-1 bg-bg">
      {message === null ? null : (
        <View className="px-gutter pt-safe-offset-2">
          <Banner tone="critical" title={message} />
        </View>
      )}
      <OnboardingBody pairing={pairing} />
    </View>
  );
}
