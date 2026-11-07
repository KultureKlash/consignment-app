import prisma from "~/db.server";
import { sendPayoutReadyEmail, sendPayoutPaidEmail } from "~/services/email";
import { PAYOUT_STATUS } from "~/lib/domain";
import { TRANSACTION_TYPE, ORDER_ITEM_STATUS } from "~/lib/domain";
import { Prisma } from "@prisma/client";
import { computeTax } from "~/lib/tax";
import { sumMoney, ZERO } from "~/lib/finance";

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
  const consignorMap = new Map<
    string,
    { consignor: UnpaidTx["consignor"]; transactions: UnpaidTx[]; total: Prisma.Decimal }
  >();

  for (const tx of unpaidTxs) {
    const existing = consignorMap.get(tx.consignorId);
    if (existing) {
      existing.transactions.push(tx);
      existing.total = existing.total.plus(tx.consignorAmount);
    } else {
      consignorMap.set(tx.consignorId, {
        consignor: tx.consignor,
        transactions: [tx],
        total: tx.consignorAmount,
      });
    }
  }

  const unpaidByConsignor = Array.from(consignorMap.values())
    .sort((a, b) => b.total.comparedTo(a.total));

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
  const totalOutstanding = sumMoney(unpaidByConsignor.map((c) => c.total));

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

  const amount = sumMoney(transactions.map((tx) => tx.consignorAmount));

  // Decimal comparison. `amount <= 0` on a float could pass for a balance that
  // was really zero but summed to 1e-13, creating a payout for nothing.
  if (amount.lessThanOrEqualTo(ZERO)) {
    throw new Error("Payout amount must be greater than 0");
  }

  // Atomic: re-validate + create inside transaction to prevent double-payout on
  // concurrent requests. A single bulk query (not one findFirst per txn) keeps
  // the interactive transaction fast enough to stay under the 5s timeout even
  // for large batches.
  const payout = await prisma.$transaction(async (tx) => {
    const alreadyPaid = await tx.payoutItem.findMany({
      where: { transactionId: { in: transactionIds } },
      select: { transactionId: true },
    });
    if (alreadyPaid.length > 0) {
      throw new Error(`Transaction ${alreadyPaid[0].transactionId} was already included in a payout`);
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

  // Email body: display boundary, so money becomes a number here.
  sendPayoutReadyEmail(payout.consignor, {
    amount: payout.amount.toNumber(),
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
  // computeTax and the email body are both display-side: the GST/QST figures
  // go on an invoice, are never stored, and never drive a write. Converting to
  // number here is the documented boundary.
  const tax = computeTax(payout.amount.toNumber(), payout.consignor);
  sendPayoutPaidEmail(payout.consignor, {
    amount: payout.amount.toNumber(),
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
