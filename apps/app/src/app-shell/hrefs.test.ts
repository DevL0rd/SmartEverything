import { describe, expect, it } from 'vitest';
import { href } from './hrefs';

describe('group and room lights hrefs', () => {
  it('opens a group page, optionally on one member', () => {
    expect(href.group('g1')).toStrictEqual({
      pathname: '/groups/[groupId]',
      params: { groupId: 'g1' },
    });
    expect(href.group('g1', { member: 'lamp' })).toStrictEqual({
      pathname: '/groups/[groupId]',
      params: { groupId: 'g1', member: 'lamp' },
    });
  });

  it('opens the lights of a room, optionally on one member', () => {
    expect(href.roomLights('r1')).toStrictEqual({
      pathname: '/rooms/[roomId]/lights',
      params: { roomId: 'r1' },
    });
    expect(href.roomLights('r1', { member: 'lamp' })).toStrictEqual({
      pathname: '/rooms/[roomId]/lights',
      params: { roomId: 'r1', member: 'lamp' },
    });
  });
});

describe('group page options', () => {
  it('carries the editor request and the control to focus', () => {
    expect(href.group('g1', { edit: true, focus: 'brightness' })).toStrictEqual({
      pathname: '/groups/[groupId]',
      params: { groupId: 'g1', edit: '1', focus: 'brightness' },
    });
  });

  it('opens the new group page', () => {
    expect(href.newGroup()).toBe('/groups/new');
  });
});

describe('home href', () => {
  it('goes to the plain Home page without a reveal', () => {
    expect(href.home()).toBe('/');
  });

  it('carries the widget to reveal and the member to show', () => {
    expect(href.home({ reveal: 'group:g1' })).toStrictEqual({
      pathname: '/',
      params: { reveal: 'group:g1' },
    });
    expect(href.home({ reveal: 'group:g1', member: 'lamp' })).toStrictEqual({
      pathname: '/',
      params: { reveal: 'group:g1', member: 'lamp' },
    });
  });
});

describe('automation hrefs', () => {
  it('opens the detail page, the editor and the new automation page', () => {
    expect(href.automation('a1')).toStrictEqual({
      pathname: '/automations/[automationId]',
      params: { automationId: 'a1' },
    });
    expect(href.automationEdit('a1', 'node:n1')).toStrictEqual({
      pathname: '/automations/[automationId]/edit',
      params: { automationId: 'a1', focus: 'node:n1' },
    });
    expect(href.automationNew()).toBe('/automations/new');
    expect(href.automationNew('morning')).toStrictEqual({
      pathname: '/automations/new',
      params: { template: 'morning' },
    });
  });

  it('opens the variables pages', () => {
    expect(href.automationValues()).toBe('/automations/variables');
    expect(href.automationValue('v1', 'name')).toStrictEqual({
      pathname: '/automations/variables/[variableId]',
      params: { variableId: 'v1', focus: 'name' },
    });
  });
});
