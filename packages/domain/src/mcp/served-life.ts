import type { Served } from './served-types';

export const SERVED_LIFE = [
  {
    name: 'health_read',
    area: 'health',
    access: 'read',
    title: 'Read health',
    line: 'Days, records, logs and types',
    description:
      'Health data of one person (personId from person_read; you when left out): the summary with totals (energy_in is calories eaten, today when no days are given), daily metrics, newest records, records in a range, what they logged, the record types, or watch stress days. Ranges default to the recent past. Returns days and records.',
    route: {
      key: 'view',
      branches: {
        summary: { part: 'get_health_summary', line: 'One day’s totals, sleep, activity and body' },
        daily: { part: 'read_health_daily', line: 'Daily values of chosen metrics over a range' },
        latest: { part: 'get_health_latest', line: 'The newest record of each type' },
        records: { part: 'read_health_records', line: 'Records of chosen types in a time range' },
        entries: { part: 'list_health_entries', line: 'What the person logged themselves' },
        types: { part: 'list_health_types', line: 'The record types and metrics that exist' },
        watch_days: { part: 'read_watch_days', line: 'Stress per day from the watch' },
      },
    },
  },
  {
    name: 'health_edit',
    area: 'health',
    access: 'control',
    title: 'Edit health entries',
    line: 'Add, change or delete a logged record',
    description:
      'Adds, changes or deletes a measurement or session a person logged (weight, blood pressure, a workout and other types from health_read view types); entryId comes from health_read view entries. Not for food or water (food_log). Returns the entry.',
    route: {
      key: 'action',
      branches: {
        add: { part: 'health_edit', line: 'Log a measurement or session' },
        update: { part: 'update_health_entry', line: 'Change the time or data fields of one logged entry' },
        remove: { part: 'delete_health_entry', line: 'Delete one logged entry' },
      },
    },
  },
  {
    name: 'food_find',
    area: 'nutrition',
    access: 'read',
    title: 'Find food',
    line: 'Saved foods, products and barcodes',
    description:
      'Finds foods by name or barcode in a person’s saved foods and Open Food Facts (view search), or lists their saved and recent foods (view saved). Returns the foodId food_log takes.',
    route: {
      key: 'view',
      branches: {
        search: { part: 'food_find', line: 'Foods matching a name or a barcode' },
        saved: { part: 'list_foods', line: 'Saved and recent foods' },
      },
    },
  },
  {
    name: 'food_edit',
    area: 'nutrition',
    access: 'control',
    title: 'Edit foods',
    line: 'Save, change or forget a food',
    description:
      'Saves, changes or forgets a food or drink in a person’s food list; saving needs only a name, and kind, basis (100 g or ml) and energy default. foodId comes from food_find. Not for logging what they ate (food_log).',
    route: {
      key: 'action',
      branches: {
        create: { part: 'create_food', line: 'Save a new food or drink' },
        update: { part: 'update_food', line: 'Change a saved food' },
        remove: { part: 'delete_food', line: 'Forget a saved food' },
      },
    },
  },
  {
    name: 'food_log',
    area: 'nutrition',
    access: 'control',
    title: 'Log food or water',
    line: 'A portion or a drink',
    description:
      'Logs a portion of food (foodId or barcode from food_find, or a new food inline; the meal follows the time of day) or a drink of water for a person (personId from person_read; you when left out). A linked water bottle logs its own drinks. Returns the entry with its energy.',
    route: {
      key: 'action',
      branches: {
        food: { part: 'food_log', line: 'Log a portion of a food' },
        water: { part: 'log_water', line: 'Log a drink of water in millilitres or glasses' },
      },
    },
  },
  {
    name: 'person_read',
    area: 'people',
    access: 'read',
    title: 'Read people',
    line: 'Body facts, goals and apps',
    description:
      'The people of the home with their personId, body facts, goals, scale slot and apps. Read it for the personId other tools take.',
    route: { part: 'person_read' },
  },
  {
    name: 'person_edit',
    area: 'people',
    access: 'control',
    title: 'Edit people',
    line: 'Add, change, remove, goals, scale readings',
    description:
      'Adds, changes or removes a person, links them to their scale slot, changes their daily goals, or says who stood on the scale for an unassigned reading; personId comes from person_read.',
    route: {
      key: 'action',
      branches: {
        create: { part: 'create_profile', line: 'Add a person' },
        update: { part: 'update_profile', line: 'Change a person’s details or scale slot' },
        remove: { part: 'delete_profile', line: 'Remove a person' },
        goals: { part: 'set_goals', line: 'Change fitness and nutrition goals' },
        assign_reading: {
          part: 'assign_body_reading',
          line: 'Give a scale reading to a person, or discard it',
        },
      },
    },
  },
  {
    name: 'settings_read',
    area: 'settings',
    access: 'read',
    title: 'Read settings',
    line: 'App, firewall, assistant, AI and budget',
    description:
      'Settings of one area with their current and allowed values: app and home settings, the firewall, the assistant, AI defaults, the AI budget, or the exchange rates behind shown costs. Read the area before settings_edit.',
    route: {
      key: 'view',
      branches: {
        app: { part: 'settings_read', line: 'App preferences and home settings' },
        firewall: { part: 'read_firewall', line: 'The firewall state and its plan' },
        assistant: {
          part: 'read_assistant',
          line: 'The assistant: name, voice, instructions and behaviour',
        },
        ai_defaults: { part: 'get_ai_defaults', line: 'The default model and thinking' },
        budget: { part: 'read_ai_budget', line: 'The AI spending limits' },
        exchange_rates: {
          part: 'read_exchange_rates',
          line: 'The exchange rates costs are shown in',
        },
      },
    },
  },
  {
    name: 'settings_edit',
    area: 'settings',
    access: 'control',
    title: 'Change settings',
    line: 'Preferences, home, assistant, AI and tools',
    description:
      'Changes the settings of one area: an app preference, the home, its location by name, the assistant, AI defaults, the AI budget or the switched-off tools. Read the area with settings_read first. Not for fetching data now or server repairs (settings_sync).',
    route: {
      key: 'action',
      branches: {
        preference: { part: 'set_preference', line: 'One app preference for a person or device' },
        home: { part: 'update_home', line: 'Home name, time zone and coordinates' },
        location: {
          part: 'set_home_location_by_name',
          line: 'The home location from a place name',
        },
        assistant: {
          part: 'update_assistant_settings',
          line: 'The assistant’s name, voice, instructions and behaviour',
        },
        ai_defaults: { part: 'set_ai_defaults', line: 'The default model and thinking' },
        budget: { part: 'set_ai_budget', line: 'Daily and monthly spending limits and warnings' },
        tools: { part: 'update_mcp_tools', line: 'Which tools are switched off' },
      },
    },
  },
  {
    name: 'settings_sync',
    area: 'settings',
    access: 'control',
    title: 'Refresh or fix',
    line: 'Weather, rates, models, firewall',
    description:
      'Fetches data now or fixes the server: the weather, the exchange rates or the model list, re-detects the firewall, or adds the missing firewall rules from its plan (each rule reports applied, present or failed, with sudo commands when the server cannot elevate). Read settings_read view firewall first.',
    route: {
      key: 'action',
      branches: {
        weather: { part: 'refresh_weather', line: 'Fetch the weather now' },
        exchange_rates: { part: 'refresh_exchange_rates', line: 'Fetch the exchange rates now' },
        models: { part: 'refresh_models', line: 'Download the model list now' },
        firewall: { part: 'check_firewall', line: 'Detect the firewall again' },
        fix_firewall: {
          part: 'apply_firewall',
          line: 'Add the missing firewall rules of the current plan',
        },
      },
    },
  },
  {
    name: 'talk_read',
    area: 'talk',
    access: 'read',
    title: 'Read walkie-talkie',
    line: 'Channels, members and messages',
    description:
      'Walkie-talkie channels with members, who is talking and each channel’s latest messages with what was said (view channels), or older messages of one channel (view messages).',
    route: {
      key: 'view',
      branches: {
        channels: { part: 'talk_read', line: 'Channels with members and latest messages' },
        messages: { part: 'list_talk_messages', line: 'Older messages of one channel' },
      },
    },
  },
  {
    name: 'talk_edit',
    area: 'talk',
    access: 'control',
    title: 'Edit walkie channels',
    line: 'Channels and their members',
    description:
      'Creates, changes or deletes a walkie-talkie channel (including whether the AI listens to it), or adds, changes or removes a member; channelId comes from talk_read. Not for saying something on a channel (voice_speak).',
    route: {
      key: 'action',
      branches: {
        create: { part: 'create_talk_channel', line: 'Create a channel' },
        update: { part: 'update_talk_channel', line: 'Change a channel' },
        remove: { part: 'remove_talk_channel', line: 'Delete a channel' },
        set_member: { part: 'set_talk_member', line: 'Add or change a member' },
        remove_member: { part: 'remove_talk_member', line: 'Remove a member' },
      },
    },
  },
] as const satisfies readonly Served[];
