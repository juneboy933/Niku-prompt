
}
[Nest] 9196  - 27/08/2026, 15:59:30   ERROR [ExceptionsHandler] PrismaClientKnownRequestError: Transaction API error: Unable to start a transaction in the given time.
    at yr.#transformRequestError (C:\Users\driller\workspace\Niku-prompt\node_modules\@prisma\client\src\runtime\core\engines\client\ClientEngine.ts:309:14)
    at yr.transaction (C:\Users\driller\workspace\Niku-prompt\node_modules\@prisma\client\src\runtime\core\engines\client\ClientEngine.ts:462:18)
    at async Proxy._transactionWithCallback (C:\Users\driller\workspace\Niku-prompt\node_modules\@prisma\client\src\runtime\getPrismaClient.ts:849:16)
    at async PaymentsService.createPendingPayment (C:\Users\driller\workspace\Niku-prompt\src\payments\payments.service.ts:150:16)
    at async PaymentsService.initiatePayment (C:\Users\driller\workspace\Niku-prompt\src\payments\payments.service.ts:34:40)
    at async C:\Users\driller\workspace\Niku-prompt\node_modules\@nestjs\core\router\router-execution-context.js:55:62
    at async C:\Users\driller\workspace\Niku-prompt\node_modules\@nestjs\core\router\router-proxy.js:9:17 {
  code: 'P2028',
  meta: {},
  clientVersion: '7.10.0'
}
