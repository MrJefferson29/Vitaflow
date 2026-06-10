const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const morgan = require("morgan");

const { connectDb, isDbConnected } = require("./db");
const Reminder = require("./models/Reminder");
const { parseDueDate } = require("./lib/dates");
const {
  parseAutoIrrigateConfig,
  resolvePumpFromAuto,
  isPumpAutoSuppressed,
  snoozeAutoUntil,
  wasAutoIrrigationContext,
} = require("./lib/auto-irrigate");
const { generateGeminiReply, isGeminiConfigured, getGeminiConfig } = require("./lib/gemini");
const {
  ADC_MAX,
  coerceSensorRaw,
  normalizeSensorRaw,
  moisturePercentFromSensorRaw,
} = require("./lib/sensor");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const ESP32_API_KEY = process.env.ESP32_API_KEY || "change-me";

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

function defaultStore() {
  return {
    moistureLevel: 42,
    sensorRaw: null,
    pumpOn: false,
    pumpAutoTriggered: false,
    pumpAutoSuppressedUntil: null,
    pumpUpdatedAt: new Date().toISOString(),
    lastSensorUpdate: null,
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
  store.pumpAutoTriggered = Boolean(store.pumpAutoTriggered);
  if (store.pumpAutoSuppressedUntil != null && typeof store.pumpAutoSuppressedUntil !== "string") {
    store.pumpAutoSuppressedUntil = null;
  }
  if (store.pumpAutoSuppressedUntil && !isPumpAutoSuppressed(store)) {
    store.pumpAutoSuppressedUntil = null;
  }
  if (store.lastSensorUpdate != null && typeof store.lastSensorUpdate !== "string") {
    store.lastSensorUpdate = null;
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
  if (fields.pumpAutoTriggered !== undefined) {
    store.pumpAutoTriggered = Boolean(fields.pumpAutoTriggered);
  }
  if (fields.pumpAutoSuppressedUntil !== undefined) {
    store.pumpAutoSuppressedUntil = fields.pumpAutoSuppressedUntil;
  }
  writeStore(store);
  return store;
}

function sensorAgeSeconds(lastSensorUpdate) {
  if (!lastSensorUpdate) {
    return null;
  }
  const ts = new Date(lastSensorUpdate).getTime();
  if (Number.isNaN(ts)) {
    return null;
  }
  return Math.max(0, Math.round((Date.now() - ts) / 1000));
}

function buildStatusPayload(store) {
  const autoConfig = parseAutoIrrigateConfig();
  return {
    moistureLevel: store.moistureLevel,
    sensorRaw: store.sensorRaw ?? null,
    dryThresholdRaw: parseDryThresholdRaw(),
    pumpOn: Boolean(store.pumpOn),
    pumpAutoTriggered: Boolean(store.pumpAutoTriggered),
    pumpAutoSuppressedUntil: store.pumpAutoSuppressedUntil ?? null,
    pumpAutoSnoozed: isPumpAutoSuppressed(store),
    pumpUpdatedAt: store.pumpUpdatedAt ?? store.lastSensorUpdate,
    lastSensorUpdate: store.lastSensorUpdate,
    sensorAgeSeconds: sensorAgeSeconds(store.lastSensorUpdate),
    autoIrrigateEnabled: autoConfig.enabled,
    autoIrrigateMoistureMin: autoConfig.minMoisture,
    autoIrrigateMoistureMax: autoConfig.maxMoisture,
  };
}

function normalizeReminderRecord(record) {
  return {
    id: String(record.id),
    title: String(record.title).trim(),
    dueAt: new Date(record.dueAt).toISOString(),
    done: Boolean(record.done),
  };
}

async function listReminders() {
  if (isDbConnected()) {
    const rows = await Reminder.find().sort({ dueAt: 1 }).lean();
    return rows.map((row) =>
      normalizeReminderRecord({
        id: row._id,
        title: row.title,
        dueAt: row.dueAt,
        done: row.done,
      }),
    );
  }
  return readStore().reminders.map(normalizeReminderRecord);
}

async function createReminderRecord(title, dueAt) {
  if (isDbConnected()) {
    const created = await Reminder.create({ title, dueAt, done: false });
    return normalizeReminderRecord({
      id: created.id,
      title: created.title,
      dueAt: created.dueAt,
      done: created.done,
    });
  }

  const store = readStore();
  const reminder = {
    id: `${Date.now()}`,
    title,
    dueAt: dueAt.toISOString(),
    done: false,
  };
  store.reminders.push(reminder);
  writeStore(store);
  return normalizeReminderRecord(reminder);
}

async function updateReminderRecord(id, done) {
  if (isDbConnected()) {
    const updated = await Reminder.findByIdAndUpdate(id, { done }, { new: true });
    if (!updated) {
      return null;
    }
    return normalizeReminderRecord({
      id: updated.id,
      title: updated.title,
      dueAt: updated.dueAt,
      done: updated.done,
    });
  }

  const store = readStore();
  const reminder = store.reminders.find((item) => item.id === id);
  if (!reminder) {
    return null;
  }
  reminder.done = done;
  writeStore(store);
  return normalizeReminderRecord(reminder);
}

async function deleteReminderRecord(id) {
  if (isDbConnected()) {
    const result = await Reminder.findByIdAndDelete(id);
    return Boolean(result);
  }

  const store = readStore();
  const before = store.reminders.length;
  store.reminders = store.reminders.filter((item) => item.id !== id);
  if (store.reminders.length === before) {
    return false;
  }
  writeStore(store);
  return true;
}

async function generateAiReply(message) {
  return generateGeminiReply(message);
}

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.path} from ${req.ip}`);
  next();
});

app.get("/api/status", (_req, res) => {
  const store = readStore();
  res.json(buildStatusPayload(store));
});

app.post("/api/pump", (req, res) => {
  const raw = (req.body || {}).pumpOn;
  const pumpOn = toPumpBooleanStrict(raw);
  if (pumpOn === undefined) {
    return res.status(400).json({ message: "pumpOn must be true/false or 0/1." });
  }

  const before = readStore();
  let patch = {
    pumpOn,
    pumpAutoTriggered: false,
  };

  if (!pumpOn && wasAutoIrrigationContext(before)) {
    patch.pumpAutoSuppressedUntil = snoozeAutoUntil();
    console.log("[pump] manual OFF — auto-irrigate snoozed for 90 minutes");
  } else if (pumpOn) {
    patch.pumpAutoSuppressedUntil = null;
  } else {
    patch.pumpAutoSuppressedUntil = null;
  }

  const store = patchStoreFields(patch);
  console.log(`[pump] set pumpOn=${pumpOn} (device should read via GET /api/status)`);
  return res.json({
    message: pumpOn
      ? "Pump turned ON."
      : store.pumpAutoSuppressedUntil
        ? "Pump turned OFF. Auto-irrigate paused for 90 minutes."
        : "Pump turned OFF.",
    pumpOn: Boolean(store.pumpOn),
    pumpUpdatedAt: store.pumpUpdatedAt,
    pumpAutoSuppressedUntil: store.pumpAutoSuppressedUntil ?? null,
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

  const normalizedRaw = normalizeSensorRaw(sensorRaw);
  if (normalizedRaw != null) {
    nextSensorRaw = normalizedRaw;
    nextMoisture = moisturePercentFromSensorRaw(nextSensorRaw);
  } else if (coerceSensorRaw(moistureLevel) != null) {
    const ml = coerceSensorRaw(moistureLevel);
    if (ml < 0 || ml > 100) {
      return res.status(400).json({ message: "moistureLevel must be a number between 0 and 100." });
    }
    nextMoisture = ml;
  } else {
    return res.status(400).json({
      message: `Send sensorRaw (0–${ADC_MAX}, ESP32 GPIO34 ADC) or moistureLevel (0–100). Received sensorRaw=${JSON.stringify(sensorRaw)}`,
    });
  }

  const now = new Date().toISOString();
  const current = readStore();
  const auto = resolvePumpFromAuto(current, nextMoisture);

  const store = patchStoreFields({
    moistureLevel: nextMoisture,
    sensorRaw: nextSensorRaw !== null ? nextSensorRaw : undefined,
    lastSensorUpdate: now,
    pumpOn: auto.pumpOn,
    pumpAutoTriggered: auto.autoTriggered,
    pumpAutoSuppressedUntil: isPumpAutoSuppressed(current) ? current.pumpAutoSuppressedUntil : null,
  });

  console.log(
    `[sensor] raw=${nextSensorRaw ?? "—"} moisture=${nextMoisture}% pump=${auto.pumpOn ? "ON" : "OFF"}${auto.suppressed ? " (auto snoozed)" : ""}`,
  );

  if (auto.autoTriggered) {
    console.log(
      `[auto-irrigate] moisture=${nextMoisture}% → pump ${auto.pumpOn ? "ON" : "OFF"} (min=${auto.config.minMoisture}, max=${auto.config.maxMoisture})`,
    );
  }

  return res.json({
    message: "Sensor reading updated.",
    ...buildStatusPayload(store),
  });
});

app.get("/api/health", (_req, res) => {
  const autoConfig = parseAutoIrrigateConfig();
  res.json({
    ok: true,
    storage: isDbConnected() ? "mongodb" : "json",
    aiConfigured: isGeminiConfigured(),
    aiProvider: "gemini",
    aiModel: getGeminiConfig().model,
    openAiConfigured: isGeminiConfigured(),
    autoIrrigateEnabled: autoConfig.enabled,
    autoIrrigateMoistureMin: autoConfig.minMoisture,
    autoIrrigateMoistureMax: autoConfig.maxMoisture,
  });
});

app.get("/api/reminders", async (_req, res) => {
  try {
    const reminders = await listReminders();
    return res.json(reminders);
  } catch (error) {
    console.error("[reminders] list failed:", error.message);
    return res.status(500).json({ message: "Unable to load reminders." });
  }
});

app.post("/api/reminders", async (req, res) => {
  const { title, dueAt } = req.body || {};
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  if (!trimmedTitle || dueAt == null || dueAt === "") {
    return res.status(400).json({ message: "title and dueAt are required." });
  }

  const dueDate = parseDueDate(dueAt);
  if (!dueDate) {
    return res.status(400).json({
      message: "dueAt must be a valid date (ISO string or YYYY-MM-DD HH:mm).",
    });
  }

  try {
    const reminder = await createReminderRecord(trimmedTitle, dueDate);
    return res.status(201).json(reminder);
  } catch (error) {
    console.error("[reminders] create failed:", error.message);
    return res.status(500).json({ message: "Unable to save reminder." });
  }
});

app.patch("/api/reminders/:id", async (req, res) => {
  const { id } = req.params;
  const { done } = req.body || {};
  if (typeof done !== "boolean") {
    return res.status(400).json({ message: "done must be a boolean." });
  }

  try {
    const reminder = await updateReminderRecord(id, done);
    if (!reminder) {
      return res.status(404).json({ message: "Reminder not found." });
    }
    return res.json(reminder);
  } catch (error) {
    console.error("[reminders] update failed:", error.message);
    return res.status(500).json({ message: "Unable to update reminder." });
  }
});

app.delete("/api/reminders/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deleted = await deleteReminderRecord(id);
    if (!deleted) {
      return res.status(404).json({ message: "Reminder not found." });
    }
    return res.status(204).send();
  } catch (error) {
    console.error("[reminders] delete failed:", error.message);
    return res.status(500).json({ message: "Unable to delete reminder." });
  }
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

async function startServer() {
  await connectDb();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Backend server listening on http://0.0.0.0:${PORT} (LAN: use this machine's IP)`);
    console.log(`Reminders storage: ${isDbConnected() ? "MongoDB" : "data/store.json"}`);
    const gemini = getGeminiConfig();
    console.log(
      `Gemini chat: ${gemini.apiKey ? `configured (${gemini.model})` : "not configured — set GEMINI_API_KEY"}`,
    );
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
