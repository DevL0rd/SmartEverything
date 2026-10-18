import type { ReactNode, RefObject } from 'react';
import { ScrollView, View } from 'react-native';
import { AdaptivePanel, usePanelFrame } from '../../../components/adaptive-panel';
import { ListRow } from '../../../components/list-row';
import { ReasonLine } from '../../../components/reason-line';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { PanelHead } from '../picker/panel/panel-chrome';
import type { AccessModel, AccessSectionView } from './access-model';
import { AccessRowView } from './access-rows';

export interface AccessPanelProps {
  readonly anchorRef: RefObject<View | null>;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly model: AccessModel;
}

function Sections({
  sections,
  model,
}: {
  readonly sections: readonly AccessSectionView[];
  readonly model: AccessModel;
}): ReactNode {
  return sections.map((section) => (
    <View key={section.id} role="radiogroup" aria-label={section.title}>
      <List title={section.title}>
        {section.rows.map((row) => (
          <AccessRowView
            key={row.key}
            row={row}
            disabled={model.blocked}
            busy={model.applying === row.key}
            onSelect={(): void => {
              model.select(section.id, row.option.value);
            }}
          />
        ))}
      </List>
    </View>
  ));
}

function CloudBody({
  model,
  leave,
}: {
  readonly model: AccessModel;
  readonly leave: (action: () => void) => void;
}): ReactNode {
  const { cloud, tools } = model;
  if (cloud === null) return null;
  return (
    <>
      <Text variant="callout" className="px-4 py-3">
        {cloud.intro}
      </Text>
      <List>
        {tools === null ? null : (
          <ListRow
            title={tools.label}
            icon="wrench"
            chevron
            onPress={(): void => {
              leave(tools.onOpen);
            }}
          />
        )}
        <ListRow
          title="Use a computer for files and commands"
          icon="monitor"
          chevron
          onPress={(): void => {
            leave(cloud.onComputer);
          }}
        />
      </List>
    </>
  );
}

function ToolsRow({
  model,
  leave,
}: {
  readonly model: AccessModel;
  readonly leave: (action: () => void) => void;
}): ReactNode {
  const { tools, cloud } = model;
  if (tools === null || cloud !== null) return null;
  return (
    <List>
      <ListRow
        title={tools.label}
        icon="wrench"
        chevron
        onPress={(): void => {
          leave(tools.onOpen);
        }}
      />
    </List>
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

function PanelContent({
  model,
  onClose,
}: {
  readonly model: AccessModel;
  readonly onClose: () => void;
}): ReactNode {
  const sheet = usePanelFrame().presentation === 'sheet';
  const leave = (action: () => void): void => {
    onClose();
    action();
  };
  return (
    <View className={cn('min-h-0 flex-1', sheet && '-mx-4')}>
      <PanelHead title={model.title} onBack={null} onClose={onClose} />
      {model.banner === null ? null : <Banner banner={model.banner} />}
      <ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-2 pb-2">
        <Sections sections={model.sections} model={model} />
        <CloudBody model={model} leave={leave} />
        <ToolsRow model={model} leave={leave} />
      </ScrollView>
      <View className="border-t border-outline-variant px-4 py-2">
        <Text variant="caption" tone="variant">
          {model.footnote}
        </Text>
      </View>
    </View>
  );
}

export function AccessPanel({ anchorRef, open, onClose, model }: AccessPanelProps): ReactNode {
  return (
    <AdaptivePanel anchorRef={anchorRef} open={open} onClose={onClose} label={model.title}>
      <PanelContent model={model} onClose={onClose} />
    </AdaptivePanel>
  );
}
