import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { isSkillName } from "@deepseek-ai/dsh-skill";
const PLUGIN_MANIFEST_DIR = ".claude-plugin";
const PLUGIN_MANIFEST_FILE = "plugin.json";
const DEFAULT_MAX_SCAN_DEPTH = 4;
const MAX_SCAN_DEPTH = 16;
const COMMAND_NAME = /^[a-z][a-z0-9_-]*$/u;
const SKIPPED_DIR_NAMES = /* @__PURE__ */ new Set(["node_modules"]);
function readJsonFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`could not read "${path}": ${String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`"${path}" is not valid JSON: ${String(error)}`);
  }
}
function stringField(data, key, label) {
  const value = data[key];
  if (value === void 0) return void 0;
  if (typeof value !== "string") throw new Error(`"${key}" in ${label} must be a string`);
  return value;
}
function booleanField(data, key, label) {
  const value = data[key];
  if (value === void 0) return void 0;
  if (typeof value !== "boolean") throw new Error(`"${key}" in ${label} must be a boolean`);
  return value;
}
function stringListField(data, key, label) {
  const value = data[key];
  if (value === void 0) return void 0;
  if (typeof value === "string") {
    const items = value.split(",").map((item) => item.trim()).filter((item) => item !== "");
    return items.length > 0 ? items : void 0;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    const items = value.map((item) => item.trim()).filter((item) => item !== "");
    return items.length > 0 ? items : void 0;
  }
  throw new Error(`"${key}" in ${label} must be a comma-separated string or a string list`);
}
function parseMarkdownFile(text, label) {
  const lines = text.replace(/^\uFEFF/u, "").split(/\r\n|\n|\r/u);
  if (lines[0] !== "---") return { frontmatter: {}, body: text };
  const closing = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closing === -1) return { frontmatter: {}, body: text };
  const yamlText = lines.slice(1, closing).join("\n");
  const body = lines.slice(closing + 1).join("\n").replace(/^\n+/u, "");
  let parsed;
  try {
    parsed = parseYaml(yamlText);
  } catch (error) {
    throw new Error(`invalid frontmatter in ${label}: ${String(error)}`);
  }
  if (parsed === null || parsed === void 0) return { frontmatter: {}, body };
  if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`frontmatter in ${label} must be a mapping of fields`);
  return { frontmatter: parsed, body };
}
function parseMetadata(raw, label) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`${label} must contain a JSON object`);
  const data = raw;
  const name = data.name;
  if (typeof name !== "string" || name.trim() === "") throw new Error(`${label} has no string "name"`);
  const description = stringField(data, "description", label);
  const version = stringField(data, "version", label);
  const homepage = stringField(data, "homepage", label);
  const license = stringField(data, "license", label);
  const authorValue = data.author;
  let author;
  if (authorValue !== void 0) {
    if (typeof authorValue === "string") {
      author = authorValue;
    } else if (typeof authorValue === "object" && authorValue !== null && !Array.isArray(authorValue)) {
      const authorData = authorValue;
      const authorName = stringField(authorData, "name", label);
      const authorEmail = stringField(authorData, "email", label);
      const authorUrl = stringField(authorData, "url", label);
      author = {
        ...authorName !== void 0 ? { name: authorName } : {},
        ...authorEmail !== void 0 ? { email: authorEmail } : {},
        ...authorUrl !== void 0 ? { url: authorUrl } : {}
      };
    } else {
      throw new Error(`"author" in ${label} must be a string or an object`);
    }
  }
  const repositoryValue = data.repository;
  let repository;
  if (repositoryValue !== void 0) {
    if (typeof repositoryValue === "string") {
      repository = repositoryValue;
    } else if (typeof repositoryValue === "object" && repositoryValue !== null && !Array.isArray(repositoryValue)) {
      const repositoryData = repositoryValue;
      const repositoryType = stringField(repositoryData, "type", label);
      const repositoryUrl = stringField(repositoryData, "url", label);
      repository = {
        ...repositoryType !== void 0 ? { type: repositoryType } : {},
        ...repositoryUrl !== void 0 ? { url: repositoryUrl } : {}
      };
    } else {
      throw new Error(`"repository" in ${label} must be a string or an object`);
    }
  }
  const keywords = stringListField(data, "keywords", label);
  return {
    name: name.trim(),
    ...description !== void 0 ? { description } : {},
    ...version !== void 0 ? { version } : {},
    ...author !== void 0 ? { author } : {},
    ...homepage !== void 0 ? { homepage } : {},
    ...repository !== void 0 ? { repository } : {},
    ...license !== void 0 ? { license } : {},
    ...keywords !== void 0 ? { keywords } : {}
  };
}
function parseSkillFile(path, text) {
  const { frontmatter, body } = parseMarkdownFile(text, path);
  const name = stringField(frontmatter, "name", path);
  if (name === void 0 || name.trim() === "") throw new Error(`skill "${path}" has no "name" in its frontmatter`);
  if (!isSkillName(name)) throw new Error(`skill name "${name}" in "${path}" is not a valid kebab-case skill name`);
  const description = stringField(frontmatter, "description", path);
  if (description === void 0 || description.trim() === "") throw new Error(`skill "${path}" has no "description" in its frontmatter`);
  if (body.trim() === "") throw new Error(`skill "${path}" has an empty body`);
  const argumentHint = stringField(frontmatter, "argument-hint", path);
  const allowedTools = stringListField(frontmatter, "allowed-tools", path);
  return {
    name,
    description,
    ...argumentHint !== void 0 ? { argumentHint } : {},
    ...allowedTools !== void 0 ? { allowedTools } : {},
    disableModelInvocation: booleanField(frontmatter, "disable-model-invocation", path) ?? false,
    userInvocable: booleanField(frontmatter, "user-invocable", path) ?? false,
    body: body.trim(),
    path,
    dir: dirname(path)
  };
}
function firstContentLine(body) {
  for (const line of body.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}
function parseCommandFile(path, text) {
  const { frontmatter, body } = parseMarkdownFile(text, path);
  const name = basename(path, ".md");
  if (!COMMAND_NAME.test(name)) throw new Error(`command file name "${name}" in "${path}" is not a valid command name`);
  const frontmatterDescription = stringField(frontmatter, "description", path);
  const description = frontmatterDescription !== void 0 && frontmatterDescription.trim() !== "" ? frontmatterDescription : firstContentLine(body);
  if (body.trim() === "") throw new Error(`command "${path}" has an empty body`);
  const argumentHint = stringField(frontmatter, "argument-hint", path);
  return {
    name,
    description,
    ...argumentHint !== void 0 ? { argumentHint } : {},
    body: body.trim(),
    path
  };
}
function hasInterpolationGroup(body) {
  const open = body.indexOf("{{");
  return open >= 0 && body.indexOf("}}", open + 2) >= 0;
}
function parseAgentFile(path, text) {
  const { frontmatter, body } = parseMarkdownFile(text, path);
  const name = stringField(frontmatter, "name", path) ?? basename(path, ".md");
  if (!COMMAND_NAME.test(name)) throw new Error(`agent name "${name}" in "${path}" is not a valid agent name`);
  const trimmed = body.trim();
  if (trimmed === "") throw new Error(`agent "${path}" has an empty body`);
  const description = stringField(frontmatter, "description", path);
  const model = stringField(frontmatter, "model", path);
  const tools = stringListField(frontmatter, "tools", path);
  return {
    name,
    ...description !== void 0 && description.trim() !== "" ? { description } : {},
    ...model !== void 0 && model.trim() !== "" ? { model } : {},
    ...tools !== void 0 ? { tools } : {},
    body: trimmed,
    path
  };
}
function parseMcpJson(text, label) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`"${label}" is not valid JSON: ${String(error)}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error(`"${label}" must contain a JSON object`);
  const servers = parsed.mcpServers;
  if (servers === void 0) return {};
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) throw new Error(`"mcpServers" in ${label} must be an object`);
  for (const [key, value] of Object.entries(servers)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`MCP server "${key}" in ${label} must be an object`);
  }
  return servers;
}
function isPluginRoot(dir) {
  return existsSync(join(dir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE));
}
function scanForPluginRoots(root, maxScanDepth, label) {
  const found = [];
  const visit = (dir, depth) => {
    if (isPluginRoot(dir)) {
      found.push(dir);
      return;
    }
    if (depth >= maxScanDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      throw new Error(`could not read "${dir}" while scanning ${label}: ${String(error)}`);
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || SKIPPED_DIR_NAMES.has(entry.name)) continue;
      visit(join(dir, entry.name), depth + 1);
    }
  };
  visit(root, 0);
  return found;
}
function assertExplicitPluginRoot(path) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) throw new Error(`Claude plugin root "${resolved}" does not exist`);
  if (!existsSync(join(resolved, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE))) {
    throw new Error(`Claude plugin root "${resolved}" has no ${PLUGIN_MANIFEST_DIR}/${PLUGIN_MANIFEST_FILE}`);
  }
  return resolved;
}
function discoverPluginRoots(plugins, roots, maxScanDepth) {
  const seen = /* @__PURE__ */ new Set();
  const ordered = [];
  const push = (dir) => {
    if (!seen.has(dir)) {
      seen.add(dir);
      ordered.push(dir);
    }
  };
  for (const plugin of plugins) push(assertExplicitPluginRoot(plugin));
  for (const root of roots) {
    const resolved = resolve(root);
    if (!existsSync(resolved)) throw new Error(`Claude plugin scan root "${resolved}" does not exist`);
    for (const found of scanForPluginRoots(resolved, maxScanDepth, `"${resolved}"`)) push(found);
  }
  return ordered;
}
function readComponents(root) {
  const skills = [];
  const skillsDir = join(root, "skills");
  if (existsSync(skillsDir)) {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isDirectory() || entry.name.startsWith(".")) continue;
      const file = join(skillsDir, entry.name, "SKILL.md");
      if (!existsSync(file)) continue;
      skills.push(parseSkillFile(file, readFileSync(file, "utf8")));
    }
  }
  const commands = [];
  const commandsDir = join(root, "commands");
  if (existsSync(commandsDir)) {
    const entries = readdirSync(commandsDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".md")) continue;
      const file = join(commandsDir, entry.name);
      commands.push(parseCommandFile(file, readFileSync(file, "utf8")));
    }
  }
  const agents = [];
  const agentsDir = join(root, "agents");
  if (existsSync(agentsDir)) {
    const entries = readdirSync(agentsDir, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".md")) continue;
      const file = join(agentsDir, entry.name);
      agents.push(parseAgentFile(file, readFileSync(file, "utf8")));
    }
  }
  const hooksFile = join(root, "hooks", "hooks.json");
  const mcpFile = join(root, ".mcp.json");
  return {
    skills,
    commands,
    agents,
    ...existsSync(hooksFile) ? { hooksFile } : {},
    mcpServers: existsSync(mcpFile) ? parseMcpJson(readFileSync(mcpFile, "utf8"), mcpFile) : {}
  };
}
function loadPlugin(root) {
  const resolved = resolve(root);
  const manifestPath = join(resolved, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
  if (!existsSync(manifestPath)) throw new Error(`Claude plugin root "${resolved}" has no ${PLUGIN_MANIFEST_DIR}/${PLUGIN_MANIFEST_FILE}`);
  return {
    root: resolved,
    metadata: parseMetadata(readJsonFile(manifestPath), manifestPath),
    components: readComponents(resolved)
  };
}
export {
  COMMAND_NAME,
  DEFAULT_MAX_SCAN_DEPTH,
  MAX_SCAN_DEPTH,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  discoverPluginRoots,
  hasInterpolationGroup,
  loadPlugin,
  parseAgentFile,
  parseCommandFile,
  parseMarkdownFile,
  parseMcpJson,
  parseSkillFile
};
