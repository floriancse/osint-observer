import { useState, useEffect } from "react"; 
import "./SidePanel.css";
import { createPopupHTML } from "../../utils/popupUtils";

const API = process.env.REACT_APP_API_URL;

export default function SidePanel({ tweets }) {
    const tweetFeatures = tweets?.features || [];
    const [lastUpdate, setLastUpdate] = useState(null);

    useEffect(() => {
        async function fetchLastUpdate() {
            try {
                const response = await fetch(`${API}/last_update`);
                const data = await response.json();
                if (data.last_update) {
                    const date = new Date(data.last_update).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    setLastUpdate(date);
                }
            } catch (error) {
                console.error("Erreur lors du fetch last_update:", error);
            }
        }
        fetchLastUpdate();
    }, []);

    return (
        <div className="sidepanel">
            <div className="sidepanel-header">
                <div className="header-main-content">
                    <div className="title-row">
                        <h3>OSINT Feed</h3>
                        <span className="tweet-count">{tweetFeatures.length} events</span>
                    </div>

                    <div className="subtitle-column">
                        <span className="header-subtitle">Twitter/X stream</span>
                        {lastUpdate && (
                            <div className="last-update-text">
                                Last update: {lastUpdate}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="sidepanel-content">
                {tweetFeatures.length > 0 ? (
                    <div className="osint-tweet-list">
                        {[...tweetFeatures]
                            .sort((a, b) => {
                                const dateA = new Date(a.properties.created_at || a.properties.date || 0);
                                const dateB = new Date(b.properties.created_at || b.properties.date || 0);
                                return dateB - dateA;
                            })
                            .map((feature, i) => (
                                <div
                                    key={feature.properties.id ?? i}
                                    className="osint-tweet-card-wrapper"
                                    dangerouslySetInnerHTML={{
                                        __html: createPopupHTML(feature.properties, false, 0, 1, true, true)
                                    }}
                                />
                            ))}
                    </div>
                ) : (
                    <div className="no-data"></div>
                )}
            </div>
        </div>
    );
}