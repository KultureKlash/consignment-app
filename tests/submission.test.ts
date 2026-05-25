import { describe, it, expect } from "vitest";
import { prisma, createTestConsignor } from "./setup";
import { createMockAdmin } from "./helpers/mock-admin";
import {
  submitListing,
  updateSubmittedListing,
  deleteSubmittedListing,
  approveListing,
  rejectListing,
  checkinListing,
  bulkApproveListing,
  bulkCheckinListing,
  bulkRequestWithdrawal,
  bulkApproveWithdrawal,
  bulkDenyWithdrawal,
  bulkCompleteWithdrawal,
  bulkUpdateActiveListingPrice,
  updateActiveListingPrice,
  setUnpricedListingPrice,
  bulkSetUnpricedListingPrices,
  requestWithdrawal,
  approveWithdrawal,
  denyWithdrawal,
  completeWithdrawal,
  adminEditAndApprove,
} from "~/services/submission";
import { createListing } from "~/services/listings";

describe("submission pipeline", () => {
  // ── Submit ──

  describe("submitListing", () => {
    it("creates a listing with status=submitted and submittedAt", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Jordan 1 Retro High",
        brand: "Nike",
        category: "Footwear > Sneakers",
        size: "10",
        price: 250,
      });

      expect(listing.status).toBe("submitted");
      expect(listing.submittedAt).toBeTruthy();
      expect(listing.price).toBe(250);
      expect(listing.variant.size).toBe("10");
      expect(listing.variant.product.title).toBe("Jordan 1 Retro High");
    });

    it("creates multiple listings with count > 1", async () => {
      const consignor = await createTestConsignor();
      await submitListing({
        consignorId: consignor.id,
        title: "Yeezy 350",
        size: "9",
        price: 200,
        count: 3,
      });

      const listings = await prisma.listing.findMany({
        where: { consignorId: consignor.id },
      });
      expect(listings).toHaveLength(3);
      expect(listings.every((l) => l.status === "submitted")).toBe(true);
    });

    it("stores GTIN on variant", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Test Shoe",
        size: "11",
        gtin: "1234567890123",
        price: 100,
      });

      expect(listing.variant.gtin).toBe("1234567890123");
    });
  });

  // ── Update ──

  describe("updateSubmittedListing", () => {
    it("updates price on a submitted listing", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Test Product",
        size: "M",
        price: 100,
      });

      const updated = await updateSubmittedListing({
        listingId: listing.id,
        consignorId: consignor.id,
        price: 150,
      });

      expect(updated.price).toBe(150);
    });

    it("rejects update by non-owner", async () => {
      const consignor1 = await createTestConsignor({ email: "a@test.com" });
      const consignor2 = await createTestConsignor({ email: "b@test.com" });
      const listing = await submitListing({
        consignorId: consignor1.id,
        title: "Test",
        size: "S",
        price: 50,
      });

      await expect(
        updateSubmittedListing({ listingId: listing.id, consignorId: consignor2.id, price: 75 }),
      ).rejects.toThrow("Not authorized");
    });

    it("rejects update on non-submitted listing", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Test",
        size: "L",
        price: 50,
      });

      // Approve it first
      await approveListing({ listingId: listing.id });

      await expect(
        updateSubmittedListing({ listingId: listing.id, consignorId: consignor.id, price: 75 }),
      ).rejects.toThrow("Can only edit submitted listings");
    });
  });

  // ── Delete ──

  describe("deleteSubmittedListing", () => {
    it("hard-deletes a submitted listing", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "To Delete",
        size: "XL",
        price: 30,
      });

      await deleteSubmittedListing({ listingId: listing.id, consignorId: consignor.id });

      const found = await prisma.listing.findUnique({ where: { id: listing.id } });
      expect(found).toBeNull();
    });

    it("rejects delete by non-owner", async () => {
      const consignor1 = await createTestConsignor({ email: "c@test.com" });
      const consignor2 = await createTestConsignor({ email: "d@test.com" });
      const listing = await submitListing({
        consignorId: consignor1.id,
        title: "Not Yours",
        size: "M",
        price: 50,
      });

      await expect(
        deleteSubmittedListing({ listingId: listing.id, consignorId: consignor2.id }),
      ).rejects.toThrow("Not authorized");
    });
  });

  // ── Approve ──

  describe("approveListing", () => {
    it("transitions submitted → approved_awaiting_dropoff", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Approve Me",
        size: "10",
        price: 200,
      });

      const approved = await approveListing({ listingId: listing.id });
      expect(approved.status).toBe("approved_awaiting_dropoff");
      expect(approved.approvedAt).toBeTruthy();
    });

    it("rejects approving a non-submitted listing", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Already Approved",
        size: "9",
        price: 150,
      });
      await approveListing({ listingId: listing.id });

      await expect(approveListing({ listingId: listing.id })).rejects.toThrow(
        'Cannot approve listing with status "approved_awaiting_dropoff"',
      );
    });
  });

  // ── Admin Edit & Approve ──

  describe("adminEditAndApprove", () => {
    it("updates GTIN when only GTIN changes", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "GTIN Edit Test",
        size: "10",
        gtin: "1111111111111",
        price: 200,
      });

      const updated = await adminEditAndApprove({
        listingId: listing.id,
        gtin: "9999999999999",
      });

      expect(updated.status).toBe("approved_awaiting_dropoff");
      const variant = await prisma.variant.findUniqueOrThrow({ where: { id: updated.variantId } });
      expect(variant.gtin).toBe("9999999999999");
    });

    it("updates price and approves", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Price Edit Test",
        size: "9",
        price: 150,
      });

      const updated = await adminEditAndApprove({
        listingId: listing.id,
        price: 175,
      });

      expect(updated.status).toBe("approved_awaiting_dropoff");
      expect(updated.price).toBe(175);
    });
  });

  // ── Reject ──

  describe("rejectListing", () => {
    it("transitions submitted → rejected with reason", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Reject Me",
        size: "8",
        price: 100,
      });

      const rejected = await rejectListing({
        listingId: listing.id,
        reason: "Item is damaged",
      });

      expect(rejected.status).toBe("rejected");
      expect(rejected.rejectedAt).toBeTruthy();
      expect(rejected.rejectionReason).toBe("Item is damaged");
    });
  });

  // ── Check-in ──

  describe("checkinListing", () => {
    it("transitions approved → active and syncs to Shopify", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Activate Me",
        size: "11",
        gtin: "9999999999999",
        price: 300,
      });

      await approveListing({ listingId: listing.id });
      const activated = await checkinListing({ admin, listingId: listing.id });

      expect(activated.status).toBe("active");
      expect(activated.listedAt).toBeTruthy();
    });

    it("rejects activating a non-approved listing", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Not Approved",
        size: "7",
        price: 50,
      });

      await expect(
        checkinListing({ admin, listingId: listing.id }),
      ).rejects.toThrow('Cannot check in listing with status "submitted"');
    });

    it("auto-generates barcode for non-footwear without GTIN", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({
        consignorId: consignor.id,
        title: "Hat",
        category: "Accessories > Hats",
        size: "OS",
        price: 50,
      });

      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });

      const variant = await prisma.variant.findUniqueOrThrow({
        where: { id: listing.variant.id },
      });
      expect(variant.gtin).toBeTruthy();
    });
  });

  // ── Bulk operations ──

  describe("bulkApproveListing", () => {
    it("approves multiple submitted listings", async () => {
      const consignor = await createTestConsignor();
      const l1 = await submitListing({ consignorId: consignor.id, title: "Bulk A", size: "9", price: 100 });
      const l2 = await submitListing({ consignorId: consignor.id, title: "Bulk B", size: "10", price: 200 });

      const result = await bulkApproveListing({ listingIds: [l1.id, l2.id] });
      expect(result.approved).toBe(2);

      const listings = await prisma.listing.findMany({ where: { id: { in: [l1.id, l2.id] } } });
      expect(listings.every((l) => l.status === "approved_awaiting_dropoff")).toBe(true);
    });

    it("skips non-submitted listings", async () => {
      const consignor = await createTestConsignor();
      const l1 = await submitListing({ consignorId: consignor.id, title: "Skip Me", size: "8", price: 80 });
      await approveListing({ listingId: l1.id }); // already approved

      const result = await bulkApproveListing({ listingIds: [l1.id] });
      expect(result.approved).toBe(0);
    });
  });

  describe("bulkCheckinListing", () => {
    it("activates multiple approved listings", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const l1 = await submitListing({ consignorId: consignor.id, title: "Act A", size: "9", gtin: "1111111111111", price: 100 });
      const l2 = await submitListing({ consignorId: consignor.id, title: "Act B", size: "10", gtin: "2222222222222", price: 200 });
      await approveListing({ listingId: l1.id });
      await approveListing({ listingId: l2.id });

      const result = await bulkCheckinListing({ admin, listingIds: [l1.id, l2.id] });
      expect(result.activated).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it("reports errors for non-approved listings", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const l1 = await submitListing({ consignorId: consignor.id, title: "Fail", size: "7", price: 50 });

      const result = await bulkCheckinListing({ admin, listingIds: [l1.id] });
      expect(result.activated).toBe(0);
      expect(result.errors).toHaveLength(1);
    });
  });

  // ── Update active listing price ──

  describe("updateActiveListingPrice", () => {
    it("updates price on an active listing", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Price Test", size: "9", price: 200 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });

      const updated = await updateActiveListingPrice({
        listingId: listing.id,
        consignorId: consignor.id,
        price: 175,
      });

      expect(updated.price).toBe(175);
      expect(updated.status).toBe("active");
    });

    it("updates price on an awaiting drop-off listing", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Dropoff Price", size: "8.5", price: 220 });
      await approveListing({ listingId: listing.id });

      const updated = await updateActiveListingPrice({
        listingId: listing.id,
        consignorId: consignor.id,
        price: 195,
      });

      expect(updated.price).toBe(195);
      expect(updated.status).toBe("approved_awaiting_dropoff");
    });

    it("rejects price update on non-active/non-awaiting listings", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Still Submitted", size: "8", price: 100 });

      await expect(
        updateActiveListingPrice({ listingId: listing.id, consignorId: consignor.id, price: 80 }),
      ).rejects.toThrow("Can only update price on active or awaiting drop-off listings");
    });

    it("rejects price update from wrong consignor", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const other = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Auth Test", size: "10", price: 300 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });

      await expect(
        updateActiveListingPrice({ listingId: listing.id, consignorId: other.id, price: 250 }),
      ).rejects.toThrow("Not authorized");
    });

    it("rejects zero or negative price", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Zero Price", size: "11", price: 150 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });

      await expect(
        updateActiveListingPrice({ listingId: listing.id, consignorId: consignor.id, price: 0 }),
      ).rejects.toThrow("Price must be greater than zero");

      await expect(
        updateActiveListingPrice({ listingId: listing.id, consignorId: consignor.id, price: -10 }),
      ).rejects.toThrow("Price must be greater than zero");
    });
  });

  // ── Request Withdrawal ──

  describe("requestWithdrawal", () => {
    it("changes active listing to withdrawal_requested and sets withdrawnAt", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Withdraw Me", size: "10", price: 300 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });

      const updated = await requestWithdrawal({ listingId: listing.id, consignorId: consignor.id });
      expect(updated.status).toBe("withdrawal_requested");

      const fresh = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect(fresh.withdrawnAt).toBeTruthy();
    });

    it("rejects withdrawal on non-active listing", async () => {
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Not Active", size: "9", price: 200 });

      await expect(
        requestWithdrawal({ listingId: listing.id, consignorId: consignor.id }),
      ).rejects.toThrow("Can only request withdrawal on active listings");
    });

    it("rejects withdrawal from wrong consignor", async () => {
      const { admin } = createMockAdmin();
      const consignor1 = await createTestConsignor();
      const consignor2 = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor1.id, title: "Not Yours", size: "8", price: 180 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });

      await expect(
        requestWithdrawal({ listingId: listing.id, consignorId: consignor2.id }),
      ).rejects.toThrow("Not authorized");
    });
  });

  // ── Approve Withdrawal ──

  describe("approveWithdrawal", () => {
    it("changes withdrawal_requested listing to pending_pickup", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Full Withdraw", size: "11", price: 350 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });
      await requestWithdrawal({ listingId: listing.id, consignorId: consignor.id });

      const updated = await approveWithdrawal({ admin, listingId: listing.id });
      expect(updated.status).toBe("pending_pickup");

      const fresh = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect(fresh.withdrawalApprovedAt).toBeTruthy();
    });

    it("rejects approval on non-withdrawal_requested listing", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Active Not WR", size: "10", price: 250 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });

      await expect(
        approveWithdrawal({ admin, listingId: listing.id }),
      ).rejects.toThrow('Cannot approve withdrawal for listing with status "active"');
    });
  });

  // ── Deny Withdrawal ──

  describe("denyWithdrawal", () => {
    it("returns withdrawal_requested listing back to active", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Deny Test", size: "11", price: 350 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });
      await requestWithdrawal({ listingId: listing.id, consignorId: consignor.id });

      const updated = await denyWithdrawal({ admin, listingId: listing.id });
      expect(updated.status).toBe("active");
    });

    it("rejects denial on non-withdrawal_requested listing", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Deny Reject", size: "10", price: 300 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });

      await expect(
        denyWithdrawal({ admin, listingId: listing.id }),
      ).rejects.toThrow('Cannot deny withdrawal for listing with status "active"');
    });
  });

  // ── Complete Withdrawal ──

  describe("completeWithdrawal", () => {
    it("changes pending_pickup listing to withdrawn", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Pickup Done", size: "10", price: 300 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });
      await requestWithdrawal({ listingId: listing.id, consignorId: consignor.id });
      await approveWithdrawal({ admin, listingId: listing.id });

      const updated = await completeWithdrawal({ listingId: listing.id });
      expect(updated.status).toBe("withdrawn");
    });

    it("rejects completion on non-pending_pickup listing", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listing = await submitListing({ consignorId: consignor.id, title: "Not Pending", size: "9", price: 200 });
      await approveListing({ listingId: listing.id });
      await checkinListing({ admin, listingId: listing.id });

      await expect(
        completeWithdrawal({ listingId: listing.id }),
      ).rejects.toThrow('Cannot complete withdrawal for listing with status "active"');
    });
  });

  // ── Bulk Withdrawal Lifecycle ──

  /**
   * Helper: create N active listings under one consignor, ready for withdrawal flow tests.
   * Returns the listing rows.
   */
  async function createActiveListings(
    consignorId: string,
    items: Array<{ title: string; size: string; price: number; gtin?: string }>,
  ) {
    const { admin } = createMockAdmin();
    const created = [];
    for (const item of items) {
      const l = await submitListing({ consignorId, title: item.title, size: item.size, price: item.price, gtin: item.gtin });
      await approveListing({ listingId: l.id });
      await checkinListing({ admin, listingId: l.id });
      created.push(l);
    }
    return created;
  }

  describe("bulkRequestWithdrawal", () => {
    it("flips all active listings to withdrawal_requested in one call", async () => {
      const consignor = await createTestConsignor();
      const [l1, l2, l3] = await createActiveListings(consignor.id, [
        { title: "BR A", size: "9", price: 100, gtin: "9991111111111" },
        { title: "BR B", size: "10", price: 200, gtin: "9992222222222" },
        { title: "BR C", size: "11", price: 300, gtin: "9993333333333" },
      ]);

      const result = await bulkRequestWithdrawal({
        consignorId: consignor.id,
        listingIds: [l1.id, l2.id, l3.id],
      });
      expect(result.requested).toBe(3);
      expect(result.skipped).toBe(0);

      const fresh = await prisma.listing.findMany({ where: { id: { in: [l1.id, l2.id, l3.id] } } });
      expect(fresh.every((l) => l.status === "withdrawal_requested")).toBe(true);
      expect(fresh.every((l) => l.withdrawnAt !== null)).toBe(true);
    });

    it("filters out listings that are not ACTIVE (no-op for them)", async () => {
      const consignor = await createTestConsignor();
      // One active, one still submitted
      const [active] = await createActiveListings(consignor.id, [
        { title: "Mixed 1", size: "9", price: 100, gtin: "8881111111111" },
      ]);
      const submitted = await submitListing({ consignorId: consignor.id, title: "Mixed 2", size: "10", price: 200 });

      const result = await bulkRequestWithdrawal({
        consignorId: consignor.id,
        listingIds: [active.id, submitted.id],
      });
      expect(result.requested).toBe(1);
      expect(result.skipped).toBe(1);

      const stillSubmitted = await prisma.listing.findUniqueOrThrow({ where: { id: submitted.id } });
      expect(stillSubmitted.status).toBe("submitted");
    });

    it("IDOR guard: silently ignores listings owned by another consignor", async () => {
      const consignor1 = await createTestConsignor();
      const consignor2 = await createTestConsignor();
      const [mine] = await createActiveListings(consignor1.id, [
        { title: "Mine", size: "9", price: 100, gtin: "7771111111111" },
      ]);
      const [theirs] = await createActiveListings(consignor2.id, [
        { title: "Theirs", size: "10", price: 200, gtin: "7772222222222" },
      ]);

      // consignor1 tries to withdraw both their own AND someone else's listing
      const result = await bulkRequestWithdrawal({
        consignorId: consignor1.id,
        listingIds: [mine.id, theirs.id],
      });
      expect(result.requested).toBe(1);
      expect(result.skipped).toBe(1);

      // theirs.id MUST still be active — IDOR attempt failed
      const stolenAttempt = await prisma.listing.findUniqueOrThrow({ where: { id: theirs.id } });
      expect(stolenAttempt.status).toBe("active");
    });

    it("rejects suspended consignor", async () => {
      const consignor = await createTestConsignor();
      const [l1] = await createActiveListings(consignor.id, [
        { title: "Suspended Test", size: "9", price: 100, gtin: "6661111111111" },
      ]);
      await prisma.consignor.update({ where: { id: consignor.id }, data: { status: "suspended" } });

      await expect(
        bulkRequestWithdrawal({ consignorId: consignor.id, listingIds: [l1.id] }),
      ).rejects.toThrow("suspended");
    });
  });

  describe("bulkApproveWithdrawal", () => {
    it("flips all withdrawal_requested listings to pending_pickup", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listings = await createActiveListings(consignor.id, [
        { title: "BAW A", size: "9", price: 100, gtin: "5551111111111" },
        { title: "BAW B", size: "10", price: 200, gtin: "5552222222222" },
      ]);
      const ids = listings.map((l) => l.id);
      await bulkRequestWithdrawal({ consignorId: consignor.id, listingIds: ids });

      const result = await bulkApproveWithdrawal({ admin, listingIds: ids });
      expect(result.approved).toBe(2);

      const fresh = await prisma.listing.findMany({ where: { id: { in: ids } } });
      expect(fresh.every((l) => l.status === "pending_pickup")).toBe(true);
      expect(fresh.every((l) => l.withdrawalApprovedAt !== null)).toBe(true);
    });

    it("skips listings that are not withdrawal_requested", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const [active] = await createActiveListings(consignor.id, [
        { title: "Still Active", size: "9", price: 100, gtin: "4441111111111" },
      ]);

      const result = await bulkApproveWithdrawal({ admin, listingIds: [active.id] });
      expect(result.approved).toBe(0);
      expect(result.skipped).toBe(1);

      const fresh = await prisma.listing.findUniqueOrThrow({ where: { id: active.id } });
      expect(fresh.status).toBe("active");
    });

    it("handles multi-consignor batch (returns count across consignors)", async () => {
      const { admin } = createMockAdmin();
      const consignor1 = await createTestConsignor();
      const consignor2 = await createTestConsignor();
      const [a] = await createActiveListings(consignor1.id, [
        { title: "Consignor1 Item", size: "9", price: 100, gtin: "3331111111111" },
      ]);
      const [b] = await createActiveListings(consignor2.id, [
        { title: "Consignor2 Item", size: "10", price: 200, gtin: "3332222222222" },
      ]);
      await bulkRequestWithdrawal({ consignorId: consignor1.id, listingIds: [a.id] });
      await bulkRequestWithdrawal({ consignorId: consignor2.id, listingIds: [b.id] });

      const result = await bulkApproveWithdrawal({ admin, listingIds: [a.id, b.id] });
      expect(result.approved).toBe(2);
    });
  });

  describe("bulkDenyWithdrawal", () => {
    it("reverts withdrawal_requested listings back to active", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listings = await createActiveListings(consignor.id, [
        { title: "BDW A", size: "9", price: 100, gtin: "2221111111111" },
        { title: "BDW B", size: "10", price: 200, gtin: "2222222222222" },
      ]);
      const ids = listings.map((l) => l.id);
      await bulkRequestWithdrawal({ consignorId: consignor.id, listingIds: ids });

      const result = await bulkDenyWithdrawal({ admin, listingIds: ids });
      expect(result.denied).toBe(2);

      const fresh = await prisma.listing.findMany({ where: { id: { in: ids } } });
      expect(fresh.every((l) => l.status === "active")).toBe(true);
    });

    it("skips listings not in withdrawal_requested state", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const [active] = await createActiveListings(consignor.id, [
        { title: "Already Active", size: "9", price: 100, gtin: "1111111111111" },
      ]);

      const result = await bulkDenyWithdrawal({ admin, listingIds: [active.id] });
      expect(result.denied).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  describe("bulkUpdateActiveListingPrice", () => {
    it("updates price on all active listings owned by consignor", async () => {
      const consignor = await createTestConsignor();
      const [l1, l2, l3] = await createActiveListings(consignor.id, [
        { title: "BUP A", size: "9", price: 100, gtin: "1234561111111" },
        { title: "BUP B", size: "10", price: 200, gtin: "1234562222222" },
        { title: "BUP C", size: "11", price: 300, gtin: "1234563333333" },
      ]);

      const result = await bulkUpdateActiveListingPrice({
        consignorId: consignor.id,
        listingIds: [l1.id, l2.id, l3.id],
        price: 1500,
      });
      expect(result.updated).toBe(3);
      expect(result.skipped).toBe(0);

      const fresh = await prisma.listing.findMany({ where: { id: { in: [l1.id, l2.id, l3.id] } } });
      expect(fresh.every((l) => l.price === 1500)).toBe(true);
    });

    it("IDOR guard: silently filters out listings owned by another consignor", async () => {
      const consignor1 = await createTestConsignor();
      const consignor2 = await createTestConsignor();
      const [mine] = await createActiveListings(consignor1.id, [
        { title: "Mine", size: "9", price: 100, gtin: "8765431111111" },
      ]);
      const [theirs] = await createActiveListings(consignor2.id, [
        { title: "Theirs", size: "10", price: 200, gtin: "8765432222222" },
      ]);

      const result = await bulkUpdateActiveListingPrice({
        consignorId: consignor1.id,
        listingIds: [mine.id, theirs.id],
        price: 999,
      });
      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(1);

      const stolenAttempt = await prisma.listing.findUniqueOrThrow({ where: { id: theirs.id } });
      expect(stolenAttempt.price).toBe(200); // unchanged
    });

    it("rejects invalid price", async () => {
      const consignor = await createTestConsignor();
      await expect(
        bulkUpdateActiveListingPrice({ consignorId: consignor.id, listingIds: [], price: 0 }),
      ).rejects.toThrow("Invalid price");
      await expect(
        bulkUpdateActiveListingPrice({ consignorId: consignor.id, listingIds: [], price: 1_000_000 }),
      ).rejects.toThrow("Invalid price");
    });
  });

  describe("bulkCompleteWithdrawal", () => {
    it("flips pending_pickup listings to withdrawn", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const listings = await createActiveListings(consignor.id, [
        { title: "BCW A", size: "9", price: 100, gtin: "0001111111111" },
        { title: "BCW B", size: "10", price: 200, gtin: "0002222222222" },
      ]);
      const ids = listings.map((l) => l.id);
      await bulkRequestWithdrawal({ consignorId: consignor.id, listingIds: ids });
      await bulkApproveWithdrawal({ admin, listingIds: ids });

      const result = await bulkCompleteWithdrawal({ admin, listingIds: ids });
      expect(result.completed).toBe(2);

      const fresh = await prisma.listing.findMany({ where: { id: { in: ids } } });
      expect(fresh.every((l) => l.status === "withdrawn")).toBe(true);
    });

    it("skips listings not in pending_pickup state", async () => {
      const { admin } = createMockAdmin();
      const consignor = await createTestConsignor();
      const [active] = await createActiveListings(consignor.id, [
        { title: "Not Pending", size: "9", price: 100, gtin: "0011111111111" },
      ]);

      const result = await bulkCompleteWithdrawal({ admin, listingIds: [active.id] });
      expect(result.completed).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  // ── Unpriced listings (admin creates without price → consignor sets price) ──

  describe("setUnpricedListingPrice", () => {
    async function createUnpricedListing(consignorId: string) {
      const { admin } = createMockAdmin();
      return createListing({
        admin,
        sku: "UNPRICED-001",
        title: "Unpriced Item",
        brand: "TestBrand",
        size: "9",
        gtin: "UNPRICED-GTIN",
        price: null,
        consignorId,
      });
    }

    it("happy path: flips AWAITING_PRICE → ACTIVE, sets listedAt + price", async () => {
      const consignor = await createTestConsignor();
      const listing = await createUnpricedListing(consignor.id);
      expect(listing.status).toBe("awaiting_price");
      expect(listing.price).toBeNull();

      await setUnpricedListingPrice({
        listingId: listing.id,
        consignorId: consignor.id,
        price: 250,
      });

      const after = await prisma.listing.findUniqueOrThrow({ where: { id: listing.id } });
      expect(after.status).toBe("active");
      expect(after.price).toBe(250);
      expect(after.listedAt).not.toBeNull();
    });

    it("rejects unauthorized consignor", async () => {
      const owner = await createTestConsignor({ email: "owner@test.com" });
      const other = await createTestConsignor({ email: "other@test.com" });
      const listing = await createUnpricedListing(owner.id);

      await expect(
        setUnpricedListingPrice({ listingId: listing.id, consignorId: other.id, price: 100 }),
      ).rejects.toThrow("Not authorized");
    });

    it("rejects listing that is already priced (not AWAITING_PRICE)", async () => {
      const consignor = await createTestConsignor();
      const { admin } = createMockAdmin();
      const listing = await createListing({
        admin, sku: "PRICED-001", title: "Already Priced", brand: "T", size: "9", gtin: "G",
        price: 200, consignorId: consignor.id,
      });

      await expect(
        setUnpricedListingPrice({ listingId: listing.id, consignorId: consignor.id, price: 300 }),
      ).rejects.toThrow("already has a price");
    });

    it("rejects suspended consignor", async () => {
      const consignor = await createTestConsignor();
      const listing = await createUnpricedListing(consignor.id);
      await prisma.consignor.update({ where: { id: consignor.id }, data: { status: "suspended" } });

      await expect(
        setUnpricedListingPrice({ listingId: listing.id, consignorId: consignor.id, price: 200 }),
      ).rejects.toThrow("suspended");
    });

    it("rejects invalid price (zero, negative, too large)", async () => {
      const consignor = await createTestConsignor();
      const listing = await createUnpricedListing(consignor.id);

      await expect(
        setUnpricedListingPrice({ listingId: listing.id, consignorId: consignor.id, price: 0 }),
      ).rejects.toThrow("Invalid price");
      await expect(
        setUnpricedListingPrice({ listingId: listing.id, consignorId: consignor.id, price: -10 }),
      ).rejects.toThrow("Invalid price");
      await expect(
        setUnpricedListingPrice({ listingId: listing.id, consignorId: consignor.id, price: 9_999_999 }),
      ).rejects.toThrow("Invalid price");
    });
  });

  describe("bulkSetUnpricedListingPrices", () => {
    async function createUnpricedBatch(consignorId: string, count: number, opts?: { size?: string; gtin?: string; sku?: string }) {
      const { admin } = createMockAdmin();
      const sku = opts?.sku ?? "BULK-001";
      const size = opts?.size ?? "9";
      const gtin = opts?.gtin ?? "BULK-GTIN-9";
      await createListing({
        admin, sku, title: "Bulk Unpriced", brand: "TestBrand", size, gtin,
        price: null, count, consignorId,
      });
      return prisma.listing.findMany({ where: { consignorId, status: "awaiting_price" } });
    }

    it("happy path: all flip to ACTIVE at the same price", async () => {
      const consignor = await createTestConsignor();
      const listings = await createUnpricedBatch(consignor.id, 3);

      const result = await bulkSetUnpricedListingPrices({
        listingIds: listings.map((l) => l.id),
        consignorId: consignor.id,
        price: 175,
      });

      expect(result.updated).toBe(3);
      const after = await prisma.listing.findMany({ where: { consignorId: consignor.id } });
      expect(after.every((l) => l.status === "active")).toBe(true);
      expect(after.every((l) => l.price === 175)).toBe(true);
      expect(after.every((l) => l.listedAt !== null)).toBe(true);
    });

    it("rejects when any listing belongs to another consignor (no partial application)", async () => {
      const owner = await createTestConsignor({ email: "owner@test.com" });
      const other = await createTestConsignor({ email: "other@test.com" });
      const ownerListings = await createUnpricedBatch(owner.id, 2);
      const otherListings = await createUnpricedBatch(other.id, 1, { sku: "BULK-002", gtin: "BULK-GTIN-OTHER" });

      const mixed = [...ownerListings.map((l) => l.id), ...otherListings.map((l) => l.id)];
      await expect(
        bulkSetUnpricedListingPrices({ listingIds: mixed, consignorId: owner.id, price: 100 }),
      ).rejects.toThrow("Not authorized");

      // Owner's listings should remain AWAITING_PRICE (no partial)
      const after = await prisma.listing.findMany({ where: { consignorId: owner.id } });
      expect(after.every((l) => l.status === "awaiting_price")).toBe(true);
    });

    it("rejects when any listing is not AWAITING_PRICE", async () => {
      const consignor = await createTestConsignor();
      const unpriced = await createUnpricedBatch(consignor.id, 2);
      const { admin } = createMockAdmin();
      const priced = await createListing({
        admin, sku: "PRICED-MIX", title: "Already Priced", brand: "T", size: "10", gtin: "PRICED-MIX-GTIN",
        price: 200, consignorId: consignor.id,
      });

      await expect(
        bulkSetUnpricedListingPrices({
          listingIds: [...unpriced.map((l) => l.id), priced.id],
          consignorId: consignor.id,
          price: 100,
        }),
      ).rejects.toThrow("must be awaiting price");
    });
  });

  describe("deleteSubmittedListing — extended for AWAITING_PRICE", () => {
    it("allows consignor to discard their unpriced listing", async () => {
      const consignor = await createTestConsignor();
      const { admin } = createMockAdmin();
      const listing = await createListing({
        admin, sku: "DISCARD-001", title: "To Discard", brand: "T", size: "9", gtin: "DISCARD-GTIN",
        price: null, consignorId: consignor.id,
      });
      expect(listing.status).toBe("awaiting_price");

      await deleteSubmittedListing({ listingId: listing.id, consignorId: consignor.id });

      const found = await prisma.listing.findUnique({ where: { id: listing.id } });
      expect(found).toBeNull();
    });
  });
});
