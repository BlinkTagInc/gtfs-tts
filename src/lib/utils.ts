/*
 * Initialize configuration with defaults.
 */
export function setDefaultConfig(initialConfig) {
  const defaults = {
    skipImport: false,
    sqlitePath: '/tmp/gtfs',
  };

  return Object.assign(defaults, initialConfig);
}
