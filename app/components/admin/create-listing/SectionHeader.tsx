import { sectionHeaderStyle, sectionTitleStyle } from "./helpers";

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
    <div style={sectionHeaderStyle}>
      <Icon size={15} color="#6d7175" />
      <h3 style={sectionTitleStyle}>{title}</h3>
      {badge && (
        <span
          style={{
            marginLeft: "auto",
            fontSize: "10px",
            fontWeight: 600,
            color: "#6d7175",
            background: "#f3f4f6",
            padding: "2px 8px",
            borderRadius: "9999px",
          }}
        >
          {badge}
        </span>
      )}
    </div>
  );
}
