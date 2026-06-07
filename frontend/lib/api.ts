export type IrrigationStatus = {
  moistureLevel: number;
  sensorRaw: number | null;
  dryThresholdRaw: number | null;
  pumpOn: boolean;
  pumpAutoTriggered?: boolean;
  pumpAutoSuppressedUntil?: string | null;
  pumpAutoSnoozed?: boolean;
  pumpUpdatedAt?: string;
  lastSensorUpdate: string | null;
  sensorAgeSeconds?: number | null;
  autoIrrigateEnabled?: boolean;
  autoIrrigateMoistureMin?: number;
  autoIrrigateMoistureMax?: number;
};

export type Reminder = {
  id: string;
  title: string;
  dueAt: string;
  done: boolean;
};

export type HealthStatus = {
  ok: boolean;
  storage: "mongodb" | "json";
  aiConfigured: boolean;
  aiProvider?: string;
  aiModel?: string;
  /** @deprecated use aiConfigured */
  openAiConfigured?: boolean;
  autoIrrigateEnabled?: boolean;
  autoIrrigateMoistureMin?: number;
  autoIrrigateMoistureMax?: number;
};

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://irrigation-pzz4.onrender.com").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
      },
      ...init,
    });
  } catch {
    throw new Error(
      `Cannot reach the server at ${API_BASE_URL}. Start the backend and set EXPO_PUBLIC_API_URL in frontend/.env to your PC's LAN IP.`,
    );
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
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
  getHealth: () => request<HealthStatus>("/api/health"),
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
