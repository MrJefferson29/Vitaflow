export function sensorAgeSeconds(lastSensorUpdate: string | null | undefined): number | null {
  if (!lastSensorUpdate) {
    return null;
  }
  const ts = new Date(lastSensorUpdate).getTime();
  if (Number.isNaN(ts)) {
    return null;
  }
  return Math.max(0, Math.round((Date.now() - ts) / 1000));
}

export function formatSensorAge(seconds: number | null): string {
  if (seconds == null) {
    return "No reading yet";
  }
  if (seconds < 5) {
    return "Just now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`;
  }
  return `${Math.floor(seconds / 3600)}h ago`;
}

export type SensorFreshness = "live" | "recent" | "stale" | "offline";

export function sensorFreshness(seconds: number | null): SensorFreshness {
  if (seconds == null) {
    return "offline";
  }
  if (seconds <= 5) {
    return "live";
  }
  if (seconds <= 30) {
    return "recent";
  }
  if (seconds <= 120) {
    return "stale";
  }
  return "offline";
}

export const FRESHNESS_COLORS: Record<SensorFreshness, string> = {
  live: "#22c55e",
  recent: "#14b8a6",
  stale: "#fbbf24",
  offline: "#ef4444",
};
