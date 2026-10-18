// Copied exactly from docs/lesson-video/astronauts-reference.html.
// Animation only changes group transforms and the explicitly named face/arm IDs.
export function astronautSvg(id, color, cheek = "#F0997B") {
  return `<svg class="astronaut" id="${id}" viewBox="0 0 200 264" aria-label="${id}"><defs><radialGradient id="v${id}" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#22385A"/><stop offset="1" stop-color="#0A1120"/></radialGradient><filter id="g${id}"><feGaussianBlur stdDeviation="6"/></filter></defs>
  <ellipse cx="100" cy="250" rx="60" ry="8" fill="#000" opacity=".35"/>
  <g id="${id}All">
  <rect x="48" y="132" width="104" height="92" rx="26" fill="#C9D2E0"/>
  <g id="${id}ArmL"><rect x="22" y="146" width="34" height="64" rx="17" fill="#E9EEF5"/><circle cx="39" cy="210" r="13" fill="${color}"/></g>
  <g id="${id}ArmR"><rect x="144" y="146" width="34" height="64" rx="17" fill="#E9EEF5"/><circle cx="161" cy="210" r="13" fill="${color}"/></g>
  <rect x="52" y="136" width="96" height="100" rx="30" fill="#F2F5FA"/>
  <rect x="52" y="186" width="96" height="12" fill="${color}" opacity=".9"/>
  <rect x="78" y="150" width="44" height="26" rx="8" fill="#DCE3EE"/><text x="100" y="169" text-anchor="middle" font-size="16" fill="${color}">✦</text>
  <rect x="62" y="228" width="30" height="26" rx="10" fill="#E9EEF5"/><rect x="108" y="228" width="30" height="26" rx="10" fill="#E9EEF5"/>
  <line x1="100" y1="22" x2="100" y2="4" stroke="#C9D2E0" stroke-width="4"/><circle id="${id}Tip" cx="100" cy="4" r="7" fill="${color}"/>
  <circle cx="100" cy="82" r="66" fill="#F4F6FA" stroke="${color}" stroke-width="5"/>
  <ellipse cx="100" cy="88" rx="50" ry="41" fill="url(#v${id})"/>
  <ellipse cx="80" cy="64" rx="15" ry="7" fill="#fff" opacity=".18" transform="rotate(-25 80 64)"/>
  <ellipse id="${id}EL" cx="83" cy="86" rx="6" ry="7" fill="#F4F8FF"/><ellipse id="${id}ER" cx="117" cy="86" rx="6" ry="7" fill="#F4F8FF"/>
  <circle cx="72" cy="100" r="5" fill="${cheek}" opacity=".45"/><circle cx="128" cy="100" r="5" fill="${cheek}" opacity=".45"/>
  <ellipse id="${id}M" cx="100" cy="106" rx="8" ry="2" fill="#FF9EA8"/>
  </g></svg>`;
}

export const astraSvg = () => astronautSvg("astra", "#5DCAA5");
export const cosmoSvg = () => astronautSvg("cosmo", "#AFA9EC");
