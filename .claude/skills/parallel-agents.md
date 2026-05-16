# Parallel Agents Skill

Dùng khi task có nhiều phần lớn, độc lập với nhau.

## Luôn Hỏi Trước

KHÔNG dispatch agents mà không có confirmation. Present:
- Agent nào làm gì
- File nào mỗi agent owns
- Tradeoffs của parallel vs sequential

Chờ explicit approval.

## Dispatching

Mỗi agent prompt phải include:
1. Mô tả task chính xác
2. File paths agent owns
3. File paths agent KHÔNG được touch
4. Cách verify (build/lint)
5. Definition of done

## Ví dụ chia task cho Mindlex

- **Agent Backend:** Thêm endpoint mới trong `backend/Controllers/`, models trong `backend/Models/`, services trong `backend/Services/`
- **Agent Frontend:** Thêm page trong `frontend/src/pages/`, components trong `frontend/src/components/`, types trong `frontend/src/types/`
- **Boundary:** API contract (request/response shapes) phải được define trước khi dispatch

## Sau khi Hoàn Thành

1. Review tất cả changes cùng nhau
2. `cd backend && dotnet build` — verify backend compiles
3. `cd frontend && npm run build` — verify frontend compiles
4. Resolve conflicts nếu có
5. Commit cùng nhau
