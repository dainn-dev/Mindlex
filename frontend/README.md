# Mindlex — Frontend

React + Vite + TypeScript + Tailwind frontend for the Mindlex legal AI platform.
Covers **19 screens / 56 Linear issues** (UM, LC, LU, PB, CM, DC, DA, DD groups).

> **Backend:** the ASP.NET Core API lives in `../backend`. This SPA expects the API at `VITE_API_BASE_URL` (defaults to `http://localhost:5000/api` via Vite proxy).

---

## Quick start

```bash
cd frontend
npm install
cp .env.example .env       # then edit if needed
npm run dev                # http://localhost:5173
```

Production build:
```bash
npm run build              # outputs to dist/
npm run preview            # serves the build locally
```

---

## Tech stack

| Concern | Choice |
|---|---|
| Bundler | Vite 5 |
| Framework | React 18 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS 3 (theme tokens in `tailwind.config.js`) |
| Routing | React Router v6 |
| State | Zustand (auth + UI/toasts) |
| HTTP | Axios with auth interceptor |
| i18n | i18next + react-i18next (EN / VI) |
| Icons | lucide-react |

---

## Folder structure

```
src/
├── App.tsx                 — routing tree
├── main.tsx                — entry
├── index.css               — Tailwind base + component classes
├── i18n/                   — translations (en/vi)
├── lib/
│   ├── api.ts              — axios instance + auth interceptor
│   ├── auth.ts             — token storage (localStorage/sessionStorage)
│   └── utils.ts            — formatters + validators
├── store/
│   ├── authStore.ts        — useAuthStore (login, register, logout)
│   └── uiStore.ts          — useUiStore (toasts)
├── types/                  — shared TypeScript types (mirror BE contract)
├── components/
│   ├── ui/                 — Button, Input, Modal, Toast, EmptyState, …
│   ├── chat/               — ChatMessage, ChatSidebar, ChatComposer
│   ├── layouts/            — Public, App, Account, Admin layouts
│   └── ProtectedRoute.tsx  — auth + role guard
└── pages/
    ├── HomePage.tsx                 (S1 — UM14, UM18)
    ├── RegisterPage.tsx             (S2 — UM1, UM2, UM15)
    ├── EmailVerifyPage.tsx          (S3 — UM3)
    ├── LoginPage.tsx                (S4 — UM4, UM5, UM15)
    ├── ForgotPasswordPage.tsx       (S5 — UM6 part 1)
    ├── ResetPasswordPage.tsx        (S5 — UM6 part 2)
    ├── OnboardingPage.tsx           (S6 — UM19)
    ├── ChatbotPage.tsx ★            (S7 — LC1-11, DC1-5, DA1, DD1-3)
    ├── NewsFeedPage.tsx             (S8 — LU3, LU4)
    ├── NewsTopicsPage.tsx           (S9 — LU1, LU2)
    ├── DrivePage.tsx                (S10 — CM1-4, DA2)
    ├── account/
    │   ├── MyAccountPage.tsx        (S11 — UM7, UM9, UM16, LC6)
    │   ├── SubscriptionPage.tsx     (S12 — PB1, PB3, PB10, PB11)
    │   ├── CheckoutPage.tsx         (S13 — PB4, PB11) — also success/cancel
    │   └── BillingPage.tsx          (S14 — PB5, PB6, PB7, PB8, PB12)
    └── admin/
        ├── AdminUsersPage.tsx       (S15 — UM10, UM11, UM12, UM17)
        └── AdminSubscriptionsPage.tsx (S16 — PB9)
```

---

## Routing map

| Path | Element | Auth | Role |
|---|---|---|---|
| `/` | Homepage | public | — |
| `/register` | Registration | public | — |
| `/login` | Login | public | — |
| `/verify-email` | Email verification | public | — |
| `/forgot-password`, `/reset-password` | Password reset | public | — |
| `/onboarding` | First-login tour | auth | any |
| `/chatbot` ★ | Legal Chatbot | auth | any (quota gated) |
| `/news`, `/news/topics` | News feed + topics | auth | any (topics: Premium) |
| `/drive` | My Drive | auth | Admin/Premium for edit |
| `/account/*` | Profile, Subscription, Checkout, Billing | auth | — |
| `/checkout/success`, `/checkout/cancel` | Stripe return URLs | auth | — |
| `/admin/users`, `/admin/subscriptions` | Admin panels | auth | Admin only |

---

## Theme

The brand uses **navy + gold** with Inter (UI) + Playfair Display (headings):

```js
navy: "#0f1e3d"   gold: "#c9a96e"   cream: "#faf8f3"
```

Component utility classes are defined in `index.css`:
`.btn-primary`, `.btn-gold`, `.btn-outline`, `.input`, `.label`, `.card`,
`.chip`, `.chip-success`, `.chip-warn`, `.chip-danger`.

---

## API contract (expected backend endpoints)

The frontend calls these endpoints (all under `VITE_API_BASE_URL`):

**Auth** — `/auth/login`, `/auth/register`, `/auth/logout`, `/auth/verify-email`,
`/auth/verify-email/resend`, `/auth/forgot-password`, `/auth/reset-password`,
`/auth/oauth/{provider}`

**Profile** — `/profile/me`, `/profile/password`, `/profile/download`,
`/profile/onboarding/status`, `/profile/onboarding/complete`

**Chat** — `/chat/quota`, `/chat/tone`, `/chat/message`, `/chat/feedback`,
`/chat/threads`, `/chat/threads/{id}`, `/chat/threads/{tid}/uploads`,
`/chat/threads/{tid}/uploads/{uid}/compliance-check|risk-check|report`,
`/chat/messages/{id}/download|save-to-folder`

**News** — `/news/feed`, `/news/topics`, `/news/unread-count`, `/news/articles/{id}/read`

**Documents** — `/documents`, `/documents/upload`, `/documents/{id}` (PATCH, DELETE),
`/documents/{id}/tags`, `/documents/{id}/share`, `/documents/{id}/download`

**Billing** — `/plans`, `/subscriptions/me`, `/subscriptions/checkout`,
`/subscriptions/cancel`, `/subscriptions/downgrade-to-plus`,
`/billing/status`, `/billing/payments`, `/billing/payments/{id}/invoice-pdf`

**Admin** — `/admin/users` (+ `/{id}/reset-password|role|deactivate|activate|delete`),
`/admin/users/download`, `/admin/subscriptions`, `/admin/subscriptions/{id}/cancel`

---

## Adding a new locale

1. Copy `src/i18n/en.json` → `src/i18n/<lang>.json` and translate.
2. Register in `src/i18n/index.ts` (`resources` + `supportedLngs`).

---

## Linear traceability

Every page references the originating issues at the top of its file (e.g.
`// LC1 + LC6 + DC1 — …`). Full mapping in `../frontend/mindlex-screen-design.md`.

Source project: [psa-app/mindlex](https://linear.app/psa-app/project/mindlex-6eeabbbacaa3/issues)
