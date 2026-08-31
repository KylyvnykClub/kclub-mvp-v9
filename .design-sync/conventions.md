# KCLUB component conventions

KCLUB is a private business club: gold-on-neutral, uppercase display type, quiet
surfaces. Components are shadcn/radix built for the kclub app.

## Setup

- Components need no global provider, with one exception: `DialogContent` reads
  next-intl context. When a design uses `Dialog`, wrap the app root in
  `DsPreviewProvider` (exported from the bundle) — without it the dialog throws
  and renders nothing. Wrapping the whole app is always safe.
- Toasts: `Toaster` and `toast` both come from this bundle (`toast.success(...)`,
  `toast(...)`). Render one `<Toaster position="bottom-right" />` at the root.
- Sidebar screens: everything sidebar-related must sit inside `SidebarProvider`.
  For a canvas that should not be viewport-fixed, use `<Sidebar collapsible="none">`.

## Styling idiom

The stylesheet is **compiled** Tailwind — only classes the kclub app already
uses exist. Do not invent arbitrary utilities (`bg-[#hex]`, unseen class names
silently do nothing). Style in this order:

1. Component props/variants first: `Button` `variant` = default | secondary |
   outline | ghost | link | destructive, `size` = sm | default | lg | icon;
   `Badge` `variant` = default | secondary | outline | destructive.
2. Semantic utility classes that ship in the CSS: `bg-background`, `bg-muted`,
   `bg-primary`, `bg-accent`, `bg-card`, `text-foreground`,
   `text-muted-foreground`, `text-accent-ink`, `text-primary-foreground`,
   `border-border`, `rounded-md`, `rounded-lg`, `shadow-md`, plus common
   layout/spacing (`flex`, `grid`, `gap-2..8`, `p-4`, `px-6`, `mt-8`,
   `items-center`, `justify-between`, `max-w-2xl`, `text-sm`, `text-xl`,
   `font-bold`, `font-black`, `uppercase`).
3. Inline styles for bespoke layout glue — the shipped previews do exactly this.

Design tokens (CSS custom properties, all defined in the shipped CSS):
`--background`, `--foreground`, `--card`, `--muted`, `--muted-foreground`,
`--primary` (#b18a44 gold), `--accent` (#d4af37 bright gold, fills only),
`--accent-ink` (legible gold for text), `--secondary`, `--destructive`,
`--border`, `--ring`, `--font-body` (Manrope), `--font-heading` (Oxanium).
Brand rule: bright gold `--accent` is a fill color; gold TEXT must use
`--accent-ink` / `text-accent-ink` (contrast).

Typography: body is Manrope; display headings are Oxanium, usually uppercase
with wide tracking (`font-black uppercase` plus inline `letterSpacing: "0.18em"`,
`fontFamily: "var(--font-heading)"`).

## Where the truth lives

Read `styles.css` (imports `_ds_bundle.css` — every class and token that
exists) and each component's `<Name>.prompt.md` / `<Name>.d.ts` before styling.

## Idiomatic example

```jsx
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
} from "kclub";

<Card style={{ maxWidth: 380 }}>
  <CardHeader>
    <CardTitle>Aurora Consulting</CardTitle>
    <CardDescription>
      Legal advisory for founders expanding into the EU.
    </CardDescription>
  </CardHeader>
  <CardContent>
    <div style={{ display: "flex", gap: 8 }}>
      <Badge>Verified partner</Badge>
      <Badge variant="secondary">Consulting</Badge>
    </div>
  </CardContent>
  <CardFooter style={{ display: "flex", gap: 12 }}>
    <Button size="sm">View offer</Button>
    <Button size="sm" variant="outline">
      Contact
    </Button>
  </CardFooter>
</Card>;
```
