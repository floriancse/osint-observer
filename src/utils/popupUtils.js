import "./popupUtils.css";
import { SiOpenstreetmap } from "react-icons/si";
import { SiMistralai } from "react-icons/si";
import { getIconHTML, WEAPON_TYPE_TO_ICON_KEY } from "./icons";


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
    const typology = { 'MIL': 'Military', 'POL': 'Politics', 'MOVE': 'Movement', 'OTHER': 'Other',}
    tags.push(`<span class="tweet-card-tag conflict_typology">${typology[props.conflict_typology]}</span>`);
  }

  if (props.aggressor) {
    tags.push(`<span class="tweet-card-tag aggressor">${props.aggressor}</span>`);
  }

  if (props.weapon_type) {
    tags.push(`<span class="tweet-card-tag weapon-type">${props.weapon_type}</span>`);
  }

  if (props.target) {
    tags.push(`<span class="tweet-card-tag target">${props.target}</span>`);
  }

  if (props.objective_type) {
    tags.push(`<span class="tweet-card-tag objective-type">${props.objective_type}</span>`);
  }

  if (!tags.length) return '';

  return `<div class="tweet-card-tags">${tags.join('')}</div>`;
}

function locationSourceIcon(locationSource) {
  if (!locationSource) {
    return `<span class="location-source-icon" title="Source inconnue" style="color:#94a3b8;">•</span>`;
  }

  const source = String(locationSource).toUpperCase().trim();

  if (source === 'LLM' || source.includes('MISTRAL') || source.includes('DEEPSEEK')) {
    return `
    <span class="location-source-icon deepseek-icon" title="Located by DeepSeek">
      <svg fill="currentColor" height="14" style="flex:none;line-height:1" viewBox="0 0 56 36" width="18" xmlns="http://www.w3.org/2000/svg"><title>Located by DeepSeek</title><path d="M 55.6128 3.4712 c -0.5953 -0.2917 -0.8517 0.2642 -1.1998 0.5466 c -0.1191 0.0911 -0.2198 0.2095 -0.3206 0.3188 c -0.8701 0.9292 -1.8867 1.5398 -3.2148 1.4668 c -1.9417 -0.1094 -3.5995 0.5012 -5.065 1.9863 c -0.3114 -1.8313 -1.3463 -2.9248 -2.9217 -3.6262 c -0.8242 -0.3645 -1.6577 -0.729 -2.2348 -1.5217 c -0.403 -0.5647 -0.5129 -1.1934 -0.7144 -1.813 c -0.1283 -0.3735 -0.2565 -0.7563 -0.687 -0.8201 c -0.4671 -0.0728 -0.6503 0.3188 -0.8335 0.647 c -0.7327 1.3394 -1.0166 2.8154 -0.9892 4.3096 c 0.0641 3.3621 1.4838 6.0406 4.3047 7.9449 c 0.3206 0.2187 0.403 0.4372 0.3023 0.7563 c -0.1924 0.656 -0.4214 1.2937 -0.6228 1.9497 c -0.1283 0.4192 -0.3207 0.5103 -0.7694 0.3279 c -1.5479 -0.6467 -2.8852 -1.6035 -4.0667 -2.7605 c -2.0058 -1.9407 -3.8193 -4.0818 -6.0815 -5.7583 c -0.5312 -0.3918 -1.0625 -0.7561 -1.6121 -1.1025 c -2.3081 -2.2412 0.3023 -4.0818 0.9068 -4.3003 c 0.6319 -0.2278 0.2198 -1.0115 -1.8227 -1.0022 c -2.0425 0.009 -3.9109 0.6924 -6.2922 1.6035 c -0.348 0.1367 -0.7145 0.2368 -1.09 0.3188 c -2.1615 -0.4099 -4.4055 -0.5012 -6.7502 -0.2368 c -4.4147 0.4919 -7.9408 2.5784 -10.5328 6.1409 C 0.1914 13.1289 -0.5413 17.9941 0.3563 23.0691 c 0.9434 5.3481 3.6727 9.7761 7.8676 13.2385 c 4.3506 3.5896 9.3606 5.3481 15.0758 5.011 c 3.4713 -0.2004 7.3364 -0.665 11.6961 -4.355 c 1.099 0.5467 2.2531 0.7652 4.1674 0.9292 c 1.4746 0.1367 2.8943 -0.0728 3.9933 -0.3005 c 1.7219 -0.3645 1.6029 -1.959 0.9801 -2.2505 c -5.0466 -2.3506 -3.9385 -1.394 -4.9459 -2.1685 c 2.5645 -3.0339 6.4297 -6.1865 7.9409 -16.4001 c 0.119 -0.8108 0.0183 -1.3211 0 -1.9771 c -0.0092 -0.4008 0.0824 -0.5556 0.5404 -0.6013 c 1.2639 -0.1458 2.4912 -0.4919 3.6178 -1.1115 c 3.2698 -1.7857 4.5886 -4.7195 4.9 -8.2364 c 0.0459 -0.5376 -0.0091 -1.0935 -0.577 -1.3757 Z M 27.119 35.123 c -4.8909 -3.8447 -7.263 -5.1113 -8.2431 -5.0566 c -0.9159 0.0547 -0.751 1.1025 -0.5496 1.7859 c 0.2107 0.6741 0.4855 1.1389 0.8701 1.731 c 0.2656 0.3918 0.4489 0.9748 -0.2655 1.4123 c -1.5754 0.9749 -4.314 -0.3281 -4.4423 -0.3918 c -3.1872 -1.877 -5.8525 -4.3553 -7.7302 -7.7444 c -1.8135 -3.262 -2.8667 -6.7605 -3.0408 -10.4961 c -0.0458 -0.9019 0.2198 -1.221 1.1174 -1.3848 c 1.1815 -0.2187 2.3997 -0.2644 3.5812 -0.0913 c 4.9918 0.729 9.2415 2.9612 12.8043 6.4963 c 2.0333 2.0135 3.572 4.419 5.1566 6.7696 c 1.6852 2.4963 3.4987 4.8745 5.8068 6.8242 c 0.8151 0.6833 1.4654 1.2026 2.0882 1.5854 c -1.8775 0.2095 -5.01 0.2552 -7.1532 -1.4397 Z M 29.4637 20.0442 c 0 -0.4009 0.3206 -0.7197 0.7237 -0.7197 c 0.0916 0 0.174 0.018 0.2473 0.0453 c 0.1008 0.0366 0.1924 0.0913 0.2656 0.1731 c 0.1283 0.1277 0.2015 0.3098 0.2015 0.5012 c 0 0.4009 -0.3205 0.7197 -0.7234 0.7197 s -0.7145 -0.3188 -0.7145 -0.7197 Z M 36.7452 23.7798 c -0.4671 0.1914 -0.9342 0.3552 -1.383 0.3735 c -0.6961 0.0364 -1.4563 -0.2461 -1.8684 -0.5923 c -0.6411 -0.5376 -1.0991 -0.8381 -1.2914 -1.7766 c -0.0825 -0.4009 -0.0367 -1.0205 0.0367 -1.3757 c 0.1648 -0.7654 -0.0184 -1.2573 -0.5587 -1.7039 c -0.4397 -0.3645 -0.9984 -0.4646 -1.6121 -0.4646 c -0.229 0 -0.4395 -0.1003 -0.5953 -0.1823 c -0.2565 -0.1275 -0.467 -0.4464 -0.2656 -0.8382 c 0.0641 -0.1274 0.3756 -0.4373 0.4489 -0.4919 c 0.8335 -0.4739 1.7952 -0.3189 2.6836 0.0364 c 0.8244 0.3371 1.4472 0.9567 2.3447 1.8313 c 0.9159 1.0568 1.0807 1.3486 1.6028 2.1411 c 0.4123 0.6196 0.7878 1.2573 1.0442 1.9863 c 0.1557 0.4556 -0.0458 0.8291 -0.5862 1.0569 Z"/></svg>
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
    ?? (avatarCache[props.username] = `https://unavatar.io/twitter/${props.username.slice(1)}`);
  const text = props.text?.length > 500
    ? props.text.slice(0, 500) + '…'
    : props.text;

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
      ${showBack ? '' : `
      <button onclick="window.closePopup()" class="close-btn"><svg width="8" height="8" viewBox="0 0 14 14" fill="none">
        <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg></button>`}
    </div>
    ${tagsHTML(props)}

    <div class="tweet-card-text">${props.text?.length > 500 ? props.text.slice(0, 500) + '[…]' : props.text}</div>
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