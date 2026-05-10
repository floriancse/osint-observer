import "./popupUtils.css";
import { SiOpenstreetmap } from "react-icons/si";
import { SiMistralai } from "react-icons/si";

function imagesHTML(images) {
  const validImages = (images || []).filter(img => img && typeof img === 'string' && img.trim() !== '');
  if (validImages.length === 0) return '';
  const count = images.length;

  if (count === 1) return `
    <div class="tweet-card-images single">
      <img src="${images[0]}" onerror="this.parentElement.style.display='none'">
    </div>`;

  if (count === 2) return `
    <div class="tweet-card-images double">
      ${images.map(img => `<img src="${img}" onerror="this.style.display='none'">`).join('')}
    </div>`;

  if (count === 3) return `
    <div class="tweet-card-images triple">
      <img src="${images[0]}" class="main-img" onerror="this.style.display='none'">
      <div class="secondary-imgs">
        <img src="${images[1]}" onerror="this.style.display='none'">
        <img src="${images[2]}" onerror="this.style.display='none'">
      </div>
    </div>`;

  const display = images.slice(0, 4);
  const remaining = count - 4;
  return `
    <div class="tweet-card-images quad">
      ${display.map((img, i) => `
        <div class="img-wrapper${i === 3 && remaining > 0 ? ' has-more' : ''}">
          <img src="${img}" onerror="this.style.display='none'">
          ${i === 3 && remaining > 0 ? `<div class="more-overlay">+${remaining}</div>` : ''}
        </div>`).join('')}
    </div>`;
}

export function createPopupGridHTML(features) {
  return createPopupHTML(
    features[0].properties,
    false,
    0,
    features.length,
    true,
    false,
    true
  );
}

function tagsHTML(props) {
  const tags = [];

  if (props.conflict_typology) {
    tags.push(`<span class="tweet-card-tag conflict_typology">${props.conflict_typology}</span>`);
  }

  if (props.weapon_type) {
    tags.push(`<span class="tweet-card-tag weapon-type">${props.weapon_type}</span>`);
  }

  if (props.target) {
    tags.push(`<span class="tweet-card-tag target">${props.target}</span>`);
  }

  if (props.aggressor) {
    tags.push(`<span class="tweet-card-tag aggressor">${props.aggressor}</span>`);
  }

  if (!tags.length) return '';

  return `<div class="tweet-card-tags">${tags.join('')}</div>`;
}

function locationSourceIcon(locationSource) {
  if (!locationSource) {
    return `<span class="location-source-icon" title="Source inconnue" style="color:#94a3b8;">•</span>`;
  }

  const source = String(locationSource).toUpperCase().trim();

  if (source === 'LLM' || source.includes('MISTRAL')) {
return `
    <span class="location-source-icon mistral-icon" title="Located by Qwen AI">
      <svg fill="currentColor" fill-rule="evenodd" height="18" style="flex:none;line-height:1" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><title>Located by Qwen AI</title><path d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z"/></svg>
    </span>`;
  }

  if (source === 'NOMINATIM' || source.includes('OSM') || source.includes('OPENSTREETMAP')) {
    return `
    <span class="location-source-icon mistral-icon" title="Located by Nominatim">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.672 23.969c-.352-.089-.534-.234-1.471-1.168C.085 21.688.014 21.579.018 20.999c0-.645-.196-.414 3.368-3.986 3.6-3.608 3.415-3.451 4.064-3.449.302 0 .378.016.62.14l.277.14 1.744-1.744-.218-.343c-.425-.662-.825-1.629-1.006-2.429a7.657 7.657 0 0 1 1.479-6.44c2.49-3.12 6.959-3.812 10.26-1.588 1.812 1.218 2.99 3.099 3.328 5.314.07.467.07 1.579 0 2.074a7.554 7.554 0 0 1-2.205 4.402 6.712 6.712 0 0 1-1.943 1.401c-.959.483-1.775.71-2.881.803-1.573.131-3.32-.305-4.656-1.163l-.343-.218-1.744 1.744.14.28c.125.241.14.316.14.617.003.651.156.467-3.426 4.049-2.761 2.756-3.186 3.164-3.398 3.261-.271.125-.69.171-.945.106zM17.485 13.95a6.425 6.425 0 0 0 4.603-3.51c1.391-2.899.455-6.306-2.227-8.108-.638-.43-1.529-.794-2.367-.962-.581-.117-1.809-.104-2.414.025a6.593 6.593 0 0 0-2.452 1.064c-.444.315-1.177 1.048-1.487 1.487a6.384 6.384 0 0 0 .38 7.907 6.406 6.406 0 0 0 3.901 2.136c.509.078 1.542.058 2.065-.037zm-3.738 7.376a80.97 80.97 0 0 1-2.196-.651c-.025-.028 1.207-4.396 1.257-4.449.023-.026 4.242 1.152 4.414 1.236.062.026-.003.288-.525 2.102a398.513 398.513 0 0 0-.635 2.236c-.025.087-.069.156-.097.156-.028-.003-1.028-.287-2.219-.631zm2.912.524c0-.053 1.227-4.333 1.246-4.347.047-.034 4.324-1.23 4.341-1.211.019.019-1.199 4.337-1.23 4.36-.02.019-4.126 1.191-4.259 1.218-.054.011-.098 0-.098-.019zm-7.105-1.911c.846-.852 1.599-1.627 1.674-1.728.171-.218.405-.732.472-1.015.026-.118.053-.352.058-.522l.011-.307.182-.051c.103-.028.193-.044.202-.034.023.025-1.207 4.321-1.246 4.36-.02.016-.677.213-1.464.436l-1.425.405 1.537-1.542zm8.289-3.06a1.371 1.371 0 0 1-.059-.187l-.044-.156.156-.028c1.339-.227 2.776-.856 3.908-1.713.16-.125.252-.171.265-.134.054.165.272.95.265.959-.034.034-4.48 1.282-4.492 1.261zm-15.083-1.3c-.05-.039-1.179-3.866-1.264-4.29-.016-.084.146-.044 2.174.536 2.121.604 2.192.629 2.222.74.028.098.011.129-.125.223-.084.059-.769.724-1.523 1.479a63.877 63.877 0 0 1-1.39 1.367c-.016 0-.056-.025-.093-.054zm.821-4.378c-1.188-.343-2.164-.623-2.167-.626-.016-.012 1.261-4.433 1.285-4.46.022-.022 4.422 1.211 4.469 1.252.009.009-.269 1.017-.618 2.239-.576 2.02-.643 2.224-.723 2.22-.05-.003-1.059-.285-2.247-.626zm2.959.538c.012-.031.212-.723.444-1.534l.42-1.476.056.321c.093.556.265 1.188.464 1.741.106.296.187.539.181.545-.008.006-.332.101-.719.212-.389.109-.741.21-.786.224-.058.016-.075.006-.059-.034zM4.905 6.112c-1.187-.339-2.167-.635-2.18-.654-.04-.062-1.246-4.321-1.23-4.338.026-.025 4.31 1.204 4.351 1.246.047.051 1.28 4.379 1.246 4.376L4.91 6.113zm2.148-1.713l-.519-1.806-.078-.28 1.693-.483c.934-.265 1.724-.495 1.76-.508.034-.016-.083.14-.26.336A8.729 8.729 0 0 0 7.69 5.23a4.348 4.348 0 0 0-.132.561c0 .293-.115-.025-.505-1.39z"/>
      </svg>
    </span>`;
  }
}

export const getTimeAgo = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return "just now";
  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
};

const avatarCache = {};
export function createPopupHTML(props, pinned, currentIndex, totalCount, showImages = true, showBack = false, useRelativeTime = false) {
  const isImportant = ['4', '5'].includes(String(props.importance_score || '0').trim());
  const rawDate = props.created_at ?? props.date ?? new Date();
  const images = Array.isArray(props.images) ? props.images : [];
  const displayTime = getTimeAgo(rawDate);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalCount - 1;
  const showNav = totalCount > 1;
  const avatarSrc = avatarCache[props.username]
    ?? (avatarCache[props.username] = `https://unavatar.io/twitter/${props.username}`);

  return `
  <div class="tweet-card${isImportant ? ' important-tweet' : ''}">
    <div class="tweet-card-header">
      <div class="tweet-card-avatar">
            <img src="${avatarSrc}" alt="${props.username}" onerror="this.style.display='none'">
      </div>
      <div class="tweet-card-username">${props.username}</div>
        ${props.verified === 'true' ? `
        <span class="tweet-card-badge verified" title="OSINT Observer verified">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 1.5L2 4v4c0 3.5 2.5 5.8 6 7 3.5-1.2 6-3.5 6-7V4L8 1.5z" fill="#9cdbfd" stroke="#0094d3" stroke-width="1"/>
            <path d="M5.5 8l2 2 3-3" stroke="#0369a1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>` : ''}
      <div class="tweet-card-time">${displayTime}</div>
      <button onclick="window.closePopup()" class="close-btn"><svg width="10" height="10" viewBox="0 0 14 14" fill="none">
        <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg></button>
    </div>
    ${tagsHTML(props)}

    <div class="tweet-card-text">${props.text}</div>
    ${showImages ? imagesHTML(images) : ''}
    ${props.nominatim_query || props.latitude ? `
      <div class="tweet-card-location">
        <span class="location-name">
          ${locationSourceIcon(props.location_source)}
          ${props.nominatim_query ? props.nominatim_query + ' ' : ''} -
          ${props.latitude}°, ${props.longitude}°
        </span>
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