# Mindlex — Memory

**Stack:** ASP.NET Core 8.0 + React 18 + PostgreSQL 16 | **DB:** EF Core Code-First | **Users:** Luật sư

**Luôn nhớ:**
- LLM integration **pending** — ChatController trả stub
- DainnUser migrations lỗi PostgreSQL → dùng EnsureCreated workaround
- Feature gating qua role check: Free/Plus/Premium/Admin
- DainnUser + DainnStripe = private NuGet packages (auth, billing)
- **Lỗi từ DainnUser/DainnStripe → KHÔNG sửa, tạo task cho upstream team**

**Mode:** DEV AGENT

---

## Current State

- Status: freshly initialized by Blueberry Sensei
- Active branch: master
- Last task: initial setup
- Deployment: chưa deploy

## Key Components

- `backend/Program.cs` — entry point, DI, middleware pipeline
- `backend/Controllers/ChatController.cs` — chatbot core (quota, tone, safety, drafting)
- `backend/Controllers/DocumentsController.cs` — Drive / content management
- `backend/Controllers/NewsController.cs` — legal news aggregation
- `backend/Data/MindlexDbContext.cs` — EF Core context + entity definitions
- `frontend/src/App.tsx` — route definitions
- `frontend/src/pages/ChatbotPage.tsx` — main chatbot UI

## In Progress

(none)

## Recent Decisions

Xem `.claude/memory/decisions.md`

---

_Keep this file under 200 lines. Archive old context with compress-context skill._
