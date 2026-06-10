/** Single source of truth for the deployed backend (Render). */
export const DEFAULT_API_BASE_URL = "https://irrigation-pzz4.onrender.com";

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL
).replace(/\/$/, "");
