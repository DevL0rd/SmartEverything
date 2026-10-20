import { href } from '../../../../app-shell/hrefs';
import type { SetupAction } from '../../../../components/setup/setup-flow';
import type { NetworkStepId, Reach } from './network-steps';

export interface Footer {
  readonly primary: SetupAction;
  readonly secondary?: SetupAction;
}

export interface FooterContext {
  readonly step: NetworkStepId;
  readonly reach: Reach | null;
  readonly fixable: boolean;
  readonly verified: boolean;
  readonly busy: boolean;
  readonly next: () => void;
  readonly previous: NetworkStepId | null;
  readonly go: (id: NetworkStepId) => void;
  readonly save: () => void;
  readonly check: () => void;
  readonly leave: () => void;
}

function withBack(context: FooterContext, primary: SetupAction): Footer {
  const { previous, go } = context;
  if (previous === null) return { primary };
  return {
    primary,
    secondary: {
      label: 'Back',
      onPress: (): void => {
        go(previous);
      },
    },
  };
}

const FOOTERS: Readonly<Record<NetworkStepId, (context: FooterContext) => Footer>> = {
  firewall: (context): Footer =>
    context.fixable
      ? {
          primary: { label: 'Fix the firewall', href: href.firewallFix() },
          secondary: { label: 'Skip for now', onPress: context.next },
        }
      : { primary: { label: 'Continue', onPress: context.next } },
  reach: (context): Footer =>
    withBack(context, {
      label: 'Continue',
      onPress: context.next,
      disabled: context.reach === null,
    }),
  address: (context): Footer =>
    withBack(context, { label: 'Save the address', onPress: context.save, loading: context.busy }),
  verify: (context): Footer =>
    context.verified
      ? withBack(context, { label: 'Continue', onPress: context.next })
      : {
          primary: { label: 'Check the address', onPress: context.check, loading: context.busy },
          secondary: {
            label: 'Change the address',
            onPress: (): void => {
              context.go('address');
            },
          },
        },
  done: (context): Footer =>
    context.reach === 'away'
      ? {
          primary: { label: 'Done', onPress: context.leave },
          secondary: { label: 'Pair a phone', href: href.pairPhone() },
        }
      : withBack(context, { label: 'Done', onPress: context.leave }),
};

export function footerOf(context: FooterContext): Footer {
  return FOOTERS[context.step](context);
}
