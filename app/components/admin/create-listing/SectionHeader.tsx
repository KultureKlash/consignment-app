export default function SectionHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon: React.ElementType;
  title: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-200/50">
      <Icon size={15} color="#6d7175" />
      <h3 className="text-[13px] font-bold text-gray-900 uppercase tracking-[0.03em] m-0">{title}</h3>
      {badge && (
        <span className="ml-auto text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </div>
  );
}
