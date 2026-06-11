# Mindlex

AI-powered legal assistant platform cho luật sư — cung cấp chatbot pháp lý, document drafting, legal news aggregation, và content management.

---

## Project Context

| | |
|---|---|
| **Stack** | ASP.NET Core 8.0 (C#) + React 18 (TypeScript) + PostgreSQL 16 + Vite 5 + Tailwind CSS 3 |
| **Database** | PostgreSQL + Entity Framework Core (Code-First migrations) |
| **Kiến trúc** | Monolithic API backend + SPA frontend, containerized via Docker Compose |
| **Deployment** | Chưa deploy — đang phát triển local với Docker Compose |
| **Users** | Luật sư (lawyers) |

**Luôn nhớ:**
- LLM integration đang **pending** — `ChatController` trả về stub responses
- DainnUser/DainnStripe migrations **bị lỗi** trên PostgreSQL → dùng `EnsureCreatedAsync` workaround thay vì `MigrateAsync`
- Tiering system: Free → Plus → Premium, feature-gated bởi role check trong mỗi controller
- DainnUser và DainnStripe là NuGet packages tự build (private feed) — cung cấp auth, profiles, sessions, Stripe billing
- **Nếu gặp lỗi từ DainnUser hoặc DainnStripe → KHÔNG cố sửa.** Tạo task/note cho team DainnUser/DainnStripe xử lý. Đây là thư viện riêng, fix ở upstream.

---

## Làm việc với Claude (DEV AGENT mode)

### Bước 1 — Hiểu Task
- Đọc CLAUDE.md + `.claude/memory/MEMORY.md` + docs liên quan
- Nếu chưa rõ: hỏi từng câu một, chờ trả lời (max 3 câu)
- Dùng quick options khi có thể: "Option 1: ... Option 2: ... Option 3: Khác"

### Bước 2 — Branch
- Kiểm tra branch hiện tại: `git branch --show-current`
- **Cảnh báo** nếu user đang ở feat/fix branch khác (có thể quên chưa checkout về main/master)
- Hỏi:
  - Option 1: Tạo branch mới `feat/<slug>` hoặc `fix/<slug>`
  - Option 2: Tiếp tục trên branch hiện tại
  - Option 3: Khác

### Bước 3 — Plan & Confirm

**Task nhỏ** (1-3 file, ít impact):
> "Tôi sẽ [mô tả ngắn]. Được chưa?"
Chờ confirm mới làm.

**Task lớn** (nhiều file, nhiều component):
Build plan đầy đủ:
- File nào tạo/sửa
- Test nào viết
- Dependency nào cần
- Plan đủ context để chia cho sub-agent nếu cần
> "Đây là plan: [plan]. Confirm để bắt đầu?"
Chờ confirm mới làm.

### Bước 4 — Implement

Khi code, luôn kiểm tra:
- **Security:** Input đã validate chưa? Có lỗ hổng injection, auth bypass không?
- **Cluster-safe:** Có dùng in-memory state không? Nếu có → chuyển qua Redis
- **Performance:** Có N+1 query không? Cần cache không? Batch được không?
- **Pattern nhất quán:** Có theo đúng module pattern của codebase không?
- **Side effects:** Thay đổi này có break feature/logic khác không?
- **Deploy safety:** Code mới có ảnh hưởng đến rolling deploy không?

### Bước 5 — Test & Verify
- Chạy test suite
- Build nếu cần
- Kiểm tra không có lỗi compile/runtime
- Nếu có UI thay đổi → dùng `.claude/skills/ui-review.md`

---

## Project Structure

```
Mindlex/
├── backend/                    # ASP.NET Core 8.0 Web API
│   ├── Controllers/            # API controllers (Auth, Chat, Documents, News, Admin, Subscription, Billing, Plans, Profile)
│   ├── Data/                   # EF Core DbContext + entity definitions
│   ├── Models/                 # DTOs (request/response models)
│   ├── Services/               # Background services, seeders, document processing
│   │   ├── Documents/          # PII sanitizer, classifier, compliance checker, risk analyzer
│   │   └── News/               # News source fetchers (Cylaw, Bailii, ECHR, Curia)
│   ├── Migrations/             # EF Core migrations (Mindlex schema only)
│   ├── Validation/             # Custom validation attributes
│   ├── Program.cs              # App entry point, DI registration, middleware pipeline
│   ├── appsettings.json        # All config (quotas, plans, pricing, safety patterns, PII patterns)
│   └── Dockerfile              # Backend container build
├── frontend/                   # React 18 SPA (TypeScript + Vite)
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   │   ├── ui/             # Input, Button, Modal, Toast, Dropdown, etc.
│   │   │   ├── chat/           # ChatSidebar, ChatMessage, ChatComposer
│   │   │   └── layouts/        # AppLayout, PublicLayout, AccountLayout, AdminLayout
│   │   ├── pages/              # Route pages (ChatbotPage, DrivePage, NewsFeedPage, etc.)
│   │   │   ├── account/        # MyAccount, Subscription, Billing, Checkout
│   │   │   └── admin/          # AdminUsers, AdminSubscriptions
│   │   ├── store/              # Zustand stores (authStore, uiStore)
│   │   ├── lib/                # api.ts (axios), auth.ts (token management), utils.ts
│   │   ├── types/              # TypeScript type definitions
│   │   └── i18n/               # Internationalization (en.json, vi.json)
│   ├── tailwind.config.js      # Custom theme (navy, gold, cream)
│   └── Dockerfile              # Frontend container build
├── docker-compose.yml          # PostgreSQL + Backend + Frontend
├── .env.example                # Required environment variables
└── docs/                       # Project documentation
```

---

## Key Commands

| Command | Mô tả |
|---|---|
| `docker compose up --build` | Start toàn bộ stack (postgres + backend + frontend) |
| `cd frontend && npm run dev` | Start frontend dev server (Vite) |
| `cd frontend && npm run build` | Build frontend production |
| `cd frontend && npm run lint` | Lint frontend code |
| `cd backend && dotnet run` | Start backend dev server |
| `cd backend && dotnet build` | Build backend |
| `cd backend && dotnet ef migrations add <Name> --context MindlexDbContext` | Tạo migration mới |
| `cd backend && dotnet ef database update --context MindlexDbContext` | Apply migrations |

---

## Skills

| Skill | Khi nào dùng |
|---|---|
| `.claude/skills/testing.md` | Chạy tests, viết tests |
| `.claude/skills/ui-review.md` | Sau khi thay đổi UI |
| `.claude/skills/parallel-agents.md` | Task lớn có nhiều phần độc lập |
| `.claude/skills/compress-context.md` | Context quá dài |
| `.claude/skills/dotnet-workflow.md` | Thêm controller, migration, service |
| `.claude/skills/docker-workflow.md` | Build/run containers, debug Docker issues |

---

## Memory System

Đọc trước khi bắt đầu task:
- `.claude/memory/MEMORY.md` — project state hiện tại (< 200 lines)
- `.claude/memory/project.md` — stable facts về project
- `.claude/memory/decisions.md` — architectural decisions đã được đưa ra

Cập nhật sau khi hoàn thành task:
- Update `MEMORY.md` nếu project state thay đổi
- Thêm vào `decisions.md` nếu có architectural decision mới

---

## Testing

- Framework: Chưa có test setup (chưa có vitest/jest config cho frontend, chưa có xUnit/NUnit cho backend)
- Frontend lint: `cd frontend && npm run lint`
- Backend build check: `cd backend && dotnet build`

---

## Git & GitHub

- Branches: `feat/<task>`, `fix/<task>`, `chore/<task>` (kebab-case, max 4 từ)
- Commits: nhỏ, thường xuyên, descriptive
- PR: tạo khi task xong, bao gồm change summary + test results

---

## Code Conventions

### Backend (C#)
- Controllers chứa business logic trực tiếp (không có separate service layer cho hầu hết features)
- Document processing services tách riêng: `Services/Documents/` (interfaces + implementations)
- DTOs theo pattern: `Models/{Feature}Dtos.cs`
- Auth check: `CurrentUserId` property + role check qua `IRoleService.GetUserRolesAsync()`
- Feature gating: kiểm tra role names (Free/Plus/Premium/Admin) trong mỗi endpoint
- Response format: anonymous objects `new { field1, field2 }` — không dùng dedicated response classes
- Activity logging: dùng `IActivityService.LogActivityAsync()` với JSON metadata cho audit trail
- Config: đọc từ `IConfiguration` với section paths (e.g., `Mindlex:Chatbot:Quotas:Free`)

### Frontend (React/TypeScript)
- Named exports cho tất cả components và pages
- Path alias: `@/` → `src/`
- State management: Zustand stores (`authStore`, `uiStore`)
- API calls: `api` instance từ `@/lib/api.ts` (axios với interceptors)
- Styling: Tailwind CSS với custom theme (navy, gold, cream colors)
- Fonts: Inter (body) + Playfair Display (headings/brand)
- i18n: react-i18next, keys trong `src/i18n/en.json` và `src/i18n/vi.json`
- Routing: react-router-dom v6, nested routes với layouts
- Icons: lucide-react

---

## Context Management

Khi context quá dài (nhiều messages, conversation cũ):
Run compress-context skill → summarize → archive → rewrite MEMORY.md



