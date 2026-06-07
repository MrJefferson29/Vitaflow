/*
 * Smart Irrigation — ESP32 client (HTTPS / Render or LAN backend).
 *
 *   GET  /api/status  → read pumpOn, drive relay
 *   POST /api/sensor  → { sensorRaw } with x-device-key header
 *
 * Render / cloud: slower poll intervals + retries on 502/503.
 * Power: use a stable 5V supply (USB charger / VIN) — a PC data-only cable is not enough in the field.
 */

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// ----- Wi-Fi -----
static const char* WIFI_SSID = "Wing";
static const char* WIFI_PASSWORD = "";  // set if your network uses a password

// ----- Backend (API_DEVICE_KEY must match ESP32_API_KEY on Render) -----
static const char* BACKEND_BASE = "https://irrigation-pzz4.onrender.com";
static const char* API_DEVICE_KEY = "change-me";

// ----- Hardware -----
static const int SENSOR_PIN = 34;
static const int RELAY_PIN = 25;
static const bool PUMP_ACTIVE_LOW = true;
static const bool INVERT_RELAY_VS_SERVER = true;

static const unsigned long PUMP_POLL_MS = 1500;
static const unsigned long SENSOR_CYCLE_MS = 3000;
static const uint16_t HTTP_TIMEOUT_MS = 20000;
static const int HTTP_MAX_RETRIES = 3;
static const int BOOT_SYNC_RETRIES = 8;

static WiFiClientSecure wifiClient;
static unsigned long lastPumpPollMs = 0;
static unsigned long lastSensorMs = 0;
static bool lastServerPumpOn = false;
static bool relayInitialized = false;
static unsigned long lastServerOkMs = 0;

static int readSensorAdc() {
  long sum = 0;
  const int samples = 20;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(SENSOR_PIN);
    delay(3);
  }
  return (int)(sum / samples);
}

static void applyRelayFromPumpOn(bool pumpOn) {
  const bool relayEnergized = INVERT_RELAY_VS_SERVER ? !pumpOn : pumpOn;
  const int level =
      PUMP_ACTIVE_LOW ? (relayEnergized ? LOW : HIGH) : (relayEnergized ? HIGH : LOW);
  digitalWrite(RELAY_PIN, level);
}

static bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }
  Serial.println("Wi-Fi lost, reconnecting...");
  WiFi.disconnect();
  delay(100);
  if (WIFI_PASSWORD[0] != '\0') {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  } else {
    WiFi.begin(WIFI_SSID);
  }
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(250);
  }
  return WiFi.status() == WL_CONNECTED;
}

static bool parseJsonPumpOn(JsonVariant v, bool* out) {
  if (v.isNull() || out == nullptr) {
    return false;
  }
  if (v.is<bool>()) {
    *out = v.as<bool>();
    return true;
  }
  if (v.is<int>() || v.is<long>()) {
    *out = v.as<int>() != 0;
    return true;
  }
  if (v.is<const char*>()) {
    const char* s = v.as<const char*>();
    *out = (strcmp(s, "true") == 0 || strcmp(s, "1") == 0 || strcmp(s, "on") == 0);
    return true;
  }
  *out = v.as<bool>();
  return true;
}

static bool httpGetStatus(bool* pumpOnOut) {
  if (pumpOnOut == nullptr) {
    return false;
  }

  HTTPClient http;
  const String url = String(BACKEND_BASE) + "/api/status";
  if (!http.begin(wifiClient, url)) {
    Serial.println("GET /api/status: http.begin failed");
    return false;
  }
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setReuse(false);

  const int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("GET /api/status failed HTTP %d\n", code);
    http.end();
    return false;
  }

  const String payload = http.getString();
  http.end();

  JsonDocument doc;
  if (deserializeJson(doc, payload)) {
    Serial.println("GET /api/status: JSON parse error");
    return false;
  }

  if (!parseJsonPumpOn(doc["pumpOn"], pumpOnOut)) {
    Serial.println("GET /api/status: missing pumpOn");
    return false;
  }

  lastServerOkMs = millis();
  return true;
}

static bool httpPostSensor(int sensorRaw) {
  HTTPClient http;
  const String url = String(BACKEND_BASE) + "/api/sensor";
  if (!http.begin(wifiClient, url)) {
    Serial.println("POST /api/sensor: http.begin failed");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-key", API_DEVICE_KEY);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setReuse(false);

  JsonDocument body;
  body["sensorRaw"] = sensorRaw;
  String json;
  serializeJson(body, json);
  Serial.printf("POST /api/sensor ADC=%d json=%s\n", sensorRaw, json.c_str());

  const int code = http.POST(json);
  const String response = http.getString();
  http.end();

  if (code == HTTP_CODE_OK || code == 201) {
    lastServerOkMs = millis();
    return true;
  }

  Serial.printf("POST /api/sensor failed HTTP %d", code);
  if (code == 401) {
    Serial.print(" — wrong x-device-key (match ESP32_API_KEY on server)");
  } else if (code == 502 || code == 503) {
    Serial.print(" — server restarting or cold start");
  } else if (code < 0) {
    Serial.print(" — connection error (timeout/TLS)");
  }
  if (response.length() > 0 && response.length() < 120) {
    Serial.printf(" body=%s", response.c_str());
  }
  Serial.println();
  return false;
}

static bool getPumpWithRetries(bool* pumpOnOut) {
  for (int attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
    if (!ensureWiFi()) {
      delay(500);
      continue;
    }
    if (httpGetStatus(pumpOnOut)) {
      return true;
    }
    if (attempt < HTTP_MAX_RETRIES) {
      delay(400 * attempt);
    }
  }
  return false;
}

static bool postSensorWithRetries(int sensorRaw) {
  for (int attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
    if (!ensureWiFi()) {
      delay(500);
      continue;
    }
    if (httpPostSensor(sensorRaw)) {
      return true;
    }
    if (attempt < HTTP_MAX_RETRIES) {
      delay(400 * attempt);
    }
  }
  return false;
}

static bool syncPumpFromServer() {
  bool serverPumpOn = false;
  if (!getPumpWithRetries(&serverPumpOn)) {
    return false;
  }

  if (!relayInitialized || serverPumpOn != lastServerPumpOn) {
    applyRelayFromPumpOn(serverPumpOn);
    lastServerPumpOn = serverPumpOn;
    relayInitialized = true;
    Serial.printf("Relay -> pump %s (GPIO%d=%s)\n", serverPumpOn ? "ON" : "OFF", RELAY_PIN,
                  digitalRead(RELAY_PIN) == LOW ? "LOW" : "HIGH");
  }
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(SENSOR_PIN, INPUT);
  applyRelayFromPumpOn(false);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  wifiClient.setInsecure();
  wifiClient.setTimeout(HTTP_TIMEOUT_MS);

  WiFi.mode(WIFI_STA);
  if (WIFI_PASSWORD[0] != '\0') {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  } else {
    WiFi.begin(WIFI_SSID);
  }

  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Wi-Fi OK, IP: ");
  Serial.println(WiFi.localIP());
  Serial.printf("Backend %s — pump poll %lums, sensor %lums\n", BACKEND_BASE, PUMP_POLL_MS,
                SENSOR_CYCLE_MS);

  Serial.println("Syncing pump state from server (Render may take ~30s on cold start)...");
  for (int i = 0; i < BOOT_SYNC_RETRIES; i++) {
    if (syncPumpFromServer()) {
      Serial.println("Initial pump sync OK");
      break;
    }
    delay(3000);
  }
}

void loop() {
  if (!ensureWiFi()) {
    delay(1000);
    return;
  }

  const unsigned long now = millis();

  if (now - lastPumpPollMs >= PUMP_POLL_MS) {
    lastPumpPollMs = now;
    if (!syncPumpFromServer()) {
      if (lastServerOkMs > 0 && (now - lastServerOkMs) > 60000) {
        Serial.println("Server unreachable >60s — relay holds last known state");
        lastServerOkMs = now;
      }
    }
  }

  if (now - lastSensorMs >= SENSOR_CYCLE_MS) {
    lastSensorMs = now;
    const int sensorRaw = readSensorAdc();
    if (postSensorWithRetries(sensorRaw)) {
      Serial.printf("Sensor OK ADC=%d  serverPumpOn=%s\n", sensorRaw,
                    lastServerPumpOn ? "true" : "false");
    }
  }

  delay(10);
}
