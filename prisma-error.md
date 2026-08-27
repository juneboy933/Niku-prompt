# Error Resolution Guide: Prisma P2028 Transaction Timeout

## Objective

Fix the Prisma database transaction error currently occurring in the NestJS payment system.

**Important:** Do not create, modify, run, or include tests as part of this task. Focus exclusively on fixing the production application code and configuration.

---

## Current Error

The NestJS application starts successfully, but payment initiation fails when creating a pending payment record.

Error:

```text
PrismaClientKnownRequestError:
Transaction API error: Unable to start a transaction in the given time.

code: P2028
clientVersion: 7.10.0
```

Relevant stack trace:

```text
at PaymentsService.createPendingPayment
src/payments/payments.service.ts:150

at PaymentsService.initiatePayment
src/payments/payments.service.ts:34
```

The application is using:

* NestJS
* Prisma 7.10.0
* PostgreSQL
* `@prisma/adapter-pg`

There is also a PostgreSQL SSL warning:

```text
SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca'
are treated as aliases for 'verify-full'.
```

The SSL warning is not automatically assumed to be the cause of the transaction failure. Investigate the actual Prisma connection and transaction lifecycle before changing SSL configuration.

---

# Primary Task

Inspect the existing codebase and identify the exact reason Prisma cannot start the transaction.

Pay special attention to:

```text
src/payments/payments.service.ts
```

especially:

```text
createPendingPayment()
```

around line 150.

Also inspect:

* Prisma service/provider setup
* PostgreSQL adapter configuration
* Connection pool configuration
* Prisma client lifecycle
* Payment invoice generation logic
* Database transaction usage

Do not guess. Inspect the existing implementation and fix the actual cause.

---

# Critical Architecture Rules

## 1. Never Call External APIs Inside a Database Transaction

The payment flow must not look like this:

```text
START TRANSACTION
      ↓
Create payment
      ↓
Call Cradle /auth/
      ↓
Wait for access token
      ↓
Call Cradle /process/
      ↓
Wait for provider response
      ↓
Update payment
      ↓
COMMIT
```

This is incorrect because external HTTP requests can hold database connections and transactions open.

Instead, the architecture must be:

```text
DATABASE TRANSACTION
      ↓
Generate invoice number
      ↓
Create pending payment
      ↓
COMMIT
      ↓
Get Cradle access token
      ↓
Call Cradle /process/
      ↓
Receive provider response
      ↓
Update payment record
```

The database transaction must contain database operations only.

---

# 2. Keep Transactions Extremely Short

If `createPendingPayment()` requires a transaction, it should only perform operations such as:

```text
Generate invoice sequence
Create payment record
Commit transaction
```

Do not include:

* HTTP requests
* `fetch`
* Axios calls
* `HttpService` calls
* Cradle authentication
* Cradle `/process/` calls
* Delays
* Long-running calculations
* User interaction

---

# 3. Investigate Prisma Client Lifecycle

Ensure the application is not creating Prisma clients repeatedly.

The architecture should effectively be:

```text
NestJS Application
        ↓
One PrismaService
        ↓
One PrismaClient
        ↓
One PostgreSQL connection pool
```

Do not create a new:

```text
PrismaClient
Pool
PrismaPgAdapter
```

inside:

* Controllers
* Services
* Payment requests
* Individual methods

The Prisma client and PostgreSQL pool should be initialized once and managed through NestJS dependency injection.

Inspect the existing Prisma service and correct lifecycle issues if they exist.

---

# 4. Investigate `@prisma/adapter-pg`

The project uses:

```text
@prisma/adapter-pg
```

Verify that:

* The PostgreSQL pool is configured correctly.
* Only one pool is created.
* Prisma uses the intended adapter.
* The connection string is loaded correctly.
* The application does not create duplicate database connections.
* Pool exhaustion is not occurring.

Do not replace the existing Prisma architecture unnecessarily.

Make the smallest correct change needed.

---

# 5. Fix Invoice Number Generation Safely

Each payment requires a unique invoice number.

Example format:

```text
INV-2026-000001
INV-2026-000002
INV-2026-000003
```

The invoice number must:

* Be generated server-side.
* Be unique.
* Be safe under concurrent requests.
* Be stored with the payment.
* Be used as the payment `externalId`.

Do not use unsafe logic such as:

```text
Find latest invoice
      ↓
Add 1
      ↓
Create payment
```

without concurrency protection.

If the existing implementation uses a transaction for invoice generation, keep that transaction short and efficient.

A dedicated database counter/sequence may be used if appropriate for the existing schema.

---

# 6. Prisma Transaction Handling

Investigate why this error occurs:

```text
P2028
Unable to start a transaction in the given time.
```

Check whether the issue is caused by:

* Connection pool exhaustion.
* Multiple Prisma clients.
* Multiple PostgreSQL pools.
* Long-running transactions.
* Transactions waiting for locks.
* Incorrect interactive transaction usage.
* Incorrect PostgreSQL adapter configuration.
* Slow/unavailable cloud PostgreSQL connections.
* Nested transactions.
* Transaction timeout configuration.

Fix the root cause rather than simply increasing the timeout.

Increasing:

```ts
maxWait
timeout
```

may be used only when justified after identifying the actual problem.

Do not blindly increase transaction timeouts as the primary solution.

---

# 7. Payment Flow After the Fix

The final payment flow must be:

```text
POST /payments/initiate
        ↓
Validate request
        ↓
Normalize Kenyan phone number
        ↓
Generate unique invoice number
        ↓
Create PENDING payment in database
        ↓
Database operation completes
        ↓
Get cached Cradle token
        ↓
Refresh token only if necessary
        ↓
Call Cradle /process/
        ↓
Send M-Pesa STK Push
        ↓
Update payment with provider response
        ↓
Return safe response to UI
```

The database must be operational before calling the Cradle API.

---

# 8. Error Handling

Improve production error handling around database operations.

Do not expose raw Prisma errors directly to the frontend.

Log useful internal information while returning controlled NestJS exceptions.

For example:

* Database unavailable → controlled server/service error.
* Transaction timeout → log context and return a controlled error.
* Duplicate invoice → handle safely.
* Duplicate payment request → prevent duplicate processing.

Do not log:

* Database passwords.
* Cradle passwords.
* Access tokens.
* Authorization headers.

---

# 9. SSL Warning

The application currently displays a PostgreSQL SSL warning related to:

```text
sslmode=prefer
sslmode=require
sslmode=verify-ca
```

Do not assume this warning causes the P2028 error.

Inspect the current `DATABASE_URL` and PostgreSQL provider requirements.

Only modify SSL configuration if it is actually incorrect for the configured PostgreSQL provider.

Do not weaken database security simply to suppress the warning.

---

# Required Investigation Order

Follow this order:

1. Inspect `PaymentsService.createPendingPayment()`.
2. Inspect the exact transaction at or around line 150.
3. Inspect `PrismaService`.
4. Inspect PostgreSQL pool creation.
5. Inspect `PrismaPgAdapter` configuration.
6. Check for multiple Prisma clients.
7. Check for multiple PostgreSQL pools.
8. Check whether external API calls occur inside transactions.
9. Check invoice generation concurrency logic.
10. Fix the actual root cause.
11. Keep changes minimal and aligned with the existing project architecture.

---

# Important Constraints

## Do NOT

* Do not create tests.
* Do not modify existing tests.
* Do not add unit tests.
* Do not add integration tests.
* Do not add end-to-end tests.
* Do not include test files in the implementation.
* Do not replace the entire payment architecture unnecessarily.
* Do not remove transactions without understanding why they exist.
* Do not put Cradle API calls inside transactions.
* Do not expose secrets.
* Do not blindly increase Prisma timeouts.

## Do

* Inspect the existing implementation first.
* Fix the actual root cause.
* Keep database transactions short.
* Ensure proper Prisma lifecycle management.
* Ensure proper PostgreSQL pool management.
* Preserve the existing payment architecture where possible.
* Maintain safe concurrent invoice generation.
* Provide clean production-ready NestJS code.

---

# Expected Result

After the fix:

1. The NestJS application starts normally.
2. Prisma connects reliably to PostgreSQL.
3. `createPendingPayment()` successfully creates payment records.
4. Invoice numbers are generated safely.
5. No unnecessary Prisma transaction timeout occurs.
6. Payment initiation proceeds to the Cradle Payment API.
7. The Cradle API can initiate the M-Pesa STK Push.
8. Payment records can be updated with provider responses.
9. The frontend receives a controlled payment response.

Focus exclusively on fixing the production code and configuration. **Exclude all tests from the implementation and do not generate any test code.**
