import { User } from "lucide-react";

interface ConsignorFormProps {
  name: string;
  email: string;
  feeRatePercent: string;
  storeOwned: boolean;
  taxStatus: string;
  gstNumber: string;
  qstNumber: string;
  province: string;
  hasChanges: boolean;
  isSubmitting: boolean;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onFeeRateChange: (v: string) => void;
  onStoreOwnedChange: (v: boolean) => void;
  onTaxStatusChange: (v: string) => void;
  onGstNumberChange: (v: string) => void;
  onQstNumberChange: (v: string) => void;
  onProvinceChange: (v: string) => void;
  onSave: () => void;
}

export function ConsignorForm({
  name,
  email,
  feeRatePercent,
  storeOwned,
  taxStatus,
  gstNumber,
  qstNumber,
  province,
  hasChanges,
  isSubmitting,
  onNameChange,
  onEmailChange,
  onFeeRateChange,
  onStoreOwnedChange,
  onTaxStatusChange,
  onGstNumberChange,
  onQstNumberChange,
  onProvinceChange,
  onSave,
}: ConsignorFormProps) {
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <User size={16} color="rgba(109,113,117,0.6)" />
        <h2 className="admin-card-title">Details</h2>
      </div>
      <div className="px-6 py-5 flex flex-col gap-4">
        <div>
          <label className="admin-label">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="admin-input"
          />
        </div>
        <div>
          <label className="admin-label">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className="admin-input"
          />
        </div>
        <div>
          <label className="admin-label">Fee Rate (%)</label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={feeRatePercent}
              onChange={(e) => onFeeRateChange(e.target.value)}
              className="admin-input pr-8"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">%</span>
          </div>
        </div>
        {/* Store Owned checkbox */}
        <div className="flex items-center gap-2.5 py-1">
          <input
            type="checkbox"
            id="storeOwned"
            checked={storeOwned}
            onChange={(e) => onStoreOwnedChange(e.target.checked)}
            className="w-4 h-4 accent-gray-900 cursor-pointer"
          />
          <label htmlFor="storeOwned" className="text-[13px] font-medium text-gray-700 cursor-pointer">
            Store owned inventory
          </label>
        </div>
        {storeOwned && (
          <p className="text-[11px] text-gray-400 -mt-2 ml-6.5">
            This account will be excluded from payout workflows.
          </p>
        )}

        {/* Tax Status */}
        <div className="border-t border-gray-200/40 pt-4">
          <label className="admin-label">Tax Status</label>
          <div className="flex gap-2">
            {(["individual", "business"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onTaxStatusChange(status)}
                className={`flex-1 py-2 px-3 text-[13px] font-medium rounded-lg border cursor-pointer transition-all duration-150 ${
                  taxStatus === status
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                {status === "individual" ? "Individual" : "Registered Business"}
              </button>
            ))}
          </div>
        </div>

        {taxStatus === "business" && (
          <>
            <div>
              <label className="admin-label">Province</label>
              <select
                value={province}
                onChange={(e) => onProvinceChange(e.target.value)}
                className="admin-input cursor-pointer"
              >
                <option value="QC">Quebec (QC)</option>
                <option value="ON">Ontario (ON)</option>
              </select>
            </div>
            <div>
              <label className="admin-label">GST/HST Number</label>
              <input
                type="text"
                value={gstNumber}
                onChange={(e) => onGstNumberChange(e.target.value)}
                className="admin-input"
                placeholder="e.g. 123456789 RT0001"
              />
            </div>
            {province === "QC" && (
              <div>
                <label className="admin-label">QST Number</label>
                <input
                  type="text"
                  value={qstNumber}
                  onChange={(e) => onQstNumberChange(e.target.value)}
                  className="admin-input"
                  placeholder="e.g. 1234567890 TQ0001"
                />
              </div>
            )}
            <p className="text-[11px] text-gray-400 -mt-1">
              Business consignors invoice with GST{province === "QC" ? "/QST" : ""} on their payout.
            </p>
          </>
        )}

        {/* Save */}
        <div className="border-t border-gray-200/40 pt-4">
          <button
            onClick={onSave}
            disabled={isSubmitting || !hasChanges}
            className={`admin-btn-primary w-full !py-2.5 !text-[13px] tracking-wide ${
              !hasChanges ? "!bg-gray-400 !cursor-default !shadow-none hover:!bg-gray-400 hover:!shadow-none hover:!translate-y-0" : ""
            } ${isSubmitting ? "opacity-70" : ""}`}
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
