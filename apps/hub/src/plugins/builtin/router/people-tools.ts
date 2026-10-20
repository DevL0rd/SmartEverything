import { MAC_ADDRESS, PERSON_NAME, type PresencePerson } from '@smarteverything/domain';
import { z } from 'zod';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import { attemptTool, NO_INPUT, ownerOnly, READ_HINTS, toolResult, WRITE_HINTS } from '../tool-kit';
import type { PeopleControls } from './people-controls';

const OWNER_ONLY = 'Only the home owner can change who the home tracks';

const PERSON_ID = z.uuid();

const PERSON_CHANGE = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('add'), name: PERSON_NAME }),
  z.strictObject({ action: z.literal('rename'), person: PERSON_ID, name: PERSON_NAME }),
  z.strictObject({ action: z.literal('remove'), person: PERSON_ID }),
  z.strictObject({ action: z.literal('track'), person: PERSON_ID, tracked: z.boolean() }),
]);

const DEVICE_LINK = z
  .strictObject({
    mac: MAC_ADDRESS,
    person: PERSON_ID.nullable().default(null),
    newPerson: PERSON_NAME.nullable().default(null),
  })
  .refine(
    (link) => link.person === null || link.newPerson === null,
    'Give person or newPerson, not both',
  );

function latest(
  people: readonly PresencePerson[],
  home: boolean,
): { readonly name: string; readonly at: string } | null {
  const moved = people
    .filter((person) => person.tracked && person.home === home && person.since !== null)
    .sort((left, right) => Date.parse(right.since ?? '') - Date.parse(left.since ?? ''))[0];
  return moved?.since === undefined || moved.since === null
    ? null
    : { name: moved.name, at: moved.since };
}

export function peopleTools(controls: PeopleControls): PluginTool[] {
  return [
    definePluginTool({
      name: 'who_is_home',
      title: 'Who is home',
      description:
        'Every known person with whether they are home now and since when (a person is home when any of their devices is on the network or their phone says Home), who arrived last and who left last. Tracking is for automations and display only.',
      input: NO_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: () => {
        const people = controls.list();
        return Promise.resolve(
          toolResult({
            home: people.filter((person) => person.home).map((person) => person.name),
            lastArrived: latest(people, true),
            lastLeft: latest(people, false),
            people,
          }),
        );
      },
    }),
    definePluginTool({
      name: 'manage_person',
      title: 'Add, rename, remove or stop tracking a person',
      description:
        'Owner only. add creates a known person that is just a name (no account); rename and remove change one; track switches presence tracking on or off for a person, including home people with an account. Ids come from who_is_home.',
      input: z.strictObject({ change: PERSON_CHANGE }),
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: ({ change }, caller) =>
        ownerOnly(caller, OWNER_ONLY, () =>
          attemptTool(() => Promise.resolve({ person: controls.manage(change) })),
        ),
    }),
    definePluginTool({
      name: 'link_device',
      title: 'Say whose device this is',
      description:
        'Owner only. Links a network device (by MAC from list_clients) to a person: person is an id from who_is_home, newPerson names a new or existing known person without an account, both empty clears the link. Several devices can belong to one person.',
      input: DEVICE_LINK,
      annotations: WRITE_HINTS,
      humanOnly: false,
      run: (link, caller) =>
        ownerOnly(caller, OWNER_ONLY, () =>
          attemptTool(() => Promise.resolve({ client: controls.link(link) })),
        ),
    }),
  ];
}
