"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { useId, useRef, useState } from "react";
import {
  activeAdminHref,
  filterAdminNavigation,
  type AdminNavGroup,
} from "@/lib/admin-navigation";

export function AdminNavigation({
  groups,
  labels,
}: {
  groups: AdminNavGroup[];
  labels: { navigation: string; search: string; empty: string; menu: string };
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const active = activeAdminHref(pathname, groups);
  const visible = filterAdminNavigation(groups, query, locale);
  return (
    <div
      className="admin-navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="admin-menu-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {labels.menu}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <nav id={id} aria-label={labels.navigation} data-open={open}>
        <label className="admin-nav-search">
          {labels.search}
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="admin-nav-groups">
          {visible.map((group) => (
            <details key={`${group.title}:${query ? "search" : "browse"}`} open>
              <summary>{group.title}</summary>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={link.href === active ? "page" : undefined}
                  onClick={() => {
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </details>
          ))}
          {!visible.length && <p role="status">{labels.empty}</p>}
        </div>
      </nav>
    </div>
  );
}
