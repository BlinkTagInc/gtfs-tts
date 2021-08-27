module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'xo',
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    indent: ['error', 2],
    'object-curly-spacing': [
      'error',
      'always',
    ],
  },
};
