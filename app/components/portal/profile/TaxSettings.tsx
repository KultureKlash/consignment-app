import { UserRound, Building2, MapPin, FileText } from "lucide-react";
import { GlassSelect } from "~/components/portal/GlassSelect";

const PROVINCES = [
  { code: "QC", name: "Quebec",  gst: 5, pst: 9.975, hst: 0,  tax: 14.975 },
  { code: "ON", name: "Ontario", gst: 5, pst: 0,     hst: 0,  tax: 5      },
];

const PROVINCE_OPTIONS = PROVINCES.map((p) => ({
  label: p.name,
  value: p.code,
  detail: `${p.tax}%`,
}));

interface TaxSettingsProps {
  taxStatus: string;
  province: string;
  gstNumber: string;
  qstNumber: string;
  onTaxStatusChange: (v: string) => void;
  onProvinceChange: (v: string) => void;
  onGstNumberChange: (v: string) => void;
  onQstNumberChange: (v: string) => void;
}

export function TaxSettings({
  taxStatus,
  province,
  gstNumber,
  qstNumber,
  onTaxStatusChange,
  onProvinceChange,
  onGstNumberChange,
  onQstNumberChange,
}: TaxSettingsProps) {
  const selectedProvince = PROVINCES.find((p) => p.code === province);

  return (
    <>
      {/* Tax Status */}
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
          Tax Status
        </label>
        <input type="hidden" name="taxStatus" value={taxStatus} />
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onTaxStatusChange("individual")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 cursor-pointer ${
              taxStatus === "individual"
                ? "border-[hsl(var(--cta))]/50 bg-[hsl(var(--cta))]/10"
                : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]"
            }`}
          >
            <UserRound className={`w-4 h-4 ${taxStatus === "individual" ? "text-[hsl(var(--cta))]" : "text-muted-foreground"}`} />
            <div className="text-left">
              <div className="text-sm font-medium">Individual</div>
              <div className="text-[10px] text-muted-foreground">Personal consignment</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => onTaxStatusChange("business")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 cursor-pointer ${
              taxStatus === "business"
                ? "border-[hsl(var(--cta))]/50 bg-[hsl(var(--cta))]/10"
                : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]"
            }`}
          >
            <Building2 className={`w-4 h-4 ${taxStatus === "business" ? "text-[hsl(var(--cta))]" : "text-muted-foreground"}`} />
            <div className="text-left">
              <div className="text-sm font-medium">Business</div>
              <div className="text-[10px] text-muted-foreground">Registered company</div>
            </div>
          </button>
        </div>
      </div>

      {/* Business tax fields -- shown when taxStatus is "business" */}
      {taxStatus === "business" && (
        <div className="space-y-4 pt-2 pl-1 border-l-2 border-[hsl(var(--cta))]/20 ml-1">
          {/* Province */}
          <div className="pl-4">
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Province
            </label>
            <input type="hidden" name="province" value={province} />
            <GlassSelect
              options={PROVINCE_OPTIONS}
              value={province}
              onChange={onProvinceChange}
              placeholder="Select province..."
              icon={<MapPin className="w-4 h-4" />}
            />
            {selectedProvince && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Tax rate: <span className="text-foreground font-medium">{selectedProvince.tax}%</span>
                {selectedProvince.hst > 0 && ` (HST ${selectedProvince.hst}%)`}
                {selectedProvince.gst > 0 && selectedProvince.pst > 0 && selectedProvince.code !== "QC" && ` (GST ${selectedProvince.gst}% + PST ${selectedProvince.pst}%)`}
                {selectedProvince.gst > 0 && selectedProvince.pst === 0 && selectedProvince.hst === 0 && ` (GST ${selectedProvince.gst}%)`}
                {selectedProvince.code === "QC" && ` (GST ${selectedProvince.gst}% + QST ${selectedProvince.pst}%)`}
              </p>
            )}
          </div>

          {/* GST/HST Number */}
          <div className="pl-4">
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              {selectedProvince?.hst ? "HST Number" : "GST Number"}
            </label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                name="gstNumber"
                value={gstNumber}
                onChange={(e) => onGstNumberChange(e.target.value)}
                className="glass-input w-full pl-10 pr-3 py-2.5 rounded-xl text-sm"
                placeholder={selectedProvince?.hst ? "HST registration number" : "GST registration number"}
              />
            </div>
          </div>

          {/* QST Number -- Quebec only */}
          {province === "QC" && (
            <div className="pl-4">
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                QST Number
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  name="qstNumber"
                  value={qstNumber}
                  onChange={(e) => onQstNumberChange(e.target.value)}
                  className="glass-input w-full pl-10 pr-3 py-2.5 rounded-xl text-sm"
                  placeholder="QST registration number"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
