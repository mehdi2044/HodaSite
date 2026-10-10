type ResponsiveImageMedia = {
  originalName?: string;
  presentation?: unknown;
  url: string;
  variants: unknown;
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
  altI18n: unknown;
};

export type PreparedLookView = {
  id: string;
  label: string;
  categoryId: string;
  media: ResponsiveImageMedia;
  items: {
    productId: string;
    title: string;
    href: string;
    colorName: string;
    colorHex: string;
    media?: ResponsiveImageMedia;
    variants: { id: string; size: string; amount: string; available: number }[];
  }[];
};
