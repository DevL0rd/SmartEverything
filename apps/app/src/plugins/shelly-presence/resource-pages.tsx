import type { ReactNode } from 'react';
import type {
  ShellyAction,
  ShellyDevice,
  ShellyPage,
  ShellyResources,
} from '@smarteverything/shelly';
import { Select } from '../../components/select';
import { valueSummary } from '../../components/schema-values';
import { Text } from '../../components/text';
import { useIsOwner } from '../../store/selectors';
import type { ActionDraft } from './action-runner';
import { ConditionBuilder, type ConditionAttribute } from './condition-builder';
import { recordOf, type JsonRecord } from './form-model';
import { usePresenceResource, type PresenceResource } from './resource-data';
import { picked, ResourceList, type ResourceActions, type ResourceItem } from './resource-list';
import { ScheduleTimeBuilder } from './schedule-time-builder';
import { ScriptEditor } from './script-editor';

const RESOURCE_PAGES: Readonly<Partial<Record<ShellyPage, PresenceResource>>> = {
  'presence-schedules': 'schedules',
  'presence-actions': 'webhooks',
  'presence-scripts': 'scripts',
  'presence-storage': 'storedValues',
};

export function resourceForPage(page: ShellyPage): PresenceResource | null {
  return RESOURCE_PAGES[page] ?? null;
}

const SCHEDULE: ResourceActions = {
  create: 'schedule_create',
  update: 'schedule_update',
  remove: 'schedule_delete',
  wrap: 'schedule',
};
const WEBHOOK: ResourceActions = {
  create: 'webhook_create',
  update: 'webhook_update',
  remove: 'webhook_delete',
  wrap: 'webhook',
};
const SCRIPT: ResourceActions = {
  create: 'script_create',
  update: 'script_config',
  remove: 'script_delete',
};
const STORED: ResourceActions = { create: 'kvs_set', update: 'kvs_set', remove: 'kvs_delete' };
const SCRIPT_RUNTIME: readonly ShellyAction[] = [
  'script_put_code',
  'script_start',
  'script_stop',
  'script_eval',
  'script_code',
  'script_library',
  'script_example',
];

export const RESOURCE_ACTIONS: ReadonlySet<ShellyAction> = new Set([
  ...[SCHEDULE, WEBHOOK, SCRIPT, STORED].flatMap((a) => [a.create, a.update, a.remove]),
  ...SCRIPT_RUNTIME,
]);

export const RESOURCE_CREATE_ACTIONS: readonly ShellyAction[] = [
  SCHEDULE.create,
  WEBHOOK.create,
  SCRIPT.create,
  STORED.create,
];

const ENABLED = { enable: true };
const NEW_SCHEDULE: JsonRecord = {
  enable: true,
  timespec: '0 0 8 * * *',
  calls: [{ method: 'Presence.SetSensor', params: { enable: true } }],
};

function enabledText(enable: boolean | undefined): string {
  return enable === true ? 'Enabled' : 'Disabled';
}

function nameOf(row: unknown): string | null {
  const name = recordOf(row)?.['name'];
  return typeof name === 'string' ? name : null;
}

function textOf(draft: ActionDraft, name: string): string {
  const value = draft.value[name];
  return typeof value === 'string' ? value : '';
}

function scheduleHelpers(draft: ActionDraft): ReactNode {
  return (
    <ScheduleTimeBuilder
      change={(timespec) => {
        draft.change({ ...draft.value, timespec });
      }}
    />
  );
}

function Schedules({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const state = usePresenceResource(sensor, 'schedules');
  const schedules = state.resources.schedules;
  const items: readonly ResourceItem[] = (schedules?.jobs ?? []).map((job) => ({
    id: String(job.id),
    title: job.timespec,
    subtitle: `${enabledText(job.enable)} · ${String(job.calls.length)} actions`,
    initial: picked('schedule_update', 'schedule', job),
    fixed: { id: job.id },
  }));
  return (
    <ResourceList
      sensor={sensor}
      title="Schedules"
      addLabel="Add schedule"
      items={items}
      state={state}
      actions={SCHEDULE}
      blank={NEW_SCHEDULE}
      helpers={scheduleHelpers}
    />
  );
}

type WebhookTypes = NonNullable<ShellyResources['webhookTypes']>['types'];

function attributesFor(types: WebhookTypes, event: string): readonly ConditionAttribute[] {
  return types.flatMap((type) => type[event]?.attrs ?? []);
}

function webhookHelpers(draft: ActionDraft, resources: ShellyResources): ReactNode {
  const types = resources.webhookTypes?.types ?? [];
  const event = textOf(draft, 'event');
  const events = types.flatMap((type) => Object.keys(type));
  return (
    <>
      <Select
        label="Event"
        value={event === '' ? null : event}
        options={events.map((name) => ({ value: name, label: name.replaceAll('_', ' ') }))}
        onChange={(next) => {
          draft.change({ ...draft.value, event: next });
        }}
      />
      <ConditionBuilder
        attributes={attributesFor(types, event)}
        condition={textOf(draft, 'condition')}
        change={(condition) => {
          draft.change({ ...draft.value, condition });
        }}
      />
    </>
  );
}

function Webhooks({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const state = usePresenceResource(sensor, 'webhooks');
  const webhooks = state.resources.webhooks;
  const items: readonly ResourceItem[] = (webhooks?.hooks ?? []).map((hook) => ({
    id: String(hook.id),
    title: nameOf(hook) ?? hook.event,
    subtitle: `${enabledText(recordOf(hook)?.['enable'] === true)} · ${hook.event}`,
    initial: picked('webhook_update', 'webhook', hook),
    fixed: { id: hook.id },
  }));
  return (
    <ResourceList
      sensor={sensor}
      title="On-device actions"
      addLabel="Add action"
      items={items}
      state={state}
      actions={WEBHOOK}
      blank={ENABLED}
      helpers={webhookHelpers}
    />
  );
}

function Scripts({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const state = usePresenceResource(sensor, 'scripts');
  const items: readonly ResourceItem[] = (state.resources.scripts?.scripts ?? []).map((script) => ({
    id: String(script.id),
    title: nameOf(script) ?? `Script ${String(script.id)}`,
    subtitle:
      script.running === undefined ? 'State unknown' : script.running ? 'Running' : 'Stopped',
    initial: { name: nameOf(script), enable: recordOf(script)?.['enable'] === true },
    fixed: { id: script.id },
  }));
  return (
    <ResourceList
      sensor={sensor}
      title="Scripts"
      addLabel="Add script"
      items={items}
      state={state}
      actions={SCRIPT}
      blank={{}}
      editor={ScriptEditor}
    />
  );
}

function StoredValues({ sensor }: { readonly sensor: ShellyDevice }): ReactNode {
  const state = usePresenceResource(sensor, 'storedValues');
  const items: readonly ResourceItem[] = Object.entries(
    state.resources.storedValues?.items ?? {},
  ).map(([key, entry]) => ({
    id: `key:${key}`,
    title: key,
    subtitle: valueSummary(entry.value),
    initial: { value: entry.value },
    fixed: { key, etag: entry.etag },
  }));
  return (
    <ResourceList
      sensor={sensor}
      title="Stored values"
      addLabel="Add stored value"
      items={items}
      state={state}
      actions={STORED}
      blank={{}}
    />
  );
}

const PAGES: Readonly<
  Record<PresenceResource, (props: { readonly sensor: ShellyDevice }) => ReactNode>
> = { schedules: Schedules, webhooks: Webhooks, scripts: Scripts, storedValues: StoredValues };

export function ResourcePage({
  sensor,
  resource,
}: {
  readonly sensor: ShellyDevice;
  readonly resource: PresenceResource;
}): ReactNode {
  const owner = useIsOwner();
  const Page = PAGES[resource];
  return owner ? (
    <Page sensor={sensor} />
  ) : (
    <Text tone="variant">The home owner can read and change what is stored on the device.</Text>
  );
}
