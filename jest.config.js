module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
  roots: [
    '<rootDir>/test/unit/aws-lambda',
    '<rootDir>/test/unit/meeting-bot',
    '<rootDir>/apps/aws-lambda',
  ],
  testMatch: ['**/?(*.)+(spec|test).js'],
  modulePaths: [
    '<rootDir>/scenarios/lambda/meeting-bot/node_modules',
    '<rootDir>/apps/aws-lambda/node_modules',
  ],
  collectCoverageFrom: [
    'apps/aws-lambda/**/*.js',
    'scenarios/lambda/meeting-bot/**/*.js',
    '!apps/aws-lambda/node_modules/**',
    '!apps/aws-lambda/**/*.test.js',
    '!scenarios/lambda/meeting-bot/node_modules/**',
  ],
};
