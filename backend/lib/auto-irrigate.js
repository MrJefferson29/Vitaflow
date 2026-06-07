const MANUAL_SNOOZE_MS = 90 * 60 * 1000;

function parseAutoIrrigateConfig() {
  const enabled = String(process.env.AUTO_IRRIGATE_ENABLED ?? "true").toLowerCase() !== "false";
  const minMoisture = Number(process.env.AUTO_IRRIGATE_MOISTURE_MIN ?? 30);
  const maxMoisture = Number(process.env.AUTO_IRRIGATE_MOISTURE_MAX ?? 55);

  return {
    enabled,
    minMoisture: Number.isFinite(minMoisture) ? Math.max(0, Math.min(100, minMoisture)) : 30,
    maxMoisture: Number.isFinite(maxMoisture) ? Math.max(0, Math.min(100, maxMoisture)) : 55,
  };
}

function isPumpAutoSuppressed(store) {
  if (!store?.pumpAutoSuppressedUntil) {
    return false;
  }
  const until = new Date(store.pumpAutoSuppressedUntil).getTime();
  if (Number.isNaN(until)) {
    return false;
  }
  return until > Date.now();
}

function snoozeAutoUntil() {
  return new Date(Date.now() + MANUAL_SNOOZE_MS).toISOString();
}

/**
 * Hysteresis: turn pump ON below min, OFF above max.
 * Respects manual OFF snooze for 90 minutes when user stops auto irrigation.
 */
function resolvePumpFromAuto(store, moistureLevel) {
  const config = parseAutoIrrigateConfig();
  const currentPumpOn = Boolean(store.pumpOn);

  if (!config.enabled) {
    return { pumpOn: currentPumpOn, autoTriggered: false, suppressed: false, config };
  }

  if (config.minMoisture >= config.maxMoisture) {
    return { pumpOn: currentPumpOn, autoTriggered: false, suppressed: false, config };
  }

  const desired = evaluateAutoPump(moistureLevel, currentPumpOn);

  if (isPumpAutoSuppressed(store)) {
    if (desired.pumpOn) {
      return { pumpOn: false, autoTriggered: false, suppressed: true, config };
    }
    return { pumpOn: false, autoTriggered: desired.autoTriggered, suppressed: true, config };
  }

  return {
    pumpOn: desired.pumpOn,
    autoTriggered: desired.autoTriggered,
    suppressed: false,
    config,
  };
}

function evaluateAutoPump(moistureLevel, currentPumpOn) {
  const config = parseAutoIrrigateConfig();
  if (!config.enabled) {
    return { pumpOn: currentPumpOn, autoTriggered: false, config };
  }

  if (config.minMoisture >= config.maxMoisture) {
    return { pumpOn: currentPumpOn, autoTriggered: false, config };
  }

  if (moistureLevel < config.minMoisture) {
    return { pumpOn: true, autoTriggered: true, config };
  }
  if (moistureLevel > config.maxMoisture) {
    return { pumpOn: false, autoTriggered: true, config };
  }

  return { pumpOn: currentPumpOn, autoTriggered: false, config };
}

function wasAutoIrrigationContext(store) {
  const config = parseAutoIrrigateConfig();
  return (
    Boolean(store.pumpAutoTriggered) ||
    (typeof store.moistureLevel === "number" && store.moistureLevel < config.minMoisture)
  );
}

module.exports = {
  parseAutoIrrigateConfig,
  evaluateAutoPump,
  resolvePumpFromAuto,
  isPumpAutoSuppressed,
  snoozeAutoUntil,
  wasAutoIrrigationContext,
  MANUAL_SNOOZE_MS,
};
