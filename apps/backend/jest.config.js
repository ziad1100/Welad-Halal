module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/test', '<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    // @nestjs/schedule >=5 ships ESM-only ("type": "module") — its package root
    // index.js is the CJS shim; map jest to it so ts-jest never parses ESM dist.
    '^@nestjs/schedule$': require.resolve('@nestjs/schedule'),
  },
};
