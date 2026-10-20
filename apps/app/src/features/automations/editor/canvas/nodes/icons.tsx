import { createElement, type ReactNode } from 'react';
import { GLYPHS as APP_GLYPHS, isIconName } from '../../../../../components/icon-glyphs';

const GLYPHS: Readonly<Record<string, ReactNode>> = {
  zap: (
    <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
  ),
  plus: <path d="M5 12h14M12 5v14" />,
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </>
  ),
  package: (
    <>
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
      <path d="M12 22V12M3.3 7 12 12l8.7-5" />
    </>
  ),
  'log-in': <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />,
  'log-out': <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  'shield-check': (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  'git-branch': (
    <>
      <path d="M6 3v12M18 9a9 9 0 0 1-9 9" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
    </>
  ),
  'circle-help': (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
    </>
  ),
  'corner-down-left': <path d="M20 4v7a4 4 0 0 1-4 4H4M9 10l-5 5 5 5" />,
  'sticky-note': (
    <>
      <path d="M21 9a2.4 2.4 0 0 0-.7-1.7l-4.6-4.6A2.4 2.4 0 0 0 14 2H5a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
      <path d="M15 3v5a1 1 0 0 0 1 1h5" />
    </>
  ),
};

export function hasGlyph(name: string): boolean {
  return Object.hasOwn(GLYPHS, name);
}

export function Glyph({
  name,
  className,
}: {
  readonly name: string;
  readonly className?: string;
}): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {GLYPHS[name]}
    </svg>
  );
}

function WellMark({ icon, title }: { readonly icon: string; readonly title: string }): ReactNode {
  if (hasGlyph(icon)) return <Glyph name={icon} className="sn-glyph" />;
  if (isIconName(icon)) {
    return createElement(APP_GLYPHS[icon], {
      size: 16,
      strokeWidth: 2,
      color: 'currentColor',
      'aria-hidden': true,
    });
  }
  return <span className="sn-initial">{title.slice(0, 1).toUpperCase()}</span>;
}

export function IconWell({
  icon,
  title,
}: {
  readonly icon: string;
  readonly title: string;
}): ReactNode {
  return (
    <span className="sn-well" aria-hidden>
      <WellMark icon={icon} title={title} />
    </span>
  );
}
