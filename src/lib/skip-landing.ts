/**
 * The front page is for someone who has not used the app yet. A browser that already has groups
 * goes straight to them, as the installed app does: its manifest starts at /groups, so only a
 * browser ever lands on "/".
 *
 * This is the script half, for a full page load. The root layout inlines it at the top of the
 * body, so it runs while the HTML is still being parsed, before the front page has painted.
 * Placed in the page itself it would also arrive with client-side navigations, as an element
 * React creates and never runs; those are `SkipLanding`'s, in `components/skip-landing`.
 *
 * `recentGroups` is the list the groups page shows (`app/groups/recent-groups-helpers`).
 */
export function skipLandingScript(basePath: string) {
  const home = JSON.stringify(basePath)
  const groups = JSON.stringify(`${basePath}/groups`)
  return `try{var p=location.pathname.replace(/\\/$/,'');if(p===${home}){var g=JSON.parse(localStorage.getItem('recentGroups')||'[]');if(Array.isArray(g)&&g.length)location.replace(${groups})}}catch(e){}`
}
