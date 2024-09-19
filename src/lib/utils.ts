/*
 * Initialize configuration with defaults.
 */
export function setDefaultConfig(initialConfig) {
  const defaults = {
    skipImport: false,
    sqlitePath: ':memory:',
  };

  return Object.assign(defaults, initialConfig);
}
