export default {
  testEnvironment: 'node',
  transform: {
    '^.+\.js$': ['babel-jest', { rootMode: 'upward' }],
  },
  moduleNameMapper: {
    '^(\.{1,2}/.*)\\.js$': '$1',
  },
};