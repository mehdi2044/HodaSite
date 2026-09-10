/** Auth middleware may see the internal proxy hostname. Keep redirects on the
 * configured public origin so browser cookies stay on their original host. */
export function adminRedirectUrl(path: string, requestUrl: string) {
  return new URL(path, process.env.APP_URL ?? new URL(requestUrl).origin);
}
