import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { z } from 'zod';
import type { AutomationV4 } from '@smarteverything/domain';
import { background, Logger } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { useProfiles } from '../../../store/people';
import { useDevices, useRooms } from '../../../store/selectors';
import { useAutomationsSource } from '../data/source';
import { useAutomationActions } from '../data/use-automation';
import { useAutomations } from '../data/use-automations';
import { graphAutomation } from '../model/templates/graph-kit';
import { templatesFor } from '../model/templates/all-templates';
import type { SlotValues, Template } from '../model/templates/parameters';
import { takenStates } from '../model/templates/taken';
import { GalleryScreen } from '../templates/gallery-screen';
import { links } from '../routes';
import { PageShell } from '../../../components/page-shell/page-shell';
import { useRefNames } from './use-environment';

const log = new Logger('app.automations');

const SCRATCH_NAME = 'New automation';

const PARAMS = z.object({
  template: z.string().optional(),
  room: z.string().optional(),
  device: z.string().optional(),
});

type Scope = Omit<z.infer<typeof PARAMS>, 'template'>;

const WHOLE_HOME: Scope = {};

function useCreate(): (name: string, definition: AutomationV4) => Promise<void> {
  const router = useRouter();
  const actions = useAutomationActions();
  return async (name, definition) => {
    try {
      const reply = await actions.create({ name, enabled: false, definition });
      if (reply.ok && reply.id !== null) {
        router.replace(links.edit(reply.id));
      } else {
        notify({ message: reply.summary, tone: 'critical' });
      }
    } catch (error) {
      log.error('automations.create_failed', error);
      notify({ message: 'The automation wasn’t created', tone: 'critical', error });
    }
  };
}

function useTemplates(scope: Scope): readonly Template[] {
  const devices = useDevices({});
  const rooms = useRooms();
  const people = useProfiles();
  const { room, device } = scope;
  return useMemo(() => {
    const shown = devices.filter(
      (entry) =>
        (room === undefined || entry.room_id === room) &&
        (device === undefined || entry.id === device),
    );
    const places = room === undefined ? rooms : rooms.filter((entry) => entry.id === room);
    return templatesFor(shown, { rooms: places, people });
  }, [devices, rooms, people, room, device]);
}

function Gallery({ scope }: { readonly scope: Scope }): ReactNode {
  const templates = useTemplates(scope);
  const names = useRefNames();
  const { lookup } = useAutomationsSource();
  const { rows } = useAutomations();
  const create = useCreate();
  const taken = useMemo(
    () =>
      takenStates(
        templates,
        rows.map((row) => ({ id: row.id, name: row.name, enabled: row.enabled })),
      ),
    [templates, rows],
  );
  return (
    <PageShell title="Templates" width="full">
      <GalleryScreen
        templates={templates}
        taken={taken}
        names={names}
        kinds={lookup}
        onCreate={(entry: Template, values: SlotValues) => {
          background(create(entry.name, entry.build(values)), 'automations.create_template');
        }}
        onScratch={() => {
          background(
            create(SCRATCH_NAME, graphAutomation({ triggers: [], body: [] })),
            'automations.create_scratch',
          );
        }}
      />
    </PageShell>
  );
}

function FromTemplate({ template }: { readonly template: Template }): ReactNode {
  const create = useCreate();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    background(create(template.name, template.build()), 'automations.create_template');
  }, [create, template]);
  return (
    <PageShell title="New automation" width="reading">
      {null}
    </PageShell>
  );
}

export function TemplatesHost(): ReactNode {
  return <Gallery scope={WHOLE_HOME} />;
}

export function NewHost(): ReactNode {
  const params = PARAMS.safeParse(useLocalSearchParams());
  const scope = params.success ? params.data : WHOLE_HOME;
  const templates = useTemplates(WHOLE_HOME);
  const chosen = params.success
    ? templates.find((entry) => entry.id === params.data.template)
    : undefined;
  return chosen === undefined ? <Gallery scope={scope} /> : <FromTemplate template={chosen} />;
}
