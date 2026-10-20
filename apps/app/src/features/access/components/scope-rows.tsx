import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';
import { MCP_TOOL_AREAS, type PersonAccess, type PersonTemplate } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import type { IconName } from '../../../components/icon';
import { SelectRow } from '../../../components/rows';
import { notifyFailure } from '../../../components/toast-store';
import type { AccessActions } from '../data/access-data';
import {
  TEMPLATE_HELP,
  TEMPLATE_LABEL,
  TEMPLATE_ORDER,
  areaLabels,
  areasText,
  budgetText,
  channelsText,
  devicesText,
  modelsText,
  scopesChange,
  templateChange,
} from '../model/scopes';
import { BudgetSheet } from './budget-sheet';
import { ChannelsScopeSheet } from './channels-scope-sheet';
import { ChecklistSheet } from './checklist-sheet';
import { DevicesScopeSheet } from './devices-scope-sheet';
import type { EditorProps } from './editor-sheet';
import { ModelsScopeSheet } from './models-scope-sheet';

interface RowProps {
  readonly access: PersonAccess;
  readonly actions: AccessActions;
}

const TEMPLATE_OPTIONS = TEMPLATE_ORDER.map((template) => ({
  value: template,
  label: `${TEMPLATE_LABEL[template]}, ${TEMPLATE_HELP[template].toLowerCase()}`,
}));

export function TemplateRow({ access, actions }: RowProps): ReactNode {
  return (
    <SelectRow<PersonTemplate>
      title="Start from"
      subtitle="Replaces the choices below with the usual ones for this kind of person"
      wrapSubtitle
      icon="user"
      options={TEMPLATE_OPTIONS}
      value={null}
      placeholder={TEMPLATE_LABEL[access.template]}
      onChange={(template) => {
        actions
          .change(access.profile_id, templateChange(template))
          .catch(notifyFailure('The kind of person was not saved'));
      }}
    />
  );
}

function EditorRow({
  title,
  subtitle,
  icon,
  value,
  editor: Editor,
  access,
  actions,
}: RowProps & {
  readonly title: string;
  readonly subtitle: string;
  readonly icon: IconName;
  readonly value: string;
  readonly editor: ComponentType<EditorProps>;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        title={title}
        subtitle={subtitle}
        wrapSubtitle
        icon={icon}
        value={value}
        chevron
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <Editor
          access={access}
          actions={actions}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function AreasSheet({ access, actions, onClose }: EditorProps): ReactNode {
  return (
    <ChecklistSheet
      title="Parts of the app"
      intro="Untick what this person must not reach."
      options={areaLabels()}
      selected={access.scopes.areas}
      onClose={onClose}
      onSave={(selected) => {
        const areas = MCP_TOOL_AREAS.filter((area) => selected.includes(area));
        actions
          .change(access.profile_id, scopesChange(access, { areas }))
          .catch(notifyFailure('The parts of the app were not saved'));
      }}
    />
  );
}

export function AreasRow(props: RowProps): ReactNode {
  return (
    <EditorRow
      {...props}
      title="Parts of the app"
      subtitle="Pages and AI tools this person can use"
      icon="grid"
      value={areasText(props.access.scopes.areas)}
      editor={AreasSheet}
    />
  );
}

export function DevicesRow(props: RowProps): ReactNode {
  return (
    <EditorRow
      {...props}
      title="Devices and rooms"
      subtitle="Which devices this person can see and control"
      icon="bulb"
      value={devicesText(props.access.scopes.devices)}
      editor={DevicesScopeSheet}
    />
  );
}

export function ModelsRow(props: RowProps): ReactNode {
  return (
    <EditorRow
      {...props}
      title="AI models"
      subtitle="Which models this person may use"
      icon="sparkles"
      value={modelsText(props.access.scopes.models)}
      editor={ModelsScopeSheet}
    />
  );
}

export function ChannelsRow(props: RowProps): ReactNode {
  return (
    <EditorRow
      {...props}
      title="Walkie-talkie channels"
      subtitle="Which channels this person can hear and speak in"
      icon="radio"
      value={channelsText(props.access.scopes.channels)}
      editor={ChannelsScopeSheet}
    />
  );
}

export function BudgetRow(props: RowProps): ReactNode {
  return (
    <EditorRow
      {...props}
      title="AI budget"
      subtitle="How much AI this person may use"
      icon="gauge"
      value={budgetText(props.access.budget)}
      editor={BudgetSheet}
    />
  );
}
