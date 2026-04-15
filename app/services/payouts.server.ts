import prisma from "~/db.server";
import { sendPayoutReadyEmail } from "~/services/email.server";

/**
 * Get all data needed for the payouts admin page:
 * - Consignors with unpaid sale transactions
 * - Recent payouts with item breakdowns
 * - Summary stats
 */
export async function getPayoutsPageData() {
  // Unpaid sale transactions: type=sale, not linked to any PayoutItem
  const unpaidTxs = await prisma.transaction.findMany({
    where: {
      type: "sale",
      payoutItems: { none: {} },
      consignor: { storeOwned: false },
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
    prisma.payout.aggregate({ where: { status: "pending" }, _sum: { amount: true } }),
    prisma.payout.aggregate({ where: { status: "invoiced" }, _sum: { amount: true } }),
    prisma.payout.aggregate({ where: { status: "paid" }, _sum: { amount: true } }),
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
    include: { payoutItems: true },
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
        status: "pending",
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

  if (payout.status !== "pending") {
    throw new Error(`Cannot mark as invoiced: payout is "${payout.status}" (must be "pending")`);
  }

  return prisma.payout.update({
    where: { id: payoutId },
    data: { status: "invoiced" },
    include: { consignor: true },
  });
}

/**
 * Mark a payout as paid.
 * - Business consignors: must be "invoiced" (invoice required first)
 * - Individual consignors: can be "pending" or "invoiced" (no invoice needed)
 */
export async function markPaid(payoutId: string) {
  const payout = await prisma.payout.findUniqueOrThrow({
    where: { id: payoutId },
    include: { consignor: true },
  });

  const isIndividual = payout.consignor.taxStatus !== "business";
  const allowedStatuses = isIndividual ? ["pending", "invoiced"] : ["invoiced"];

  if (!allowedStatuses.includes(payout.status)) {
    const expected = isIndividual ? '"pending" or "invoiced"' : '"invoiced"';
    throw new Error(`Cannot mark as paid: payout is "${payout.status}" (must be ${expected})`);
  }

  return prisma.payout.update({
    where: { id: payoutId },
    data: { status: "paid" },
    include: { consignor: true },
  });
}

/**
 * Cancel a pending payout. Deletes the payout and its items.
 * Cannot cancel paid payouts.
 */
export async function cancelPayout(payoutId: string) {
  const payout = await prisma.payout.findUniqueOrThrow({
    where: { id: payoutId },
  });

  if (payout.status === "paid") {
    throw new Error("Cannot cancel a paid payout");
  }

  // PayoutItems cascade-delete due to onDelete: Cascade
  await prisma.payout.delete({ where: { id: payoutId } });
}
