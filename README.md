# Smart Irrigation System

## Project Overview

This project is a **Smart Irrigation System** for agriculture and small-scale farming. It combines an embedded soil-moisture sensor, an automated water pump controlled by a relay, a central server on the local network, and a mobile application so farmers can monitor soil conditions, control irrigation, schedule farm tasks, and get guidance on crop care.

The system is designed to run on a **local area network (LAN)**. The ESP32 microcontroller, the backend server (typically a laptop or PC), and the mobile phone must all be on the same Wi-Fi network. This keeps the setup simple for field demos, university projects, and prototype deployments without requiring a paid cloud platform for basic operation.

---

## System Architecture

The solution has three main layers that work together:

**1. Hardware layer (ESP32 microcontroller)**

- Reads soil moisture using a capacitive soil moisture sensor connected to **GPIO34** (analog input).
- Uses the ESP32’s **12-bit ADC**, producing raw values from **0 to 4095**. For typical capacitive probes, a **higher reading means drier soil**.
- Sends sensor readings to the backend over Wi-Fi.
- Polls the server for pump on/off state and drives a **relay on GPIO26** to turn the water pump on or off.
- Authenticates sensor uploads with a shared API key.

**2. Backend layer (Node.js / Express API)**

- Hosts a REST API (default port **5000**, listening on all interfaces so LAN devices can connect).
- Stores the latest moisture reading, raw ADC value, pump state, and farm reminders in a JSON file (`backend/data/store.json`).
- Converts raw ADC readings into an estimated **moisture percentage** (0% = dry, 100% = wet).
- Exposes endpoints for the mobile app and the ESP32.
- Optionally connects to **OpenAI** for an agronomy chat assistant.

**3. Application layer (Expo / React Native mobile app)**

- **Dashboard**: shows soil moisture %, raw sensor ADC, pump status, and last sync time; allows turning the pump on or off.
- **Reminders**: create, complete, and delete scheduled farm tasks (e.g. fertilizer, weeding, harvest).
- **Chat**: ask questions about irrigation, soil, pests, and fertilizer; answers come from the backend (with optional AI when configured).

### How data flows

1. The ESP32 reads the moisture sensor and **POST**s `sensorRaw` to `/api/sensor` about every 1.5 seconds.
2. The backend updates stored moisture and timestamp.
3. The user toggles the pump in the mobile app via **POST** `/api/pump`.
4. The ESP32 **GET**s `/api/status` about every 400 ms and sets the relay so the physical pump matches the server state.
5. The mobile app **GET**s `/api/status` to refresh the dashboard.

The **server is the source of truth for pump state**. The ESP32 does not turn the pump on by itself from sensor logic in the current design; irrigation is controlled from the app (or any client that calls the pump API).

### Moisture calculation

When the device sends `sensorRaw`, the backend maps it to moisture percent:

- Raw value is clamped to 0–4095.
- Moisture % = round((4095 − sensorRaw) / 4095 × 100).
- So **100% means wet** (low ADC) and **0% means dry** (high ADC).

An optional environment variable `ESP_DRY_THRESHOLD_RAW` (e.g. 3000) can be set on the backend so the app can display the same “dry threshold” used for calibration notes.

---

## Main Features

| Feature | Description |
|--------|-------------|
| Real-time soil monitoring | Live moisture % and raw ADC from the ESP32 |
| Remote pump control | Turn irrigation pump on/off from the phone |
| Farm reminders | Task list with due dates and done/pending status |
| Agronomy assistant | Chat for irrigation and crop-care advice (optional OpenAI) |
| Device security | ESP32 sensor posts require `x-device-key` matching `ESP32_API_KEY` |
| Local persistence | State saved in JSON without a separate database server |

---

## Technologies Used and Why They Were Chosen

### ESP32 (Arduino framework)

**What it is:** A low-cost Wi-Fi microcontroller widely used in IoT projects.

**Why it was used:**

- Built-in **Wi-Fi** for talking to the backend without extra modules.
- **12-bit ADC** on GPIO pins, suitable for analog soil moisture sensors.
- Large community, many relay and sensor examples, and Arduino libraries (WiFi, HTTPClient, ArduinoJson).
- Runs **standalone firmware** on the farm network without tying control logic to a specific cloud vendor.
- Low power and cost compared to a full single-board computer at the sensor node.

**Libraries on device:** ArduinoJson (v7.x), WiFi, HTTPClient (from the ESP32 board package).

---

### Node.js and Express 5

**What it is:** JavaScript runtime (Node.js) with Express as a minimal web framework for HTTP APIs.

**Why it was used:**

- **Fast to build REST APIs** with JSON request/response bodies for both the mobile app and the ESP32.
- **Single language (JavaScript)** across backend and familiar ecosystem (npm).
- Easy to run on a **Windows/Mac/Linux PC** on the LAN; binds to `0.0.0.0` so phones and ESP32 can reach it by IP address.
- **Express 5** provides routing, middleware, and JSON parsing with little boilerplate.
- Fits academic and prototype timelines where a full microservices stack is unnecessary.

**Supporting backend packages:**

| Package | Role | Why |
|--------|------|-----|
| **dotenv** | Loads `.env` configuration | Keeps secrets (API keys, port) out of source code |
| **cors** | Cross-Origin Resource Sharing | Allows the Expo app (different origin) to call the API from web or dev builds |
| **morgan** | HTTP request logging | Helps debug traffic from the phone and ESP32 during development |
| **body-parser** | Request body parsing | Used with Express for JSON payloads |
| **nodemon** | Auto-restart on file changes | Speeds up backend development |
| **jsonwebtoken** | JWT support (dependency) | Listed in package.json for possible future auth; not required for current LAN prototype |
| **mongoose** | MongoDB ODM (dependency) | Listed in package.json; **current code uses JSON file storage** instead for simplicity |

**Persistence choice:** Data is stored in `backend/data/store.json` with atomic-style writes (write to temp file, then replace). **Why:** No need to install or maintain MongoDB for demos; easy to inspect and back up; sufficient for single-field, single-server use.

---

### React Native with Expo and Expo Router

**What it is:** A framework to build native mobile (and web) apps using React, with Expo providing tooling, builds, and native modules.

**Why it was used:**

- **One codebase** for Android, iOS, and web testing.
- **Expo Router** gives file-based navigation (`app/(tabs)/`) so screens (Dashboard, Reminders, Chat) stay organized.
- **Fast development**: hot reload, Expo Go for testing on a physical phone on the same network as the backend.
- **TypeScript** in the frontend improves reliability when calling the API (`frontend/lib/api.ts`).
- UI built with standard React Native components (ScrollView, Pressable, FlatList) for a clean, native feel without a heavy custom design system.

**Supporting frontend packages:**

### OpenAI API (optional)

**What it is:** Cloud language model API used for the `/api/chat` endpoint.

**Why it was used:**

- Provides **practical, natural-language answers** about irrigation timing, soil moisture, pests, and fertilizer without training a custom model.
- Backend uses model **gpt-4.1-mini** via the OpenAI Responses API when `OPENAI_API_KEY` is set in `backend/.env`.
- If the key is missing, the server still responds with **built-in fallback text** so the app remains usable for demonstrations.

---


## Hardware Configuration (ESP32)

| Item | Setting |
|------|---------|
| Moisture sensor pin | GPIO34 (ADC input) |
| Relay / pump control pin | GPIO26 |
| Pump poll interval | 400 ms (read server pump state) |
| Sensor post interval | 1500 ms |
| Relay logic | Configurable: `PUMP_ACTIVE_LOW`, `INVERT_RELAY_VS_SERVER` in firmware |

Firmware constants to edit before flashing:

- `WIFI_SSID`, `WIFI_PASSWORD` — farm Wi-Fi
- `BACKEND_HOST` — LAN IP of the PC running the backend
- `BACKEND_PORT` — must match `PORT` in backend `.env` (default 5000)
- `API_DEVICE_KEY` — must match `ESP32_API_KEY` in backend `.env`

---
## Advantages of This Overall Design

1. **Separation of concerns:** Sensor hardware, business logic (server), and user interface (app) can be developed and tested independently.
2. **Low operational cost:** No mandatory cloud subscription for core irrigation monitoring and pump control.
3. **Transparent state:** Pump and moisture state live in one JSON store and one API; easy to debug with browser or Postman.
4. **Scalable path:** Dependencies like mongoose and jsonwebtoken allow future upgrade to MongoDB and user accounts without rewriting the whole app.
5. **Farmer-facing features:** Reminders and chat go beyond raw IoT toggles toward practical farm management.
6. **Cross-platform app:** Expo reduces the need for separate Android and iOS native projects.

---

## Summary

The Smart Irrigation System connects an **ESP32** soil sensor and pump relay to a **Node.js/Express** backend and an **Expo** mobile app over a local network. It monitors soil moisture, controls irrigation remotely, schedules farm tasks, and optionally provides AI-assisted crop advice. The technology choices prioritize **simplicity, local control, fast development, and clarity** for education, prototyping, and small-scale agricultural use.

---

*Document generated for the Irrigation project repository. Update LAN IP addresses, API keys, and Wi-Fi credentials in your local configuration files when deploying.*
#   I r r i g a t i o n  
 