const ADC_MAX = 4095;

function isSensorRawInverted() {
  return String(process.env.SENSOR_ADC_INVERT ?? "false").toLowerCase() === "true";
}

/** Accept number or numeric string from ESP32 JSON. */
function coerceSensorRaw(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.round(raw);
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) {
      return Math.round(n);
    }
  }
  return null;
}

function normalizeSensorRaw(sensorRaw) {
  const coerced = coerceSensorRaw(sensorRaw);
  if (coerced == null || coerced < 0 || coerced > ADC_MAX) {
    return null;
  }
  if (isSensorRawInverted()) {
    return ADC_MAX - coerced;
  }
  return coerced;
}

/** Higher ADC = drier (typical capacitive probe). 100% = wet. */
function moisturePercentFromSensorRaw(sensorRaw) {
  const clamped = Math.max(0, Math.min(ADC_MAX, sensorRaw));
  return Math.round(((ADC_MAX - clamped) / ADC_MAX) * 100);
}

module.exports = {
  ADC_MAX,
  coerceSensorRaw,
  normalizeSensorRaw,
  moisturePercentFromSensorRaw,
  isSensorRawInverted,
};
