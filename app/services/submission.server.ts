// Barrel re-export — actual implementations are in app/services/submission/
export {
  submitListing,
  updateSubmittedListing,
  deleteSubmittedListing,
  updateActiveListingPrice,
  requestWithdrawal,
} from "./submission/portal.server";

export {
  approveListing,
  rejectListing,
  adminEditAndApprove,
} from "./submission/approval.server";

export {
  adminEditProduct,
  adminEditListing,
} from "./submission/edit.server";

export {
  activateListing,
  approveWithdrawal,
  completeWithdrawal,
} from "./submission/lifecycle.server";

export {
  bulkApproveListing,
  bulkActivateListing,
} from "./submission/bulk.server";
