export interface Relay {
  readonly eventId: string;
  readonly from: string;
  readonly text: string;
  readonly answersBack: boolean;
}

export function askText(relay: Relay): string {
  const back = relay.answersBack
    ? 'Your final reply goes back to that chat by itself.'
    : 'Nobody waits for a reply in another chat; answer here.';
  return [
    `SmartEverything · message from the chat "${relay.from}" (another AI, not the person)`,
    relay.text,
    `-> Answer with assistant_reply with eventId "${relay.eventId}". ${back}`,
  ].join('\n');
}

export function reportText(relay: Relay): string {
  return [
    `SmartEverything · report from the chat "${relay.from}" (another AI, not the person)`,
    relay.text,
    `-> Carry on with the work this was for, and tell the person what they need to know with assistant_reply with eventId "${relay.eventId}": the result, a real blocker or a question for them.`,
  ].join('\n');
}
