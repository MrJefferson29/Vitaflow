const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const morgan = require("morgan");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const ESP32_API_KEY = process.env.ESP32_API_KEY || "change-me";
const ADC_MAX = 4095;

const storePath = path.join(__dirname, "data", "store.json");

function parseDryThresholdRaw() {
  const raw = process.env.ESP_DRY_THRESHOLD_RAW;
  if (raw === undefined || raw === "") {
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > ADC_MAX) {
    return null;
  }
  return n;
}

/** ESP32 ADC: higher reading = drier (typical capacitive probe). Map to moisture % (100 = wet). */
function moisturePercentFromSensorRaw(sensorRaw) {
  const clamped = Math.max(0, Math.min(ADC_MAX, sensorRaw));
  return Math.round(((ADC_MAX - clamped) / ADC_MAX) * 100);
}

function defaultStore() {
  return {
    moistureLevel: 42,
    sensorRaw: null,
    pumpOn: false,
    pumpUpdatedAt: new Date().toISOString(),
    lastSensorUpdate: new Date().toISOString(),
    reminders: [],
  };
}

function ensureStoreFile() {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(storePath)) {
    writeStoreRaw(defaultStore());
  }
}

/** Atomic-ish write: full JSON to temp file, then replace main file (avoids half-written store.json). */
function writeStoreRaw(data) {
  const tmpPath = `${storePath}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, payload, "utf-8");
  fs.copyFileSync(tmpPath, storePath);
  fs.unlinkSync(tmpPath);
}

/** Parse pump from API / disk. Returns undefined if the value is not a recognized on/off form. */
function toPumpBooleanStrict(raw) {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (raw === 0 || raw === 1) {
    return raw === 1;
  }
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "on") {
      return true;
    }
    if (s === "false" || s === "0" || s === "off") {
      return false;
    }
  }
  return undefined;
}

function readStore() {
  ensureStoreFile();
  let raw = "";
  try {
    raw = fs.readFileSync(storePath, "utf-8");
  } catch {
    const fresh = defaultStore();
    writeStoreRaw(fresh);
    return fresh;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    const fresh = defaultStore();
    writeStoreRaw(fresh);
    return mergeAndNormalizeStore(fresh);
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const fresh = defaultStore();
    writeStoreRaw(fresh);
    return mergeAndNormalizeStore(fresh);
  }

  return mergeAndNormalizeStore(parsed);
}

function mergeAndNormalizeStore(parsed) {
  const base = defaultStore();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    writeStoreRaw(base);
    return { ...base, pumpOn: false };
  }
  const store = {
    ...base,
    ...parsed,
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
  };
  const p = toPumpBooleanStrict(store.pumpOn);
  store.pumpOn = p === undefined ? false : p;
  if (typeof store.moistureLevel !== "number" || !Number.isFinite(store.moistureLevel)) {
    store.moistureLevel = base.moistureLevel;
  }
  if (store.sensorRaw != null && (typeof store.sensorRaw !== "number" || !Number.isFinite(store.sensorRaw))) {
    store.sensorRaw = null;
  }
  if (typeof store.lastSensorUpdate !== "string") {
    store.lastSensorUpdate = base.lastSensorUpdate;
  }
  if (typeof store.pumpUpdatedAt !== "string") {
    store.pumpUpdatedAt = base.pumpUpdatedAt;
  }
  return store;
}

function writeStore(next) {
  writeStoreRaw(next);
}

/** Update only the given fields so sensor posts never clobber pumpOn from a stale full-store read. */
function patchStoreFields(fields) {
  const store = readStore();
  if (fields.moistureLevel !== undefined) {
    store.moistureLevel = fields.moistureLevel;
  }
  if (fields.sensorRaw !== undefined) {
    store.sensorRaw = fields.sensorRaw;
  }
  if (fields.lastSensorUpdate !== undefined) {
    store.lastSensorUpdate = fields.lastSensorUpdate;
  }
  if (fields.pumpOn !== undefined) {
    const parsed = toPumpBooleanStrict(fields.pumpOn);
    if (parsed !== undefined) {
      store.pumpOn = parsed;
      store.pumpUpdatedAt = new Date().toISOString();
    }
  }
  writeStore(store);
  return store;
}

async function generateAiReply(message) {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) {
    return "I can help with irrigation, soil moisture, pests, and fertilizer schedules. Add OPENAI_API_KEY in backend .env for smarter AI responses.";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "You are an agronomy assistant. Give concise, practical farm guidance about crops, irrigation, and soil care.",
          },
          {
            role: "user",
            content: message,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API failed: ${response.status}`);
    }

    const data = await response.json();
    if (data.output_text) {
      return data.output_text;
    }

    return "I could not parse an AI response. Please try again.";
  } catch (error) {
    return `AI service is temporarily unavailable (${error.message}).`;
  }
}

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/status", (_req, res) => {
  const store = readStore();
  const dryThresholdRaw = parseDryThresholdRaw();
  res.json({
    moistureLevel: store.moistureLevel,
    sensorRaw: store.sensorRaw ?? null,
    dryThresholdRaw,
    pumpOn: Boolean(store.pumpOn),
    pumpUpdatedAt: store.pumpUpdatedAt ?? store.lastSensorUpdate,
    lastSensorUpdate: store.lastSensorUpdate,
  });
});

app.post("/api/pump", (req, res) => {
  const raw = (req.body || {}).pumpOn;
  const pumpOn = toPumpBooleanStrict(raw);
  if (pumpOn === undefined) {
    return res.status(400).json({ message: "pumpOn must be true/false or 0/1." });
  }

  const store = patchStoreFields({ pumpOn });
  console.log(`[pump] set pumpOn=${pumpOn} (device should read via GET /api/status)`);
  return res.json({
    message: `Pump turned ${pumpOn ? "ON" : "OFF"}.`,
    pumpOn: Boolean(store.pumpOn),
    pumpUpdatedAt: store.pumpUpdatedAt,
  });
});

app.post("/api/sensor", (req, res) => {
  const apiKey = req.headers["x-device-key"];
  if (apiKey !== ESP32_API_KEY) {
    return res.status(401).json({ message: "Unauthorized ESP32 device." });
  }

  const { moistureLevel, sensorRaw } = req.body || {};
  let nextMoisture = null;
  let nextSensorRaw = null;

  if (typeof sensorRaw === "number" && Number.isFinite(sensorRaw)) {
    if (sensorRaw < 0 || sensorRaw > ADC_MAX) {
      return res.status(400).json({ message: `sensorRaw must be between 0 and ${ADC_MAX} (ESP32 ADC).` });
    }
    nextSensorRaw = Math.round(sensorRaw);
    nextMoisture = moisturePercentFromSensorRaw(nextSensorRaw);
  } else if (typeof moistureLevel === "number" && Number.isFinite(moistureLevel)) {
    if (moistureLevel < 0 || moistureLevel > 100) {
      return res.status(400).json({ message: "moistureLevel must be a number between 0 and 100." });
    }
    nextMoisture = Math.round(moistureLevel);
  } else {
    return res.status(400).json({
      message: `Send sensorRaw (0–${ADC_MAX}, ESP32 GPIO34-style ADC) or moistureLevel (0–100). Pump state is only changed via POST /api/pump (app).`,
    });
  }

  const store = patchStoreFields({
    moistureLevel: nextMoisture,
    sensorRaw: nextSensorRaw !== null ? nextSensorRaw : undefined,
    lastSensorUpdate: new Date().toISOString(),
  });
  return res.json({
    message: "Sensor reading updated.",
    moistureLevel: store.moistureLevel,
    sensorRaw: store.sensorRaw ?? null,
    pumpOn: Boolean(store.pumpOn),
    pumpUpdatedAt: store.pumpUpdatedAt,
  });
});

app.get("/api/reminders", (_req, res) => {
  const store = readStore();
  res.json(store.reminders);
});

app.post("/api/reminders", (req, res) => {
  const { title, dueAt } = req.body || {};
  if (!title || !dueAt) {
    return res.status(400).json({ message: "title and dueAt are required." });
  }

  const dueDate = new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    return res.status(400).json({ message: "dueAt must be a valid date." });
  }

  const store = readStore();
  const reminder = {
    id: `${Date.now()}`,
    title: String(title).trim(),
    dueAt: dueDate.toISOString(),
    done: false,
  };
  store.reminders.push(reminder);
  writeStore(store);
  return res.status(201).json(reminder);
});

app.patch("/api/reminders/:id", (req, res) => {
  const { id } = req.params;
  const { done } = req.body || {};
  if (typeof done !== "boolean") {
    return res.status(400).json({ message: "done must be a boolean." });
  }

  const store = readStore();
  const reminder = store.reminders.find((item) => item.id === id);
  if (!reminder) {
    return res.status(404).json({ message: "Reminder not found." });
  }

  reminder.done = done;
  writeStore(store);
  return res.json(reminder);
});

app.delete("/api/reminders/:id", (req, res) => {
  const { id } = req.params;
  const store = readStore();
  const before = store.reminders.length;
  store.reminders = store.reminders.filter((item) => item.id !== id);

  if (store.reminders.length === before) {
    return res.status(404).json({ message: "Reminder not found." });
  }

  writeStore(store);
  return res.status(204).send();
});

app.post("/api/chat", async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ message: "message is required." });
  }

  const reply = await generateAiReply(message);
  return res.json({ reply });
});

app.get("/", (_req, res) => {
  res.send("Smart Irrigation API is running.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend server listening on http://0.0.0.0:${PORT} (LAN: use this machine's IP)`);
});
