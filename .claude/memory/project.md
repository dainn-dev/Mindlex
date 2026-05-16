# Project Facts — Mindlex

_Stable facts. Chỉ update khi project thay đổi căn bản._

## Description

Mindlex là AI-powered legal assistant platform dành cho luật sư. Platform cung cấp:
- **Legal Chatbot** — hỏi đáp pháp lý với tone plain/technical, quota theo tier
- **Document Drafting** — tạo legal documents từ prompt, auto-anonymize PII
- **Document Upload & Review** — upload DOCX, compliance check, risk analysis, generate compliance reports
- **Content Management (Drive)** — lưu trữ, chia sẻ, tag documents
- **Legal News** — aggregation từ Cylaw, ECHR, Bailii, Curia; topic filtering
- **Subscription Billing** — Free/Plus/Premium tiers qua Stripe

## Tech Stack

| Layer | Technology | Vai trò |
|---|---|---|
| Backend Framework | ASP.NET Core 8.0 | Web API |
| ORM | Entity Framework Core 8.0 | Database access |
| Database | PostgreSQL 16 | Primary data store |
| Auth Library | DainnUser (private NuGet) | Authentication, profiles, sessions, social login, activity logging |
| Billing Library | DainnStripe (private NuGet) | Stripe integration, subscriptions, checkout |
| Frontend Framework | React 18.3 | SPA |
| Build Tool | Vite 5.4 | Dev server + bundler |
| Styling | Tailwind CSS 3.4 | Utility-first CSS |
| State Management | Zustand 4.5 | Client state |
| Routing | react-router-dom 6.26 | SPA routing |
| HTTP Client | Axios 1.7 | API calls với refresh token flow |
| i18n | react-i18next 15 | English + Vietnamese |
| Icons | lucide-react | Icon library |
| Containerization | Docker Compose | Local dev environment |
| Document Processing | DocumentFormat.OpenXml 3.1 | DOCX generation/parsing |

## Architecture

```
┌────────────────┐     ┌─────────────────────┐     ┌──────────────┐
│  React SPA     │────▶│  ASP.NET Core API   │────▶│  PostgreSQL  │
│  (Vite, :3000) │     │  (:8080)            │     │  (:5432)     │
└────────────────┘     └─────────────────────┘     └──────────────┘
                              │
                       ┌──────┴──────┐
                       │             │
                  DainnUser    DainnStripe
                  (Auth/       (Stripe/
                   Profiles)    Billing)
```

- Frontend gọi backend qua `/api/*` (proxied trong Docker, hoặc `VITE_API_BASE_URL`)
- Backend dùng 3 DbContexts: `MindlexDbContext` (own), `DainnUserDbContext`, `DainnStripeDbContext`
- Background services: RoleSeeder, AdminSeeder, ChatThreadRetentionSweeper, InactiveAccountSweeper, NewsIngestionService

## Database

**MindlexDbContext entities:**
- `ChatThread` — conversation threads (OwnerId, Title, timestamps)
- `ChatMessage` — individual messages (ThreadId, Role, Content)
- `ChatUpload` — uploaded files trong chat (ThreadId, FileName, Content bytes, WordCount)
- `NewsArticle` — ingested legal news (Source, Headline, Summary, TopicsCsv)
- `NewsRead` — read tracking (UserId + ArticleId composite key)
- `SavedDocument` — Drive documents (OwnerId, FileName, DocumentType, TagsCsv, Content bytes)
- `DocumentShare` — sharing links (Token, RecipientEmail, ExpiresAt, RevokedAt)

**DainnUser tables** (managed by library): Users, Roles, Sessions, Activities, PasswordResets, etc.
**DainnStripe tables** (managed by library): Subscriptions, Payments, Products, Prices, etc.

## API Overview

| Route Prefix | Controller | Chức năng |
|---|---|---|
| `/api/auth/*` | AuthController | Register, login, OAuth, refresh, logout, email verify, password reset |
| `/api/chat/*` | ChatController | Send message, threads CRUD, uploads, compliance/risk check, tone, quota, feedback |
| `/api/documents/*` | DocumentsController | List, upload, download, rename, delete, share, tags |
| `/api/news/*` | NewsController | Feed, topics, mark read, unread count |
| `/api/subscriptions/*` | SubscriptionController | Current subscription, checkout, cancel |
| `/api/billing/*` | BillingController | Billing status, payment history |
| `/api/plans/*` | PlansController | Available plans with pricing |
| `/api/profile/*` | ProfileController | Get/update profile |
| `/api/admin/*` | AdminController | User management, subscription management (Admin only) |
| `/api/stripe/*` | DainnStripe endpoints | Webhook, catalog, commerce |

## Key Components

- `backend/Program.cs` — DI registration, migration/schema setup, middleware pipeline
- `backend/appsettings.json` — ALL configuration (quotas, plans, pricing, PII patterns, safety, news sources)
- `backend/Services/RoleSeeder.cs` — Seeds Free/Plus/Premium/Admin roles
- `backend/Services/Documents/` — PII sanitization, document classification, compliance checking, risk analysis
- `backend/Services/News/` — News fetchers cho Cylaw, Bailii, ECHR, Curia (RSS/HTML scraping)
- `frontend/src/App.tsx` — Complete route map
- `frontend/src/lib/api.ts` — Axios instance với auto refresh token
- `frontend/src/store/authStore.ts` — Auth state, login/logout/social flows

## Infrastructure

- **Local dev:** Docker Compose (postgres:16-alpine + backend + frontend)
- **Ports:** PostgreSQL 55432 (host), Backend 8080, Frontend 3000
- **Deployment:** Chưa deploy — planning phase
- **CI/CD:** Chưa setup

## Conventions

- Backend response: anonymous objects, consistent `{ error, code }` shape cho errors
- Feature gating: role-based (`Free`, `Plus`, `Premium`, `Admin`) checked per-endpoint
- PII anonymization: regex-based, applied on document drafting và file uploads
- Chat quota: daily limit reset at 04:00 UTC, tracked via activity log
- Document classification: keyword-based auto-tagging
- Theme: navy (#0f1e3d) + gold (#c9a96e) + cream (#faf8f3)
