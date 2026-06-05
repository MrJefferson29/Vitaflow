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

/**
 * Hysteresis: turn pump ON below min, OFF above max, hold state between.
 * Runs on every sensor reading — works without the mobile app.
 */
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

module.exports = { parseAutoIrrigateConfig, evaluateAutoPump };
