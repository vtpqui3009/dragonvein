import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'artifacts', 'public/assets'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-restricted-globals': ['error',
        { name: 'alert', message: 'Use the in-game UI.' }],
    },
  },
  {
    // the simulation must stay deterministic and headless
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng from src/core/rng.ts.' },
        { object: 'Date', property: 'now', message: 'The sim advances in ticks, not wall-clock time.' }],
      'no-restricted-imports': ['error',
        { patterns: ['three', 'three/*', '../render/*', '../ui/*', '../audio/*'] }],
    },
  },
);
