module.exports = {
    verbose: true,
    testTimeout: 700000,
    forceExit: true,
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.js'],
    transform: {
        '^.+\\.[tj]sx?$': ['ts-jest', { isolatedModules: true }]
    }
}