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

export function createPopupHTML(props, pinned, currentIndex, totalCount) {
  const isImportant = ['4', '5'].includes(String(props.importance || '0').trim());
  const date = new Date(props.created_at);
  const formattedDate = date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
  const formattedTime = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const images = Array.isArray(props.images) ? props.images : [];

  return `
<div class="tweet-card${isImportant ? ' important-tweet' : ''}">
  <div class="tweet-card-header">
    <div class="tweet-card-avatar">
      <img src="img/${props.username}.jpg" alt="${props.username}"
           onerror="this.style.display='none';this.parentElement.textContent='${getusernameInitials(props.username)}'">
    </div>
    <div class="tweet-card-username">${props.username}</div>
    <div class="tweet-card-time">${formattedTime} · ${formattedDate}</div>
    <button onclick="window.closePopup()" class="close-btn" style="display:${pinned ? 'flex' : 'none'}">×</button>
  </div>
  <div class="tweet-card-text">${props.text}</div>
  ${imagesHTML(images)}
  <div class="tweet-card-actions">
    <a href="${props.url}" class="tweet-card-link" target="_blank">Voir le tweet ↗</a>
    ${pinned && totalCount > 1 ? `
      <div class="tweet-card-nav">
        <span class="tweet-card-nav-count">${currentIndex + 1}/${totalCount}</span>
        <button onclick="window.previousTweet()" class="tweet-card-nav-btn">←</button>
        <button onclick="window.nextTweet()" class="tweet-card-nav-btn">→</button>
      </div>` : ''}
  </div>
</div>`;
}