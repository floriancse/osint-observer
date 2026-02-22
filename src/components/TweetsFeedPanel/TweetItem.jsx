import React from 'react';
import { formatTweetTime, getusernameInitials, parseImages } from '../../utils/helpers';

function TweetImages({ images }) {
  if (!images || images.length === 0) return null;
  const count = images.length;

  if (count === 1) return (
    <div className="tweet-card-images single">
      <img src={images[0]} alt="media-img" loading="lazy"
        onError={e => { e.target.parentElement.style.display = 'none'; }} />
    </div>
  );

  if (count === 2) return (
    <div className="tweet-card-images double">
      {images.map((img, i) => (
        <img key={i} src={img} alt="media-img" loading="lazy"
          onError={e => { e.target.style.display = 'none'; }} />
      ))}
    </div>
  );

  if (count === 3) return (
    <div className="tweet-card-images triple">
      <img src={images[0]} alt="media-img" loading="lazy" className="main-img"
        onError={e => { e.target.style.display = 'none'; }} />
      <div className="secondary-imgs">
        <img src={images[1]} alt="media-img" loading="lazy"
          onError={e => { e.target.style.display = 'none'; }} />
        <img src={images[2]} alt="media-img" loading="lazy"
          onError={e => { e.target.style.display = 'none'; }} />
      </div>
    </div>
  );

  const display = images.slice(0, 4);
  const remaining = count - 4;
  return (
    <div className="tweet-card-images quad">
      {display.map((img, i) => (
        <div key={i} className={`img-wrapper${i === 3 && remaining > 0 ? ' has-more' : ''}`}>
          <img src={img} alt="media-img" loading="lazy"
            onError={e => { e.target.style.display = 'none'; }} />
          {i === 3 && remaining > 0 && (
            <div className="more-overlay">+{remaining}</div>
          )}
        </div>
      ))}
    </div>
  );
}

const IconExternalLink = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const IconMapPin = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

export default function TweetItem({ feature, onLocate }) {
  const props = feature.properties;
  const images = parseImages(props.images);
  const isImportant = ['4', '5'].includes(String(props.importance_score || '0').trim());
  const hasGeo = feature.geometry?.coordinates?.length >= 2;

  const handleAvatarError = (e) => {
    e.target.style.display = 'none';
    e.target.parentElement.textContent = getusernameInitials(props.username);
  };

  return (
    <div className={`feed-tweet-item${isImportant ? ' important-tweet' : ''}`}>

      <div className="feed-tweet-header">
        <div className="feed-tweet-avatar">
          <img src={`img/${props.username}.jpg`} alt={props.username} onError={handleAvatarError} />
        </div>
        <div className="feed-tweet-username">{props.username}</div>
        <div className="feed-tweet-time">{formatTweetTime(props.created_at)}</div>
      </div>

      <div className="feed-tweet-text">{props.text}</div>

      <TweetImages images={images} />

      <div className="feed-tweet-actions">
        <a
          href={props.url}
          target="_blank"
          rel="noreferrer"
          className="tweet-card-link"
          onClick={e => e.stopPropagation()}
        >
          <IconExternalLink />
          Voir le tweet
        </a>

        {hasGeo && onLocate && (
          <button
            className="feed-tweet-btn feed-tweet-btn-secondary"
            onClick={e => { e.stopPropagation(); onLocate(feature); }}
          >
            <IconMapPin />
            Voir sur la carte
          </button>
        )}
      </div>
    </div>
  );
}