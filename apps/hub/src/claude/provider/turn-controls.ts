import type { ProviderTurn, ProviderControl, JsonValue } from '@smarteverything/domain';

export function controlledTurn(turn: ProviderTurn, control: ProviderControl): ProviderTurn {
  if (control.action === 'set_model') return { ...turn, model: control.model };
  if (control.action === 'set_permission_mode')
    return { ...turn, options: { ...turn.options, permission_mode: control.mode } };
  if (control.action === 'set_mcp_servers')
    return { ...turn, options: { ...turn.options, mcp_servers: control.servers } };
  if (control.action === 'apply_flags')
    return flagTurn(
      {
        ...turn,
        options: {
          ...turn.options,
          flag_settings: { ...turn.options.flag_settings, ...control.values },
        },
      },
      control.values,
    );
  if (control.action === 'update_settings') return flagTurn(turn, control.values);
  return turn;
}

function flagTurn(turn: ProviderTurn, values: Record<string, JsonValue>): ProviderTurn {
  const effort = values['effortLevel'];
  const fast = values['fastMode'];
  const { fast: previousFast, ...options } = turn.options;
  return {
    ...turn,
    ...(typeof effort === 'string' || effort === null ? { effort } : {}),
    options: {
      ...options,
      ...(typeof fast === 'boolean'
        ? { fast }
        : fast !== null && previousFast !== undefined
          ? { fast: previousFast }
          : {}),
    },
  };
}
