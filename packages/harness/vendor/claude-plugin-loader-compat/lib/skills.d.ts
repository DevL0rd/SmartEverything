/**
 * Skill provider serving pre-parsed Claude plugin skills. Bodies are parsed
 * eagerly at loader startup (fail loud), so `list` and `get` are immediate
 * lookups over an in-memory catalog. One provider instance serves every
 * loaded plugin; candidate order follows the deterministic plugin order, so
 * duplicate skill names across plugins resolve to the earlier plugin.
 * @module @deepseek-ai/dsh-claude-plugin-loader/skills
 */
import type { SkillProvider } from '@deepseek-ai/dsh-skill';
import type { ClaudeSkillFile } from './manifest.ts';
/** Registry name of the Claude plugin skill provider. */
export declare const CLAUDE_PLUGIN_SKILL_PROVIDER = "claude-plugin";
/**
 * Rank of Claude plugin skills in the registry's lower-wins ladder: below
 * user-level `dsh` skills (400) so a user's own skills shadow plugin skills,
 * and above bundled skills (600) so plugins extend a stock deployment.
 */
export declare const CLAUDE_PLUGIN_SKILL_RANK = 350;
/** One provider entry: a parsed skill file plus its owning plugin's identity. */
export interface PluginSkillEntry {
    /** Owning plugin's manifest name, exposed as `source` and `metadata.plugin`. */
    readonly pluginName: string;
    readonly pluginVersion?: string;
    /** Absolute plugin root, available for diagnostics. */
    readonly pluginRoot: string;
    readonly skill: ClaudeSkillFile;
}
/**
 * Create a skill provider over the given pre-parsed entries.
 * @param entries - provider entries in deterministic plugin order.
 * @returns the provider, ready for `ctx.skills.registerProvider()`.
 */
export declare function createClaudePluginSkillProvider(entries: readonly PluginSkillEntry[]): SkillProvider;
