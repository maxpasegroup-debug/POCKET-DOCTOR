export interface Doctor {
  id: string;
  name: string;
  qualification: string;
  specialty: string;
  biography: string;
  languages: string[];
  timezone: string;
  isDemo: boolean;
  consultationMinutes: number;
}
export interface Note {
  privateNote: string;
  summary: string;
  followUpRequired: boolean;
  followUpDate: string | null;
  followUpNote: string;
}
export interface Appointment {
  id: string;
  patientName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: string;
  doctor: Doctor;
  note: Note | null;
}
export interface Availability {
  timezone: string;
  consultationMinutes: number;
  bufferMinutes: number;
  acceptingAppointments: boolean;
  windows: { weekday: number; startMinute: number; endMinute: number }[];
  excludedDates: string[];
}
export function localDay(date: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
export function agenda(
  items: Appointment[],
  filter: string,
  timezone: string,
  now = new Date(),
) {
  return items
    .filter((a) =>
      filter === "Completed"
        ? a.status === "COMPLETED"
        : filter === "Today"
          ? localDay(a.startsAt, timezone) ===
            localDay(now.toISOString(), timezone)
          : ["CONFIRMED", "IN_PROGRESS", "PENDING_PAYMENT"].includes(
              a.status,
            ) && new Date(a.endsAt) > now,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
export function minute(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) && value !== "24:00")
    throw new Error(
      "Enter working times as HH:MM, for example 09:00 or 24:00.",
    );
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
export function validateAvailability(value: Availability): Availability {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.timezone });
  } catch {
    throw new Error("Enter a valid timezone, for example Asia/Kolkata.");
  }
  if (
    !Number.isInteger(value.consultationMinutes) ||
    value.consultationMinutes < 10 ||
    value.consultationMinutes > 120 ||
    !Number.isInteger(value.bufferMinutes) ||
    value.bufferMinutes < 0 ||
    value.bufferMinutes > 60
  )
    throw new Error(
      "Use a consultation length of 10–120 minutes and a buffer of 0–60 minutes.",
    );
  for (const [index, window] of value.windows.entries()) {
    if (
      window.startMinute >= 1440 ||
      window.endMinute - window.startMinute < value.consultationMinutes ||
      value.windows.some(
        (other, i) =>
          i < index &&
          other.weekday === window.weekday &&
          other.startMinute < window.endMinute &&
          other.endMinute > window.startMinute,
      )
    )
      throw new Error(
        "Working windows must fit a consultation and must not overlap.",
      );
  }
  for (const date of value.excludedDates) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      throw new Error(
        "Enter valid unavailable dates as YYYY-MM-DD, separated by commas.",
      );
  }
  return { ...value, excludedDates: [...new Set(value.excludedDates)] };
}
export function clock(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
