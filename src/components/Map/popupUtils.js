import { getusernameInitials } from '../../utils/helpers';


function imagesHTML(images) {
  if (!images?.length) return '';
  const count = images.length;

  if (count === 1) return `
    <div class="tweet-card-images single">
      <img src="${images[0]}" loading="lazy" onerror="this.parentElement.style.display='none'">
    </div>`;

  if (count === 2) return `
    <div class="tweet-card-images double">
      ${images.map(img => `<img src="${img}" loading="lazy" onerror="this.style.display='none'">`).join('')}
    </div>`;

  if (count === 3) return `
    <div class="tweet-card-images triple">
      <img src="${images[0]}" class="main-img" loading="lazy" onerror="this.style.display='none'">
      <div class="secondary-imgs">
        <img src="${images[1]}" loading="lazy" onerror="this.style.display='none'">
        <img src="${images[2]}" loading="lazy" onerror="this.style.display='none'">
      </div>
    </div>`;

  const display = images.slice(0, 4);
  const remaining = count - 4;
  return `
    <div class="tweet-card-images quad">
      ${display.map((img, i) => `
        <div class="img-wrapper${i === 3 && remaining > 0 ? ' has-more' : ''}">
          <img src="${img}" loading="lazy" onerror="this.style.display='none'">
          ${i === 3 && remaining > 0 ? `<div class="more-overlay">+${remaining}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

function importanceBadge(score) {
  const s = parseInt(score) || 0;
  if (s >= 4) return `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(255,45,45,0.15);color:#ff2d2d;font-weight:600;letter-spacing:0.08em;">HIGH</span>`;
  if (s >= 2) return `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(255, 200, 0, 0.15);color:#ffd600;font-weight:600;letter-spacing:0.08em;">MED</span>`;
  return `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(255,255,255,0.06);color:#7a839f;font-weight:600;letter-spacing:0.08em;">LOW</span>`;
}

// ── Popup cluster : détail direct avec navigation ──
export function createPopupGridHTML(features) {
  // Affiche directement le premier tweet avec navigation flèches
  return createPopupHTML(
    features[0].properties,
    false,
    0,
    features.length,
    true,
    false
  );
}

// ── Popup détail avec navigation flèches ──
export function createPopupHTML(props, pinned, currentIndex, totalCount, showImages = true, showBack = false) {
  const isImportant = ['4', '5'].includes(String(props.importance_score || '0').trim());
  const date = new Date(props.created_at);
  const formattedDate = date.toLocaleDateString('en-UK', { year: 'numeric', month: 'short', day: 'numeric' });
  const formattedTime = date.toLocaleTimeString('en-UK', { hour: '2-digit', minute: '2-digit' });
  const images = Array.isArray(props.images) ? props.images : [];

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalCount - 1;
  const showNav = totalCount > 1;

  return `
    <div class="tweet-card${isImportant ? ' important-tweet' : ''}">
      <div class="tweet-card-header">
        <div class="tweet-card-avatar">
          <img src="img/${props.username}.jpg" alt="${props.username}"
              onerror="this.style.display='none';this.parentElement.textContent='${getusernameInitials(props.username)}'">
        </div>
        <div class="tweet-card-username">${props.username}</div>
        ${importanceBadge(props.importance_score)}
        <div class="tweet-card-time">${formattedTime} · ${formattedDate}</div>
        <button onclick="window.closePopup()" class="close-btn" style="display:flex">×</button>
      </div>

      <div class="tweet-card-text">${props.text}</div>
      ${showImages ? imagesHTML(images) : ''}
      ${props.nominatim_query ? `
      <div class="tweet-card-location">
        <span class="location-name">${props.nominatim_query}</span>
        <span class="location-coords">${props.latitude}°, ${props.longitude}°</span>
      </div>` : ''}

      <div class="tweet-card-actions">
        <a href="${props.url}" class="tweet-card-link" target="_blank">Source ↗</a>
        ${showNav ? `
        <div class="tweet-card-nav">
  <button
    class="tweet-card-nav-btn${hasPrev ? '' : ' disabled'}"
    onclick="${hasPrev ? `window.navigateTweet(${currentIndex - 1})` : ''}"
    ${hasPrev ? '' : 'disabled'}
  >‹</button>
  <span class="tweet-card-nav-count">${currentIndex + 1}/${totalCount}</span>
  <button
    class="tweet-card-nav-btn${hasNext ? '' : ' disabled'}"
    onclick="${hasNext ? `window.navigateTweet(${currentIndex + 1})` : ''}"
    ${hasNext ? '' : 'disabled'}
  >›</button>
</div>` : ''}
      </div>
    </div>`;
}