// Match only home pages, including D64 market URLs. Market syntax follows
// seo-urls.ts; active-market validation remains the middleware's responsibility.
// Export the source so the browser UI and generated worker share one contract.
export const PWA_HOME_PATH_SOURCE =
  "^/(fa|tr|en)(?:/m/[A-Za-z0-9_-]{1,40})?/?$";
const homePath = new RegExp(PWA_HOME_PATH_SOURCE);
export function isPwaHomePath(pathname: string) {
  return homePath.test(pathname);
}
