# Mindlex

ASP.NET Core 8 Web API tích hợp 2 module:

- **User Management** — `DainnUser.Core` / `DainnUser.Application` / `DainnUser.Infrastructure` (JWT auth, register/login/refresh, email verification, password reset, session, activity log, lockout).
- **Payment & Billing** — `DainnStripe` (Stripe checkout, subscriptions, payments, webhooks, catalog).

## Cấu trúc

```
Mindlex/
├── Program.cs                    # Wire-up AddDainnUser + AddDainnStripe
├── appsettings.json              # PostgreSQL + JWT + Stripe + SMTP
├── Controllers/
│   ├── AuthController.cs         # /api/auth/* — register, login, refresh, logout, ...
│   └── SubscriptionController.cs # /api/subscriptions/* — checkout, cancel
├── Models/
│   ├── AuthDtos.cs
│   └── SubscriptionDtos.cs
└── Mindlex.csproj                # net8.0, EF Core 8.0.11
```

DainnStripe đã tự map sẵn các endpoint sau (xem `Program.cs`):

- `POST /api/stripe/webhook` — Stripe webhook receiver
- `/api/stripe/catalog/*` — quản lý product/price
- `/api/stripe/commerce/*` — payment & subscription commerce

## Yêu cầu

- .NET SDK **8.x** (project pin về `net8.0` cho khớp với EF Core 8 mà DainnUser/DainnStripe build).
- PostgreSQL 13+ chạy ở `localhost:5432`.
- `dotnet-ef` CLI (`dotnet tool install --global dotnet-ef`).
- (Dev) Mailhog hoặc SMTP server giả ở `localhost:1025` cho email verification.

## Cấu hình

Sửa `appsettings.json` — các trường cần thay:

- `DainnUser:Database:ConnectionString` — chuỗi kết nối PG.
- `DainnUser:Jwt:Secret` — secret JWT (≥ 32 ký tự).
- `DainnStripe:SecretKey` / `PublishableKey` / `WebhookSigningSecret` — lấy từ Stripe Dashboard.
- `DainnStripe:Database:ConnectionString` & `DainnStripe:Database:Provider` — DB cho DainnStripe (có thể trùng DB với DainnUser).

## Migration & khởi tạo DB

### DainnUser (đã có sẵn 3 migrations bundle trong package)

```powershell
dotnet ef database update --context DainnUser.Infrastructure.Data.DainnUserDbContext
```

### DainnStripe (chưa có migration — phải generate trong project)

```powershell
dotnet ef migrations add InitialDainnStripe --context DainnStripe.Data.DainnStripeDbContext --output-dir Migrations/DainnStripe
dotnet ef database update --context DainnStripe.Data.DainnStripeDbContext
```

## Chạy

```powershell
dotnet run
```

Mở `https://localhost:5001/swagger` để xem & test các endpoint.

## Auth flow

1. `POST /api/auth/register` `{ email, username, password }` → `userId`
2. Email verification được gửi qua SMTP đã cấu hình.
3. `POST /api/auth/verify-email` `{ userId, token }` để xác thực.
4. `POST /api/auth/login` `{ email, password }` → `{ accessToken, refreshToken, sessionId, ... }`
5. Gắn `Authorization: Bearer <accessToken>` vào các request cần auth.
6. `POST /api/auth/refresh` `{ refreshToken }` khi access token hết hạn.

## Subscription flow

1. (Trong Stripe Dashboard) tạo Product + Price → lấy `price_xxx`.
2. Client gọi `POST /api/subscriptions/checkout` với:
   ```json
   {
     "priceId": "price_xxx",
     "successUrl": "https://app.mindlex.local/billing/success?session_id={CHECKOUT_SESSION_ID}",
     "cancelUrl":  "https://app.mindlex.local/pricing"
   }
   ```
3. API trả về `{ sessionId, url }` — redirect user sang `url`.
4. Stripe gửi webhook về `POST /api/stripe/webhook` → DainnStripe tự xử lý `customer.subscription.created/updated/deleted` và cập nhật bảng `DainnStripeSubscriptions`.
5. Hủy subscription: `POST /api/subscriptions/cancel` `{ subscriptionId, cancellationReason }`.

### Test webhook local

```powershell
stripe listen --forward-to https://localhost:5001/api/stripe/webhook
```

Sao `whsec_...` mà Stripe CLI in ra vào `DainnStripe:WebhookSigningSecret`.

## Lưu ý

- Project target `net8.0` thay vì `net10.0` vì DainnUser/DainnStripe phụ thuộc EF Core 8.0.11. Nâng .NET 10 sẽ gây xung đột method abstract giữa EF Core 10 và EF Core 8 providers bundled trong các package này.
- `DainnUser.Web` (Blazor components) **không** được cài — project này là REST API thuần.
- `DainnUser.PostgreSQL` (v9.x) là package **độc lập** khác (monolithic user-management), không phải PG provider cho `DainnUser.*` (v1.0.1). Provider PG đã có sẵn trong `DainnUser.Infrastructure` qua `Npgsql.EntityFrameworkCore.PostgreSQL`.
