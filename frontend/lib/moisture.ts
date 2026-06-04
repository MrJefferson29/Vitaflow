export type MoistureBandId = "critical" | "low" | "moderate" | "good" | "saturated";

export type MoistureBand = {
  id: MoistureBandId;
  label: string;
  shortLabel: string;
  hint: string;
  min: number;
  max: number;
  primary: string;
  secondary: string;
  glow: string;
};

export const MOISTURE_BANDS: MoistureBand[] = [
  {
    id: "critical",
    label: "Critical — very dry",
    shortLabel: "Critical",
    hint: "Irrigate soon. Soil is severely dry.",
    min: 0,
    max: 20,
    primary: "#ef4444",
    secondary: "#fca5a5",
    glow: "rgba(239, 68, 68, 0.45)",
  },
  {
    id: "low",
    label: "Low moisture",
    shortLabel: "Low",
    hint: "Below optimal. Consider watering.",
    min: 21,
    max: 40,
    primary: "#f97316",
    secondary: "#fdba74",
    glow: "rgba(249, 115, 22, 0.4)",
  },
  {
    id: "moderate",
    label: "Moderate",
    shortLabel: "Moderate",
    hint: "Acceptable range. Monitor trends.",
    min: 41,
    max: 60,
    primary: "#eab308",
    secondary: "#fde047",
    glow: "rgba(234, 179, 8, 0.35)",
  },
  {
    id: "good",
    label: "Good — healthy",
    shortLabel: "Good",
    hint: "Ideal for most crops. Pump usually off.",
    min: 61,
    max: 80,
    primary: "#22c55e",
    secondary: "#86efac",
    glow: "rgba(34, 197, 94, 0.4)",
  },
  {
    id: "saturated",
    label: "Saturated — very wet",
    shortLabel: "Saturated",
    hint: "High moisture. Avoid over-watering.",
    min: 81,
    max: 100,
    primary: "#0ea5e9",
    secondary: "#7dd3fc",
    glow: "rgba(14, 165, 233, 0.45)",
  },
];

const UNKNOWN_BAND: MoistureBand = {
  id: "moderate",
  label: "Awaiting reading",
  shortLabel: "—",
  hint: "Connect sensor or pull to refresh.",
  min: 0,
  max: 100,
  primary: "#94a3b8",
  secondary: "#cbd5e1",
  glow: "rgba(148, 163, 184, 0.3)",
};

export function getMoistureBand(level: number | null | undefined): MoistureBand {
  if (level == null || !Number.isFinite(level)) {
    return UNKNOWN_BAND;
  }
  const clamped = Math.max(0, Math.min(100, Math.round(level)));
  return MOISTURE_BANDS.find((b) => clamped >= b.min && clamped <= b.max) ?? UNKNOWN_BAND;
}
