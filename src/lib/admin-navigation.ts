export type AdminNavGroup = {
  title: string;
  links: Array<{ href: string; label: string }>;
};

/** Prefer the most specific existing destination, without matching sibling prefixes. */
export function activeAdminHref(pathname: string, groups: AdminNavGroup[]) {
  return groups
    .flatMap((group) => group.links)
    .filter(
      ({ href }) =>
        pathname === href ||
        (href !== "/admin" && pathname.startsWith(`${href}/`)),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function searchable(value: string, locale: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase(locale)
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u064b-\u065f]/g, "")
    .trim();
}

/** Search only the server-supplied navigation; it cannot add a privileged destination. */
export function filterAdminNavigation(
  groups: AdminNavGroup[],
  query: string,
  locale: string,
) {
  const needle = searchable(query, locale);
  return groups
    .map((group) => ({
      ...group,
      links: searchable(group.title, locale).includes(needle)
        ? group.links
        : group.links.filter((link) =>
            searchable(link.label, locale).includes(needle),
          ),
    }))
    .filter((group) => group.links.length > 0);
}
