import { useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { MCP_TOOLS } from '@smarteverything/domain';
import { AdaptivePanel, usePanelFrame } from '../../../components/adaptive-panel';
import { COMPACT_PANEL_INSET } from '../../../components/compact-panel';
import { useFocusRequest } from '../../../components/focus-request';
import { ListRow } from '../../../components/list-row';
import { ReasonLine } from '../../../components/reason-line';
import { SheetBody } from '../../../components/sheet-body';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { PanelHead, PanelSection } from '../picker/panel/panel-chrome';
import type { AccessModel, AccessSectionView } from './access-model';
import { AccessRowView } from './access-rows';
import { ACCESS_TOOLS_TITLE, AccessToolsPage } from './access-tools-page';
import { stateOf } from './tools-model';
import { useToolPermissions, type ToolPermissions } from './use-tool-permissions';

export interface AccessPanelProps {
  readonly anchorRef: RefObject<View | null>;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly model: AccessModel;
  readonly startWithTools?: boolean;
  readonly onToolsBack?: () => void;
}

function SectionRows({
  section,
  model,
}: {
  readonly section: AccessSectionView;
  readonly model: AccessModel;
}): ReactNode {
  const rows = section.rows.map((row) => (
    <AccessRowView
      key={row.key}
      row={row}
      disabled={model.blocked}
      busy={model.applying === row.key}
      compact
      onSelect={(): void => {
        model.select(section.id, row.option.value);
      }}
    />
  ));
  return (
    <View role="radiogroup" aria-label={section.title}>
      <PanelSection title={section.title}>
        <View>{rows}</View>
      </PanelSection>
    </View>
  );
}

function ToolsRow({
  permissions,
  onOpen,
  focus,
}: {
  readonly permissions: ToolPermissions | null;
  readonly onOpen: () => void;
  readonly focus: boolean;
}): ReactNode {
  const opener = useFocusRequest(focus);
  if (permissions === null) return null;
  const { on, total } = stateOf(permissions.allowed, MCP_TOOLS);
  return (
    <ListRow
      title={ACCESS_TOOLS_TITLE}
      value={`${String(on)} of ${String(total)}`}
      label={`${ACCESS_TOOLS_TITLE}, ${String(on)} of ${String(total)} allowed`}
      icon="wrench"
      chevron
      compact
      pressRef={opener}
      onPress={onOpen}
    />
  );
}

function Banner({ banner }: { readonly banner: NonNullable<AccessModel['banner']> }): ReactNode {
  return (
    <View accessibilityLiveRegion="polite" className="border-b border-outline-variant px-4 py-2">
      <ReasonLine
        icon={banner.icon}
        text={banner.text}
        {...(banner.action === null ? {} : { action: banner.action })}
      />
    </View>
  );
}

function Footnote({ text }: { readonly text: string }): ReactNode {
  return (
    <View className="border-t border-outline-variant px-2 py-2">
      <Text variant="caption" tone="variant">
        {text}
      </Text>
    </View>
  );
}

function PanelContent({
  model,
  onClose,
  permissions,
  onTools,
  focusTools,
}: {
  readonly model: AccessModel;
  readonly onClose: () => void;
  readonly permissions: ToolPermissions | null;
  readonly onTools: () => void;
  readonly focusTools: boolean;
}): ReactNode {
  return (
    <View className="min-h-0 shrink py-1">
      <PanelHead title={model.title} onBack={null} onClose={onClose} />
      {model.banner === null ? null : <Banner banner={model.banner} />}
      <SheetBody scroll fit padding="pb-2">
        {model.sections.map((section) => (
          <SectionRows key={section.id} section={section} model={model} />
        ))}
        <ToolsRow permissions={permissions} onOpen={onTools} focus={focusTools} />
      </SheetBody>
      <Footnote text={model.footnote} />
    </View>
  );
}

type OpenProps = Omit<AccessPanelProps, 'open'> & {
  readonly permissions: ToolPermissions | null;
};

function AccessPages({
  model,
  onClose,
  permissions,
  showTools,
  back,
  onTools,
  focusTools,
}: Pick<OpenProps, 'model' | 'onClose' | 'permissions'> & {
  readonly showTools: boolean;
  readonly back: () => void;
  readonly onTools: () => void;
  readonly focusTools: boolean;
}): ReactNode {
  const sheet = usePanelFrame().presentation === 'sheet';
  return (
    <View className={cn('min-h-0 shrink', !sheet && COMPACT_PANEL_INSET)}>
      <View
        aria-hidden={showTools}
        accessibilityElementsHidden={showTools}
        importantForAccessibility={showTools ? 'no-hide-descendants' : 'auto'}
        className={showTools ? 'hidden' : 'min-h-0 shrink'}
      >
        <PanelContent
          model={model}
          onClose={onClose}
          permissions={permissions}
          onTools={onTools}
          focusTools={focusTools}
        />
      </View>
      {showTools && permissions !== null ? (
        <AccessToolsPage permissions={permissions} onBack={back} onClose={onClose} />
      ) : null}
    </View>
  );
}

function OpenAccessPanel({
  anchorRef,
  onClose,
  model,
  permissions,
  startWithTools,
  onToolsBack,
}: OpenProps): ReactNode {
  const [page, setPage] = useState<'access' | 'tools' | 'returned'>(
    startWithTools === true ? 'tools' : 'access',
  );
  const [previousToolsRequest, setPreviousToolsRequest] = useState(startWithTools);
  if (startWithTools !== previousToolsRequest) {
    setPreviousToolsRequest(startWithTools);
    if (startWithTools === true) setPage('tools');
  }
  const showTools = page === 'tools' && permissions !== null;
  const back = (): void => {
    setPage('returned');
    onToolsBack?.();
  };
  return (
    <AdaptivePanel
      anchorRef={anchorRef}
      open
      onClose={onClose}
      onBack={showTools ? back : onClose}
      label={showTools ? ACCESS_TOOLS_TITLE : model.title}
      fit
      chrome
      scroll={false}
    >
      <AccessPages
        model={model}
        onClose={onClose}
        permissions={permissions}
        showTools={showTools}
        back={back}
        onTools={() => {
          setPage('tools');
        }}
        focusTools={page === 'returned'}
      />
    </AdaptivePanel>
  );
}

export function AccessPanel({ open, ...props }: AccessPanelProps): ReactNode {
  const permissions = useToolPermissions(props.model.tools);
  return open ? <OpenAccessPanel {...props} permissions={permissions} /> : null;
}
