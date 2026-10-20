import { describe, expect, it, vi, type Mock } from 'vitest';
import type { NavPinTarget } from '@smarteverything/domain';

vi.mock('expo-router', () => ({ usePathname: vi.fn() }));
vi.mock('./nav-layout', () => ({ useNavPins: vi.fn(), usePinned: vi.fn() }));
vi.mock('./nav-targets', () => ({ pinTargetOfPath: vi.fn() }));

const { pinMenuItem, pinAction } = await import('./pin-menu');

const TARGET: NavPinTarget = {
  kind: 'room',
  roomId: '11111111-1111-4111-8111-111111111111',
};

function pins(): {
  readonly pin: Mock<(target: NavPinTarget) => void>;
  readonly unpin: Mock<(target: NavPinTarget) => void>;
} {
  return {
    pin: vi.fn<(target: NavPinTarget) => void>(),
    unpin: vi.fn<(target: NavPinTarget) => void>(),
  };
}

describe('the pin item of a menu', () => {
  it('offers to pin something that is not pinned and pins it when chosen', () => {
    const actions = pins();
    const item = pinMenuItem(TARGET, 'navigation', false, actions);
    expect(item).toMatchObject({ label: 'Pin to navigation', icon: 'pin' });
    item.onPress();
    expect(actions.pin).toHaveBeenCalledWith(TARGET);
    expect(actions.unpin).not.toHaveBeenCalled();
  });

  it('offers to unpin something that is pinned and unpins it when chosen', () => {
    const actions = pins();
    const item = pinMenuItem(TARGET, 'navigation', true, actions);
    expect(item).toMatchObject({ label: 'Unpin from navigation', icon: 'pinOff' });
    item.onPress();
    expect(actions.unpin).toHaveBeenCalledWith(TARGET);
    expect(actions.pin).not.toHaveBeenCalled();
  });

  it('words the item for the page when it sits in a page header', () => {
    expect(pinMenuItem(TARGET, 'page', false, pins()).label).toBe('Pin this page');
    expect(pinMenuItem(TARGET, 'page', true, pins()).label).toBe('Unpin this page');
  });
});

describe('the pin button of a page header', () => {
  it('pins a page that is not pinned and shows it unselected', () => {
    const actions = pins();
    const action = pinAction(TARGET, false, actions);
    expect(action).toMatchObject({ icon: 'pin', label: 'Pin this page', selected: false });
    expect(action.iconOnly).toBe(true);
    action.onPress?.();
    expect(actions.pin).toHaveBeenCalledWith(TARGET);
    expect(actions.unpin).not.toHaveBeenCalled();
  });

  it('unpins a pinned page and shows it selected', () => {
    const actions = pins();
    const action = pinAction(TARGET, true, actions);
    expect(action).toMatchObject({ icon: 'pinOff', label: 'Unpin this page', selected: true });
    action.onPress?.();
    expect(actions.unpin).toHaveBeenCalledWith(TARGET);
    expect(actions.pin).not.toHaveBeenCalled();
  });
});
