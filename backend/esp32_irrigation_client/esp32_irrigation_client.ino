/*
 * Smart Irrigation — ESP32 HTTPS client for Render (or any TLS backend).
 *
 * GET  /api/status  → pumpOn → relay
 * POST /api/sensor  → sensorRaw + x-device-key
 *
 * HTTP -1 fix: fresh TLS session per request, NTP time, DNS 8.8.8.8, WiFi sleep off,
 * single-flight HTTP (no overlapping GET/POST on one SSL socket).
 */

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>

// ----- Wi-Fi -----
static const char* WIFI_SSID = "Amana";
static const char* WIFI_PASSWORD = "";  // set password if network is not open

// ----- Backend -----
// USE_LOCAL_HTTP=true: PC running "npm start" on the SAME Wi-Fi as the ESP32 (no TLS).
// USE_LOCAL_HTTP=false: Render HTTPS (only if your network can reach onrender.com:443).
static const bool USE_LOCAL_HTTP = true;
static const char* BACKEND_HOST = "192.168.193.40";  // your PC LAN IP (ipconfig)
static const uint16_t BACKEND_PORT = 5000;             // 5000 local, 443 for Render
static const char* RENDER_HOST = "irrigation-pzz4.onrender.com";
static const char* API_DEVICE_KEY = "change-me";  // must match ESP32_API_KEY in backend/.env

// ----- Hardware -----
static const int SENSOR_PIN = 34;
static const int RELAY_PIN = 25;
static const bool PUMP_ACTIVE_LOW = true;
static const bool INVERT_RELAY_VS_SERVER = true;

static const unsigned long PUMP_POLL_MS = 2000;
static const unsigned long SENSOR_CYCLE_MS = 4000;
static const uint16_t HTTP_TIMEOUT_MS = 25000;
static const int HTTP_MAX_RETRIES = 4;
static const int BOOT_SYNC_RETRIES = 10;

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
  } else if (code == HTTPC_ERROR_SEND_HEADER_FAILED) {
    Serial.print(" — send header failed");
  } else if (code == HTTPC_ERROR_SEND_PAYLOAD_FAILED) {
    Serial.print(" — send payload failed");
  } else if (code == HTTPC_ERROR_NOT_CONNECTED) {
    Serial.print(" — not connected");
  } else if (code == HTTPC_ERROR_CONNECTION_LOST) {
    Serial.print(" — connection lost");
  } else if (code == HTTPC_ERROR_NO_STREAM) {
    Serial.print(" — no stream");
  } else if (code == HTTPC_ERROR_NO_HTTP_SERVER) {
    Serial.print(" — no HTTP server");
  } else if (code == HTTPC_ERROR_TOO_LESS_RAM) {
    Serial.print(" — out of RAM");
  } else if (code == HTTPC_ERROR_READ_TIMEOUT) {
    Serial.print(" — read timeout");
  } else if (code < 0) {
    Serial.print(" — TLS/TCP error (no response reached server)");
  }
  Serial.printf(" heap=%u rssi=%d\n", ESP.getFreeHeap(), WiFi.RSSI());
}

static const char* activeBackendHost() {
  return USE_LOCAL_HTTP ? BACKEND_HOST : RENDER_HOST;
}

static uint16_t activeBackendPort() {
  return USE_LOCAL_HTTP ? BACKEND_PORT : 443;
}

/** One fresh client per request — reusing one SSL socket causes HTTP -1 on ESP32. */
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

  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  const char* host = activeBackendHost();
  const uint16_t port = activeBackendPort();
  const bool isHttps = !USE_LOCAL_HTTP;
  bool begun = false;

  if (USE_LOCAL_HTTP) {
    plainClient.setTimeout(HTTP_TIMEOUT_MS);
    begun = http.begin(plainClient, host, port, path);
  } else {
    secureClient.setInsecure();
    secureClient.setTimeout(HTTP_TIMEOUT_MS);
    begun = http.begin(secureClient, host, port, path, true);
  }

  if (!begun) {
    Serial.printf("%s %s: http.begin failed\n", method, path);
    httpBusy = false;
    return false;
  }

  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setReuse(false);
  http.addHeader("Connection", "close");
  http.addHeader("User-Agent", "ESP32-Irrigation/1.0");
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
  if (USE_LOCAL_HTTP) {
    plainClient.stop();
  } else {
    secureClient.stop();
  }
  delay(80);

  if (outCode) {
    *outCode = code;
  }
  if (outPayload) {
    *outPayload = payload;
  }

  httpBusy = false;
  return code > 0;
}

static bool syncTimeNtp() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  struct tm timeinfo;
  for (int i = 0; i < 25; i++) {
    if (getLocalTime(&timeinfo)) {
      Serial.printf("NTP OK: %04d-%02d-%02d %02d:%02d:%02d\n", timeinfo.tm_year + 1900,
                    timeinfo.tm_mon + 1, timeinfo.tm_mday, timeinfo.tm_hour, timeinfo.tm_min,
                    timeinfo.tm_sec);
      return true;
    }
    delay(400);
  }
  Serial.println("NTP failed — continuing (setInsecure TLS may still work)");
  return false;
}

static bool testDns() {
  if (USE_LOCAL_HTTP) {
    Serial.printf("Local HTTP mode — backend %s:%u (no DNS needed)\n", BACKEND_HOST, BACKEND_PORT);
    return true;
  }
  IPAddress ip;
  if (WiFi.hostByName(RENDER_HOST, ip)) {
    Serial.printf("DNS OK: %s -> %s\n", RENDER_HOST, ip.toString().c_str());
    return true;
  }
  Serial.printf("DNS FAILED for %s — network may block Render; try USE_LOCAL_HTTP\n", RENDER_HOST);
  return false;
}

static bool testBackendReachable() {
  int code = 0;
  String payload;
  Serial.println("Probing GET /api/health ...");
  if (!httpRequest("GET", "/api/health", nullptr, &code, &payload)) {
    logHttpError("GET /api/health", code);
    return false;
  }
  if (code != HTTP_CODE_OK) {
    logHttpError("GET /api/health", code);
    if (payload.length() > 0 && payload.length() < 200) {
      Serial.printf("body=%s\n", payload.c_str());
    }
    return false;
  }
  Serial.printf("Backend reachable: %s\n", payload.c_str());
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
  if (code != HTTP_CODE_OK) {
    logHttpError("GET /api/status", code);
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
  if (code == HTTP_CODE_OK || code == 201) {
    lastServerOkMs = millis();
    return true;
  }

  logHttpError("POST /api/sensor", code);
  if (code == 401) {
    Serial.println("Hint: set API_DEVICE_KEY = Render ESP32_API_KEY");
  }
  if (payload.length() > 0 && payload.length() < 200) {
    Serial.printf("body=%s\n", payload.c_str());
  }
  return false;
}

static bool postSensorWithRetries(int sensorRaw) {
  for (int attempt = 1; attempt <= HTTP_MAX_RETRIES; attempt++) {
    if (httpPostSensor(sensorRaw)) {
      return true;
    }
    if (attempt < HTTP_MAX_RETRIES) {
      delay(800 * attempt);
    }
  }
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
      delay(800 * attempt);
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
  Serial.printf("Gateway: %s  DNS: 8.8.8.8\n", WiFi.gatewayIP().toString().c_str());
  WiFi.config(INADDR_NONE, INADDR_NONE, INADDR_NONE, IPAddress(8, 8, 8, 8), IPAddress(1, 1, 1, 1));

  if (!USE_LOCAL_HTTP) {
    syncTimeNtp();
  }
  testDns();

  Serial.printf("Backend %s://%s:%u — pump %lums, sensor %lums\n", USE_LOCAL_HTTP ? "http" : "https",
                activeBackendHost(), activeBackendPort(), PUMP_POLL_MS, SENSOR_CYCLE_MS);

  for (int i = 0; i < BOOT_SYNC_RETRIES; i++) {
    if (testBackendReachable()) {
      break;
    }
    Serial.printf("Backend probe %d/%d failed — Render may be waking (wait 30-60s)...\n", i + 1,
                  BOOT_SYNC_RETRIES);
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
        Serial.println("Server unreachable >90s — relay holds last state");
        lastServerOkMs = now;
      }
    }
  }

  delay(20);
}
