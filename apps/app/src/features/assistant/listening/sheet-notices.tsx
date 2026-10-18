import type { ReactNode } from 'react';
import type { Href } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Banner, type BannerProps } from '../../../components/banner';
import { KIND_NOUNS, type ListeningRow } from './listening-model';

type Notice = Omit<BannerProps, 'action'> & {
  readonly action?: { readonly label: string; readonly href: Href };
};

function noticeOf(row: ListeningRow): Notice | null {
  const noun = KIND_NOUNS[row.source.kind];
  switch (row.state) {
    case 'blocked':
      return {
        tone: 'info',
        title: 'Blocked by setting',
        body: `This ${noun} does not listen.`,
      };
    case 'privacy':
      return {
        tone: 'info',
        title: 'The privacy switch is on',
        body: 'Listening stops while it is on. Your Wake and Write down choices are kept.',
        action: { label: 'Open camera', href: href.camera(row.source.key) },
      };
    case 'offline':
      return {
        tone: 'warning',
        title: `This ${noun} is offline`,
        body: 'Listening resumes by itself when it is back.',
      };
    case 'in_conversation':
      return {
        tone: 'info',
        title: 'In a conversation',
        body: `This ${noun} rests until the conversation ends.`,
      };
    case 'discord_call':
      return {
        tone: 'info',
        title: 'Off during Discord call',
        body: `The bot is in a voice channel, so this ${noun} does not listen. It starts again when the call ends.`,
      };
    case 'no_host':
      return {
        tone: 'warning',
        title: 'No computer is on to listen',
        body: `This ${noun} is heard through a computer that is switched on. Listening resumes when one is.`,
      };
    case 'listening':
    case 'off':
    case 'needs_permission':
      return null;
  }
}

export function SheetNotice({ row }: { readonly row: ListeningRow }): ReactNode {
  const notice = noticeOf(row);
  return notice === null ? null : <Banner wrapBody {...notice} />;
}
