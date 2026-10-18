import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import { SectionAction, List } from '../../components/section';
import { count } from '../../format/number';

export function SectionPreview({
  title,
  caption,
  total,
  href,
  children,
}: {
  readonly title: string;
  readonly caption?: string;
  readonly total?: number;
  readonly href: Href;
  readonly children: ReactNode;
}): ReactNode {
  const label = total === undefined ? 'See all' : `See all (${count(total)})`;
  return (
    <List
      title={title}
      {...(caption === undefined ? {} : { caption })}
      action={<SectionAction label={label} href={href} />}
    >
      {children}
    </List>
  );
}
