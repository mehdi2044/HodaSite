/** Optional fixture database, distinct from the shared test database; never a live DB. */
export function isolatedTestDatabaseUrl(
  isolated: string | undefined,
  shared: string | undefined,
  label: string,
) {
  if (!isolated) return undefined;
  const invalid = () =>
    new Error(
      label +
        " requires a differently named dedicated PostgreSQL _test database",
    );
  if (!shared) throw invalid();
  const source = new URL(shared),
    destination = new URL(isolated);
  const postgres = (url: URL) =>
    ["postgresql:", "postgres:"].includes(url.protocol);
  if (
    !postgres(source) ||
    !postgres(destination) ||
    !source.pathname.endsWith("_test") ||
    !destination.pathname.endsWith("_test") ||
    destination.pathname === source.pathname
  )
    throw invalid();
  return isolated;
}
export function isolatedTestDatabases(
  shared: string | undefined,
  fixtures: readonly { url: string | undefined; label: string }[],
) {
  const urls = fixtures
    .map(({ url, label }) => isolatedTestDatabaseUrl(url, shared, label))
    .filter((url): url is string => Boolean(url));
  if (new Set(urls.map((url) => new URL(url).pathname)).size !== urls.length)
    throw new Error("Fixture databases must be distinct from one another");
  return urls;
}
