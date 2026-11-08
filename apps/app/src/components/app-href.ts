import type { Href } from 'expo-router';

type Reachable<Path> = Path extends `${string}?${string}` | `${string}#${string}` ? never : Path;

type Plain<Route> = Route extends string
  ? Reachable<Route>
  : { [Key in keyof Route]: Key extends 'pathname' ? Reachable<Route[Key]> : Route[Key] };

export type AppHref = Plain<Href>;
