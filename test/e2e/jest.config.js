/**
 * Jest Configuration for E2E Tests
 * 
 * Extended timeout for human-in-the-loop testing
 * Node environment for AWS CLI and Graph API interactions
 */

module.exports = {
  testEnvironment: 'node',
  testTimeout: 600000, // 10 minutes for human-in-the-loop tests
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.js'],
  verbose: true,
  collectCoverage: false, // E2E tests don't need coverage
  maxWorkers: 1, // Run tests serially to avoid conflicts
  
  // Display settings for better human-readable output
  bail: false, // Continue even if one test fails
  errorOnDeprecated: false,
  
  // Module paths
  moduleDirectories: ['node_modules', '<rootDir>'],
  
  // Global setup/teardown if needed
  // globalSetup: './jest.global-setup.js',
  // globalTeardown: './jest.global-teardown.js',
};
