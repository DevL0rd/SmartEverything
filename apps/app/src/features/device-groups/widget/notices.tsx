import type { ReactNode } from 'react';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { plural } from '../../../format/text';
import { editHref } from '../group-links';
import { memberNoun } from '../group-summary';
import { hasIssues } from '../model/outcomes';
import { Notice } from './notice';
import { ResultLine } from './result-line';
import type { GroupData } from './use-group-data';

export function noticeCount(data: GroupData): number {
  return (
    Number(hasIssues(data.master.outcomes)) +
    Number(data.lost > 0) +
    Number(data.view.state.power === 'none')
  );
}

export function Notices({ data }: { readonly data: GroupData }): ReactNode {
  const { master, view, lost } = data;
  const noun = memberNoun(data.lights);
  return (
    <>
      <ResultLine
        outcomes={master.outcomes}
        noun={noun}
        nameOf={data.nameOf}
        onRetry={master.retry}
        onDismiss={master.dismiss}
      />
      {lost > 0 ? (
        <Notice text={`${plural(lost, noun)} ${lost === 1 ? 'was' : 'were'} removed`}>
          <Interactive
            href={editHref(data.target)}
            label="Edit group"
            className="min-h-touch-min justify-center rounded-xs px-1"
            layerClassName="rounded-xs"
          >
            <Text variant="footnote" tone="primary">
              Edit group
            </Text>
          </Interactive>
        </Notice>
      ) : null}
      {view.state.power === 'none' ? (
        <Notice text={`None of these ${noun}s can be reached`} />
      ) : null}
    </>
  );
}
