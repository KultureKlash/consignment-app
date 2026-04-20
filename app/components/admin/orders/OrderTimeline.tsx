import { Clock } from "lucide-react";

const timelineDotColors: Record<string, string> = {
  created: "#6d7175",
  paid: "#059669",
  refund: "#d97706",
  void: "#dc2626",
};

interface TimelineEvent {
  type: string;
  label: string;
  date: string;
}

interface OrderTimelineProps {
  timeline: TimelineEvent[];
}

export function OrderTimeline({ timeline }: OrderTimelineProps) {
  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <Clock size={15} color="#6d7175" />
        <h2 className="admin-card-title">Timeline</h2>
      </div>
      <div className="p-5">
        {timeline.map((event, i) => {
          const isLast = i === timeline.length - 1;
          const dotColor = timelineDotColors[event.type] ?? "#6d7175";
          const eventDate = new Date(event.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });

          return (
            <div key={i} className="flex gap-3 relative">
              {/* Dot + line */}
              <div className="flex flex-col items-center w-3 shrink-0">
                <div
                  className="w-2.5 h-2.5 rounded-full border-2 border-white mt-[3px] shrink-0"
                  style={{ background: dotColor, boxShadow: `0 0 0 2px ${dotColor}33` }}
                />
                {!isLast && (
                  <div className="w-0.5 flex-1 bg-gray-200/60 min-h-5" />
                )}
              </div>
              {/* Content */}
              <div className={isLast ? "" : "pb-5"}>
                <div className="text-[13px] font-medium text-gray-900 leading-snug">
                  {event.label}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {eventDate}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
