import type { ReactNode } from 'react';
import { useState } from 'react';
import { HTTPS_URL, type SettingsRow } from '@smarteverything/domain';
import { setPublicUrl, verifyPublicUrl } from '../../../../api/access';
import { closeFlow } from '../../../../app-shell/close-flow';
import { href } from '../../../../app-shell/hrefs';
import { SetupFlow } from '../../../../components/setup/setup-flow';
import type { StepBarStep } from '../../../../components/setup/step-bar';
import { setLocalPref, useLocalPref } from '../../../../store/local-prefs';
import { useMutationState } from '../../../../store/mutation';
import { useIsOwner, useSettings } from '../../../../store/selectors';
import { useEntityStore } from '../../../../store/store-context';
import { useSetupFacts, type SetupFacts } from '../../../setup';
import { normalised } from '../public-url';
import { AddressBody, DoneBody, FirewallBody, ReachBody, VerifyBody } from './network-step-bodies';
import { footerOf } from './network-footer';
import {
  networkSteps,
  openStep,
  stepAfter,
  stepBefore,
  type NetworkStep,
  type NetworkStepId,
  type Reach,
} from './network-steps';

const HEADINGS: Readonly<Record<NetworkStepId, string>> = {
  firewall: 'Let phones and cameras in',
  reach: 'Do you want to reach your home when you are away?',
  address: 'Your public address',
  verify: 'Check the address',
  done: 'All set',
};

function barOf(steps: readonly NetworkStep[], current: NetworkStepId): readonly StepBarStep[] {
  return steps.map((step) => ({
    label: step.title,
    state: step.id === current ? 'active' : step.done ? 'done' : 'waiting',
  }));
}

function leave(): void {
  closeFlow(href.settings.page('setup'));
}

function addressProblem(draft: string): string | null {
  return HTTPS_URL.safeParse(normalised(draft)).success ? null : 'Use an https:// address';
}

interface Wizard {
  readonly facts: SetupFacts;
  readonly steps: readonly NetworkStep[];
  readonly current: NetworkStepId;
  readonly reach: Reach | null;
  readonly go: (id: NetworkStepId) => void;
  readonly choose: (reach: Reach) => void;
}

function useWizard(): Wizard {
  const facts = useSetupFacts();
  const chosen = useLocalPref('setupReach');
  const reach = chosen ?? (facts.address === 'none' ? null : 'away');
  const [at, setAt] = useState<NetworkStepId | null>(null);
  const steps = networkSteps(facts, reach);
  const current = steps.find((step) => step.id === at)?.id ?? openStep(steps);
  return {
    facts,
    steps,
    current,
    reach,
    go: setAt,
    choose: (next): void => {
      setAt('reach');
      setLocalPref('setupReach', next);
    },
  };
}

function useAddress(
  settings: SettingsRow,
  go: (id: NetworkStepId) => void,
): {
  readonly draft: string;
  readonly problem: string | null;
  readonly busy: boolean;
  readonly setDraft: (value: string) => void;
  readonly save: () => void;
  readonly check: () => void;
} {
  const store = useEntityStore();
  const mutation = useMutationState();
  const [draft, setDraft] = useState(settings.public_url ?? '');
  const [shown, setShown] = useState(false);
  const check = (): void => {
    mutation.run(() => verifyPublicUrl(store), { failure: 'The address wasn’t checked' });
  };
  const save = (): void => {
    setShown(true);
    if (addressProblem(draft) !== null) return;
    mutation.run(() => setPublicUrl(store, normalised(draft)), {
      failure: 'The address wasn’t saved',
      onDone: () => {
        go('verify');
      },
    });
  };
  return {
    draft,
    problem: shown ? addressProblem(draft) : null,
    busy: mutation.busy,
    setDraft,
    save,
    check,
  };
}

function Body({
  wizard,
  settings,
  address,
}: {
  readonly wizard: Wizard;
  readonly settings: SettingsRow;
  readonly address: ReturnType<typeof useAddress>;
}): ReactNode {
  switch (wizard.current) {
    case 'firewall':
      return <FirewallBody />;
    case 'reach':
      return <ReachBody reach={wizard.reach} onChoose={wizard.choose} />;
    case 'address':
      return (
        <AddressBody
          draft={address.draft}
          problem={address.problem}
          onChange={address.setDraft}
          onSubmit={address.save}
        />
      );
    case 'verify':
      return <VerifyBody settings={settings} busy={address.busy} />;
    case 'done':
      return <DoneBody reach={wizard.reach} />;
  }
}

export function NetworkWizard(): ReactNode {
  const wizard = useWizard();
  const settings = useSettings();
  const owner = useIsOwner();
  const address = useAddress(settings, wizard.go);
  const fixable = wizard.facts.firewall === 'missing' && owner;
  const footer = footerOf({
    step: wizard.current,
    reach: wizard.reach,
    fixable,
    verified: settings.public_url_verified_at !== null && settings.public_url_error === null,
    busy: address.busy,
    next: () => {
      wizard.go(stepAfter(wizard.steps, wizard.current));
    },
    previous: stepBefore(wizard.steps, wizard.current),
    go: wizard.go,
    save: address.save,
    check: address.check,
    leave,
  });
  return (
    <SetupFlow
      title="Reach your home"
      steps={barOf(wizard.steps, wizard.current)}
      heading={HEADINGS[wizard.current]}
      {...(wizard.current === 'reach' && wizard.reach === null
        ? { reason: 'Choose one to continue.' }
        : {})}
      primary={footer.primary}
      {...(footer.secondary === undefined ? {} : { secondary: footer.secondary })}
      onCancel={leave}
    >
      <Body wizard={wizard} settings={settings} address={address} />
    </SetupFlow>
  );
}
