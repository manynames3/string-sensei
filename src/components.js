import { GUITAR_STRINGS, TUNING_PRESETS } from "./notes.js?v=14";
import { TUNER_STATES } from "./tunerLogic.js?v=14";

const MESSAGES = {
  [TUNER_STATES.FLAT]: [
    "Panel one: your string is dramatically slumping.",
    "Tune up before the guitar monologues in the rain.",
    "That note needs a training arc."
  ],
  [TUNER_STATES.TUNED]: [
    "Perfect. Sensei stamps this panel approved.",
    "Clean hit. That string landed center frame.",
    "That resonance gets the victory sparkle."
  ],
  [TUNER_STATES.SHARP]: [
    "Too much power. Bring it down.",
    "That string just entered the final boss arc.",
    "Dial it back before the speed lines take over."
  ],
  [TUNER_STATES.LISTENING]: [
    "Listening... give Sensei one clean string.",
    "Waiting for a stable pitch.",
    "Play a single string and let it ring."
  ],
  [TUNER_STATES.QUIET]: [
    "Listening for one clean ringing string.",
    "Let the note ring for a beat so Sensei can lock on."
  ],
  [TUNER_STATES.NO_PITCH]: [
    "I hear sound, but not a clean note yet.",
    "Mute the other strings, avoid chords, and try one ringing note."
  ],
  [TUNER_STATES.OUT_OF_RANGE]: [
    "That pitch is outside this tuning's guitar range.",
    "Pick the right tuning preset, then play one string at a time."
  ],
  [TUNER_STATES.ERROR]: [
    "Microphone access did not happen. Check browser permissions and try again."
  ],
  [TUNER_STATES.IDLE]: [
    "Tap the button, allow microphone access, and play one string at a time."
  ]
};

const TITLES = {
  [TUNER_STATES.IDLE]: "Start Tuning",
  [TUNER_STATES.LISTENING]: "Listening...",
  [TUNER_STATES.FLAT]: "Tune Up",
  [TUNER_STATES.TUNED]: "Perfect",
  [TUNER_STATES.SHARP]: "Tune Down",
  [TUNER_STATES.QUIET]: "Listening...",
  [TUNER_STATES.NO_PITCH]: "Find the Note",
  [TUNER_STATES.OUT_OF_RANGE]: "Outside Range",
  [TUNER_STATES.ERROR]: "Mic Blocked"
};

const KICKERS = {
  [TUNER_STATES.IDLE]: "Ready when you are",
  [TUNER_STATES.LISTENING]: "Microphone active",
  [TUNER_STATES.FLAT]: "Flat",
  [TUNER_STATES.TUNED]: "In Tune",
  [TUNER_STATES.SHARP]: "Sharp",
  [TUNER_STATES.QUIET]: "Finding pitch",
  [TUNER_STATES.NO_PITCH]: "No stable pitch",
  [TUNER_STATES.OUT_OF_RANGE]: "Guitar range check",
  [TUNER_STATES.ERROR]: "Permission needed"
};

let messageIndex = 0;
let lastMessageState = TUNER_STATES.IDLE;

export function getStateCopy(state) {
  if (lastMessageState !== state) {
    messageIndex = 0;
    lastMessageState = state;
  }

  const messages = MESSAGES[state] ?? MESSAGES[TUNER_STATES.IDLE];
  const message = messages[messageIndex % messages.length];
  return {
    kicker: KICKERS[state] ?? KICKERS[TUNER_STATES.IDLE],
    title: TITLES[state] ?? TITLES[TUNER_STATES.IDLE],
    message
  };
}

export function cycleStateMessage(state) {
  const messages = MESSAGES[state] ?? MESSAGES[TUNER_STATES.IDLE];
  messageIndex = (messageIndex + 1) % messages.length;
}

const CHAOS_LINES = {
  roast: {
    [TUNER_STATES.FLAT]: [
      "{note} is so low it just got an invoice from the basement.",
      "{note} dropped {cents}. That string is doing side quests underground.",
      "Your {note} is emotionally below sea level. Character development required."
    ],
    [TUNER_STATES.TUNED]: [
      "{note} is perfect, which is suspicious. Do not touch it.",
      "{note} landed center panel. The guitar has briefly chosen peace.",
      "Sensei reviewed {note} at {frequency} and found no crimes."
    ],
    [TUNER_STATES.SHARP]: [
      "{note} is trying to leave the manga and become a laser beam.",
      "{note} is {cents} spicy. Put the power level down.",
      "That {note} has final-boss posture and first-episode judgment."
    ],
    default: [
      "No clean note yet. The guitar is speaking in cursive.",
      "Sensei needs one ringing string, not the entire band argument.",
      "The note is currently in witness protection."
    ]
  },
  excuse: [
    "Official excuse: the room has villain energy.",
    "Official excuse: the pick was emotionally unprepared.",
    "Official excuse: the string saw the meter and got nervous.",
    "Official excuse: temporary protagonist turbulence.",
    "Official excuse: the guitar is doing method acting."
  ],
  victory: [
    "DON! Screenshot this before the string changes its mind.",
    "Perfect panel. Walk away like you meant to do that.",
    "The tuning arc is complete. Roll opening credits.",
    "That string is now legally allowed to wear sunglasses indoors.",
    "Sensei stamp acquired. Proceed to unnecessary power chord."
  ]
};

export function getChaosLine(action, context = {}) {
  const note = context.note ?? "that string";
  const cents = context.cents ?? "mystery cents";
  const frequency = context.frequency ?? "unknown Hz";

  const lines = action === "roast"
    ? CHAOS_LINES.roast[context.state] ?? CHAOS_LINES.roast.default
    : CHAOS_LINES[action] ?? CHAOS_LINES.roast.default;
  const template = lines[Math.floor(Math.random() * lines.length)];

  return template
    .replaceAll("{note}", note)
    .replaceAll("{cents}", cents)
    .replaceAll("{frequency}", frequency);
}

export function renderMascot(state) {
  const mood = state === TUNER_STATES.FLAT
    ? "sad"
    : state === TUNER_STATES.TUNED
      ? "happy"
      : state === TUNER_STATES.SHARP
        ? "panic"
        : "idle";

  return `
    <svg class="mascot mascot-${mood}" viewBox="0 0 260 260" role="img" aria-label="Original anime-inspired tuner mascot">
      <defs>
        <radialGradient id="faceGlow" cx="45%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#fffdf4" />
          <stop offset="62%" stop-color="#f4ead8" />
          <stop offset="100%" stop-color="#d9c7aa" />
        </radialGradient>
        <linearGradient id="hairInk" x1="0%" x2="100%">
          <stop offset="0%" stop-color="#2b2b2b" />
          <stop offset="100%" stop-color="#050505" />
        </linearGradient>
        <pattern id="screenTone" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.1" fill="#111111" opacity="0.26" />
        </pattern>
      </defs>
      <g class="reaction-lines">
        <path d="M35 86 L12 67" />
        <path d="M226 86 L249 67" />
        <path d="M45 172 L18 187" />
        <path d="M216 172 L242 187" />
      </g>
      <g class="sparkles">
        <path d="M44 46 L50 60 L64 66 L50 72 L44 86 L38 72 L24 66 L38 60 Z" />
        <path d="M212 40 L216 50 L226 54 L216 58 L212 68 L208 58 L198 54 L208 50 Z" />
      </g>
      <g class="mascot-body">
        <path class="hood" d="M64 122 C55 76 84 38 131 36 C178 38 207 76 198 122 C222 150 208 212 160 224 L100 224 C52 212 39 150 64 122 Z" />
        <path class="hair" d="M64 117 C67 62 96 34 132 34 C171 34 195 66 198 116 C181 94 161 88 132 91 C105 94 82 99 64 117 Z" />
        <path class="bang bang-left" d="M96 44 C88 72 83 88 61 111 C91 101 108 79 116 48 Z" />
        <path class="bang bang-mid" d="M125 39 C116 72 117 90 100 114 C132 97 147 75 145 41 Z" />
        <path class="bang bang-right" d="M155 47 C159 74 170 92 195 112 C169 104 151 82 141 47 Z" />
        <path class="face" d="M72 116 C76 78 99 59 131 59 C164 59 186 79 190 116 C197 178 170 208 131 208 C91 208 64 178 72 116 Z" />
        <circle class="blush blush-left" cx="94" cy="149" r="12" />
        <circle class="blush blush-right" cx="168" cy="149" r="12" />
        <circle class="tone-dot tone-dot-left" cx="94" cy="149" r="12" />
        <circle class="tone-dot tone-dot-right" cx="168" cy="149" r="12" />
        <g class="eyes idle-eyes">
          <path d="M90 127 C98 119 109 119 117 127" />
          <path d="M145 127 C153 119 164 119 172 127" />
        </g>
        <g class="eyes happy-eyes">
          <path d="M89 126 C99 139 109 139 119 126" />
          <path d="M143 126 C153 139 164 139 174 126" />
        </g>
        <g class="eyes sad-eyes">
          <path d="M89 132 C99 124 110 124 119 132" />
          <path d="M143 132 C153 124 164 124 174 132" />
        </g>
        <g class="eyes panic-eyes">
          <circle cx="103" cy="128" r="10" />
          <circle cx="158" cy="128" r="10" />
          <circle class="pupil" cx="103" cy="128" r="4" />
          <circle class="pupil" cx="158" cy="128" r="4" />
        </g>
        <path class="mouth idle-mouth" d="M114 169 C124 174 139 174 149 169" />
        <path class="mouth happy-mouth" d="M107 162 C119 185 144 185 156 162" />
        <path class="mouth sad-mouth" d="M111 178 C122 164 141 164 153 178" />
        <ellipse class="mouth panic-mouth" cx="132" cy="171" rx="18" ry="23" />
        <g class="tear-drops">
          <path d="M91 151 C83 162 83 175 94 176 C105 175 104 162 91 151 Z" />
          <path d="M174 151 C166 162 166 175 177 176 C188 175 187 162 174 151 Z" />
        </g>
        <g class="sweat-drops">
          <path d="M190 92 C181 104 182 119 195 119 C208 118 205 103 190 92 Z" />
          <path d="M71 97 C64 107 65 119 76 119 C87 118 84 106 71 97 Z" />
        </g>
        <g class="thumb-arm">
          <path class="arm" d="M176 176 C205 168 223 146 221 120" />
          <path class="thumb" d="M219 121 C231 116 238 121 235 132 C244 134 245 147 235 151 L215 158 C205 161 197 154 200 144 C202 136 207 127 219 121 Z" />
        </g>
      </g>
    </svg>
  `;
}

export function renderTuningOptions(selectedId = "standard") {
  return TUNING_PRESETS.map((preset) => `
    <option value="${preset.id}" ${preset.id === selectedId ? "selected" : ""}>${preset.name}</option>
  `).join("");
}

export function renderStringOptions(targets = GUITAR_STRINGS, selectedKey = "auto") {
  return `
    <option value="auto" ${selectedKey === "auto" ? "selected" : ""}>Auto-detect</option>
    ${targets.map((string) => `
      <option value="${string.key}" ${string.key === selectedKey || string.id === selectedKey ? "selected" : ""}>
        ${string.id} - ${string.label}
      </option>
    `).join("")}
  `;
}

export function renderToneButtons(targets = GUITAR_STRINGS) {
  return targets.map((string) => `
    <button class="tone-button" type="button" data-tone="${string.id}">
      <span>${string.id}</span>
      <small>${string.frequency.toFixed(2)} Hz</small>
    </button>
  `).join("");
}
