import {
  MAX_BREAKPOINT_AUTOMATIONS,
  MAX_BREAKPOINTS_PER_AUTOMATION,
  MAX_FAVOURITE_KINDS,
  MAX_RECENT_KINDS,
  type AutomationsBreakpointsPref,
  type AutomationsPalettePref,
} from '@smarteverything/domain';

export function withRecentKind(pref: AutomationsPalettePref, kind: string): AutomationsPalettePref {
  const recents = [kind, ...pref.recents.filter((known) => known !== kind)].slice(
    0,
    MAX_RECENT_KINDS,
  );
  return { ...pref, recents };
}

export function withFavouriteToggled(
  pref: AutomationsPalettePref,
  kind: string,
): AutomationsPalettePref | null {
  if (pref.favourites.includes(kind)) {
    return { ...pref, favourites: pref.favourites.filter((known) => known !== kind) };
  }
  if (pref.favourites.length >= MAX_FAVOURITE_KINDS) return null;
  return { ...pref, favourites: [kind, ...pref.favourites] };
}

export function breakpointsOf(pref: AutomationsBreakpointsPref, automationId: string): string[] {
  return pref.byAutomation[automationId] ?? [];
}

export function withBreakpoints(
  pref: AutomationsBreakpointsPref,
  automationId: string,
  nodeIds: readonly string[],
): AutomationsBreakpointsPref | null {
  const others = Object.fromEntries(
    Object.entries(pref.byAutomation).filter(([known]) => known !== automationId),
  );
  if (nodeIds.length === 0) return { byAutomation: others };
  if (nodeIds.length > MAX_BREAKPOINTS_PER_AUTOMATION) return null;
  if (
    !(automationId in pref.byAutomation) &&
    Object.keys(others).length >= MAX_BREAKPOINT_AUTOMATIONS
  ) {
    return null;
  }
  return { byAutomation: { ...others, [automationId]: [...new Set(nodeIds)] } };
}

export function withBreakpointToggled(
  pref: AutomationsBreakpointsPref,
  automationId: string,
  nodeId: string,
): AutomationsBreakpointsPref | null {
  const current = breakpointsOf(pref, automationId);
  const next = current.includes(nodeId)
    ? current.filter((known) => known !== nodeId)
    : [...current, nodeId];
  return withBreakpoints(pref, automationId, next);
}
