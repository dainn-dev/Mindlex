# Architecture — Mindlex

## Overview

Mindlex là monolithic web application gồm 2 phần chính: ASP.NET Core 8.0 backend API và React 18 SPA frontend. Cả hai được containerized qua Docker Compose cùng với PostgreSQL 16 database.

Backend tích hợp 2 NuGet library tự build: **DainnUser** (authentication, user management, social login, activity logging) và **DainnStripe** (Stripe subscriptions, payments, checkout flows). Cả 3 modules (Mindlex, DainnUser, DainnStripe) share cùng 1 PostgreSQL instance nhưng dùng separate DbContexts.

Frontend là single-page application build với Vite, dùng Tailwind CSS cho styling với custom theme (navy/gold/cream) phù hợp thương hiệu legal-tech premium.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Compose                            │
│                                                                 │
│  ┌──────────────┐    ┌─────────────────────┐    ┌───────────┐  │
│  │   Frontend   │    │      Backend         │    │ PostgreSQL│  │
│  │   (nginx)    │───▶│   (ASP.NET Core)     │───▶│   16      │  │
│  │   :3000      │    │   :8080              │    │   :5432   │  │
│  └──────────────┘    └─────────────────────┘    └───────────┘  │
│                             │                                   │
│                      ┌──────┼──────┐                            │
│                      │      │      │                            │
│                 DainnUser  │  DainnStripe                       │
│                 (Auth)     │  (Billing)                         │
│                            │                                    │
│                      [LLM API]                                  │
│                      (pending)                                  │
└─────────────────────────────────────────────────────────────────┘

External Services:
- Stripe API (payments, subscriptions)
- Google OAuth / Microsoft OAuth (social login)
- Legal news sources (Cylaw, ECHR, Bailii, Curia)
- LLM API (pending integration)
- SMTP (email notifications)
```

## Components

### Backend API (`backend/`)
- **Location:** `backend/`
- **Role:** REST API serving all business logic
- **Key files:**
  - `Program.cs` — DI registration, middleware pipeline, schema setup
  - `Controllers/` — 8 controllers covering all features
  - `Data/MindlexDbContext.cs` — Database schema + entities
  - `Services/` — Background workers, document processing, news fetchers
  - `appsettings.json` — All application configuration

### Frontend SPA (`frontend/`)
- **Location:** `frontend/`
- **Role:** User-facing web interface
- **Key files:**
  - `src/App.tsx` — Route definitions
  - `src/store/` — Zustand state management
  - `src/lib/api.ts` — HTTP client với auto token refresh
  - `src/pages/` — Feature pages
  - `src/components/` — Reusable UI components

### DainnUser (NuGet package)
- **Role:** User management, authentication, sessions, social login, email, activity logging
- **Interface:** `IAuthenticationService`, `IProfileService`, `IRoleService`, `IActivityService`, `ISocialLoginService`, `ISessionService`, `IEmailService`

### DainnStripe (NuGet package)
- **Role:** Stripe integration, subscription management, checkout, webhooks
- **Interface:** `IDainnStripeCheckoutService`, `IStripeWebhookHandler`

## Data Flow

### Authentication
```
User → Login/Register → AuthController → DainnUser (IAuthenticationService)
     → JWT issued → Frontend stores in localStorage
     → Subsequent requests: Bearer token → [Authorize] attribute → Claims
```

### Chat Message
```
User → ChatComposer → POST /api/chat/message
     → ChatController:
       1. Validate user + quota
       2. Safety checks (toxic/greeting detection)
       3. Resolve tone (plain/technical)
       4. Generate reply (STUB — pending LLM)
       5. PII sanitize (if drafting mode)
       6. Persist messages to ChatThread
       7. Log activity for quota tracking
     → Response with reply, sources, quota update
```

### Document Upload (Drive)
```
User → DrivePage → POST /api/documents/upload
     → DocumentsController:
       1. Role check (Premium/Admin only)
       2. Validate file (type, size, name, quota)
       3. Read bytes + auto-anonymize PII
       4. Auto-classify (keyword-based tagging)
       5. Persist to SavedDocuments
     → Response with file metadata
```

### Subscription Flow
```
User → CheckoutPage → POST /api/subscriptions/checkout
     → SubscriptionController → DainnStripe (Stripe Checkout Session)
     → Redirect to Stripe → Payment → Webhook
     → MindlexSubscriptionWebhookHandler:
       1. Update user role (Free→Plus/Premium)
       2. Send confirmation email
```

## External Services

| Service | Dùng cho | Config location |
|---|---|---|
| Stripe | Payments, subscriptions | `appsettings.json` → `DainnStripe` section |
| Google OAuth | Social login | `appsettings.json` → `DainnUser:GoogleClientId/Secret` |
| Microsoft OAuth | Social login | `appsettings.json` → `DainnUser:MicrosoftClientId/Secret` |
| SMTP | Email (verification, sharing, notifications) | `appsettings.json` → `DainnUser:Email` |
| Cylaw, ECHR, Bailii, Curia | Legal news ingestion | `appsettings.json` → `Mindlex:LegalNews` |
| LLM API | AI responses (pending) | TBD |

## Environment Variables

| Variable | Required | Mô tả |
|---|---|---|
| `JWT_SECRET` | Yes | JWT signing key (>= 32 chars) |
| `STRIPE_SECRET` | Yes | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `ADMIN_EMAIL` | No | Seeded admin email (default: admin@mindlex.local) |
| `ADMIN_PASSWORD` | No | Seeded admin password (default: Admin123!) |
| `POSTGRES_HOST_PORT` | No | Host port for PostgreSQL (default: 55432) |
| `VITE_API_BASE_URL` | No | Frontend API base URL (default: /api) |
| `NUGET_FEED_URL` | If private | Private NuGet feed URL |
| `NUGET_USERNAME` | If private | NuGet feed username |
| `NUGET_PAT` | If private | NuGet feed PAT |
