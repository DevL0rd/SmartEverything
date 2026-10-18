import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Logger } from '@smarteverything/logging';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ClientRow, type Pairing, type Role } from '@smarteverything/domain';
import { startPairing } from '../../../api/settings';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { FlowFrame } from '../../../components/flow-frame';
import { errorText, type ErrorText } from '../../../format/errors';
import { useProfiles } from '../../../store/people';
import { useRows } from '../../../store/selectors';
import { href } from '../../../app-shell/hrefs';
import { PairingCodeView } from './pairing-code-view';
import { deviceRoleOf, usePeopleAccess } from '../../access';
import { ROLE_LABEL, newlyPaired } from './clients';
import { PersonChoice } from './person-choice';

const log = new Logger('app.pairing');

interface Shown extends Pairing {
  readonly known: ReadonlySet<string>;
}

type Step =
  | { readonly kind: 'choose' }
  | { readonly kind: 'showing'; readonly pairing: Shown }
  | { readonly kind: 'expired' };

function Paired({ client }: { readonly client: ClientRow }): ReactNode {
  const person = useProfiles().find((profile) => profile.id === client.profile_id);
  return (
    <EmptyState
      icon="circleCheck"
      title={`${client.name} is paired`}
      body={`It joined as ${ROLE_LABEL[client.role].toLowerCase()}${
        person === undefined ? '' : ` for ${person.name}`
      }.`}
    />
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
  readonly problem: ErrorText | null;
  readonly paired: ClientRow | null;
  readonly start: (role: Role, profileId: string) => void;
} {
  const clients = useRows('clients');
  const [step, setStep] = useState<Step>({ kind: 'choose' });
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [problem, setProblem] = useState<ErrorText | null>(null);
  useExpiry(step, () => {
    setStep({ kind: 'expired' });
  });
  const paired = step.kind === 'showing' ? newlyPaired(clients, step.pairing.known) : null;
  const start = (role: Role, profileId: string): void => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setProblem(null);
    const known = new Set(clients.map((client) => client.id));
    const startedAt = Date.now();
    log.info('pairing.invitation_requested', { role, profileId, knownClients: known.size });
    startPairing(role, profileId).then(
      (pairing) => {
        log.info('pairing.invitation_created', { role, durationMs: Date.now() - startedAt });
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
        setProblem(errorText(error));
      },
    );
  };
  return { step, busy, problem, paired, start };
}

function Body({
  flow,
  chosen,
  onChoose,
}: {
  readonly flow: ReturnType<typeof usePairPhone>;
  readonly chosen: string | null;
  readonly onChoose: (profileId: string) => void;
}): ReactNode {
  if (flow.paired !== null) {
    return <Paired client={flow.paired} />;
  }
  switch (flow.step.kind) {
    case 'choose':
      return <PersonChoice chosen={chosen} onChoose={onChoose} />;
    case 'showing':
      return <PairingCodeView pairing={flow.step.pairing} />;
    case 'expired':
      return <EmptyState icon="clock" title="The code expired" body="Show a new one to pair." />;
  }
}

function useChosenRole(chosen: string | null): Role | null {
  const people = usePeopleAccess();
  const person = people.data?.find((entry) => entry.profile_id === chosen);
  return person === undefined ? null : deviceRoleOf(person.role);
}

export function PairPhoneFlow(): ReactNode {
  const router = useRouter();
  const flow = usePairPhone();
  const preset = useLocalSearchParams<{ profileId?: string }>().profileId ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const chosen = picked ?? preset;
  const role = useChosenRole(chosen);
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
              disabled={role === null || chosen === null}
              onPress={() => {
                if (role !== null && chosen !== null) {
                  flow.start(role, chosen);
                }
              }}
            />
          ) : null}
        </>
      }
    >
      {flow.problem === null ? null : (
        <Banner
          tone="critical"
          title={flow.problem.title}
          body={flow.problem.detail}
          action={{ label: 'Connection setup', href: href.settings.page('server') }}
        />
      )}
      <Body flow={flow} chosen={chosen} onChoose={setPicked} />
    </FlowFrame>
  );
}
