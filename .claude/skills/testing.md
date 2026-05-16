# Testing Skill

## Detect Framework

1. `frontend/package.json` → chưa có test framework (vitest/jest chưa install)
2. `backend/Mindlex.csproj` → chưa có test project (xUnit/NUnit chưa setup)

## Hiện tại: Verification thay vì formal tests

### Backend
```bash
cd backend && dotnet build
```
Kiểm tra không có compile errors.

### Frontend
```bash
cd frontend && npm run lint
cd frontend && npm run build
```
Kiểm tra lint + TypeScript compilation.

### Full stack (Docker)
```bash
docker compose up --build
```
Kiểm tra tất cả services start thành công.

## Khi thêm test framework

### Frontend (recommended: Vitest)
```bash
cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```
Config `vitest.config.ts`, test files: `*.test.tsx` cùng thư mục với component.

### Backend (recommended: xUnit)
Tạo project `backend.Tests/`:
```bash
dotnet new xunit -n Mindlex.Tests
dotnet add Mindlex.Tests/Mindlex.Tests.csproj reference backend/Mindlex.csproj
```

## Test Requirements

**New feature:** Viết tests TRƯỚC implementation (TDD).
**Bug fix:** Viết regression test trước.
**Backend API:** Test happy path + error path + auth.
**Frontend:** Test behavior, không test implementation.

## Sau khi test

Report: "Build: OK. Lint: OK. Tests: N/A (no test framework yet)."
Nếu có failure: fix trước khi tiếp tục.
