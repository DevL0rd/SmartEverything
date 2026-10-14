import { createUserMessage } from "@deepseek-ai/dsh-llm";
const CLAUDE_PLUGIN_ROOT = "${CLAUDE_PLUGIN_ROOT}";
function substitute(value, pluginRoot) {
  return value.replaceAll(CLAUDE_PLUGIN_ROOT, pluginRoot);
}
function renderCommandBody(body, rawInput, pluginRoot) {
  const input = rawInput.trim();
  let rendered;
  if (body.includes("$ARGUMENTS")) {
    rendered = body.replaceAll("$ARGUMENTS", input);
  } else if (/\$[1-9](?!\d)/u.test(body)) {
    const positionals = input === "" ? [] : input.split(/\s+/u);
    rendered = body.replace(/\$([1-9])(?!\d)/gu, (_match, digit) => positionals[Number(digit) - 1] ?? "");
  } else if (input !== "") {
    rendered = `${body.trimEnd()} ${input}`;
  } else {
    rendered = body;
  }
  return rendered.includes(CLAUDE_PLUGIN_ROOT) ? substitute(rendered, pluginRoot) : rendered;
}
function sanitizeMcpServerName(pluginName, serverKey) {
  const sanitized = `${pluginName}-${serverKey}`.toLowerCase().replace(/[^a-z0-9_-]/gu, "-").replace(/-+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 32);
  if (sanitized === "") {
    throw new Error(`could not derive an MCP server name from plugin "${pluginName}" and server key "${serverKey}"`);
  }
  return sanitized;
}
function mapMcpServer(entry, options) {
  const { pluginName, pluginRoot, serverKey, toolCallTimeoutMs, failOnStartupError } = options;
  const serverName = sanitizeMcpServerName(pluginName, serverKey);
  const label = `MCP server "${serverKey}" in plugin "${pluginName}"`;
  const type = entry.type ?? "stdio";
  if (type !== "stdio" && type !== "sse" && type !== "http") throw new Error(`${label} has unsupported "type" ${JSON.stringify(type)}`);
  if (type === "sse") {
    return { kind: "skip", reason: `${label} uses the "sse" transport, which the harness does not support` };
  }
  if (type === "http") {
    const url = entry.url;
    if (typeof url !== "string" || url === "") throw new Error(`${label} has no string "url"`);
    const headers = {};
    const rawHeaders = entry.headers;
    if (rawHeaders !== void 0) {
      if (typeof rawHeaders !== "object" || rawHeaders === null || Array.isArray(rawHeaders)) throw new Error(`${label} has non-object "headers"`);
      for (const [key, value] of Object.entries(rawHeaders)) {
        if (typeof value !== "string") throw new Error(`${label} has a non-string "headers" value`);
        headers[key] = substitute(value, pluginRoot);
      }
    }
    return {
      kind: "mount",
      config: { transport: "streamable-http", serverName, url: substitute(url, pluginRoot), headers, toolCallTimeoutMs, failOnStartupError }
    };
  }
  const command = entry.command;
  if (typeof command !== "string" || command === "") throw new Error(`${label} has no string "command"`);
  const args = [];
  const rawArgs = entry.args;
  if (rawArgs !== void 0) {
    if (!Array.isArray(rawArgs) || rawArgs.some((arg) => typeof arg !== "string")) throw new Error(`${label} has non-string "args"`);
    args.push(...rawArgs.map((arg) => substitute(arg, pluginRoot)));
  }
  const env = {};
  const rawEnv = entry.env;
  if (rawEnv !== void 0) {
    if (typeof rawEnv !== "object" || rawEnv === null || Array.isArray(rawEnv)) throw new Error(`${label} has non-object "env"`);
    for (const [key, value] of Object.entries(rawEnv)) {
      if (typeof value !== "string") throw new Error(`${label} has a non-string "env" value`);
      env[key] = substitute(value, pluginRoot);
    }
  }
  const rawCwd = entry.cwd;
  if (rawCwd !== void 0 && typeof rawCwd !== "string") throw new Error(`${label} has a non-string "cwd"`);
  const cwd = rawCwd === void 0 ? "" : substitute(rawCwd, pluginRoot);
  return {
    kind: "mount",
    config: { transport: "stdio", serverName, command: substitute(command, pluginRoot), args, env, cwd, toolCallTimeoutMs, failOnStartupError }
  };
}
function buildCommandDefinition(command, pluginRoot) {
  return {
    name: command.name,
    description: command.description,
    ...command.argumentHint !== void 0 ? { input: { hint: command.argumentHint } } : {},
    handler: ({ agent, rawInput }) => {
      agent.steer(createUserMessage({
        content: [{ type: "text", text: renderCommandBody(command.body, rawInput, pluginRoot) }],
        source: { kind: "user" }
      }));
      return { kind: "success" };
    }
  };
}
export {
  buildCommandDefinition,
  mapMcpServer,
  renderCommandBody,
  sanitizeMcpServerName
};
