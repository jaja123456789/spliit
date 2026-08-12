/**
 * The path prefix the app is served under.
 *
 * `next.config.mjs` reads `NEXT_PUBLIC_BASE_PATH`, and `playwright.config.ts` pins it to '' for the
 * server it starts, because the specs navigate to root-relative paths like `/groups`. Helpers that
 * build a URL have to agree with that: hard-coding a prefix here made every API-backed spec receive
 * the 404 HTML page instead of JSON ("Unexpected token '<'").
 *
 * Empty by default, so a checkout with no `NEXT_PUBLIC_BASE_PATH` set behaves the same as CI.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** Prefixes a root-relative app path with the base path, e.g. `/auth/error`. */
export function appPath(path: string): string {
  return `${BASE_PATH}${path}`
}
