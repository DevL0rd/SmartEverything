import {
  InputPointError,
  keysymsOfText,
  mapPicturePoint,
  modifierKeysym,
  parseKeyCombo,
  type ComputerFeature,
  type ComputerInput,
  type ScreenPicture,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { NodeFailureError } from '../../node-failure';
import type { InputControl } from '../session-controls';
import { KEYBOARD_AND_POINTER } from './portal-devices';
import type { PortalSession } from './portal-session';

const log = new Logger('hub.node-input');

const BUTTON_LEFT = 0x110;
const BUTTON_RIGHT = 0x111;
const AXIS_VERTICAL = 0;
const AXIS_HORIZONTAL = 1;

const NOT_UNLOCKED =
  'The screen is locked or its lock state is not known yet. Remote control only acts when the screen is known to be unlocked; the person unlocks it.';
const NO_PICTURE =
  'Take a picture of the screen with see first: coordinates are pixels of the screen picture you last saw.';

export interface LinuxInputOptions {
  readonly grant: { readonly obtain: () => Promise<PortalSession> };
  readonly deviceTypes: () => Promise<number>;
  readonly picture: () => ScreenPicture | null;
  readonly locked: () => boolean | null;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

export class LinuxInput implements InputControl {
  constructor(private readonly options: LinuxInputOptions) {}

  async features(): Promise<readonly ComputerFeature[]> {
    try {
      const types = await this.options.deviceTypes();
      return (types & KEYBOARD_AND_POINTER) === KEYBOARD_AND_POINTER ? ['input'] : [];
    } catch (cause) {
      log.debug('input.unavailable', () => ({ reason: messageOf(cause) }));
      return [];
    }
  }

  async send(input: ComputerInput): Promise<void> {
    if (this.options.locked() !== false) throw new NodeFailureError('no_session', NOT_UNLOCKED);
    const session = await this.options.grant.obtain();
    await this.perform(session, input);
  }

  private async perform(session: PortalSession, input: ComputerInput): Promise<void> {
    switch (input.action) {
      case 'click':
        return this.click(session, input, BUTTON_LEFT, 1);
      case 'double_click':
        return this.click(session, input, BUTTON_LEFT, 2);
      case 'right_click':
        return this.click(session, input, BUTTON_RIGHT, 1);
      case 'move':
        return this.move(session, input);
      case 'drag':
        return this.drag(session, input, { x: input.toX, y: input.toY });
      case 'scroll':
        return this.scroll(session, input, input.dx, input.dy);
      case 'type':
        return this.type(session, input.text);
      case 'keys':
        return this.keys(session, input.keys);
    }
  }

  private async move(session: PortalSession, point: Point): Promise<void> {
    const picture = this.options.picture();
    if (picture === null) throw new NodeFailureError('failed', NO_PICTURE);
    try {
      const mapped = mapPicturePoint(picture, session.streams, point);
      await session.pointerMotion(mapped.region.id, mapped.x, mapped.y);
    } catch (cause) {
      if (cause instanceof InputPointError) throw new NodeFailureError('failed', cause.message);
      throw cause;
    }
  }

  private async press(session: PortalSession, button: number): Promise<void> {
    await session.button(button, true);
    await session.button(button, false);
  }

  private async click(
    session: PortalSession,
    point: Point,
    button: number,
    times: number,
  ): Promise<void> {
    await this.move(session, point);
    for (let count = 0; count < times; count += 1) await this.press(session, button);
  }

  private async drag(session: PortalSession, from: Point, to: Point): Promise<void> {
    await this.move(session, from);
    await session.button(BUTTON_LEFT, true);
    await this.move(session, to);
    await session.button(BUTTON_LEFT, false);
  }

  private async scroll(
    session: PortalSession,
    point: Point,
    horizontal: number,
    vertical: number,
  ): Promise<void> {
    await this.move(session, point);
    if (vertical !== 0) await session.axisDiscrete(AXIS_VERTICAL, vertical);
    if (horizontal !== 0) await session.axisDiscrete(AXIS_HORIZONTAL, horizontal);
  }

  private async type(session: PortalSession, text: string): Promise<void> {
    for (const keysym of keysymsOfText(text)) {
      await session.keysym(keysym, true);
      await session.keysym(keysym, false);
    }
  }

  private async keys(session: PortalSession, combo: string): Promise<void> {
    const parsed = parseKeyCombo(combo);
    const held = parsed.modifiers.map(modifierKeysym);
    for (const keysym of held) await session.keysym(keysym, true);
    await session.keysym(parsed.keysym, true);
    await session.keysym(parsed.keysym, false);
    for (const keysym of [...held].reverse()) await session.keysym(keysym, false);
  }
}
