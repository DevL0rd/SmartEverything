import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Logger } from '@smarteverything/logging';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { type ClientRow, type Pairing, type Role } from '@smarteverything/domain';
import { startPairing } from '../../../api/settings';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { useRows } from '../../../store/selectors';
import { href } from '../../../app-shell/hrefs';
import { PairingCodeView } from './pairing-code-view';
import { ClientProfile } from './client-profile';
import { ROLE_HELP, ROLE_LABEL, newlyPaired } from './clients';

const log = new Logger('app.pairing');

const CHOICE_ORDER: readonly Role[] = ['member', 'owner'];

interface Shown extends Pairing {
  readonly known: ReadonlySet<string>;
}

type Step =
  | { readonly kind: 'choose' }
  | { readonly kind: 'showing'; readonly pairing: Shown }
  | { readonly kind: 'expired' };

function RoleChoice({
  role,
  onRole,
}: {
  readonly role: Role;
  readonly onRole: (role: Role) => void;
}): ReactNode {
  return (
    <List title="What can this phone do?" inset>
      {CHOICE_ORDER.map((option) => (
        <ListRow
          key={option}
          title={ROLE_LABEL[option]}
          subtitle={ROLE_HELP[option]}
          icon={option === 'owner' ? 'key' : 'users'}
          selected={option === role}
          trailing={option === role ? <Icon name="check" tone="primary" /> : null}
          onPress={() => {
            onRole(option);
          }}
        />
      ))}
    </List>
  );
}

function Paired({ client }: { readonly client: ClientRow }): ReactNode {
  return (
    <View className="gap-6">
      <EmptyState
        icon="circleCheck"
        title={`${client.name} is paired`}
        body={`It joined as ${ROLE_LABEL[client.role].toLowerCase()}.`}
      />
      <ClientProfile client={client} label="Whose phone is this?" />
    </View>
  );
}

function useExpiry(step: Step, onExpire: () => void): void {
  const expiresAt = step.kind === 'showing' ? step.pairing.expiresAt : null;
  useEffect(() => {
    if (expiresAt === null) {
      return undefined;
    }
    const timer = setTimeout(onExpire, Math.max(0, Date.parse(expiresAt) - Date.now()));
    return (): void => {
      clearTimeout(timer);
    };
  }, [expiresAt, onExpire]);
}

function usePairPhone(): {
  readonly step: Step;
  readonly busy: boolean;
  readonly problem: string | null;
  readonly paired: ClientRow | null;
  readonly start: (role: Role) => void;
} {
  const clients = useRows('clients');
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);
  useExpiry(step, () => {
    setStep({ kind: 'expired' });
  });
  const paired = step.kind === 'showing' ? newlyPaired(clients, step.pairing.known) : null;
  const start = (role: Role): void => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setProblem(null);
    const known = new Set(clients.map((client) => client.id));
    startPairing(role).then(
      (pairing) => {
        pending.current = false;
        setBusy(false);
        setStep({ kind: 'showing', pairing: { ...pairing, known } });
      },
      (error: unknown) => {
        pending.current = false;
        log.warn('pairing.invitation_creation_failed', {
          failure: error instanceof Error ? error.name : 'ServerFailure',
        });
        setBusy(false);
        setProblem(
          'A pairing code could not be created. Check your home connection or set up Remote access.',
        );
      },
    );
  };
  return { step, busy, problem, paired, start };
}

function Body({
  flow,
  role,
  onRole,
}: {
  readonly flow: ReturnType<typeof usePairPhone>;
  readonly role: Role;
  readonly onRole: (role: Role) => void;
}): ReactNode {
  if (flow.paired !== null) {
    return <Paired client={flow.paired} />;
  }
  switch (flow.step.kind) {
    case 'choose':
      return <RoleChoice role={role} onRole={onRole} />;
    case 'showing':
      return <PairingCodeView pairing={flow.step.pairing} />;
    case 'expired':
      return <EmptyState icon="clock" title="The code expired" body="Show a new one to pair." />;
  }
}

export function PairPhoneFlow(): ReactNode {
  const router = useRouter();
  const flow = usePairPhone();
  const [role, setRole] = useState<Role>('member');
  const close = (): void => {
    router.back();
  };
  const done = flow.paired !== null;
  const showButton = !done && flow.step.kind !== 'showing';
  return (
    <FlowFrame
      title="Pair a phone"
      onCancel={close}
      footer={
        <>
          <Button
            label={done ? 'Done' : 'Cancel'}
            variant={done ? 'filled' : 'text'}
            onPress={close}
          />
          {showButton ? (
            <Button
              label={flow.step.kind === 'expired' ? 'Show a new code' : 'Show code'}
              loading={flow.busy}
              onPress={() => {
                flow.start(role);
              }}
            />
          ) : null}
        </>
      }
    >
      {flow.problem === null ? null : (
        <Banner
          tone="critical"
          title={flow.problem}
          action={{ label: 'Connection setup', href: href.settings.page('server') }}
        />
      )}
      <Body flow={flow} role={role} onRole={setRole} />
    </FlowFrame>
  );
}
