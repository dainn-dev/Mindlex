# UI Review Skill

Chạy sau khi implement bất kỳ UI changes nào.

## Step 1: Start Dev Server

```bash
cd frontend && npm run dev
```
Chờ "ready" / "Local:" URL trong output (thường là http://localhost:5173).

## Step 2: Open Browser với Playwright

Dùng Playwright MCP tool để:
1. Navigate đến app URL (http://localhost:5173)
2. Login nếu cần: email `admin@mindlex.local`, password `Admin123!`
3. Navigate đến page/feature đã thay đổi

## Step 3: Dừng lại và Chờ

Báo user:
- "Tôi đã mở [URL] trong browser"
- "Đang ở trang [page name / route]"
- "Bạn review UI và cho tôi biết cần điều chỉnh gì"

**DỪNG TẠI ĐÂY. Chờ user response.**

## Step 4: Iterate

Nếu user yêu cầu thay đổi: apply → reload → hỏi review lại.
Nếu user approve: tiếp tục tạo PR.

## Lưu ý Mindlex UI

- Theme: navy (#0f1e3d) + gold (#c9a96e) + cream (#faf8f3)
- Font: Inter (body), Playfair Display (brand/headings)
- Responsive: mobile-first, breakpoint md: cho desktop nav
- Components: `src/components/ui/` (Button, Input, Modal, Toast, Dropdown, etc.)
