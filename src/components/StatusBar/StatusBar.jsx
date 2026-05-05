import { useState, useEffect, useRef } from "react";
import "./StatusBar.css";
import { FaCircle } from "react-icons/fa";

const API = process.env.REACT_APP_API_URL;

export default function StatusBar() {
    const [tweets, setTweets] = useState([]);
    const trackRef = useRef(null);

    useEffect(() => {
        fetch(`${API}/important_tweets`)
            .then(r => r.json())
            .then(data => setTweets(data.important_tweets));
    }, []);

    if (!tweets.length) return <div className="statusbar" />;

    const items = [...tweets, ...tweets];

    return (
        <div className="statusbar">
            <span className="statusbar-badge"><FaCircle />LIVE</span>
            <div className="statusbar-track-wrapper">
                <div className="statusbar-track" ref={trackRef}>
                    {items.map((t, i) => {
                        const date = new Date(t.date).toLocaleDateString('en-UK', { day: 'numeric', month: 'short', year: 'numeric' });
                        const time = new Date(t.date).toLocaleTimeString('en-UK', { hour: '2-digit', minute: '2-digit' });
                        return (
                            <span key={i} className="statusbar-item">
                                <span className="statusbar-date">{time} · {date}</span>
                                <span className="statusbar-text">“{t.text}”</span>
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}