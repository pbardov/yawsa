module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true,
  },
  extends: ['airbnb-base'],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    'no-continue': 'off',
    'import/extensions': 'off',
    'no-plusplus': 'off',
    'no-underscore-dangle': 'off',
    'react/forbid-prop-types': 'off',
    'no-console': 'off',
    'comma-dangle': 'off',
    'react/jsx-filename-extension': 'off',
    'class-methods-use-this': 'off',
    'no-await-in-loop': 'off',
    'no-restricted-syntax': 'off',
    'no-promise-executor-return': 'off',
    'no-restricted-exports': 'off'
  },
};
