import { z } from 'zod';

export const MACHINE_MEMORY = z.strictObject({ state: z.string() });
export type MachineMemory = z.infer<typeof MACHINE_MEMORY>;

export const ANY_STATE = '*';

const TRANSITION = z.strictObject({
  from: z.string(),
  event: z.string(),
  to: z.string(),
  guard: z.boolean().optional(),
});

export const MACHINE_REQUEST = z
  .strictObject({
    event: z.string(),
    states: z.array(z.string().min(1)).min(1),
    initial: z.string(),
    transitions: z.array(TRANSITION),
  })
  .refine((request) => request.states.includes(request.initial), {
    message: 'the initial state is not one of the states',
  })
  .refine(
    (request) =>
      request.transitions.every(
        (transition) =>
          request.states.includes(transition.to) &&
          (transition.from === ANY_STATE || request.states.includes(transition.from)),
      ),
    { message: 'a transition names a state that does not exist' },
  );
export type MachineRequest = z.input<typeof MACHINE_REQUEST>;

export interface MachineOutcome {
  readonly state: string;
  readonly previous: string;
  readonly changed: boolean;
  readonly recovered: boolean;
  readonly memory: MachineMemory;
}

export function machine(memory: MachineMemory | undefined, input: MachineRequest): MachineOutcome {
  const request = MACHINE_REQUEST.parse(input);
  const kept = memory?.state;
  const recovered = kept !== undefined && !request.states.includes(kept);
  const previous = kept === undefined || recovered ? request.initial : kept;
  const taken = request.transitions.find(
    (transition) =>
      (transition.from === ANY_STATE || transition.from === previous) &&
      transition.event === request.event &&
      transition.guard !== false,
  );
  const state = taken?.to ?? previous;
  return { state, previous, changed: state !== previous, recovered, memory: { state } };
}
