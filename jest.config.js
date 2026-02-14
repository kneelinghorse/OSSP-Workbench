/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  // Custom transformer: regex-strips import.meta.url patterns, then babel-jest
  // converts ESM→CJS. No --experimental-vm-modules needed.
  transform: { '^.+\\.(t|j)sx?$': '<rootDir>/tests/transform.cjs' },
  // ESM-only npm packages that need babel transformation
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|ora|cli-spinners|log-symbols|is-unicode-supported|strip-ansi|ansi-regex|inquirer|node-fetch|data-uri-to-buffer|fetch-blob|formdata-polyfill|lru-cache|p-retry)/)'
  ],
  testMatch: [
    '**/tests/**/*.test.(ts|js)',
    '**/tests/**/*.spec.(ts|js)'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/artifacts/'
  ],
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/tests/**',
    '!**/scripts/**',
    '!**/bin/**',
    '!**/examples/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testTimeout: 30000,
  maxWorkers: 2,
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // Extensionless ESM paths used in tests
    '^\\.\\./\\.\\./packages/runtime/importers/openapi/importer$': '<rootDir>/packages/runtime/importers/openapi/importer.js',
    '^\\.\\./\\.\\./packages/runtime/importers/postgres/importer$': '<rootDir>/packages/runtime/importers/postgres/importer.js',
    // Map CLI commands in tests to CJS shims for isolation
    '^\\.\\./\\.\\./packages/runtime/cli/commands/discover$': '<rootDir>/tests/_shims/commands/discover.cjs',
    '^\\.\\./\\.\\./packages/runtime/cli/commands/review$': '<rootDir>/tests/_shims/commands/review.cjs',
    '^\\.\\./\\.\\./packages/runtime/cli/commands/approve$': '<rootDir>/tests/_shims/commands/approve.cjs',
    '^\\.\\./\\.\\./packages/runtime/cli/commands/governance$': '<rootDir>/tests/_shims/commands/governance.cjs',

    '^\\.\\./\\.\\./packages/runtime/cli/utils/output$': '<rootDir>/tests/_shims/utils/output.cjs',
    '^\\.\\./\\.\\./packages/runtime/cli/utils/detect-ci$': '<rootDir>/tests/_shims/utils/detect-ci.cjs'
  }
};
