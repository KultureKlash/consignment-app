import prisma from "~/db.server";
import { sendPayoutReadyEmail, sendPayoutPaidEmail } from "~/services/email";
import { PAYOUT_STATUS } from "~/lib/domain";
import { TRANSACTION_TYPE, ORDER_ITEM_STATUS } from "~/lib/domain";
import { computeTax } from "~/lib/tax";

/**
 * Get all data needed for the payouts admin page:
 * - Consignors with unpaid sale transactions
 * - Recent payouts with item breakdowns
 * - Summary stats
 */
export async function getPayoutsPageData() {
  // Unpaid sale transactions: type=sale, not linked to any PayoutItem,
  // AND the order item hasn't been refunded (refunded sales are owed nothing).
  const unpaidTxs = await prisma.transaction.findMany({
    where: {
      type: TRANSACTION_TYPE.SALE,
      payoutItems: { none: {} },
      consignor: { storeOwned: false },
      orderItem: { status: { not: ORDER_ITEM_STATUS.REFUNDED } },
    },
    include: {
      consignor: true,
      orderItem: {
        include: {
          order: true,
          listing: {
            include: {
              variant: { include: { product: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Group unpaid transactions by consignor
  type UnpaidTx = typeof unpaidTxs[number];
  const consignorMap = new Map<string, { consignor: UnpaidTx["consignor"]; transactions: UnpaidTx[]; total: number }>();

  for (const tx of unpaidTxs) {
    const existing = consignorMap.get(tx.consignorId);
    if (existing) {
      existing.transactions.push(tx);
      existing.total += tx.consignorAmount;
    } else {
      consignorMap.set(tx.consignorId, {
        consignor: tx.consignor,
        transactions: [tx],
        total: tx.consignorAmount,
      });
    }
  }

  const unpaidByConsignor = Array.from(consignorMap.values())
    .sort((a, b) => b.total - a.total);

  // Recent payouts with items
  const payouts = await prisma.payout.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    include: {
      consignor: true,
      items: {
        include: {
          transaction: {
            include: {
              orderItem: {
                include: {
                  order: true,
                  listing: {
                    include: {
                      variant: { include: { product: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Summary stats
  const totalOutstanding = unpaidByConsignor.reduce((sum, c) => sum + c.total, 0);

  const [pendingAgg, invoicedAgg, paidAgg] = await Promise.all([
    prisma.payout.aggregate({ where: { status: PAYOUT_STATUS.PENDING }, _sum: { amount: true } }),
    prisma.payout.aggregate({ where: { status: PAYOUT_STATUS.INVOICED }, _sum: { amount: true } }),
    prisma.payout.aggregate({ where: { status: PAYOUT_STATUS.PAID }, _sum: { amount: true } }),
  ]);

  return {
    unpaidByConsignor,
    payouts,
    stats: {
      totalOutstanding,
      totalPending: pendingAgg._sum.amount ?? 0,
      totalInvoiced: invoicedAgg._sum.amount ?? 0,
      totalPaid: paidAgg._sum.amount ?? 0,
    },
  };
}

/**
 * Create a payout from selected transactions.
 * Validates ownership and prevents double-payout.
 */
export async function createPayout({
  consignorId,
  transactionIds,
}: {
  consignorId: string;
  transactionIds: string[];
}) {
  if (transactionIds.length === 0) {
    throw new Error("No transactions selected");
  }

  const transactions = await prisma.transaction.findMany({
    where: { id: { in: transactionIds } },
    include: { payoutItems: true, orderItem: true },
  });

  // Validate all exist
  if (transactions.length !== transactionIds.length) {
    throw new Error("Some transactions not found");
  }

  // Validate all belong to this consignor
  for (const tx of transactions) {
    if (tx.consignorId !== consignorId) {
      throw new Error(`Transaction ${tx.id} does not belong to this consignor`);
    }
  }

  // Validate none are already in a payout
  for (const tx of transactions) {
    if (tx.payoutItems.length > 0) {
      throw new Error(`Transaction ${tx.id} is already included in a payout`);
    }
  }

  // Validate none have been refunded — refunded items are owed nothing
  for (const tx of transactions) {
    if (tx.orderItem?.status === ORDER_ITEM_STATUS.REFUNDED) {
      throw new Error(`Transaction ${tx.id} cannot be paid out — the order item was refunded`);
    }
  }

  const amount = transactions.reduce((sum, tx) => sum + tx.consignorAmount, 0);

  if (amount <= 0) {
    throw new Error("Payout amount must be greater than 0");
  }

  // Atomic: re-validate + create inside transaction to prevent double-payout on concurrent requests
  const payout = await prisma.$transaction(async (tx) => {
    for (const txn of transactions) {
      const existing = await tx.payoutItem.findFirst({ where: { transactionId: txn.id } });
      if (existing) throw new Error(`Transaction ${txn.id} was already included in a payout`);
    }

    return tx.payout.create({
      data: {
        consignorId,
        amount,
        status: PAYOUT_STATUS.PENDING,
        items: {
          create: transactionIds.map((transactionId) => ({ transactionId })),
        },
      },
      include: {
        consignor: true,
        items: {
          include: {
            transaction: {
              include: {
                orderItem: {
                  include: {
                    order: true,
                    listing: {
                      include: {
                        variant: { include: { product: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  sendPayoutReadyEmail(payout.consignor, {
    amount: payout.amount,
    itemCount: transactionIds.length,
  }).catch(() => {});

  return payout;
}

/**
 * Mark a pending payout as invoiced (invoice received from consignor).
 */
export async function markInvoiced(payoutId: string) {
  const payout = await prisma.payout.findUniqueOrThrow({
    where: { id: payoutId },
  });

  if (payout.status !== PAYOUT_STATUS.PENDING) {
    throw new Error(`Cannot mark as invoiced: payout is "${payout.status}" (must be "${PAYOUT_STATUS.PENDING}")`);
  }

  return prisma.payout.update({
    where: { id: payoutId },
    data: { status: PAYOUT_STATUS.INVOICED },
    include: { consignor: true },
  });
}

/**
 * Mark a payout as paid.
 * - Business consignors: must be "invoiced" (invoice required first) — unless
 *   `allowMissingInvoice: true` is passed, which is the admin's explicit
 *   override for "pay them anyway, they can upload the invoice later"
 * - Individual consignors: can be "pending" or "invoiced" (no invoice needed)
 */
export async function markPaid(payoutId: string, opts: { allowMissingInvoice?: boolean } = {}) {
  const payout = await prisma.payout.findUniqueOrThrow({
    where: { id: payoutId },
    include: { consignor: true, items: true },
  });

  const isIndividual = payout.consignor.taxStatus !== "business";
  const allowedStatuses = isIndividual || opts.allowMissingInvoice
    ? [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.INVOICED]
    : [PAYOUT_STATUS.INVOICED];

  if (!allowedStatuses.includes(payout.status)) {
    const expected = isIndividual || opts.allowMissingInvoice
      ? `"${PAYOUT_STATUS.PENDING}" or "${PAYOUT_STATUS.INVOICED}"`
      : `"${PAYOUT_STATUS.INVOICED}"`;
    throw new Error(`Cannot mark as paid: payout is "${payout.status}" (must be ${expected})`);
  }

  const updated = await prisma.payout.update({
    where: { id: payoutId },
    data: { status: PAYOUT_STATUS.PAID },
    include: { consignor: true },
  });

  // Confirmation email (best-effort — don't block the status change if delivery fails)
  const tax = computeTax(payout.amount, payout.consignor);
  sendPayoutPaidEmail(payout.consignor, {
    amount: payout.amount,
    itemCount: payout.items.length,
    totalWithTax: tax.isTaxable ? tax.total : undefined,
    isTaxable: tax.isTaxable,
  }).catch(() => {});

  return updated;
}

/**
 * Cancel a pending payout. Deletes the payout and its items.
 * Cannot cancel paid payouts.
 */
export async function cancelPayout(payoutId: string) {
  const payout = await prisma.payout.findUniqueOrThrow({
    where: { id: payoutId },
  });

  if (payout.status === PAYOUT_STATUS.PAID) {
    throw new Error("Cannot cancel a paid payout");
  }

  // PayoutItems cascade-delete due to onDelete: Cascade
  await prisma.payout.delete({ where: { id: payoutId } });
}
