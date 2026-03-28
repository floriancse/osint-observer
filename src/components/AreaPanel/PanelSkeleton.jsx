export default function PanelSkeleton() {
  return (
    <div style={{ padding: '0 0 8px 0' }}>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -600px 0; }
          100% { background-position:  600px 0; }
        }
        .sk {
          border-radius: 3px;
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
          background-size: 600px 100%;
          animation: shimmer 1.6s infinite linear;
        }
      `}</style>

      {/* TensionIndex */}
      <div style={{ border: '1px solid rgba(255,255,255,0.06)', background: '#111418', borderRadius: 4, padding: '20px 24px', marginBottom: 8 }}>
        <div className="sk" style={{ width: 80,  height: 10, marginBottom: 12 }} />
        <div className="sk" style={{ width: 160, height: 32, marginBottom: 20 }} />
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 16 }}>
          <div className="sk" style={{ width: 80, height: 72 }} />
          <div style={{ flex: 1 }}>
            <div className="sk" style={{ width: 100, height: 10, marginBottom: 8 }} />
            <div className="sk" style={{ width: '100%', height: 6 }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ marginLeft: 40, padding: 16, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
              <div className="sk" style={{ width: '60%', height: 10, marginBottom: 8 }} />
              <div className="sk" style={{ width: '90%', height: 10 }} />
            </div>
          ))}
        </div>
      </div>

      {/* TensionHistory */}
      <div style={{ border: '1px solid rgba(255,255,255,0.06)', background: '#111418', borderRadius: 4, padding: '20px 24px', marginBottom: 8 }}>
        <div className="sk" style={{ width: 120, height: 10, marginBottom: 14 }} />
        <div className="sk" style={{ width: '100%', height: 120 }} />
      </div>
    </div>
  );
}