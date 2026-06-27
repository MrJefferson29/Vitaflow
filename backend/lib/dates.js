function parseDueDate(raw) {
  if (raw == null || raw === "") {
    return null;
  }

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }

  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  const iso = new Date(trimmed);
  if (!Number.isNaN(iso.getTime()) && trimmed.includes("T")) {
    return iso;
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (match) {
    const [, y, mo, d, h, mi] = match;
    const local = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0, 0);
    return Number.isNaN(local.getTime()) ? null : local;
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

module.exports = { parseDueDate };
