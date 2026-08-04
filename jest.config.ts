import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  coverageProvider: 'v8',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // nanoid ships ESM only, which Jest cannot `require`.
    '^nanoid$': '<rootDir>/test-mocks/nanoid.js',
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'node',
}

export default createJestConfig(config)
