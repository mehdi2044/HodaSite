"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
type Target = { href: string; pathname: string; token: symbol };
const Context = createContext<{
  target: Target | null;
  set: React.Dispatch<React.SetStateAction<Target | null>>;
} | null>(null);
export function StorefrontProductProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [target, set] = useState<Target | null>(null);
  return (
    <Context.Provider value={{ target, set }}>{children}</Context.Provider>
  );
}
/** Mounted only after the server has resolved an active public product. */
export function StorefrontProductTarget({ href }: { href: string }) {
  const state = useContext(Context);
  const set = state?.set;
  const pathname = usePathname();
  useEffect(() => {
    const token = Symbol();
    set?.({ href, pathname, token });
    return () =>
      set?.((current) => (current?.token === token ? null : current));
  }, [set, href, pathname]);
  return null;
}
export function useStorefrontProductHref() {
  const state = useContext(Context);
  const pathname = usePathname();
  return state?.target?.pathname === pathname ? state.target.href : null;
}
