declare module 'eslint-plugin-jsx-a11y' {
  interface FlatConfig {
    readonly rules?: Readonly<Record<string, unknown>>;
  }
  interface JsxA11yPlugin {
    readonly flatConfigs: Readonly<Record<string, FlatConfig>>;
  }
  const plugin: JsxA11yPlugin;
  export default plugin;
}
