import { Navigation, Ruler, TrendingUp, Activity, CheckSquare } from "lucide-react";

export type ToolMode = "navigate" | "measure" | "slope" | "profile" | "validate";

interface ToolRailProps {
  activeTool: ToolMode;
  onSelect: (tool: ToolMode) => void;
}

export function ToolRail({ activeTool, onSelect }: ToolRailProps) {
  const tools = [
    { id: "navigate", icon: Navigation, label: "Navigate" },
    { id: "measure", icon: Ruler, label: "Measure" },
    { id: "slope", icon: Activity, label: "Slope Map" },
    { id: "profile", icon: TrendingUp, label: "Profile Line" },
    { id: "validate", icon: CheckSquare, label: "Validate" },
  ] as const;

  return (
    <div className="tool-rail">
      {tools.map((t) => (
        <button
          key={t.id}
          className={`tool-btn ${activeTool === t.id ? "active" : ""}`}
          onClick={() => onSelect(t.id)}
          title={t.label}
        >
          <t.icon size={18} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
