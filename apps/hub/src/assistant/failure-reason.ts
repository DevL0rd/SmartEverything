const ACTIONS_NAMED = 3;

export function reasonWithActions(reason: string, actions: readonly string[]): string {
  return actions.length === 0
    ? reason
    : `${reason} Already done before it stopped: ${actions.slice(-ACTIONS_NAMED).join('; ')}.`;
}
