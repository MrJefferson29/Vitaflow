export type IrrigationStatus = {
  /** Estimated soil moisture 0–100 (100 = wet). Derived from ESP32 ADC when device sends sensorRaw. */
  moistureLevel: number;
  /** Last ESP32 ADC reading 0–4095 (e.g. GPIO34); higher = drier for typical capacitive probes. */
  sensorRaw: number | null;
  /** Server dry threshold in ADC counts; set ESP_DRY_THRESHOLD_RAW in backend .env to match firmware. */
  dryThresholdRaw: number | null;
  pumpOn: boolean;
  lastSensorUpdate: string;
};

export type Reminder = {
  id: string;
  title: string;
  dueAt: string;
  done: boolean;
};

const API_BASE_URL = "http://10.60.14.100:5000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    let message = "Request failed.";
    try {
      const body = await response.json();
      message = body.message || message;
    } catch {
      // Ignore JSON parse errors and use fallback message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function normalizeStatusPayload(data: IrrigationStatus): IrrigationStatus {
  return {
    ...data,
    pumpOn: Boolean(data.pumpOn),
  };
}

export const api = {
  baseUrl: API_BASE_URL,
  getStatus: async () => {
    const data = await request<IrrigationStatus>("/api/status");
    return normalizeStatusPayload(data);
  },
  setPump: async (pumpOn: boolean) => {
    const data = await request<{ message: string; pumpOn: boolean }>("/api/pump", {
      method: "POST",
      body: JSON.stringify({ pumpOn: Boolean(pumpOn) }),
    });
    return { ...data, pumpOn: Boolean(data.pumpOn) };
  },
  getReminders: () => request<Reminder[]>("/api/reminders"),
  createReminder: (title: string, dueAt: string) =>
    request<Reminder>("/api/reminders", {
      method: "POST",
      body: JSON.stringify({ title, dueAt }),
    }),
  updateReminder: (id: string, done: boolean) =>
    request<Reminder>(`/api/reminders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    }),
  deleteReminder: (id: string) =>
    request<void>(`/api/reminders/${id}`, {
      method: "DELETE",
    }),
  chat: (message: string) =>
    request<{ reply: string }>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};
