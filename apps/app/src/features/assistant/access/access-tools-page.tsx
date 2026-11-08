import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { MCP_TOOLS, type McpToolArea } from '@smarteverything/domain';
import { CollapseBody, CollapseRoot, TurnChevron } from '../../../components/disclosure';
import { useFocusRequest } from '../../../components/focus-request';
import { ListRow } from '../../../components/list-row';
import { SwitchRow } from '../../../components/rows';
import { SearchField } from '../../../components/search-field';
import { SheetBody } from '../../../components/sheet-body';
import { Text } from '../../../components/text';
import { useEscape } from '../../../components/use-escape';
import { PanelHead, PanelNote } from '../picker/panel/panel-chrome';
import {
  matchingToolGroups,
  stateOf,
  withTool,
  withTools,
  type ToolGroupMatch,
} from './tools-model';
import type { ToolPermissions } from './use-tool-permissions';

type Tool = (typeof MCP_TOOLS)[number];

function AllToolsSwitch({
  tools,
  permissions,
  category,
}: {
  readonly tools: readonly Tool[];
  readonly permissions: ToolPermissions;
  readonly category?: string;
}): ReactNode {
  const { allowed, readOnly, saving, save } = permissions;
  const { all, mixed, on, total } = stateOf(allowed, tools);
  const title = `Allow all · ${String(on)} of ${String(total)}`;
  return (
    <SwitchRow
      title={title}
      label={
        category === undefined
          ? title
          : `Allow all in ${category} · ${String(on)} of ${String(total)}`
      }
      compact
      value={all}
      mixed={mixed}
      disabled={readOnly || saving}
      onChange={(value) => {
        save(withTools(allowed, tools, value));
      }}
    />
  );
}

function CategoryTools({
  match,
  permissions,
}: {
  readonly match: ToolGroupMatch;
  readonly permissions: ToolPermissions;
}): ReactNode {
  const { allowed, readOnly, saving, save } = permissions;
  return (
    <CollapseBody className="border-l border-outline-variant pl-2">
      <AllToolsSwitch
        tools={match.group.tools}
        permissions={permissions}
        category={match.group.title}
      />
      {match.tools.map((tool) => (
        <SwitchRow
          key={tool.name}
          title={tool.title}
          subtitle={tool.description}
          value={allowed.includes(tool.name)}
          disabled={readOnly || saving}
          compact
          onChange={(on) => {
            save(withTool(allowed, tool.name, on));
          }}
        />
      ))}
    </CollapseBody>
  );
}

function Category({
  match,
  permissions,
  open,
  toggle,
}: {
  readonly match: ToolGroupMatch;
  readonly permissions: ToolPermissions;
  readonly open: boolean;
  readonly toggle: () => void;
}): ReactNode {
  const { group } = match;
  const { on, total } = stateOf(permissions.allowed, group.tools);
  return (
    <CollapseRoot className="border-t border-outline-variant">
      <ListRow
        title={group.title}
        compact
        value={`${String(on)} of ${String(total)}`}
        expanded={open}
        label={`${group.title}, ${String(on)} of ${String(total)} allowed`}
        trailing={
          <View pointerEvents="none">
            <TurnChevron open={open} />
          </View>
        }
        onPress={toggle}
      />
      {open ? <CategoryTools match={match} permissions={permissions} /> : null}
    </CollapseRoot>
  );
}

function ToolCategories({
  query,
  permissions,
}: {
  readonly query: string;
  readonly permissions: ToolPermissions;
}): ReactNode {
  const [expanded, setExpanded] = useState<ReadonlySet<McpToolArea>>(new Set());
  const [collapsedInSearch, setCollapsedInSearch] = useState<ReadonlySet<McpToolArea>>(new Set());
  const searching = query.trim() !== '';
  const changed = searching ? collapsedInSearch : expanded;
  const setChanged = searching ? setCollapsedInSearch : setExpanded;
  const matches = matchingToolGroups(query);
  if (matches.length === 0)
    return (
      <View accessibilityLiveRegion="polite" className="px-3 py-4">
        <Text tone="variant">No matching tools.</Text>
      </View>
    );
  return matches.map((match) => (
    <Category
      key={match.group.area}
      match={match}
      permissions={permissions}
      open={searching !== changed.has(match.group.area)}
      toggle={() => {
        setChanged((previous) => toggledCategory(previous, match.group.area));
      }}
    />
  ));
}

function toggledCategory(
  previous: ReadonlySet<McpToolArea>,
  area: McpToolArea,
): ReadonlySet<McpToolArea> {
  const changed = new Set(previous);
  if (changed.has(area)) changed.delete(area);
  else changed.add(area);
  return changed;
}

export const ACCESS_TOOLS_TITLE = 'Tools for this chat';

export function AccessToolsPage({
  permissions,
  onBack,
  onClose,
}: {
  readonly permissions: ToolPermissions;
  readonly onBack: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const backRef = useFocusRequest(true);
  useEscape(true, onBack);
  return (
    <View className="min-h-0 shrink gap-1 py-1">
      <PanelHead
        title={ACCESS_TOOLS_TITLE}
        backLabel="Back to access"
        backRef={backRef}
        onBack={onBack}
        onClose={onClose}
      />
      <SearchField value={query} onChange={setQuery} placeholder="Search tools" variant="field" />
      {permissions.readOnly ? (
        <PanelNote icon="lock" text="Only the owner can change tools on this computer chat." />
      ) : null}
      <AllToolsSwitch tools={MCP_TOOLS} permissions={permissions} />
      <SheetBody scroll fit padding="pb-1">
        <ToolCategories query={query} permissions={permissions} />
      </SheetBody>
      {permissions.readOnly ? null : (
        <View
          accessibilityLiveRegion="polite"
          className="border-t border-outline-variant px-2 py-2"
        >
          <Text variant="caption" tone="variant">
            {permissions.saving ? 'Saving changes…' : 'Changes save automatically.'}
          </Text>
        </View>
      )}
    </View>
  );
}
