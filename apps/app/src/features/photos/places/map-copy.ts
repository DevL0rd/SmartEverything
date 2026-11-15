export const MAP_COPY = {
  empty: {
    title: 'Photos with a location show up here',
    body: "Turn on location in your phone's camera. Photos without one stay in the Library.",
  },
  offline: {
    title: 'The hub is offline',
    body: 'These are the places from your last visit. They update when the hub is back.',
  },
  unreachable: {
    title: 'The hub is offline',
    body: 'Map and places open when the hub reconnects. Your photos stay on the hub as they are.',
  },
  find: 'Find a place',
  inView: 'Places in view',
  found: 'Places found',
  noMatch: 'No place matches. Try a city, region or country.',
  noneInView: 'No places in this part of the map. Zoom out to see more.',
} as const;
