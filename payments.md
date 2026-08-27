# Prompt: Build and Wire Up the Cradle Payment API in NestJS

Build a complete, production-ready **Cradle Payment API integration** in a NestJS application. This integration is strictly for **payments and M-Pesa STK Push** functionality. Do not include or integrate any voice, SMS, messaging, or unrelated Cradle services.

The system must expose backend API endpoints and provide a payment UI where a customer enters their Kenyan phone number, initiates an M-Pesa STK Push, receives a unique invoice number automatically, and can view a receipt/invoice after payment processing.

---

## 1. Objective

Create a payment flow that works as follows:

```text
Customer opens Payment Page
        ↓
System generates/creates payment invoice
        ↓
Customer enters phone number
        ↓
Customer enters/confirms payment amount
        ↓
Customer clicks "Pay with M-Pesa"
        ↓
NestJS requests Cradle access token
        ↓
NestJS calls Cradle /process/ endpoint
        ↓
M-Pesa STK Push is sent to customer's phone
        ↓
Customer enters M-Pesa PIN
        ↓
Payment status is received/updated
        ↓
System displays payment receipt/invoice
```

The frontend must never communicate directly with Cradle Payment API.

All Cradle credentials and API communication must remain securely on the NestJS server.

---

# 2. Cradle Payment API Configuration

Create environment variables:

```env
CRADLE_PAYMENT_BASE_URL=https://payment.cradlevoices.com
CRADLE_MERCHANT_ID=your_merchant_id
CRADLE_PASSWORD=your_password
```

Never hardcode credentials.

Never expose:

* `CRADLE_PASSWORD`
* Basic authentication credentials
* Access tokens

to the frontend.

Use NestJS `ConfigModule` and typed configuration.

---

# 3. Cradle Authentication Flow

The Cradle Payment API authentication endpoint is:

```text
GET https://payment.cradlevoices.com/auth/
```

Authentication uses HTTP Basic Authentication.

Construct the Basic credentials exactly as:

```text
merchantId:password
```

Then Base64 encode that complete string:

```text
Base64(merchantId:password)
```

Send the request with:

```http
Authorization: Basic <base64_credentials>
Accept: application/json
```

Example authentication response:

```json
{
  "error": false,
  "message": "Token Success",
  "accessToken": "ACCESS_TOKEN",
  "expires": 1787833494,
  "expiresIn": 3600,
  "expiresDate": "2026-08-27T12:24:54+00:00"
}
```

The `accessToken` must be used for payment initiation.

---

# 4. Token Management

Implement efficient server-side token caching.

Do not request a new access token for every payment.

The token response includes:

```text
expiresIn: 3600
```

Implement this logic:

```text
Payment request arrives
        ↓
Check cached access token
        ↓
Is token valid?
   ┌────┴────┐
   │         │
  YES        NO
   │         │
Reuse      Request new token
token           ↓
   │        Cache token
   └────────────┘
        ↓
Initiate payment
```

Requirements:

* Cache the token in memory initially.
* Refresh the token approximately 60 seconds before expiration.
* Prevent multiple simultaneous requests from creating unnecessary authentication requests.
* Never expose the token to the client.
* If the provider rejects the token, clear it, obtain a fresh token, and retry once.

Create a dedicated method:

```ts
getValidAccessToken()
```

---

# 5. Payment Initiation Endpoint

Cradle payment processing uses:

```text
POST https://payment.cradlevoices.com/process/
```

The request must contain:

```http
Content-Type: application/json
Authorization: Bearer <accessToken>
```

The access token returned from `/auth/` must be used directly.

Do not Base64 encode the access token again.

---

# 6. Cradle STK Push Request

The NestJS server should send a request similar to:

```json
{
  "merchantId": "YOUR_MERCHANT_ID",
  "currency": "KES",
  "amount": 100,
  "payerPhone": "254712345678",
  "externalId": "INV-2026-000001",
  "callbackUrl": "https://yourdomain.com/api/payments/cradle/callback",
  "redirectUrl": "https://yourdomain.com/payment/success"
}
```

The `merchantId` must come from environment configuration.

The `currency` should initially be:

```text
KES
```

The `payerPhone` must be normalized to Kenyan international format:

```text
254XXXXXXXXX
```

---

# 7. Phone Number Normalization

The payment UI should allow common Kenyan formats:

```text
0712345678
712345678
254712345678
+254712345678
```

Normalize all valid formats to:

```text
254712345678
```

Reject invalid Kenyan phone numbers.

Create a reusable utility:

```ts
normalizeKenyanPhoneNumber(phone: string): string
```

Use validation before calling the Cradle API.

---

# 8. Invoice Number Generation

Every payment attempt must automatically receive a unique invoice number.

Use a clear format such as:

```text
INV-YYYY-000001
```

Examples:

```text
INV-2026-000001
INV-2026-000002
INV-2026-000003
```

The invoice number should be generated server-side.

It must never rely solely on the frontend.

Requirements:

* Unique.
* Sequential or safely generated.
* Stored in the database.
* Used as the Cradle `externalId`.
* Associated with exactly one payment record.

For example:

```text
invoiceNumber = INV-2026-000001
externalId = INV-2026-000001
```

Handle concurrent requests safely so duplicate invoice numbers cannot be generated.

Use database transactions or another reliable concurrency-safe mechanism.

---

# 9. Payment Database Model

Create a payment model/entity with fields similar to:

```text
id
invoiceNumber
externalId
merchantId
amount
currency
payerPhone
status
provider
providerReference
providerResponse
callbackResponse
createdAt
updatedAt
completedAt
```

Use the application's existing database and ORM conventions.

Recommended provider value:

```text
CRADLE
```

Recommended statuses:

```text
PENDING
PROCESSING
SUCCESS
FAILED
EXPIRED
```

Do not mark a payment as successful merely because the STK Push request was accepted.

A successful STK Push initiation is different from a successful customer payment.

---

# 10. Public API Endpoint

Expose an endpoint for initiating payment:

```http
POST /api/payments/initiate
```

Example request:

```json
{
  "phone": "0712345678",
  "amount": 100
}
```

The backend should:

1. Validate the amount.
2. Validate the phone number.
3. Normalize the phone number.
4. Generate a unique invoice number.
5. Create a `PENDING` payment record.
6. Obtain a valid Cradle access token.
7. Call `/process/`.
8. Update the payment record with the provider response.
9. Return a safe response to the UI.

Example response:

```json
{
  "success": true,
  "invoiceNumber": "INV-2026-000001",
  "status": "PROCESSING",
  "message": "STK Push has been sent to your phone."
}
```

Never return:

* Merchant password.
* Cradle access token.
* Basic authorization credentials.

---

# 11. Payment Status Endpoint

Expose an endpoint:

```http
GET /api/payments/:invoiceNumber
```

Example:

```text
GET /api/payments/INV-2026-000001
```

Return:

```json
{
  "invoiceNumber": "INV-2026-000001",
  "amount": 100,
  "currency": "KES",
  "phone": "254712345678",
  "status": "PROCESSING"
}
```

The frontend can use this endpoint to check whether the payment has completed.

If polling is used:

* Poll at a reasonable interval.
* Stop polling after success or failure.
* Do not create excessive API traffic.

---

# 12. Cradle Callback/Webhook

Create:

```http
POST /api/payments/cradle/callback
```

The callback URL sent to Cradle should point to this endpoint.

Example:

```text
https://yourdomain.com/api/payments/cradle/callback
```

Requirements:

1. Receive the provider callback.
2. Identify the payment using the invoice/external reference.
3. Update the payment status.
4. Store the callback payload for auditing.
5. Make callback processing idempotent.
6. Do not process the same successful callback twice.
7. Return a successful response quickly.

Important:

Do not invent the callback payload structure.

Implement the exact callback DTO only after confirming the Cradle API callback documentation.

Until then, safely log and store the raw payload structure for development/testing.

---

# 13. Payment UI

Create a clean, modern, mobile-friendly payment page.

The page should contain:

### Header

```text
Secure Payment
```

### Invoice Information

Display:

```text
Invoice Number
INV-2026-000001

Amount
KES 100
```

### Phone Number Input

```text
M-Pesa Phone Number

[ 0712 345 678 ]
```

### Payment Button

```text
Pay KES 100
```

or:

```text
Send M-Pesa Prompt
```

The UI should clearly explain:

```text
An M-Pesa payment prompt will be sent to your phone.
Enter your M-Pesa PIN on your phone to complete the payment.
```

---

# 14. Payment UI States

The interface must handle the following states.

## Initial State

```text
Invoice Number
Amount
Phone Number Input
Pay Button
```

---

## Processing State

After clicking the payment button:

```text
Processing Payment

An M-Pesa prompt has been sent to your phone.

Please check your phone and enter your M-Pesa PIN.
```

Disable duplicate payment submissions.

Show a loading indicator.

---

## Success State

When payment is confirmed:

```text
✓ Payment Successful

Invoice: INV-2026-000001

Amount Paid: KES 100

Status: Paid
```

Show a button:

```text
View Receipt
```

---

## Failed State

If payment fails:

```text
Payment Failed

Your payment could not be completed.
Please try again.
```

Allow a safe retry.

A retry must not accidentally reuse or duplicate the original transaction incorrectly.

---

# 15. Receipt / Invoice Page

Create a printable receipt page.

Route example:

```text
/payment/receipt/:invoiceNumber
```

Example:

```text
/payment/receipt/INV-2026-000001
```

The receipt should display:

```text
PAYMENT RECEIPT

Invoice Number
INV-2026-000001

Amount
KES 100

Payment Method
M-Pesa

Phone Number
2547******678

Status
PAID

Date
27 August 2026

Payment Reference
<provider reference when available>
```

Mask the customer's phone number where appropriate.

Do not expose sensitive provider data.

Include:

```text
Print Receipt
```

The receipt should have a clean print-friendly layout.

---

# 16. API and Service Architecture

Use a clean NestJS architecture.

Suggested structure:

```text
src/
├── payments/
│   ├── payments.module.ts
│   ├── payments.controller.ts
│   ├── payments.service.ts
│   │
│   ├── dto/
│   │   ├── initiate-payment.dto.ts
│   │   └── payment-response.dto.ts
│   │
│   ├── cradle/
│   │   ├── cradle-payment.service.ts
│   │   ├── cradle-auth.service.ts
│   │   ├── cradle.types.ts
│   │   └── cradle.constants.ts
│   │
│   └── utils/
│       ├── phone.util.ts
│       └── invoice.util.ts
│
└── config/
    └── cradle-payment.config.ts
```

Responsibilities:

### `CradleAuthService`

Responsible only for:

* Calling `/auth/`.
* Creating Basic authentication credentials.
* Receiving access tokens.
* Caching and refreshing tokens.

### `CradlePaymentService`

Responsible only for:

* Getting a valid token.
* Calling `/process/`.
* Sending payment payloads.
* Handling provider communication.

### `PaymentsService`

Responsible for:

* Creating payment records.
* Generating invoices.
* Coordinating payment flow.
* Updating payment records.
* Applying business rules.

### `PaymentsController`

Responsible for exposing the REST API.

---

# 17. Error Handling

Handle:

### Invalid phone number

```http
400 Bad Request
```

### Invalid amount

```http
400 Bad Request
```

### Duplicate invoice

Prevent duplicates at the database level.

### Cradle authentication failure

Handle safely and return a controlled server error.

### Provider unavailable

Handle:

```text
500
502
503
504
```

Return an appropriate service unavailable response.

### Expired token

Clear the cached token and authenticate again.

Retry the failed payment request only once when the failure is clearly caused by authentication.

Do not create infinite retry loops.

---

# 18. Logging

Implement structured logs for:

```text
Payment created
Invoice generated
STK Push requested
Token refreshed
Provider response received
Callback received
Payment successful
Payment failed
```

Never log:

```text
Passwords
Authorization headers
Access tokens
Full sensitive credentials
```

Mask sensitive phone numbers in production logs.

---

# 19. Security Requirements

The implementation must ensure:

* Cradle credentials are server-side only.
* Access tokens are server-side only.
* Invoice numbers cannot be manipulated by the client.
* Payment amounts are validated server-side.
* Duplicate payment requests are prevented.
* Callback processing is idempotent.
* Database updates are transactional where required.
* API input uses DTO validation.
* Sensitive information is masked in logs.

---

# 20. Frontend Integration

The payment UI should communicate only with the NestJS backend.

Correct architecture:

```text
Payment UI
     │
     │ POST /api/payments/initiate
     ▼
NestJS Backend
     │
     │ GET /auth/
     ▼
Cradle Payment API
     │
     │ accessToken
     ▼
NestJS Backend
     │
     │ POST /process/
     ▼
Cradle Payment API
     │
     ▼
M-Pesa STK Push
```

Never allow:

```text
Frontend → Cradle API directly
```

---

# 21. Expected Final Deliverables

Implement:

1. Complete NestJS Payments Module.
2. Cradle Payment API configuration.
3. `/auth/` authentication integration.
4. Server-side access token caching.
5. `/process/` STK Push integration.
6. Invoice number generation.
7. Payment database model.
8. Payment initiation endpoint.
9. Payment status endpoint.
10. Cradle callback endpoint.
11. Kenyan phone number normalization.
12. Payment UI.
13. Processing/payment status UI.
14. Printable receipt/invoice page.
15. DTO validation.
16. Error handling.
17. Structured logging.
18. Unit tests for authentication and payment processing.

The implementation must be clean, modular, secure, and production-oriented.

Do not add voice, SMS, messaging, or unrelated Cradle services. This integration is exclusively for the **Cradle Payment API and M-Pesa/STK Push payment processing**.
