# API Overview — Mindlex

## Base URL

`http://localhost:8080/api` (Docker) hoặc `http://localhost:5000/api` (local dotnet run)

## Authentication

JWT Bearer token. Gửi header: `Authorization: Bearer <accessToken>`

Token flow:
1. `POST /api/auth/login` → nhận `accessToken` + `refreshToken`
2. Attach `accessToken` vào mỗi request
3. Khi 401 → `POST /api/auth/refresh` với `refreshToken` → nhận token mới

## Endpoints

### Auth (`/api/auth`)

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login (email/password) | No |
| POST | `/auth/oauth/google` | Google OAuth sign-in | No |
| POST | `/auth/oauth/microsoft` | Microsoft OAuth sign-in | No |
| POST | `/auth/oauth/complete-profile` | Complete social profile (dateOfBirth) | Required |
| POST | `/auth/refresh` | Refresh access token | No |
| POST | `/auth/logout` | Logout (invalidate session) | Required |
| POST | `/auth/forgot-password` | Request password reset email | No |
| POST | `/auth/reset-password` | Reset password with token | No |
| POST | `/auth/verify-email` | Verify email with token | No |
| POST | `/auth/resend-verification` | Resend verification email | No |

### Chat (`/api/chat`)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/chat/quota` | Get current quota + tone | Required |
| GET | `/chat/tone` | Get tone details | Required |
| PUT | `/chat/tone` | Set tone preference (Plus/Premium only) | Required |
| POST | `/chat/message` | Send message, get AI reply | Required |
| GET | `/chat/threads` | List user's threads | Required |
| GET | `/chat/threads/:id` | Get thread with messages | Required |
| PATCH | `/chat/threads/:id` | Rename thread | Required |
| DELETE | `/chat/threads/:id` | Delete thread | Required |
| POST | `/chat/threads/:id/uploads` | Upload DOCX to thread (Premium) | Required |
| POST | `/chat/threads/:id/uploads/:uid/compliance-check` | Run compliance check (Premium) | Required |
| POST | `/chat/threads/:id/uploads/:uid/risk-check` | Run risk analysis (Premium) | Required |
| POST | `/chat/threads/:id/uploads/:uid/report` | Download compliance report DOCX (Premium) | Required |
| DELETE | `/chat/threads/:id/uploads/:uid` | Remove upload | Required |
| POST | `/chat/feedback` | Submit like/dislike feedback | Required |

### Documents / Drive (`/api`)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/documents` | List user's documents (+ shared with me) | Required |
| POST | `/documents/upload` | Upload files to Drive (Premium, max 5 files) | Required |
| GET | `/documents/:id/download` | Download document | Required |
| PATCH | `/documents/:id` | Rename document | Required |
| DELETE | `/documents/:id` | Delete document | Required |
| PUT | `/documents/:id/tags` | Update tags (Premium) | Required |
| POST | `/documents/:id/share` | Share document via email (Premium) | Required |
| GET | `/documents/share-status` | Get unseen share count | Required |
| POST | `/chat/messages/:id/save-to-folder` | Save chat draft to Drive (Premium) | Required |
| POST | `/chat/messages/:id/download` | Download chat draft as DOCX | Required |

### News (`/api/news`)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/news/topics` | Get available + selected topics | Required |
| PUT | `/news/topics` | Save topic preferences (Premium) | Required |
| GET | `/news/feed` | Get news feed (filtered by topics) | Required |
| POST | `/news/articles/:id/read` | Mark article as read | Required |
| GET | `/news/unread-count` | Get unread count | Required |

### Subscriptions (`/api/subscriptions`)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/subscriptions/me` | Get current subscription | Required |
| POST | `/subscriptions/checkout` | Create Stripe checkout session | Required |
| POST | `/subscriptions/cancel` | Cancel subscription | Required |

### Billing (`/api/billing`)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/billing/status` | Get billing status | Required |
| GET | `/billing/payments` | Get payment history | Required |

### Plans (`/api/plans`)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/plans` | Get available plans with pricing | No |

### Profile (`/api/profile`)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/profile/me` | Get current user profile | Required |
| PUT | `/profile/me` | Update profile | Required |

### Admin (`/api/admin`) — Admin role only

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/admin/users` | List all users | Admin |
| GET | `/admin/users/:id` | Get user details | Admin |
| PUT | `/admin/users/:id/role` | Change user role | Admin |
| POST | `/admin/users/:id/suspend` | Suspend user | Admin |
| GET | `/admin/subscriptions` | List subscriptions | Admin |

### Stripe Webhooks

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/stripe/webhook` | Stripe webhook handler | Stripe signature |

## Error Response Format

```json
{
  "error": "Human-readable error message",
  "code": "machine_readable_code"
}
```

Common codes: `quota_exceeded`, `upload_not_allowed`, `tone_override_not_allowed`, `file_too_large`, `unsupported_type`, `duplicate_filename`, `invalid_tags`, `email_not_verified`, `social_signin_failed`

## Tier-based Feature Matrix

| Feature | Free | Plus | Premium |
|---|---|---|---|
| Chat queries/day | 5 | 19 | Unlimited |
| Tone override | No | Yes | Yes |
| Document upload (chat) | No | No | Yes |
| Compliance/Risk check | No | No | Yes |
| Drive upload | No | No | Yes |
| Document sharing | No | No | Yes |
| Tag management | No | No | Yes |
| News topic selection | No | No | Yes |
| Chat retention | 30 min | 3 days | 7 days |
