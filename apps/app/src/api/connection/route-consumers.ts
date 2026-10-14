import { connectionState } from './connection';
import { routeFor } from './active-route';

export function trustedHubOrigins(): readonly string[] {
  const connection = connectionState.get();
  if (connection.status !== 'paired') return [];
  const manager = routeFor(connection.connection);
  const current = manager.state.get();
  const endpoints = current.metadata?.endpoints ?? [];
  return [
    ...new Set(
      [
        connection.connection.url,
        ...(current.endpoint === null ? [] : [current.endpoint.url]),
        ...endpoints.map((endpoint) => endpoint.url),
      ].map((url) => new URL(url).origin),
    ),
  ];
}
