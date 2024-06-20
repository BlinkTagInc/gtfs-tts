/*
 * Initialize configuration with defaults.
 */
export function setDefaultConfig(initialConfig) {
  const defaults = {
    skipImport: false,
  };

  return Object.assign(defaults, initialConfig);
}
