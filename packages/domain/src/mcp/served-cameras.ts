import type { Served } from './served-types';

export const SERVED_CAMERAS = [
  {
    name: 'history_read',
    area: 'history',
    access: 'read',
    title: 'Device history',
    line: 'How a value changed over time',
    description:
      'How one capability of one device changed over a time range, raw or bucketed; deviceId and the capability key come from device_find and device_read. Not for events such as motion or the doorbell (event_find).',
    route: { part: 'history_read' },
  },
  {
    name: 'event_find',
    area: 'history',
    access: 'read',
    title: 'Find events',
    line: 'Motion, doorbell, alarms and more',
    description:
      'Events newest first (motion, people, doorbell, alarms, leaks, automations, apps opening or closing on a computer) with snapshots; signal rows are the other events in the activity feed, narrowed with source and signalKind from signal_read. Not for how a value changed (history_read).',
    route: { part: 'event_find' },
  },
  {
    name: 'camera_read',
    area: 'cameras',
    access: 'read',
    title: 'Camera pictures',
    line: 'Live or saved',
    description:
      'Pictures from home cameras: live ones taken now from several cameras or rooms, or the newest saved picture or a recording’s snapshot; camera deviceIds come from device_find (family camera). Not for a computer or phone screen (sight_look).',
    route: {
      key: 'view',
      default: 'live',
      branches: {
        live: {
          part: 'take_camera_snapshots',
          line: 'Pictures taken now from cameras by deviceIds or rooms',
        },
        saved: {
          part: 'get_camera_snapshot',
          line: 'The newest saved picture, or one recording’s snapshot',
        },
      },
    },
  },
  {
    name: 'sight_look',
    area: 'cameras',
    access: 'read',
    title: 'Look at one thing',
    line: 'A camera, a screen or a window, once',
    description:
      'One still picture taken now to look at: a home camera, a computer’s screen, the window in front on a computer, or a paired phone’s screen. Use it before computer_use to see where to click. A phone camera needs a call in the app.',
    route: { part: 'see' },
  },
  {
    name: 'camera_record',
    area: 'cameras',
    access: 'control',
    title: 'Record a clip',
    line: '5 seconds to 5 minutes',
    description:
      'Records a clip of 5 to 300 seconds from one camera and saves it with the camera’s recordings. Returns the recording id once it is saved.',
    route: { part: 'camera_record' },
  },
  {
    name: 'transcript_read',
    area: 'cameras',
    access: 'read',
    title: 'Read transcripts',
    line: 'What was heard, search, status',
    description:
      'What cameras, phones, computers and plugins heard: the newest speech page by page, the lines around one line, a search, the list of transcripts, one transcript, whether each source is transcribing, or how long transcripts are kept and the daily budget. Owner only. Not for who hears the AI’s name (listening_read).',
    route: {
      key: 'view',
      default: 'feed',
      branches: {
        feed: {
          part: 'read_camera_transcript_feed',
          line: 'The newest speech, page by page, optionally of one source or transcript',
        },
        range: { part: 'read_camera_transcript_range', line: 'The speech around one line' },
        search: {
          part: 'search_camera_transcript_feed',
          line: 'Find speech by words, with the time of each line',
        },
        list: { part: 'list_transcripts', line: 'Transcripts with their source and times' },
        session: { part: 'read_transcript', line: 'One transcript with its lines' },
        status: { part: 'read_transcript_status', line: 'Whether each source is transcribing now' },
        settings: {
          part: 'read_transcript_settings',
          line: 'Days transcripts are kept and the daily budget',
        },
      },
    },
  },
  {
    name: 'transcript_edit',
    area: 'cameras',
    access: 'control',
    title: 'Edit transcripts',
    line: 'Delete one, keep days, daily budget',
    description:
      'Deletes one transcript with all its lines, or changes how many days transcripts are kept and the most transcribing may spend in a day. Owner only. Not for whether a device writes down speech (listening_edit).',
    route: {
      key: 'action',
      branches: {
        delete: {
          part: 'delete_transcript',
          line: 'Delete one transcript; a conversation still in progress stays',
        },
        settings: {
          part: 'update_transcript_settings',
          line: 'Days transcripts are kept or the daily transcribing budget',
        },
      },
    },
  },
  {
    name: 'listening_read',
    area: 'cameras',
    access: 'read',
    title: 'Read listening',
    line: 'Who hears the AI’s name, state, last wake',
    description:
      'Every camera, phone, computer, Discord and walkie channel that can hear the AI’s name: whether it listens and writes down speech, its state, sensitivity, a phone’s power mode, its last wake claims and who answered. Cameras, walkie and Discord are heard by the listening computer (home setting ear_host_device_id). Owners see all, members their own phones and computers.',
    route: { part: 'listening_read' },
  },
  {
    name: 'listening_edit',
    area: 'cameras',
    access: 'control',
    title: 'Edit listening',
    line: 'Name listening, writing down, sensitivity',
    description:
      'Switches one source’s listening for the AI’s name or its writing down of speech, or changes its sensitivity or a phone’s power mode; sourceKey comes from listening_read. Owners change any camera, phone or computer, members only their own phone or computer.',
    route: { part: 'update_listening' },
  },
] as const satisfies readonly Served[];
