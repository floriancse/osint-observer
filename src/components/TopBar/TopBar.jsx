import { useState, useEffect, useRef } from "react";
import "./TopBar.css";
import { useTime } from "../../context/TimeContext";
import { createPopupHTML } from "../../utils/popupUtils";
import { FaXTwitter, FaMagnifyingGlass } from "react-icons/fa6";

const API = process.env.REACT_APP_API_URL;

/* ─── Constants ─── */
const SPARK_W = 160;
const SPARK_H = 26;
const SPARK_PAD = 2;

/* ─── Helpers ─── */

/**
 * Parse watchlist format: { "EntityName": [{ "YYYY-MM-DD": score }, ...], ... }
 * Returns array sorted by latest score desc, filtered to score >= 40.
 */


/* ─── TopBar ─── */
export default function TopBar({ tweets }) {
  const [chokepoints, setChokepoints] = useState([]);
  const [watchlist,   setWatchlist]   = useState([]);
  const { selectedPeriod, changePeriod } = useTime();
  const [openPanel, setOpenPanel] = useState(null);

  const menuRef = useRef(null);

  const timeOptions = [
    { value: "6h",  label: "6h"  },
    { value: "24h", label: "24h" },
    { value: "7d",  label: "7d"  },
    { value: "14d", label: "14d" },
  ];


  const togglePanel = (panel) =>
    setOpenPanel((current) => (current === panel ? null : panel));

  return (
    <div className="topbar">
      <div className="topbar-left" ref={menuRef}>

       
        {/* Time period */}
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