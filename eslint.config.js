import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', '.clasp.json'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        GmailApp: 'readonly',
        DriveApp: 'readonly',
        PropertiesService: 'readonly',
        ScriptApp: 'readonly',
        Utilities: 'readonly',
        MimeType: 'readonly',
        SpreadsheetApp: 'readonly',
        Drive: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  }
];
