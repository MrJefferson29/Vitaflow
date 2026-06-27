
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

static const char* WIFI_SSID = "Amana";
static const char* WIFI_PASSWORD = "";

static const char* BACKEND_HOST = "irrigation-pzz4.onrender.com";
static const uint16_t BACKEND_PORT = 443;
static const char* API_DEVICE_KEY = "change-me";

static const int SENSOR_PIN = 34;
static const int RELAY_PIN = 25;
static const bool PUMP_ACTIVE_LOW = true;
static const bool INVERT_RELAY_VS_SERVER = true;

static const unsigned long PUMP_POLL_MS = 2500;
static const unsigned long SENSOR_CYCLE_MS = 5000;
static const uint16_t HTTP_TIMEOUT_MS = 30000;
static const int HTTP_MAX_RETRIES = 5;
static const int BOOT_SYNC_RETRIES = 12;

static unsigned long lastPumpPollMs = 0;
static unsigned long lastSensorMs = 0;
static bool lastServerPumpOn = false;
static bool relayInitialized = false;
static unsigned long lastServerOkMs = 0;
static bool httpBusy = false;

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

static bool isCaptivePortal(int code, const String& body) {
  if (code == 301 || code == 302 || code == 307) {
    return true;
  }
  if (body.indexOf("recharge.orange") >= 0) {
    return true;
  }
  if (body.indexOf("Captive Portal") >= 0 || body.indexOf("<html>") >= 0) {
    return code != HTTP_CODE_OK && code != 201;
  }
  return false;
}

static void logCaptivePortalHint() {
  Serial.println(
      ">>> Mobile carrier captive portal detected (e.g. Orange recharge page).");
  Serial.println(
      ">>> Recharge mobile data OR use home Wi-Fi with internet — not HTTP to LAN.");
}

static bool ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }
  Serial.println("Wi-Fi lost, reconnecting...");
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  if (WIFI_PASSWORD[0] != '\0') {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  } else {
    WiFi.begin(WIFI_SSID);
  }
  for (int i = 0; i < 50 && WiFi.status() != WL_CONNECTED; i++) {
    delay(300);
  }
  if (WiFi.status() == WL_CONNECTED) {
    WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, IPAddress(8, 8, 8, 8),
                IPAddress(1, 1, 1, 1));
    Serial.print("Wi-Fi OK, IP: ");
    Serial.println(WiFi.localIP());
  }
  return WiFi.status() == WL_CONNECTED;
}

static void logHttpError(const char* label, int code) {
  Serial.printf("%s failed HTTP %d", label, code);
  if (code == HTTPC_ERROR_CONNECTION_REFUSED) {
    Serial.print(" — connection refused");
  } else if (code == HTTPC_ERROR_READ_TIMEOUT) {
    Serial.print(" — read timeout");
  } else if (code < 0) {
    Serial.print(" — TLS/TCP failed (check Wi-Fi internet, not LAN IP)");
  }
  Serial.printf(" heap=%u rssi=%d\n", ESP.getFreeHeap(), WiFi.RSSI());
}

/** Fresh TLS socket per request — shared WiFiClientSecure causes HTTP -1 on ESP32. */
static bool httpRequest(const char* method, const char* path, const char* jsonBody, int* outCode,
                        String* outPayload) {
  if (httpBusy) {
    return false;
  }
  httpBusy = true;

  if (!ensureWiFi()) {
    httpBusy = false;
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(HTTP_TIMEOUT_MS);

  HTTPClient http;
  if (!http.begin(client, BACKEND_HOST, BACKEND_PORT, path, true)) {
    Serial.printf("%s %s: http.begin failed\n", method, path);
    httpBusy = false;
    return false;
  }

  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setReuse(false);
  http.addHeader("Connection", "close");
  http.addHeader("Host", BACKEND_HOST);
  http.addHeader("User-Agent", "ESP32-Irrigation/2.0");
  if (jsonBody != nullptr) {
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-key", API_DEVICE_KEY);
  }

  int code;
  if (strcmp(method, "GET") == 0) {
    code = http.GET();
  } else {
    code = http.POST(String(jsonBody));
  }

  String payload;
  if (code > 0) {
    payload = http.getString();
  }

  http.end();
  client.stop();
  delay(100);

  if (outCode) {
    *outCode = code;
  }
  if (outPayload) {
    *outPayload = payload;
  }

  httpBusy = false;
  return code > 0;
}

static void syncTimeNtp() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  struct tm timeinfo;
  for (int i = 0; i < 20; i++) {
    if (getLocalTime(&timeinfo)) {
      Serial.println("NTP time synced");
      return;
    }
    delay(400);
  }
  Serial.println("NTP skipped (setInsecure TLS still used)");
}

static bool testDns() {
  IPAddress ip;
  if (WiFi.hostByName(BACKEND_HOST, ip)) {
    Serial.printf("DNS OK: %s -> %s\n", BACKEND_HOST, ip.toString().c_str());
    return true;
  }
  Serial.printf("DNS FAILED for %s\n", BACKEND_HOST);
  return false;
}

static bool httpGetHealth() {
  int code = 0;
  String payload;
  if (!httpRequest("GET", "/api/health", nullptr, &code, &payload)) {
    logHttpError("GET /api/health", code);
    return false;
  }
  if (isCaptivePortal(code, payload)) {
    logCaptivePortalHint();
    if (payload.length() < 180) {
      Serial.printf("body=%s\n", payload.c_str());
    }
    return false;
  }
  if (code != HTTP_CODE_OK) {
    logHttpError("GET /api/health", code);
    return false;
  }
  Serial.printf("Backend OK: %s\n", payload.c_str());
  lastServerOkMs = millis();
  return true;
}

static bool httpGetStatus(bool* pumpOnOut) {
  int code = 0;
  String payload;
  if (!httpRequest("GET", "/api/status", nullptr, &code, &payload)) {
    logHttpError("GET /api/status", code);
    return false;
  }
  if (isCaptivePortal(code, payload)) {
    logCaptivePortalHint();
    return false;
  }
  if (code != HTTP_CODE_OK) {
    logHttpError("GET /api/status", code);
    if (payload.length() > 0 && payload.length() < 160) {
      Serial.printf("body=%s\n", payload.c_str());
    }
    return false;
  }

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
  JsonDocument body;
  body["sensorRaw"] = sensorRaw;
  String json;
  serializeJson(body, json);
  Serial.printf("POST /api/sensor ADC=%d json=%s\n", sensorRaw, json.c_str());

  int code = 0;
  String payload;
  if (!httpRequest("POST", "/api/sensor", json.c_str(), &code, &payload)) {
    logHttpError("POST /api/sensor", code);
    return false;
  }
  if (isCaptivePortal(code, payload)) {
    logCaptivePortalHint();
    return false;
  }
  if (code == HTTP_CODE_OK || code == 201) {
    lastServerOkMs = millis();
    return true;
  }

  logHttpError("POST /api/sensor", code);
  if (code == 401) {
    Serial.println("Hint: API_DEVICE_KEY must match Render ESP32_API_KEY");
  }
  if (payload.length() > 0 && payload.length() < 160) {
    Serial.printf("body=%s\n", payload.c_str());
  }
  return false;
}

static bool getPumpWithRetries(bool* pumpOnOut) {
  for (int attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
    if (!ensureWiFi()) {
      delay(600);
      continue;
    }
    if (httpGetStatus(pumpOnOut)) {
      return true;
    }
    if (attempt < HTTP_MAX_RETRIES) {
      delay(1000 * attempt);
    }
  }
  return false;
}

static bool postSensorWithRetries(int sensorRaw) {
  for (int attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
    if (!ensureWiFi()) {
      delay(600);
      continue;
    }
    if (httpPostSensor(sensorRaw)) {
      return true;
    }
    if (attempt < HTTP_MAX_RETRIES) {
      delay(1000 * attempt);
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
  delay(400);

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(SENSOR_PIN, INPUT);
  applyRelayFromPumpOn(false);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.persistent(false);

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
  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, IPAddress(8, 8, 8, 8), IPAddress(1, 1, 1, 1));

  syncTimeNtp();
  testDns();

  Serial.printf("Backend https://%s — pump %lums, sensor %lums\n", BACKEND_HOST, PUMP_POLL_MS,
                SENSOR_CYCLE_MS);

  Serial.println("Probing Render (cold start may take 30-60s)...");
  for (int i = 0; i < BOOT_SYNC_RETRIES; i++) {
    if (httpGetHealth()) {
      break;
    }
    Serial.printf("Health probe %d/%d failed, retrying...\n", i + 1, BOOT_SYNC_RETRIES);
    delay(5000);
  }

  Serial.println("Syncing pump state...");
  for (int i = 0; i < BOOT_SYNC_RETRIES; i++) {
    if (syncPumpFromServer()) {
      Serial.println("Initial pump sync OK");
      break;
    }
    delay(4000);
  }
}

void loop() {
  if (!ensureWiFi()) {
    delay(1500);
    return;
  }

  const unsigned long now = millis();

  if (now - lastSensorMs >= SENSOR_CYCLE_MS) {
    lastSensorMs = now;
    const int sensorRaw = readSensorAdc();
    if (postSensorWithRetries(sensorRaw)) {
      Serial.printf("Sensor OK ADC=%d  serverPumpOn=%s\n", sensorRaw,
                    lastServerPumpOn ? "true" : "false");
    }
  }

  if (now - lastPumpPollMs >= PUMP_POLL_MS) {
    lastPumpPollMs = now;
    if (!syncPumpFromServer()) {
      if (lastServerOkMs > 0 && (now - lastServerOkMs) > 90000) {
        Serial.println("Render unreachable >90s — relay holds last state");
        lastServerOkMs = now;
      }
    }
  }

  delay(30);
}
