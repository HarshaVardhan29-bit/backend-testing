# Enterprise Signup API

> Production-ready Node.js + Express + MongoDB monolith for user signup and email verification.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 18 |
| Framework | Express 4 |
| Database | MongoDB via Mongoose 8 |
| Validation | Zod |
| Password hashing | bcryptjs (cost 12) |
| Email | Nodemailer + SMTP |
| Security | helmet, express-mongo-sanitize, xss-clean |
| Rate limiting | express-rate-limit |
| Logging | Winston + Morgan |
| Jobs | node-cron |
| Env validation | envalid |

---

## Project Structure

```
src/
├── config/
│   ├── db.js          # MongoDB connection + lifecycle
│   ├── env.js         # Validated environment variables
│   └── logger.js      # Winston logger
├── jobs/
│   └── cleanupUnverified.js  # Cron: delete stale unverified accounts
├── middlewares/
│   ├── errorHandler.js       # Global error + 404 handlers
│   ├── rateLimiter.js        # Global, signup, OTP limiters
│   └── requestLogger.js      # Request ID + Morgan → Winston
├── modules/
│   └── user/
│       ├── user.model.js       # Mongoose schema
│       ├── user.repository.js  # DB queries (data access layer)
│       ├── user.service.js     # Business logic
│       ├── user.controller.js  # HTTP handlers
│       ├── user.routes.js      # Route definitions
│       └── user.validator.js   # Zod schemas + validate() middleware
├── utils/
│   ├── ApiError.js      # Operational error class
│   ├── ApiResponse.js   # Standard response envelope
│   ├── asyncHandler.js  # Async route wrapper
│   └── email.js         # Nodemailer singleton + OTP email
├── app.js               # Express app setup
└── server.js            # Entry point + graceful shutdown
```

---

## Getting Started

### 1. Prerequisites

- Node.js ≥ 18
- MongoDB (local or Atlas)
- SMTP credentials (Gmail App Password, SendGrid, etc.)

### 2. Install

```bash
npm install
```

### 3. Configure

```bash
cp .env.example .env
# Fill in MONGO_URI, SMTP_*, etc.
```

### 4. Run

```bash
# Development (nodemon)
npm run dev

# Production
npm start
```

---

## API Reference

### Base URL: `http://localhost:5000/api/v1`

---

### `POST /auth/signup`

Register a new user. Sends a 6-digit OTP to the provided email.

**Request body:**
```json
{
  "firstName":    "John",
  "lastName":     "Doe",
  "email":        "john@example.com",
  "password":     "P@ssword123",
  "phone":        "+919876543210",
  "signupSource": "web"
}
```

**Password rules:** min 8 chars, uppercase, lowercase, digit, special character.

**Response `201`:**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Account created. Please check your email for the verification OTP.",
  "data": {
    "id": "...",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "role": "user",
    "status": "pending_verification",
    "emailVerified": false,
    "createdAt": "..."
  }
}
```

---

### `POST /auth/verify-email`

Verify the OTP sent to the user's email. Activates the account.

**Request body:**
```json
{
  "email": "john@example.com",
  "otp": "482910"
}
```

**Response `200`:**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Email verified successfully. Your account is now active.",
  "data": { "status": "active", "emailVerified": true, ... }
}
```

---

### `POST /auth/resend-otp`

Resend a new OTP. Always returns `200` to prevent email enumeration.
Rate-limited: 60-second cooldown between requests.

**Request body:**
```json
{
  "email": "john@example.com"
}
```

---

### `GET /health`

Returns server + database health.

**Response `200`:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "...",
  "uptime": 42.3,
  "services": { "database": { "status": "connected" } }
}
```

---

## Error Response Format

All errors follow the same envelope:

```json
{
  "success": false,
  "statusCode": 422,
  "message": "Validation failed",
  "requestId": "uuid-v4",
  "errors": [
    { "field": "email", "message": "Must be a valid email address" },
    { "field": "password", "message": "Password must contain at least one uppercase letter" }
  ]
}
```

---

## Rate Limits

| Endpoint | Window | Max |
|---|---|---|
| All routes (global) | 15 min | 100 |
| `POST /auth/signup` | 1 hour | 10 per IP+email |
| `POST /auth/verify-email` | 15 min | 10 |
| `POST /auth/resend-otp` | 15 min | 10 |

---

## Security Features

- `helmet` — sets 15+ security HTTP headers
- `express-mongo-sanitize` — strips `$` / `.` from inputs (NoSQL injection)
- `xss-clean` — sanitizes HTML in string inputs
- OTP uses `crypto.timingSafeEqual` (constant-time comparison)
- Passwords hashed with bcrypt cost factor 12
- `password` and `emailOtp` fields are `select: false` in Mongoose
- `resendOtp` always returns 200 (prevents email enumeration)
- Request body capped at 10kb

---

## Environment Variables

See [`.env.example`](.env.example) for the full list with descriptions.
