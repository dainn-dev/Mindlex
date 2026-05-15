# Mindlex — Screen Design Document

> Source: [Linear project — Mindlex](https://linear.app/psa-app/project/mindlex-6eeabbbacaa3/issues)
> Generated: 2026-05-15
> Total issues analyzed: **56** (across 8 functional groups)

Mindlex is an AI-powered legal assistant platform. Issues are grouped by **functional code prefix**, then mapped to **16 concrete screens / views** that the FE team needs to build.

---

## 1. Functional groups (prefix → meaning)

| Prefix | Group | Issue count |
|---|---|---|
| UM | User Management & Auth | 17 |
| LC | Legal Chatbot (main chat) | 11 |
| LU | Legal Updates / News | 4 |
| PB | Payment & Billing | 11 |
| CM | Content Management (My Drive) | 4 |
| DC | Document Compliance Check | 4 |
| DA | Document Anonymization | 2 |
| DD | Document Drafting | 3 |

---

## 2. Screens grouped by area

### A. PUBLIC / UNAUTHENTICATED

#### Screen 1 — Public Homepage
**Issues:** UM14, UM18

- Left column: embedded Login form (UM4 component)
- Right column: 4-image auto-scrolling carousel (6s interval, dot indicators)
- "Explore Plans" section — 3 plan cards from `GET /api/plans` (display-only, no CTAs for guests)
- FAQ section — 8 accordion entries
- Footer — © 2025 MINDLEX LIMITED + ToS + Privacy + Usage Policy + LinkedIn
- Responsive: stacked on mobile

#### Screen 2 — Registration
**Issues:** UM1, UM2, UM15

- Form fields: Full Name, Email, Password, Confirm Password, DoB (DD/MM/YYYY date picker), T&C, Privacy checkboxes
- Real-time inline validation (onChange) + error summary banner on submit
- Password complexity rules visible
- Age check ≥ 18
- "Sign in with Google" / "Sign in with Microsoft" buttons (UM15)
- Backend: `POST /api/auth/register`

#### Screen 3 — Email Verification
**Issues:** UM3

- "Please check your email" prompt page
- "Email Verified" confirmation page (after link click) → "Go to Dashboard" auto-login
- Resend Verification UI with 60s countdown
- "Verification link expired" + Resend
- Backend: `POST /api/auth/verify-email/resend`

#### Screen 4 — Login
**Issues:** UM4, UM5, UM15

- Form: Email, Password, Remember Me, Forgot Password link
- Inline + 401 error display ("Invalid email or password.")
- Social login buttons (Google + Microsoft)
- Token storage: localStorage (RememberMe) | sessionStorage
- Role-based redirect after login
- Backend: `POST /api/auth/login`

#### Screen 5 — Forgot / Reset Password
**Issues:** UM6

- Email entry → generic confirmation page (no info leak about account existence)
- Reset Password form (from email link): New + Confirm Password
- Submit-only validation (not onChange)
- "Password reset successful" page → redirect to Login

---

### B. AUTHENTICATED — MAIN APP

#### Screen 6 — Onboarding (first login)
**Issues:** UM19

- Triggered when `GET /api/profile/onboarding/status` returns `completed:false`
- Welcome banner + 5 feature cards: Legal Assistant, Legal News, Legal Drive, Legal Draft, Legal Compliance
- Tooltips on card hover
- "Example legal questions" section
- Reopen via Help menu

#### Screen 7 — Legal Chatbot (the core screen)
**Issues:** LC1, LC2, LC3, LC4, LC5, LC6, LC7, LC8, LC9, LC10, LC11, DC1, DC2, DC3, DC5, DA1, DD1, DD2, DD3

This is the **most complex screen**. Components:

- **Left sidebar** — chat history threads (LC8)
  - GET `/api/chat/threads`, auto-title (max 30 chars)
  - "..." dropdown: Rename / Delete (with confirm)
- **Message stream** — assistant + user bubbles
  - Markdown rendering
  - Source links + disclaimer (LC3)
  - Tone-aware rendering (LC2 — plain / technical badge)
  - Jurisdiction sources ordering (LC9)
  - Per-message action icons (LC5 Copy / LC7 Like / Dislike)
  - Toxic content warning bubble with red border (LC10)
  - Drafting mode actions: Download (DD3) + Save to Folder (DD2)
- **Composer (input area)**
  - Text input + send
  - Quota indicator + 429 banner with Upgrade CTA (LC1)
  - Tone toggle (Plain / Technical) — hidden for Free users (LC6)
  - Feature Dropdown: Document Drafting mode (DD1) | Compliance Check (DC1)
  - File upload zone for DC1 (DOCX/DOC drag-drop, single file)
- **Sticky Reference widget** — fixed bottom-left (LC11)
- **Anonymization toasts** — top-right (DA1)
- **Compliance results inline** — structured issue list (DC2 + DC3), Download Report button (DC5)

#### Screen 8 — News Feed
**Issues:** LU3, LU4

- Vertical card list (newest first); each card: headline, summary snippet, topic tags, pub date
- Unread cards: bold background
- Click → opens `sourceUrl` in new tab + `POST /api/news/articles/{id}/read`
- Red dot on News menu when `hasUnread:true` (polling)
- Empty state: "No news available" + `usingDefaultTopics` hint

#### Screen 9 — News Topics
**Issues:** LU1, LU2

- Premium-only (disabled chips for Free/Plus via `canEdit`)
- Grid of 10 predefined topic chips — toggle select/deselect
- "Save Interests" → `PUT /api/news/topics`
- "Clear All" → confirmation popup "Remove All Selected Topics?"
- Success toast "Topic preferences updated successfully"

#### Screen 10 — My Drive
**Issues:** CM1, CM2, CM3, CM4, DA2

- File table (columns: Name, Type, Date, Size, Source, Tags, Actions)
- Upload zone (drag-drop, batch ≤ 5), spec error toasts
- Storage quota indicator
- Row "..." dropdown: Rename / Delete / Edit Tags / Share / Download
- Share popup — multi-email input (semicolon, 1-5)
- Tag filter dropdown + Auto-tag chips (CM3)
- Anonymization status badge per file (DA2)

---

### C. ACCOUNT & BILLING

#### Screen 11 — My Account
**Issues:** UM7, UM9, UM16, LC6

- Email (view-only) / Full Name (Edit modal) / DoB (view-only)
- Change Password modal — Current/New/Confirm with complexity
- Tone toggle (LC6) — Plain/Technical (paid roles only)
- "Download My Data" button (UM16) → `account_info.txt`
- "Log Out" with confirmation popup (UM9)

#### Screen 12 — Subscription Plans
**Issues:** PB1, PB3, PB10

- Currency dropdown (EUR / GBP / USD) — persists in localStorage
- Monthly / Annual toggle
- 3 plan cards: Free / Plus / Premium (price + features)
- CTA matrix based on `currentTier`:
  - Free → Current Plan (disabled) / Upgrade to Plus / Upgrade to Premium
  - Plus → Upgrade to Premium / Downgrade button on Premium card
  - Premium → similar with downgrade logic
- Cross-cycle upgrade confirmation popup (PB10)

#### Screen 13 — Checkout Flow
**Issues:** PB4, PB11

- Pre-checkout page (Mindlex-hosted): plan summary + monthly/annual toggle
- "Continue to Payment" → `POST /api/subscriptions/checkout` → redirect to Stripe Checkout
- Success URL: "Welcome to Mindlex Premium" + "Back to Chatbot" CTA
- Cancel URL: back to PB1
- Disclaimer: "Prices may include applicable taxes based on your billing address" (PB11)

#### Screen 14 — My Billing
**Issues:** PB5, PB6, PB7, PB8, PB12

- **Subscription Status section** (PB5)
  - Free Active: Role + Status + Upgrade
  - Paid Active: + Next Payment Due + Last Payment Date
  - Canceled / Expired: end-of-access message
- **Cancel Subscription** (PB6) — confirmation popup
- **Payment History table** (PB7) — Date / Plan / Amount / Status / Download (Paid only)
- **Invoice PDF download** (PB8) — `Invoice_<TxId>.pdf`
- **Refund Info** (PB12) — static text with `mailto:info@mindlex.ai`

---

### D. ADMIN

#### Screen 15 — Admin: User Management
**Issues:** UM10, UM11, UM12, UM17

- User list table per spec columns (Full Name, Email, DoB, Date of Deletion, Payment Dates, Plan, Status…)
- Actions dropdown per row:
  - Reset Password (UM10) — confirm popup; disabled for Admin / self
  - Edit Role (UM11) — popup with Role dropdown + mandatory Reason textarea (max 5000)
  - Deactivate / Activate (UM12) — confirm modal
  - Delete (UM12) — confirm modal + SR2 retention note on partial mode
- "Download" button → `account_info.csv` (UM17)

#### Screen 16 — Admin: Subscription Management
**Issues:** PB9

- Subscription list: `GET /api/admin/subscriptions`
- Click user → details: per PB9 conditional field table
- Editable Current Role dropdown (reuses UM11 popup)
- "Cancel Subscription" → confirm popup → `POST /api/admin/subscriptions/{id}/cancel`

---

## 3. Cross-cutting concerns

| Concern | Issues | Notes |
|---|---|---|
| **Tone (plain / technical)** | LC2, LC6 | Toggle in My Account + chatbot; hidden for Free |
| **Anonymization** | DA1, DA2 | Top-right toasts when PII removed |
| **Quota / paywall gating** | LC1, PB10 | 429 banner with role-aware Upgrade CTA |
| **Source citations** | LC3, LC9 | Below assistant message; jurisdiction-sorted |
| **Toxic / greeting** | LC10 | Pre-filtered server side; FE renders flag |
| **Onboarding** | UM19 | One-shot + Help menu re-open |
| **Responsive** | All FE | Desktop + mobile breakpoint mentioned in most issues |

---

## 4. Suggested information architecture

```
Public
 ├── / (Homepage UM14/UM18)
 ├── /register
 ├── /login
 ├── /verify-email
 ├── /forgot-password
 └── /reset-password

App (authenticated)
 ├── /chatbot         ← Default landing (Screen 7)
 ├── /news            ← LU3
 │    └── /news/topics  ← LU1
 ├── /drive           ← CM1
 ├── /account
 │    ├── /account/profile  ← UM7
 │    ├── /account/subscription  ← PB1
 │    ├── /account/billing       ← PB5
 │    └── /account/privacy       ← UM16
 ├── /checkout
 │    ├── /checkout/success
 │    └── /checkout/cancel
 └── /onboarding      ← UM19

Admin
 ├── /admin/users     ← UM10/11/12/17
 └── /admin/subscriptions  ← PB9
```

---

## 5. Component library (DRY checklist)

These components are reused 3+ times — build first:

- `<ConfirmModal>` (UM9, UM11, UM12, PB6, PB10, CM1, LC8…)
- `<Toast>` top-right (DA1, DC5, DD2, DD3, PB6…)
- `<RoleAwareCTA>` (PB1, PB5, PB10)
- `<FileUploader>` (CM1, DC1)
- `<TagChip>` (CM3, CM4, LU1)
- `<ValidatedFormField>` (UM1, UM2, UM5, UM6, UM7…)
- `<UpgradeBanner>` (LC1 quota, role-locked features)
- `<EmptyState>` (LU3, PB7…)

---

## 6. Build sequencing recommendation

**Sprint 1 — Foundations:** UM14, UM1–UM6, UM15, UM19 (public + auth)
**Sprint 2 — Core chat:** LC1, LC3, LC4, LC5, LC8, LC11 (basic chatbot loop)
**Sprint 3 — Tone & feedback:** LC2, LC6, LC7, LC9, LC10
**Sprint 4 — Drive + drafting:** CM1–CM4, DD1–DD3, DA1, DA2
**Sprint 5 — Compliance:** DC1, DC2, DC3, DC5
**Sprint 6 — Billing:** PB1, PB3, PB4, PB5, PB6, PB7, PB8, PB10, PB11, PB12
**Sprint 7 — News + Admin:** LU1–LU4, UM7, UM9–UM12, UM16, UM17, PB9

---

_End of design document._
