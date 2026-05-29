import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', '.clasp.json', 'src/**', 'appsscript.json'],
    files: ['lib/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    }
  }
];
