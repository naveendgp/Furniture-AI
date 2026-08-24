# Studio AI — AI Interior Design & Furniture Visualization

A premium, production-grade SaaS UI for designing and visualizing rooms with AI.
Built for non-technical users: guided flows, one primary action per screen, a
visual-first experience, full light/dark theming, and accessible interactions.

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript**
- **Tailwind CSS v4** (CSS-first `@theme`, design tokens in `globals.css`)
- **Framer Motion** — page transitions, staggered grids, micro-interactions
- **Recharts** — budget visualizations
- **next-themes** — light / dark mode
- **lucide-react** — icons

> The Design Studio canvas is rendered as a polished visual mock. It is the
> drop-in integration point for **React Three Fiber + Drei** — see
> `src/app/studio/page.tsx` (search for "Integration point").

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
```

## Architecture

```
src/
├── app/
│   ├── layout.tsx          # ThemeProvider + AppShell
│   ├── globals.css         # Design system: tokens, glass, gradients, motion
│   ├── page.tsx            # Dashboard (hero, recent projects, inspirations, AI recs)
│   ├── projects/           # Project grid + empty state
│   ├── new/                # 5-step creation wizard (upload → style → review → generate)
│   ├── studio/             # Immersive canvas + context panel + floating dock
│   ├── assistant/          # ChatGPT-style AI chat with suggestion cards
│   ├── library/            # Pinterest-style masonry, search + filters
│   ├── gallery/            # Before/After slider + render variations
│   ├── budget/             # Recharts donut + cost breakdown
│   ├── settings/           # Profile / appearance / toggles
│   ├── loading.tsx         # Skeleton loaders
│   ├── error.tsx           # Error state
│   └── not-found.tsx       # 404
├── components/
│   ├── shell/              # Sidebar (collapsible), Topbar, MobileNav, AppShell
│   ├── ui/                 # Button, Card, Badge, Skeleton, Page, primitives
│   ├── project-card.tsx
│   └── theme-provider.tsx
└── lib/
    ├── data.ts             # Mock data (swap for TanStack Query in production)
    └── utils.ts            # cn(), INR formatting
```

## Design system

Tokens live as CSS variables in `globals.css` and are exposed to Tailwind via
`@theme inline`. Two complete palettes (light/dark) cover surfaces, text, brand
(indigo → purple gradient), borders, and a layered shadow scale. Utilities:
`.glass` (glassmorphism), `.brand-gradient`, `.text-gradient`, `.skeleton`,
`.app-aurora` (ambient backdrop). Radii are 16–28px throughout.

## Accessibility

- Visible `:focus-visible` rings, `aria-label`s on icon buttons, `role="switch"`
  toggles, semantic landmarks.
- Large (≥40px) tap targets, WCAG-minded contrast in both themes.
- `prefers-reduced-motion` disables animation globally.
