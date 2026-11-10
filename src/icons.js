/** Original vector instruments. Markup is static and never interpolates input. */
const start = '<svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
const icons = Object.freeze({
  mote: `${start}
    <path d="m16 8 6 3.5v7L16 22l-6-3.5v-7L16 8Z" fill="currentColor" fill-opacity=".06"/>
    <circle cx="16" cy="15" r="2.7"/>
    <path d="M10 13H5l-2 3 2 3h5m12-6h5l2 3-2 3h-5M6 16h4m12 0h4M16 3v2m-6-1 1 2m11-2-1 2M16 22v4"/>
    <path d="m13.5 25 2.5 3 2.5-3M11 29h10" opacity=".7"/>
    <circle cx="16" cy="15" r=".8" fill="currentColor" stroke="none"/>
  </svg>`,
  satellite: `${start}
    <path d="M5 22v-7a11 11 0 0 1 22 0v7" opacity=".55"/>
    <path d="M4 23c4-3 20-3 24 0v3c-4 3-20 3-24 0v-3Z" fill="currentColor" fill-opacity=".06"/>
    <path d="M4 23c4 3 20 3 24 0M10 28v2m12-2v2"/>
    <circle cx="16" cy="12" r="4"/>
    <circle cx="9" cy="18" r="2.2"/>
    <circle cx="23" cy="18" r="2.2"/>
    <path d="M14.5 11.5c0-1 1-1.5 2-1.5M16 3v2m-7 1 1 1m13-1-1 1" opacity=".7"/>
  </svg>`,
  prism: `${start}
    <path d="m5 8 21 3-3 15-21-3L5 8Z" fill="currentColor" fill-opacity=".06"/>
    <path d="m12 9-3 15m10-14-3 15M4 13l21 3M3 18l21 3M13 26v3m-5 0h12"/>
    <path d="M27 2v3m2 2h2M24 4l-2-2m7 8 2 2" opacity=".65"/>
    <path d="M24 7a3 3 0 0 1 3-3"/>
  </svg>`,
  star: `${start}
    <circle cx="16" cy="16" r="12" opacity=".35"/>
    <path d="M16 4a12 12 0 0 1 12 12M4 16a12 12 0 0 0 12 12"/>
    <path d="m16 9 6.5 12h-13L16 9Z" fill="currentColor" fill-opacity=".07"/>
    <path d="m16 9 1 8 5.5 4m-5.5-4-7.5 4M1 16h9m12 0 9-5m-9 5h9m-9 0 9 5"/>
    <circle cx="16" cy="4" r="1.5" fill="currentColor" stroke="none"/>
  </svg>`,
  nova: `${start}
    <circle cx="16" cy="16" r="11" opacity=".3"/>
    <path d="m16 2 1.7 8.2L24 8l-2.2 6.3L30 16l-8.2 1.7L24 24l-6.3-2.2L16 30l-1.7-8.2L8 24l2.2-6.3L2 16l8.2-1.7L8 8l6.3 2.2L16 2Z" fill="currentColor" fill-opacity=".06"/>
    <circle cx="16" cy="16" r="4"/>
    <path d="M14 15a2 2 0 0 1 2-1" opacity=".7"/>
  </svg>`,
});

export function generatorIcon(id) {
  return Object.hasOwn(icons, id) ? icons[id] : '';
}
