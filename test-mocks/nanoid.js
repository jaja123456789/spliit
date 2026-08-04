// nanoid v5 ships ESM only and Jest cannot `require` it, so tests resolve it to this shim
// (see `moduleNameMapper` in jest.config.ts). Ids only need to be unique, not URL-friendly-short.
const { randomBytes } = require('crypto')

const nanoid = (size = 21) =>
  randomBytes(size).toString('base64url').slice(0, size)

module.exports = { nanoid }
