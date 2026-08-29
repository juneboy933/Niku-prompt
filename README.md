# Niku-Prompt?

**"Can I prompt you?"** — Instant invoicing and M-Pesa collection for Kenya's
informal manufacturers (jua kali), built for the Africa's Talking Open
Hackathon.

A manufacturer finishes a job, dials a USSD code, and sends a payment request
to their customer's phone by number. The customer gets an SMS, replies to
accept or reject, and — on accept — an M-Pesa STK push lands on their phone.
Once paid, both sides get an SMS confirmation. No app, no smartphone required
on either end.

## The problem

Jua kali manufacturers (welders, carpenters, fabricators) chase payment
manually after finishing a job — no invoice, no record, no prompt forcing the
transaction to close. This delays cash flow and leaves disputes unwinnable.
Niku-Prompt? replaces that with a recorded, prompted, near-instant
transaction using USSD, SMS, and M-Pesa STK Push.

## Architecture

The core domain is modelled as four tables, each owning one concern:

| Table | Owns | Lifecycle |
|---|---|---|
| **Manufacturer** | Registration — `phoneNumber` (from USSD session), `businessName` | Registered / not |
| **Invoice** | The business-facing request | `CREATED → SENT → ACCEPTED/REJECTED/EXPIRED → PAYMENT_PENDING → SETTLED` |
| **Transaction** | One row per STK attempt (an invoice can have several, e.g. after a retry) | `INITIATED → PUSHED → SUCCESS/FAILED/UNKNOWN` |
| **Ledger** | Append-only, the source of truth for settlement | Written only when a Transaction reaches `SUCCESS` |

**Ledger is truth.** `Invoice.status` only reaches `SETTLED` as a side effect
of a Ledger write (`LedgerService.recordSettlement`), never set directly —
that write, the Transaction update, and the Invoice update happen inside a
single Prisma `$transaction` so they commit together or not at all.

**Modules talk through events, not direct calls**, to avoid a circular
dependency between the SMS and payment flows: `SmsService` emits
`invoice.accepted` after a customer accepts by SMS reply; `PaymentsService`
listens for that event and initiates the STK push. Neither module imports
the other directly.

```
src/
├── manufacturer/   registration, lookup
├── invoice/        the state machine above, phone normalization, unique codes
├── transaction/     STK attempt lifecycle
├── ledger/          atomic settlement (Ledger → Transaction → Invoice)
├── sms/             Africa's Talking SMS — outbound sends, inbound reply parsing
├── ussd/            the USSD menu tree — registration + invoice creation
├── payments/        Cradle Payment API integration (wraps M-Pesa STK Push)
└── prisma/          PrismaService, Prisma 7 driver-adapter wiring
```

### Why Cradle instead of raw Daraja

The STK push and payment-status callback are handled through the
[Cradle Payment API](https://payment.cradlevoices.com), which wraps M-Pesa,
rather than calling Safaricom's Daraja API directly. `PaymentsService`
listens for `invoice.accepted`, creates a `Transaction`, calls Cradle's
`/process/` endpoint, and marks the transaction `PUSHED`. Cradle's callback
(`POST /api/payments/cradle/invoice-callback`) resolves it to `SUCCESS` or
`FAILED`, and on success calls `LedgerService.recordSettlement` — the same
guarded, atomic path described above.

`payments/` also contains a second, independent flow (`POST
/api/payments/initiate`, its own `Payment` table, and the pages under
`public/`) — a standalone Cradle payment demo not tied to the
Manufacturer/Invoice flow, useful for testing the Cradle integration in
isolation from USSD/SMS.

## Setup

**Requirements:** Node.js, Docker, an Africa's Talking sandbox account, and
Cradle Payment API sandbox credentials.

```bash
npm install
docker compose up -d          # Postgres + Redis
npx prisma migrate dev        # creates tables from prisma/schema.prisma
npm run start:dev
```

Copy `.env.example` to `.env` and fill in:

```env
DATABASE_URL=postgresql://postgres_user:postgre_password@localhost:port/postgres_database

# Africa's Talking — sandbox username is always "sandbox"
AT_USERNAME=sandbox
AT_API_KEY=your_sandbox_api_key

# Cradle Payment API
CRADLE_PAYMENT_BASE_URL=https://payment.cradlevoices.com
CRADLE_MERCHANT_ID=your_merchant_id
CRADLE_PASSWORD=your_password
CRADLE_CALLBACK_URL=https://<your-ngrok-domain>/api/payments/cradle/invoice-callback
CRADLE_REDIRECT_URL=http://localhost:3000/payment/success
CRADLE_CURRENCY=KES

PORT=3000
```

`AT_USERNAME`/`AT_API_KEY` are missing from the committed `.env.example` —
add them before anyone else clones this.

To receive Africa's Talking's and Cradle's webhooks locally, expose your
server with a tunnel:

```bash
ngrok http 3000
```

Point AT's USSD channel and SMS callback, and Cradle's `callbackUrl`, at your
ngrok URL.

## Routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/ussd` | Africa's Talking USSD session callback |
| `POST` | `/sms/inbound` | Africa's Talking inbound SMS callback (customer accept/reject) |
| `POST` | `/api/payments/initiate` | Standalone Cradle payment demo (not tied to an Invoice) |
| `GET` | `/api/payments/:invoiceNumber` | Status lookup for the standalone demo |
| `POST` | `/api/payments/cradle/callback` | Cradle callback for the standalone demo |
| `POST` | `/api/payments/cradle/invoice-callback` | Cradle callback for the real Invoice/Transaction/Ledger flow |
| `GET` | `/payment/success` | Static success page |
| `GET` | `/payment/receipt/:invoiceNumber` | Static receipt page |

## The USSD flow

```
Dial USSD code
│
├─ Unregistered
│   Niku-Prompt?
│   1. Register  2. Ask for payment
│   ├─ 1 → Enter business name → registered
│   └─ 2 → "Please register first"
│
└─ Registered
    Niku-Prompt?
    1. Ask for payment
    └─ Enter customer number → Enter amount →
       "Invoice for KES X. 1. Confirm  2. Cancel"
       ├─ 1 → Invoice created, SMS sent to customer
       └─ 2 → cancelled
```

## Known limitations (sandbox testing)

Africa's Talking's sandbox simulator has real constraints worth knowing
before a live demo:

- **Safaricom numbers behave inconsistently in the sandbox** — SMS and USSD
  simulation is most reliable with Airtel test numbers.
- **The sandbox has no way to simulate an inbound SMS reply** — you can send
  an outbound SMS and trigger USSD sessions, but there's no simulator path
  for "customer replies 1234-1 by SMS." To test `POST /sms/inbound` and the
  accept/reject flow end to end, call the endpoint directly (`curl`/Postman)
  with a payload shaped like AT's real inbound webhook, rather than relying
  on the simulator.
- These are sandbox-only constraints — they don't reflect a bug in this
  codebase, and a production AT account doesn't have them. Worth stating
  plainly to judges if asked why a live SMS-reply demo isn't possible in the
  sandbox.

## Suggested next steps

- **Fix the phone-format mismatch** described above — normalize `from` in
  `SmsService.handleInboundReply` the same way `Invoice.customerNumber` is
  normalized, or the accept/reject guard silently drops legitimate replies.
- **`InvoiceStatus.EXPIRED` is defined but never set.** Nothing currently
  transitions a `SENT` invoice past its 24h `expiresAt`. A lazy check
  (flip the status when `findInvoiceByCode` notices `expiresAt` has passed)
  is the smallest fix; a scheduled job is the more correct one.
- **`bullmq`/`ioredis`/`@nestjs/bullmq` are installed but unused** — they were
  part of the original raw-Daraja polling design, superseded once Cradle's
  callback model made polling unnecessary. Safe to remove before submission
  if not needed elsewhere, to keep the dependency list honest.
- **Add `AT_USERNAME`/`AT_API_KEY` to `.env.example`** — currently missing,
  so a fresh clone can't run the SMS/USSD flow without guessing them.
