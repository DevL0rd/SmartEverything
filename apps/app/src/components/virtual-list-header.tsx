import type { ReactElement, ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { Text } from './text';

interface HeaderSection {
  readonly key: string;
  readonly title: string;
}

type ReportLength = (sectionKey: string, length: number) => void;

function Header({
  title,
  widthClassName,
  onLength,
}: {
  readonly title: string;
  readonly widthClassName: string;
  readonly onLength?: (length: number) => void;
}): ReactNode {
  return (
    <View
      className="bg-bg px-gutter pb-1 pt-4"
      onLayout={(event) => {
        onLength?.(event.nativeEvent.layout.height);
      }}
    >
      <Text
        variant="footnote"
        tone="variant"
        accessibilityRole="header"
        className={cn('w-full self-center', widthClassName)}
      >
        {title}
      </Text>
    </View>
  );
}

export const SectionHeader = memo(Header);

function GaugedHeader({
  section,
  widthClassName,
  onLength,
}: {
  readonly section: HeaderSection;
  readonly widthClassName: string;
  readonly onLength: ReportLength;
}): ReactNode {
  return (
    <Header
      title={section.title}
      widthClassName={widthClassName}
      onLength={(length) => {
        onLength(section.key, length);
      }}
    />
  );
}

interface GaugeProps {
  readonly sections: readonly HeaderSection[];
  readonly widthClassName: string;
  readonly onLength: ReportLength;
}

function Gauge({ sections, widthClassName, onLength }: GaugeProps): ReactNode {
  return (
    <View
      aria-hidden
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      className="invisible absolute inset-x-0 top-0 opacity-0"
    >
      {sections.map((section) => (
        <GaugedHeader
          key={section.key}
          section={section}
          widthClassName={widthClassName}
          onLength={onLength}
        />
      ))}
    </View>
  );
}

function sameGauge(left: GaugeProps, right: GaugeProps): boolean {
  return (
    left.widthClassName === right.widthClassName &&
    left.onLength === right.onLength &&
    left.sections.length === right.sections.length &&
    left.sections.every((section, index) => {
      const other = right.sections[index];
      return other?.key === section.key && other.title === section.title;
    })
  );
}

const HeaderGauge = memo(Gauge, sameGauge);

export function ListTop({
  header,
  ...gauge
}: GaugeProps & { readonly header: ReactElement | undefined }): ReactNode {
  return (
    <View>
      <HeaderGauge {...gauge} />
      {header}
    </View>
  );
}
