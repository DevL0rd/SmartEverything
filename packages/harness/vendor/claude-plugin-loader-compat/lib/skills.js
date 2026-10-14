const CLAUDE_PLUGIN_SKILL_PROVIDER = "claude-plugin";
const CLAUDE_PLUGIN_SKILL_RANK = 350;
function buildCandidate(entry, index) {
  const { skill } = entry;
  return {
    name: skill.name,
    description: skill.description,
    ...skill.argumentHint !== void 0 ? { whenToUse: skill.argumentHint } : {},
    invocation: { modelInvocable: !skill.disableModelInvocation, userInvocable: skill.userInvocable },
    source: `claude-plugin:${entry.pluginName}`,
    provider: CLAUDE_PLUGIN_SKILL_PROVIDER,
    rank: CLAUDE_PLUGIN_SKILL_RANK,
    locator: index,
    path: skill.path,
    resourceBase: { kind: "directory", path: skill.dir },
    metadata: {
      plugin: entry.pluginName,
      ...entry.pluginVersion !== void 0 ? { pluginVersion: entry.pluginVersion } : {}
    }
  };
}
function buildDefinition(entry) {
  const { skill } = entry;
  return {
    name: skill.name,
    description: skill.description,
    ...skill.argumentHint !== void 0 ? { whenToUse: skill.argumentHint } : {},
    invocation: { modelInvocable: !skill.disableModelInvocation, userInvocable: skill.userInvocable },
    source: `claude-plugin:${entry.pluginName}`,
    provider: CLAUDE_PLUGIN_SKILL_PROVIDER,
    content: skill.body,
    path: skill.path,
    resourceBase: { kind: "directory", path: skill.dir },
    metadata: {
      plugin: entry.pluginName,
      ...entry.pluginVersion !== void 0 ? { pluginVersion: entry.pluginVersion } : {}
    }
  };
}
function createClaudePluginSkillProvider(entries) {
  return {
    name: CLAUDE_PLUGIN_SKILL_PROVIDER,
    list(_options) {
      return Promise.resolve(entries.map((entry, index) => buildCandidate(entry, index)));
    },
    get(candidate, _options) {
      const entry = typeof candidate.locator === "number" ? entries[candidate.locator] : void 0;
      return Promise.resolve(entry === void 0 ? void 0 : buildDefinition(entry));
    }
  };
}
export {
  CLAUDE_PLUGIN_SKILL_PROVIDER,
  CLAUDE_PLUGIN_SKILL_RANK,
  createClaudePluginSkillProvider
};
