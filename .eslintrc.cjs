/* ESLint config for Vite + React project (ESLint 8 / eslintrc format). */
module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  ignorePatterns: [
    'dist',
    'dist-ssr',
    'node_modules',
    'supabase/functions/**', // Deno edge functions, different runtime
    'netlify/edge-functions/**', // Netlify edge functions (Deno runtime)
    'public/OneSignalSDK*.js', // OneSignal vendor service workers
    '*.config.js',
    '*.cjs',
  ],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react/prop-types': 'off',
    // Literal quotes/apostrophes in JSX text render fine; not a real bug.
    'react/no-unescaped-entities': 'off',
    // Allow intentional unused args prefixed with _, surface the rest.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
  },
}
