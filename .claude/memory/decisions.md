# Architectural Decisions

_Thêm decisions vào đây khi chúng được đưa ra._

---

## Decision: PostgreSQL as primary database

**Date:** 2026-05-15
**Decision:** Dùng PostgreSQL 16 cho toàn bộ data storage (cả 3 DbContexts share cùng 1 database instance)
**Reason:** Consistent, mature RDBMS phù hợp cho legal data có relationships phức tạp
**Alternatives considered:** N/A — inferred từ existing code

---

## Decision: DainnUser + DainnStripe NuGet packages cho Auth & Billing

**Date:** 2026-05-15
**Decision:** Dùng private NuGet packages (DainnUser.Core/Infrastructure, DainnStripe) thay vì build auth/billing from scratch
**Reason:** Tái sử dụng code across projects, đã có sẵn social login, session management, Stripe integration
**Alternatives considered:** ASP.NET Identity, custom JWT, direct Stripe API

---

## Decision: EnsureCreated workaround cho DainnUser/DainnStripe schemas

**Date:** 2026-05-15
**Decision:** Dùng `EnsureCreatedAsync` thay vì `MigrateAsync` cho DainnUser và DainnStripe DbContexts
**Reason:** Migrations từ upstream packages bị lỗi trên PostgreSQL (InsertDataOperation mis-types Guid as string)
**Alternatives considered:** Fix upstream migrations — pending

---

## Decision: Monolithic API architecture

**Date:** 2026-05-15
**Decision:** Single ASP.NET Core project chứa tất cả API endpoints
**Reason:** Early-stage product, team nhỏ, không cần microservices complexity
**Alternatives considered:** Microservices — quá sớm cho product stage hiện tại

---

## Decision: Zustand for frontend state management

**Date:** 2026-05-15
**Decision:** Zustand thay vì Redux/Context API
**Reason:** Lightweight, minimal boilerplate, phù hợp cho app size hiện tại
**Alternatives considered:** Redux Toolkit, React Context

---

## Decision: Activity log as user preference store

**Date:** 2026-05-15
**Decision:** Lưu user preferences (tone, news topics) dưới dạng activity log entries với JSON metadata
**Reason:** Tận dụng DainnUser's IActivityService có sẵn, không cần thêm table riêng
**Alternatives considered:** Dedicated UserPreferences table — có thể refactor sau khi preferences phức tạp hơn

---

## Decision: Stub LLM responses (pending integration)

**Date:** 2026-05-15
**Decision:** ChatController trả stub text thay vì gọi LLM API thực
**Reason:** MVP focus vào UX flow trước, LLM integration sẽ thêm sau
**Alternatives considered:** N/A — đây là TODO, không phải permanent decision

---
