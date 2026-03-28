# Klokan Visual Redesign Brief

> Drop this file at the root of the repo. Reference it in Claude Code with:
> _"Follow the brief in `KLOKAN_DESIGN_BRIEF.md`"_

---

## 1. Product Context

**Klokan** (klokan.live) is a Quebec-focused AI SaaS for real estate brokers.

- Brokers embed a **chat widget** on their listings or website
- Leads initiate real-time conversations with an AI assistant
- The AI auto-extracts prospect profile data: name, email, budget, property type, location, timeline
- Brokers can jump into any AI conversation at any time
- Conversations and profiles appear in the **Klokan dashboard**
- **Managers** oversee multiple brokers and can assign leads to specific brokers

Primary market: Quebec real estate brokers and their agencies. All user-facing copy defaults to **French**.

---

## 2. Brand Direction

**Warm professional.** Not cold luxury, not startup-casual. The feeling is: a trusted advisor who knows the Quebec market.

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| `brand-slate` | `#3D4A5C` | Primary text, nav, structural elements |
| `brand-terracotta` | `#C4694F` | Primary accent — CTAs, active states, urgent signals |
| `brand-sand` | `#F2EDE6` | Page background |
| `brand-white` | `#FDFAF7` | Cards, panels, modals |
| `brand-sage` | `#8A9E8C` | Secondary accent — success, assigned, online states |
| `brand-slate-light` | `#6B7A8D` | Secondary text, muted elements |

### Typography

| Role | Font | Source |
|---|---|---|
| Display / Wordmark | **Fraunces** | Google Fonts — has warmth and editorial character |
| UI Body | **DM Sans** | Google Fonts — clean, professional, slightly warm |

Never use: Inter, Roboto, Arial, system-ui, or any generic sans-serif as the primary font.

---

## 3. Tailwind Config

Extend `tailwind.config.ts` with the full brand token set:

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          slate:       '#3D4A5C',
          terracotta:  '#C4694F',
          sand:        '#F2EDE6',
          white:       '#FDFAF7',
          sage:        '#8A9E8C',
          'slate-light': '#6B7A8D',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        body:    ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
```

---

## 4. Font Setup

In `/app/layout.tsx`, load both fonts via `next/font/google`:

```tsx
import { Fraunces, DM_Sans } from 'next/font/google'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
})

// Apply both variables to <html> or <body>
```

Add to `/styles/globals.css`:

```css
:root {
  --font-display: var(--font-fraunces), serif;
  --font-body: var(--font-dm-sans), sans-serif;
}

body {
  font-family: var(--font-body);
  background-color: #F2EDE6;
  color: #3D4A5C;
}
```

---

## 5. Task 1 — Logo & Wordmark

**File:** `/components/brand/KlokanLogo.tsx`

Create two exports:

### `<KlokanMark />` — Icon only
- SVG logo mark: a speech bubble with a small house outline inside
- Single color, works cleanly at 24px and scales up
- Default fill: `brand-slate` (`#3D4A5C`); accept a `color` prop to override

### `<KlokanLogo />` — Mark + Wordmark
- Mark on the left, "Klokan" wordmark on the right
- Wordmark in Fraunces, `brand-slate`
- Accept `size` prop: `sm` | `md` | `lg`
- Export both as named exports from the same file

---

## 6. Task 2 — Lead Card Redesign

**File:** `/components/leads/LeadCard.tsx`

Replace the current flat list items. Each card represents one prospect conversation.

### Always visible
- **Name**: display extracted name, or `Prospect #[shortId]` if unnamed — never "New client"
- **Status dot**: colored circle, left of name
  - 🔴 Terracotta = active / unread messages
  - 🟢 Sage = assigned and read
  - ⚫ Slate-light = cold / 0 messages
- **Message count**: small badge, e.g. `18 msg`
- **Time since last message**: relative French format — `"il y a 3 min"`, `"hier"`, `"il y a 2 j"`

### Shown when data is available
- **Budget chip**: e.g. `750 K$` — sand background, slate text, rounded pill
- **Property line**: `achat · condo · Montréal centre-ville`
- **Timeline**: `d'ici l'été`, `dès maintenant`, etc.
- **Phone**: only if extracted, shown as a subtle link

### Assignment display
- **Unassigned**: prominent `Assigner →` button in terracotta — not a greyed badge
- **Assigned**: broker's name with a small avatar initial circle in slate

### Visual states
- **Active/unread**: 3px left border in terracotta, slightly elevated `box-shadow`
- **Assigned + read**: neutral, no border
- **Empty (0 msg)**: 70% opacity, de-emphasized

### Props interface
```ts
interface LeadCardProps {
  id: string
  name?: string
  status: 'active' | 'assigned' | 'cold'
  messageCount: number
  lastMessageAt?: Date
  budget?: number
  propertyType?: string
  transactionType?: 'achat' | 'vente' | 'location'
  location?: string
  timeline?: string
  phone?: string
  assignedBroker?: { name: string; avatarInitials: string }
  onAssign?: () => void
  onClick?: () => void
}
```

---

## 7. Task 3 — Sessions List & Filter Bar

**File:** `/components/leads/SessionsList.tsx`

The list container with its filter tab bar.

### Filter tabs
Replace current tabs with: `Récents` · `Non assignés` · `Budget ↓` · `Messages`

- Active tab: terracotta underline, slate text
- Inactive: slate-light text
- Tab bar has a warm white background, subtle bottom border in sand

### List behavior
- Unread/active leads always float to the top within their filter
- Empty-state message when no leads match: _"Aucun prospect pour le moment."_ in slate-light, centered

---

## 8. Task 4 — Customer-Facing Chat Widget

**File:** `/components/widget/ChatWidget.tsx`

This is the embed that appears on a broker's listing page. It must feel premium — a concierge tool, not a generic chatbot.

### Collapsed state (floating button)
- Terracotta circle button, bottom-right of screen
- Icon: house outline + small chat bubble overlay
- Subtle pulse animation when idle (CSS only, `animation: pulse 2s infinite`)
- On hover: slight scale up (`scale-110`), shadow deepens

### Expanded panel
- `width: 380px`, `border-radius: 16px`
- Background: `brand-white` (`#FDFAF7`)
- Soft shadow: `0 8px 32px rgba(61,74,92,0.15)`
- Smooth open animation: slide up + fade in

### Panel header
- Left: `<KlokanMark />` icon in terracotta
- Center: broker name in DM Sans medium, "En ligne" with sage dot below
- Right: minimize `—` button in slate-light

### Message area
- Scrollable, `padding: 16px`
- **AI / broker messages**: slate background (`#3D4A5C`), white text, `border-radius: 12px 12px 12px 2px`
- **Lead messages**: sand background (`#F2EDE6`), slate text, `border-radius: 12px 12px 2px 12px`
- Timestamp below each message in slate-light, small

### Input bar
- Warm white background, separated by a subtle top border
- Placeholder: _"Écrivez votre message..."_ in DM Sans, slate-light
- Send button: terracotta, arrow icon, activates on non-empty input

### Opening message (hardcoded example)
```
Bonjour ! Je suis l'assistant de [Nom du courtier].
Comment puis-je vous aider aujourd'hui ?
```

---

## 9. General Rules

- All user-facing copy in **French** (Quebec conventions)
- **Tailwind classes only** — no inline styles, no CSS modules
- Every interactive element needs a **hover state** and **focus ring** (accessibility)
- All components fully **typed in TypeScript**
- No purple gradients, no generic SaaS blue (`#0070f3` etc.)
- Components should be **self-contained** and accept props for all dynamic content
- Use `cn()` utility (clsx + tailwind-merge) for conditional class merging

---

## 10. File Summary

| File | Task |
|---|---|
| `tailwind.config.ts` | Update with brand tokens |
| `app/layout.tsx` | Add Fraunces + DM Sans via next/font |
| `styles/globals.css` | CSS variables, body defaults |
| `components/brand/KlokanLogo.tsx` | KlokanMark + KlokanLogo |
| `components/leads/LeadCard.tsx` | Redesigned lead card |
| `components/leads/SessionsList.tsx` | List container + filter tabs |
| `components/widget/ChatWidget.tsx` | Customer-facing chat widget |
