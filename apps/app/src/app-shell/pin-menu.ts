import { usePathname } from 'expo-router';
import type { NavPinTarget } from '@smarteverything/domain';
import type { HeaderAction } from '../components/page-header';
import type { MenuItem } from '../components/menu';
import { useNavPins, usePinned, type NavPins } from './nav-layout';
import { pinTargetOfPath } from './nav-targets';

export type PinSubject = 'page' | 'navigation';

const LABELS: Readonly<Record<PinSubject, { readonly pin: string; readonly unpin: string }>> = {
  page: { pin: 'Pin this page', unpin: 'Unpin this page' },
  navigation: { pin: 'Pin to navigation', unpin: 'Unpin from navigation' },
};

export function pinMenuItem(
  target: NavPinTarget,
  subject: PinSubject,
  pinned: boolean,
  pins: Pick<NavPins, 'pin' | 'unpin'>,
): MenuItem {
  return {
    label: pinned ? LABELS[subject].unpin : LABELS[subject].pin,
    icon: pinned ? 'pinOff' : 'pin',
    onPress: (): void => {
      if (pinned) pins.unpin(target);
      else pins.pin(target);
    },
  };
}

export function usePinMenuItems(
  target: NavPinTarget | null,
  subject: PinSubject = 'navigation',
): readonly MenuItem[] {
  const pinned = usePinned(target);
  const pins = useNavPins();
  return target === null ? [] : [pinMenuItem(target, subject, pinned, pins)];
}

export function pinAction(
  target: NavPinTarget,
  pinned: boolean,
  pins: Pick<NavPins, 'pin' | 'unpin'>,
): HeaderAction {
  const { label, onPress } = pinMenuItem(target, 'page', pinned, pins);
  return { icon: pinned ? 'pinOff' : 'pin', label, onPress, selected: pinned, iconOnly: true };
}

export function usePinAction(target: NavPinTarget): HeaderAction {
  return pinAction(target, usePinned(target), useNavPins());
}

export function usePagePinTarget(): NavPinTarget | null {
  return pinTargetOfPath(usePathname());
}
