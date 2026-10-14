import { useEffect, useId, useRef } from 'react';
import { isNative } from '../design/platform';
import type { DecisionOption } from './decision-options';
const DIRECTIONS: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};
function moveChoice(
  event: KeyboardEvent,
  group: HTMLElement,
  options: readonly DecisionOption[],
  choose: (id: string) => void,
): void {
  const direction = DIRECTIONS[event.key];
  if (direction === undefined) return;
  const target = event.target;
  if (!(target instanceof Node)) return;
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
  const index = radios.findIndex((radio) => radio.contains(target));
  if (index < 0) return;
  const next = (index + direction + options.length) % options.length;
  const option = options[next];
  if (option === undefined || option.disabled === true) return;
  event.preventDefault();
  choose(option.id);
  radios[next]?.focus();
}
export function useDecisionKeys(
  id: string,
  options: readonly DecisionOption[],
  disabled: boolean,
  choose: (id: string) => void,
): void {
  useEffect(() => {
    if (isNative() || disabled) return undefined;
    const listen = (event: KeyboardEvent): void => {
      const group = document.getElementById(id);
      if (event.target instanceof Node && group?.contains(event.target) === true)
        moveChoice(event, group, options, choose);
    };
    document.addEventListener('keydown', listen);
    return (): void => {
      document.removeEventListener('keydown', listen);
    };
  }, [id, options, disabled, choose]);
}

export function focusDecisionHeading(id: string): void {
  if (isNative()) return;
  const container = document.getElementById(id);
  const heading = container?.querySelector<HTMLElement>('[role="heading"]');
  if (heading === null || heading === undefined) return;
  heading.tabIndex = -1;
  heading.focus();
}
export function useDecisionStepFocus(step: number): string {
  const id = useId();
  const previous = useRef(step);
  useEffect(() => {
    if (previous.current !== step) focusDecisionHeading(id);
    previous.current = step;
  }, [step, id]);
  return id;
}
