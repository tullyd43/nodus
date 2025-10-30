export default {
  presets: [['@babel/preset-env', {targets: {node: 'current'}}]],
  plugins: [
    '@babel/plugin-proposal-private-methods',
    ['@babel/plugin-proposal-private-property-in-object', { loose: true }]
  ]
};
