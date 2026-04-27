import "./ContentPanel.css";

export default function ContentPanel({ isOpen, onToggle }) {
  return (
    <div className={`content-panel ${isOpen ? "closed" : "open"}`}>
      {/* <button className="content-panel-toggle" onClick={onToggle}>
        {isOpen ? "›" : "‹"}
      </button> */}
      {isOpen && <div className="content-panel-body">contenu</div>}
    </div>
  );
}