import { z } from 'zod';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import { define, guild, shortName, type Operation, ON_GUILD } from './kit';

const event = { ...guild, scheduledEventId: SNOWFLAKE };
const rule = { ...guild, ruleId: SNOWFLAKE };

export const SCHEDULED_OPERATIONS: readonly Operation[] = [
  define(
    'read',
    {
      action: 'scheduled_events_list',
      description: 'Read scheduled guild events.',
      ...ON_GUILD,
    },
    guild,
    (a, c) => c.rest.get(`/guilds/${a.guildId}/scheduled-events`),
  ),
  define(
    'read',
    { action: 'automod_rules_list', description: 'Read guild AutoMod rules.', ...ON_GUILD },
    guild,
    (a, c) => c.rest.get(`/guilds/${a.guildId}/auto-moderation/rules`),
  ),
  define(
    'change',
    {
      action: 'scheduled_event_create',
      description: 'Create an external scheduled event.',
      ...ON_GUILD,
    },
    {
      ...guild,
      name: shortName,
      description: z.string().max(1000).optional(),
      start: z.iso.datetime(),
      end: z.iso.datetime(),
      location: shortName,
    },
    (a, c) => {
      if (Date.parse(a.start) <= Date.now() || Date.parse(a.end) <= Date.parse(a.start)) {
        throw new DiscordInputError('Event times must be ordered and in the future');
      }
      return c.rest.post(`/guilds/${a.guildId}/scheduled-events`, {
        name: a.name,
        description: a.description,
        scheduled_start_time: a.start,
        scheduled_end_time: a.end,
        entity_type: 3,
        entity_metadata: { location: a.location },
        privacy_level: 2,
      });
    },
  ),
  define(
    'change',
    {
      action: 'scheduled_event_edit',
      description: 'Edit scheduled event text or transition its status.',
      ...ON_GUILD,
    },
    {
      ...event,
      name: shortName.optional(),
      description: z.string().max(1000).optional(),
      status: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    },
    (a, c) =>
      c.rest.patch(`/guilds/${a.guildId}/scheduled-events/${a.scheduledEventId}`, {
        name: a.name,
        description: a.description,
        status: a.status,
      }),
  ),
  define(
    'change',
    {
      action: 'automod_keyword_create',
      description: 'Create an enabled keyword-block AutoMod rule.',
      ...ON_GUILD,
    },
    {
      ...guild,
      name: shortName,
      keywords: z.array(z.string().min(1).max(60)).min(1).max(100),
      exemptRoles: z.array(SNOWFLAKE).max(20).default([]),
      exemptChannels: z.array(SNOWFLAKE).max(50).default([]),
    },
    async (a, c) => {
      for (const id of a.exemptChannels) {
        const destination = await c.channels.guildChannel(id);
        if (destination.guild_id !== a.guildId) {
          throw new DiscordInputError('Exemption channel is in another guild');
        }
      }
      return c.rest.post(`/guilds/${a.guildId}/auto-moderation/rules`, {
        name: a.name,
        event_type: 1,
        trigger_type: 1,
        trigger_metadata: { keyword_filter: a.keywords },
        actions: [{ type: 1 }],
        enabled: true,
        exempt_roles: a.exemptRoles,
        exempt_channels: a.exemptChannels,
      });
    },
  ),
  define(
    'change',
    {
      action: 'automod_rule_toggle',
      description: 'Enable or disable an AutoMod rule.',
      ...ON_GUILD,
    },
    { ...rule, enabled: z.boolean() },
    (a, c) =>
      c.rest.patch(`/guilds/${a.guildId}/auto-moderation/rules/${a.ruleId}`, {
        enabled: a.enabled,
      }),
  ),
  define(
    'remove',
    { action: 'scheduled_event_delete', description: 'Delete a scheduled event.', ...ON_GUILD },
    event,
    (a, c) => c.rest.delete(`/guilds/${a.guildId}/scheduled-events/${a.scheduledEventId}`),
  ),
  define(
    'remove',
    { action: 'automod_rule_delete', description: 'Delete an AutoMod rule.', ...ON_GUILD },
    rule,
    (a, c) => c.rest.delete(`/guilds/${a.guildId}/auto-moderation/rules/${a.ruleId}`),
  ),
];
