import { useRef } from "react";
import "./TopBar.css";
import { useTime } from "../../context/TimeContext";

/* ─── TopBar ─── */
export default function TopBar({ openPanel, togglePanel, sidePanelCollapsed }) {
  const { selectedPeriod, changePeriod } = useTime();
  const menuRef = useRef(null);

  const timeOptions = [
    { value: "6h", label: "6h" },
    { value: "24h", label: "24h" },
    { value: "7d", label: "7d" },
    { value: "14d", label: "14d" },
  ];

  return (
    <div className="topbar">
      <div
        className="topbar-left"
        ref={menuRef}
        style={{ paddingLeft: sidePanelCollapsed ? 33 : 0 }}
      >
        {/* ─── Time period ─── */}
        <div className="time-period-group">
          {timeOptions.map((option) => (
            <button
              key={option.value}
              className={`time-btn ${selectedPeriod === option.value ? "active" : ""}`}
              onClick={() => changePeriod(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}