module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
  roots: [
    '<rootDir>/test/unit/aws-lambda',
    '<rootDir>/test/unit/meeting-bot',
    '<rootDir>/apps/aws-lambda',
  ],
  testMatch: ['**/?(*.)+(spec|test).js'],
  modulePaths: ['<rootDir>/lambda/meeting-bot/node_modules'],
  collectCoverageFrom: [
    'apps/aws-lambda/**/*.js',
    'lambda/meeting-bot/**/*.js',
    '!apps/aws-lambda/node_modules/**',
    '!apps/aws-lambda/**/*.test.js',
    '!lambda/meeting-bot/node_modules/**',
  ],
};
