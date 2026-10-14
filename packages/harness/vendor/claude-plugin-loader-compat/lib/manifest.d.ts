/**
 * Claude plugin source-tree discovery and parsing: locate `.claude-plugin/plugin.json`
 * roots, read the manifest, and parse each mapped component file (skills, commands,
 * agents, hooks, MCP servers) into typed records. File parsing is the loader's
 * hostile-input boundary: every format error fails loud at load with the absolute
 * path of the offending file, so a broken plugin never mounts a partial surface.
 * Claude-valid files the harness cannot serve (agent bodies with `{{…}}` groups)
 * parse here and are skipped at mount with a warning.
 * @module @deepseek-ai/dsh-claude-plugin-loader/manifest
 */
/** Directory inside a plugin root that holds the `plugin.json` manifest. */
export declare const PLUGIN_MANIFEST_DIR = ".claude-plugin";
/** Manifest filename inside {@link PLUGIN_MANIFEST_DIR}. */
export declare const PLUGIN_MANIFEST_FILE = "plugin.json";
/**
 * Default recursion depth for `roots` scanning. Deep enough for the marketplace
 * cache layout `cache/<org>/<plugin>/<version>/` (4 levels below the root).
 */
export declare const DEFAULT_MAX_SCAN_DEPTH = 4;
/** Upper bound for `roots` recursion, keeping startup discovery bounded. */
export declare const MAX_SCAN_DEPTH = 16;
/** Command and agent name grammar shared with the harness slash-command registry. */
export declare const COMMAND_NAME: RegExp;
/**
 * Parsed `plugin.json` metadata. Only `name` is required by the Claude Code
 * plugin manifest; the rest is passthrough metadata surfaced to diagnostics.
 */
export interface PluginMetadata {
    /** Unique plugin name; duplicate names across loaded plugins are rejected. */
    readonly name: string;
    readonly description?: string;
    readonly version?: string;
    readonly author?: string | {
        readonly name?: string;
        readonly email?: string;
        readonly url?: string;
    };
    readonly homepage?: string;
    readonly repository?: string | {
        readonly type?: string;
        readonly url?: string;
    };
    readonly license?: string;
    readonly keywords?: readonly string[];
}
/** Parsed `skills/<name>/SKILL.md` file. */
export interface ClaudeSkillFile {
    /** Kebab-case skill name from the `name` frontmatter field (required). */
    readonly name: string;
    /** Routing description from the `description` frontmatter field (required). */
    readonly description: string;
    /** Optional `argument-hint` guidance, surfaced as the harness `whenToUse`. */
    readonly argumentHint?: string;
    /**
     * Frontmatter `allowed-tools` list. The harness has no per-skill tool
     * restriction seam, so this is warned about and otherwise ignored.
     */
    readonly allowedTools?: readonly string[];
    /** Frontmatter `disable-model-invocation` (default false, Claude Code default). */
    readonly disableModelInvocation: boolean;
    /** Frontmatter `user-invocable` (default false, the Claude Code plugin default). */
    readonly userInvocable: boolean;
    /** Markdown instruction body after the frontmatter. */
    readonly body: string;
    /** Absolute path to `SKILL.md`. */
    readonly path: string;
    /** Absolute directory holding the skill's resources. */
    readonly dir: string;
}
/** Parsed `commands/<name>.md` file. */
export interface ClaudeCommandFile {
    /** Command name from the file basename. */
    readonly name: string;
    /** Frontmatter `description`, else the first non-empty body line. */
    readonly description: string;
    /** Optional `argument-hint`, advertised as the command input hint. */
    readonly argumentHint?: string;
    /** Prompt template body; see `renderCommandBody` for `$ARGUMENTS` substitution. */
    readonly body: string;
    /** Absolute path to the command file. */
    readonly path: string;
}
/** Parsed `agents/<name>.md` file. */
export interface ClaudeAgentFile {
    /** Agent name from the frontmatter `name`, else the file basename. */
    readonly name: string;
    /** Frontmatter `description`; not surfaced by the harness (warned, ignored). */
    readonly description?: string;
    /** Frontmatter `tools` comma list, mapped to the subagent tool-filter allow-list. */
    readonly tools?: readonly string[];
    /** Frontmatter `model` override; not surfaced by the harness (warned, ignored). */
    readonly model?: string;
    /**
     * System-prompt body mounted as the subagent persona. Bodies containing a
     * `{{…}}` group are skipped at mount with a warning: the persona seam
     * interpolates them as prompt variables and would fail at child render.
     */
    readonly body: string;
    /** Absolute path to the agent file. */
    readonly path: string;
}
/** Parsed `.mcp.json` content: server key to raw JSON entry (validated during mapping). */
export type McpServersFile = Readonly<Record<string, Readonly<Record<string, unknown>>>>;
/** Mapped components present in one plugin root. */
export interface PluginComponents {
    readonly skills: readonly ClaudeSkillFile[];
    readonly commands: readonly ClaudeCommandFile[];
    readonly agents: readonly ClaudeAgentFile[];
    /** Absolute path to `hooks/hooks.json`, or `undefined` when absent. */
    readonly hooksFile?: string;
    /** Parsed `.mcp.json` servers; empty when the file is absent. */
    readonly mcpServers: McpServersFile;
}
/** One discovered Claude plugin: root directory, manifest, and mapped components. */
export interface LoadedPlugin {
    /** Absolute plugin root containing `.claude-plugin/`. */
    readonly root: string;
    readonly metadata: PluginMetadata;
    readonly components: PluginComponents;
}
/**
 * Split a Markdown file into YAML frontmatter and body. Frontmatter is a
 * leading block fenced by `---` lines; an unclosed fence or no fence leaves
 * the whole text as the body, matching Claude Code's reading.
 * @param text - raw file content.
 * @param label - file label used in error messages.
 * @returns the parsed frontmatter mapping (empty when absent) and the remaining body.
 */
export declare function parseMarkdownFile(text: string, label: string): {
    frontmatter: Readonly<Record<string, unknown>>;
    body: string;
};
/**
 * Parse one `SKILL.md` file.
 * @param path - absolute file path.
 * @param text - raw file content.
 * @returns the parsed skill record.
 */
export declare function parseSkillFile(path: string, text: string): ClaudeSkillFile;
/**
 * Parse one `commands/<name>.md` file.
 * @param path - absolute file path.
 * @param text - raw file content.
 * @returns the parsed command record.
 */
export declare function parseCommandFile(path: string, text: string): ClaudeCommandFile;
/**
 * Whether a persona body contains a `{{…}}` group. The harness's subagent
 * persona seam interpolates such groups as prompt variables and fails at
 * child render, so the mount step skips these agents with a warning instead.
 * @param body - the agent's body text.
 * @returns whether an interpolation group is present.
 */
export declare function hasInterpolationGroup(body: string): boolean;
/**
 * Parse one `agents/<name>.md` file.
 * @param path - absolute file path.
 * @param text - raw file content.
 * @returns the parsed agent record.
 */
export declare function parseAgentFile(path: string, text: string): ClaudeAgentFile;
/**
 * Parse `.mcp.json` content into a server map. Entries are validated for
 * object shape here; transport and field validation happen during mapping.
 * @param text - raw file content.
 * @param label - file path used in error messages.
 * @returns the server map; empty when the file carries no `mcpServers`.
 */
export declare function parseMcpJson(text: string, label: string): McpServersFile;
/**
 * Discover plugin roots from explicit `plugins` entries (kept in config order,
 * each required to exist and carry a manifest) plus `roots` entries scanned
 * recursively up to `maxScanDepth` (deterministic depth-first order). The two
 * sources are deduplicated by resolved path.
 * @param plugins - explicit plugin roots.
 * @param roots - scan roots.
 * @param maxScanDepth - recursion depth below each scan root.
 * @returns unique absolute plugin roots.
 */
export declare function discoverPluginRoots(plugins: readonly string[], roots: readonly string[], maxScanDepth: number): string[];
/**
 * Load one plugin root: parse its manifest and every mapped component.
 * Any parse failure throws with the offending path.
 * @param root - plugin root directory (explicit or discovered).
 * @returns the loaded plugin.
 */
export declare function loadPlugin(root: string): LoadedPlugin;
