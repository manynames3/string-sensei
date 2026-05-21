import { GUITAR_STRINGS, TUNING_PRESETS } from "./notes.js?v=33";
import { TUNER_STATES } from "./tunerLogic.js?v=33";

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
  [TUNER_STATES.FLAT]: [
    "{note} is reporting from the basement at {cents}.",
    "{note} has entered its tragic backstory phase.",
    "Sensei says {note} needs a small motivational speech upward.",
    "That string is wearing ankle weights. Tune up.",
    "{note} is so low the tea got cold waiting for it.",
    "The panel budget cannot support this much droop.",
    "Flat arc detected. Training montage recommended.",
    "{note} just bowed too deeply and forgot to come back."
  ],
  [TUNER_STATES.TUNED]: [
    "{note} at {frequency}. No notes from Sensei. Rare.",
    "Perfect panel. Nobody move. Especially the tuning peg.",
    "{note} is centered enough to make the speed lines jealous.",
    "Sensei has stamped {note} with unreasonable confidence.",
    "That string achieved inner peace and mild smugness.",
    "Clean hit. The guitar briefly became a professional.",
    "DON! {note} landed exactly where the plot needed it.",
    "Perfect. Walk away slowly before physics changes its mind."
  ],
  [TUNER_STATES.SHARP]: [
    "{note} is {cents} spicy and challenging the roof.",
    "That string is trying to leave the page.",
    "{note} has too much main-character energy. Tune down.",
    "Sensei sees {note} sprinting uphill with no plan.",
    "Sharp arc detected. Lower the power level.",
    "{note} is auditioning to become a laser.",
    "The scroll says: dramatic, but no.",
    "That string has entered final-boss volume without permission."
  ],
  default: [
    "Sensei is listening for one clean heroic pluck.",
    "Mute the side characters. One string gets the panel.",
    "The guitar is currently speaking in crowd noise.",
    "No stable note yet. The plot is still loading.",
    "Sensei needs a single ringing string, not a committee.",
    "The note is hiding behind the screentone.",
    "Tea is ready. Pitch is not.",
    "Pluck once and let it ring like it has a destiny.",
    "Too much chaos in the dojo. One string at a time.",
    "The tuner heard something. It was mostly vibes."
  ]
};

let lastChaosTemplate = "";

const MASCOT_ASSETS = {
  idle: {
    src: "./assets/mascots/sensei-waiting-v1.png?v=33",
    label: "Painted chibi sensei waiting with tea and clock"
  },
  sad: {
    src: "./assets/mascots/sensei-flat-v1.png?v=33",
    label: "Painted chibi sensei frustrated because the guitar string is flat"
  },
  happy: {
    src: "./assets/mascots/sensei-tuned-v1.png?v=33",
    label: "Painted chibi sensei celebrating a perfectly tuned string"
  },
  panic: {
    src: "./assets/mascots/sensei-sharp-v1.png?v=33",
    label: "Painted chibi sensei panicking because the guitar string is sharp"
  }
};

export function getChaosLine(context = {}) {
  const note = context.note ?? "that string";
  const cents = context.cents ?? "several cents";
  const frequency = context.frequency ?? "unknown Hz";

  const lines = [
    ...(CHAOS_LINES[context.state] ?? []),
    ...CHAOS_LINES.default
  ];
  let template = lines[Math.floor(Math.random() * lines.length)];
  if (lines.length > 1) {
    while (template === lastChaosTemplate) {
      template = lines[Math.floor(Math.random() * lines.length)];
    }
  }
  lastChaosTemplate = template;

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

  const asset = MASCOT_ASSETS[mood];
  return `
    <figure class="mascot painted-mascot mascot-${mood}" role="img" aria-label="${asset.label}">
      <img class="mascot-image" src="${asset.src}" alt="" draggable="false" decoding="async" />
    </figure>
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
