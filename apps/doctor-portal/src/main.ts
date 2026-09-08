import "./style.css";
import { ApiClient, validateApiBase } from "./api";
import {
  agenda,
  clock,
  minute,
  validateAvailability,
  type Appointment,
  type Availability,
  type Doctor,
} from "./models";

const root = document.querySelector<HTMLDivElement>("#app")!;
if (import.meta.env.PROD && (!import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_SHOW_DEVELOPMENT_OTP === 'true')) {
  throw new Error('A production API URL without development OTP is required.');
}
const api = new ApiClient(
  validateApiBase(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1", import.meta.env.PROD),
  () => reset("Your session has ended. Please sign in again."),
);
let doctor: Doctor | undefined;
let appointments: Appointment[] = [];
let current = "Agenda";
let epoch = 0;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
) {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}
function button(text: string, action: () => void, secondary = false) {
  const node = el("button", text, secondary ? "secondary" : "");
  node.type = "button";
  node.onclick = action;
  return node;
}
function field(label: string, value = "", type = "text", multiline = false) {
  const wrap = el("label", label);
  const input = multiline ? el("textarea") : el("input");
  if (input instanceof HTMLInputElement) input.type = type;
  input.value = value;
  wrap.append(input);
  return { wrap, input };
}
function message(parent: HTMLElement, text: string, error = false) {
  const node = el("p", text, error ? "notice error" : "notice");
  node.setAttribute("role", error ? "alert" : "status");
  parent.append(node);
  return node;
}
async function submit(form: HTMLFormElement, action: () => Promise<void>) {
  form.querySelectorAll(".notice").forEach((n) => n.remove());
  const controls = [...form.querySelectorAll<HTMLButtonElement>("button")];
  controls.forEach((b) => (b.disabled = true));
  try {
    await action();
  } catch (e) {
    if (form.isConnected)
      message(form, e instanceof Error ? e.message : "Please try again.", true);
  } finally {
    controls.forEach((b) => (b.disabled = false));
  }
}
function brand() {
  const block = el("div", "", "brand");
  block.append(
    el("strong", "POCKET DOCTOR"),
    el("span", "Your Doctor. In Your Pocket."),
  );
  return block;
}
function reset(note = "") {
  epoch++;
  api.clear();
  doctor = undefined;
  appointments = [];
  login(note);
}
function login(note = "") {
  root.replaceChildren();
  const page = el("main", "", "login");
  const intro = el("section", "", "intro");
  intro.append(
    brand(),
    el("p", "DOCTOR WORKSPACE", "eyebrow"),
    el("h1", "A little more care, one conversation at a time."),
    el(
      "p",
      "A focused space for your appointments, availability and follow-up.",
    ),
  );
  const form = el("form", "", "login-form");
  form.append(
    el("h2", "Welcome back"),
    el(
      "p",
      "Sign in with the mobile number linked to your verified doctor account.",
    ),
  );
  const phone = field("Mobile number", "", "tel");
  phone.input.required = true;
  phone.input.autocomplete = "tel";
  phone.input.placeholder = "+919876543210";
  form.append(phone.wrap);
  const send = button("Send verification code", () => {});
  send.type = "submit";
  form.append(send);
  if (note) message(form, note);
  form.onsubmit = (e) => {
    e.preventDefault();
    void submit(form, async () => {
      const value = phone.input.value.trim();
      if (!/^\+91[6-9]\d{9}$/.test(value))
        throw new Error("Enter a valid Indian mobile number with +91.");
      const result = await api.request<{
        challengeId: string;
        developmentCode?: string;
      }>("/auth/otp/request", "POST", { phone: value });
      otp(result.challengeId, result.developmentCode);
    });
  };
  page.append(intro, form);
  root.append(page);
}
function otp(challengeId: string, developmentCode?: string) {
  const form = root.querySelector("form")!;
  form.replaceChildren(
    el("h2", "Check your phone"),
    el("p", "Enter the six-digit verification code."),
  );
  const code = field("Verification code");
  code.input.required = true;
  code.input.inputMode = "numeric";
  code.input.autocomplete = "one-time-code";
  code.input.maxLength = 6;
  form.append(code.wrap);
  if (
    import.meta.env.DEV &&
    import.meta.env.VITE_SHOW_DEVELOPMENT_OTP === "true" &&
    developmentCode
  )
    message(form, `Local development code: ${developmentCode}`);
  const verify = button("Verify & continue", () => {});
  verify.type = "submit";
  form.append(
    verify,
    button("Use another number", () => login(), true),
  );
  form.onsubmit = (e) => {
    e.preventDefault();
    void submit(form, async () => {
      if (!/^\d{6}$/.test(code.input.value))
        throw new Error("Enter all six digits.");
      const session = await api.request<{ token: string }>(
        "/auth/otp/verify",
        "POST",
        { challengeId, code: code.input.value },
      );
      api.setToken(session.token);
      try {
        doctor = (await api.request<{ doctor: Doctor }>("/doctor/profile"))
          .doctor;
        await show("Agenda");
      } catch (e) {
        try {
          await api.request("/auth/logout", "POST");
        } finally {
          api.clear();
        }
        throw e;
      }
    });
  };
}
async function logout() {
  try {
    await api.request("/auth/logout", "POST");
    reset();
  } catch {
    reset(
      "Signed out on this device. Server sign-out could not be confirmed; the session will expire automatically.",
    );
  }
}
async function show(section: string) {
  if (!doctor) return;
  current = section;
  const ticket = ++epoch;
  root.replaceChildren();
  const shell = el("div", "", "workspace");
  const aside = el("aside");
  aside.append(brand());
  const nav = el("nav");
  nav.setAttribute("aria-label", "Workspace");
  ["Agenda", "Profile", "Availability"].forEach((name) => {
    const b = button(name, () => void show(name), true);
    if (name === current) b.setAttribute("aria-current", "page");
    nav.append(b);
  });
  aside.append(
    nav,
    button("Log out", () => void logout(), true),
  );
  const main = el("main");
  const header = el("header");
  header.append(
    el("p", "YOUR DOCTOR WORKSPACE", "eyebrow"),
    el(
      "h1",
      section === "Agenda"
        ? "A little more care, one conversation at a time."
        : section,
    ),
    el("p", doctor.name),
  );
  main.append(header);
  if (doctor.isDemo)
    message(
      main,
      "DEMO workspace · Sample account and appointments. No real consultation takes place.",
    );
  const content = el("section");
  main.append(content);
  shell.append(aside, main);
  root.append(shell);
  message(content, "Loading your workspace…");
  try {
    if (section === "Agenda") {
      const data = await api.request<{ consultations: Appointment[] }>(
        "/doctor/appointments",
      );
      if (ticket !== epoch) return;
      appointments = data.consultations;
      renderAgenda(content);
    } else if (section === "Profile") {
      const data = await api.request<{ doctor: Doctor }>("/doctor/profile");
      if (ticket !== epoch) return;
      doctor = data.doctor;
      profile(content);
    } else {
      const data = await api.request<Availability>("/doctor/availability");
      if (ticket !== epoch) return;
      availability(content, data);
    }
  } catch (e) {
    if (ticket !== epoch) return;
    content.replaceChildren();
    message(
      content,
      e instanceof Error ? e.message : "Please try again.",
      true,
    );
    content.append(button("Retry", () => void show(section)));
  }
}
function renderAgenda(content: HTMLElement, filter = "Today") {
  content.replaceChildren();
  const tabs = el("nav", "", "tabs");
  tabs.setAttribute("aria-label", "Appointment filter");
  ["Today", "Upcoming", "Completed"].forEach((name) => {
    const b = button(name, () => renderAgenda(content, name), true);
    b.setAttribute("aria-pressed", String(filter === name));
    tabs.append(b);
  });
  content.append(tabs, el("p", `Times shown in ${doctor!.timezone}`, "muted"));
  const list = agenda(appointments, filter, doctor!.timezone);
  if (!list.length) {
    const empty = el("div", "", "empty");
    empty.append(
      el(
        "h2",
        filter === "Today"
          ? "A little breathing room."
          : "No appointments here yet.",
      ),
      el(
        "p",
        filter === "Today"
          ? "Your appointments for today will appear here. You can review your upcoming schedule or update your availability."
          : "Appointments will appear as bookings are confirmed and completed.",
      ),
      button("Refresh agenda", () => void show("Agenda"), true),
    );
    content.append(empty);
    return;
  }
  list.forEach((a) => {
    const row = button("", () => detail(content, a), true);
    row.classList.add("appointment");
    row.append(
      el(
        "time",
        new Intl.DateTimeFormat("en-IN", {
          timeZone: a.timezone,
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(a.startsAt)),
      ),
      el("strong", a.patientName),
      el(
        "span",
        new Intl.DateTimeFormat("en-IN", {
          timeZone: a.timezone,
          day: "numeric",
          month: "short",
        }).format(new Date(a.startsAt)),
      ),
      el("span", a.status.replaceAll("_", " "), "status"),
    );
    content.append(row);
  });
}
function detail(content: HTMLElement, a: Appointment) {
  content.replaceChildren(
    button("← Back to agenda", () => renderAgenda(content), true),
    el("h2", a.patientName),
    el(
      "p",
      `${new Date(a.startsAt).toLocaleString("en-IN", { timeZone: a.timezone })} · ${a.timezone} · ${a.status.replaceAll("_", " ")}`,
    ),
  );
  message(
    content,
    "Consultation connection is not available yet. Video provider integration is pending. This is not an emergency service.",
  );
  if (a.doctor.isDemo) {
    const actions = el("form");
    for (const action of ["start", "complete", "no-show"] as const) {
      if (
        action === "complete"
          ? a.status !== "IN_PROGRESS"
          : a.status !== "CONFIRMED"
      )
        continue;
      actions.append(
        button(
          `DEMO: ${action}`,
          () =>
            void submit(actions, async () => {
              await api.request(
                `/doctor/consultations/${a.id}/action`,
                "POST",
                { action },
              );
              await show("Agenda");
            }),
          true,
        ),
      );
    }
    content.append(actions);
  }
  if (!["IN_PROGRESS", "COMPLETED"].includes(a.status)) {
    message(content, "Notes are available during or after a consultation.");
    return;
  }
  const form = el("form", "", "editor");
  form.append(
    el("h3", "Consultation notes"),
    el(
      "p",
      "Keep private notes separate from the summary shared with the patient after completion.",
    ),
  );
  const privateNote = field(
    "Private doctor note",
    a.note?.privateNote ?? "",
    "text",
    true,
  );
  privateNote.input.maxLength = 10000;
  const summary = field(
    "Patient-visible summary",
    a.note?.summary ?? "",
    "text",
    true,
  );
  summary.input.maxLength = 5000;
  const follow = field("Follow-up required", "", "checkbox");
  (follow.input as HTMLInputElement).checked =
    a.note?.followUpRequired ?? false;
  const date = field(
    "Follow-up date (optional)",
    a.note?.followUpDate ?? "",
    "date",
  );
  const note = field(
    "Patient-visible follow-up note",
    a.note?.followUpNote ?? "",
    "text",
    true,
  );
  note.input.maxLength = 2000;
  const toggle = () => {
    const enabled = (follow.input as HTMLInputElement).checked;
    date.input.disabled = !enabled;
    note.input.disabled = !enabled;
  };
  follow.input.onchange = toggle;
  toggle();
  form.append(
    privateNote.wrap,
    summary.wrap,
    follow.wrap,
    date.wrap,
    note.wrap,
  );
  const save = button("Save notes", () => {});
  save.type = "submit";
  form.append(save);
  form.onsubmit = (e) => {
    e.preventDefault();
    void submit(form, async () => {
      const required = (follow.input as HTMLInputElement).checked;
      await api.request(`/doctor/consultations/${a.id}/notes`, "POST", {
        privateNote: privateNote.input.value,
        summary: summary.input.value,
        followUpRequired: required,
        followUpDate: required ? date.input.value || null : null,
        followUpNote: required ? note.input.value : "",
      });
      a.note = {
        privateNote: privateNote.input.value,
        summary: summary.input.value,
        followUpRequired: required,
        followUpDate: required ? date.input.value || null : null,
        followUpNote: required ? note.input.value : "",
      };
      message(form, "Notes saved.");
    });
  };
  content.append(form);
}
function profile(content: HTMLElement) {
  content.replaceChildren();
  const form = el("form", "", "editor");
  form.append(
    el("h2", doctor!.name),
    el("p", `${doctor!.qualification} · ${doctor!.specialty}`),
    el(
      "p",
      "Credentials and verification are managed by Pocket Doctor. Contact the platform team for corrections.",
    ),
  );
  const bio = field(
    "Professional introduction",
    doctor!.biography,
    "text",
    true,
  );
  bio.input.required = true;
  bio.input.maxLength = 2000;
  const languages = field(
    "Languages (separate with commas)",
    doctor!.languages.join(", "),
  );
  languages.input.required = true;
  form.append(bio.wrap, languages.wrap);
  const save = button("Save profile", () => {});
  save.type = "submit";
  form.append(save);
  form.onsubmit = (e) => {
    e.preventDefault();
    void submit(form, async () => {
      doctor = (
        await api.request<{ doctor: Doctor }>("/doctor/profile", "PATCH", {
          biography: bio.input.value,
          languages: languages.input.value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        })
      ).doctor;
      message(form, "Profile saved.");
    });
  };
  content.append(form);
}
function availability(content: HTMLElement, data: Availability) {
  content.replaceChildren();
  const form = el("form", "", "editor");
  form.append(
    el("h2", "Make room for care"),
    el(
      "p",
      "Set recurring working windows in your timezone. Add separate windows on the same day to leave a break. Existing appointments retain their booked time.",
    ),
  );
  const zone = field("Timezone", data.timezone);
  zone.input.required = true;
  const duration = field(
    "Consultation length (minutes)",
    String(data.consultationMinutes),
    "number",
  );
  const buffer = field(
    "Buffer between appointments (minutes)",
    String(data.bufferMinutes),
    "number",
  );
  (duration.input as HTMLInputElement).min = "10";
  (duration.input as HTMLInputElement).max = "120";
  (buffer.input as HTMLInputElement).min = "0";
  (buffer.input as HTMLInputElement).max = "60";
  const accepting = field("Accepting appointments", "", "checkbox");
  (accepting.input as HTMLInputElement).checked = data.acceptingAppointments;
  form.append(
    zone.wrap,
    duration.wrap,
    buffer.wrap,
    accepting.wrap,
    el("h3", "Weekly windows"),
  );
  const rows = el("div");
  const controls: {
    row: HTMLElement;
    day: HTMLSelectElement;
    start: HTMLInputElement;
    end: HTMLInputElement;
  }[] = [];
  function add(weekday = 1, startMinute = 540, endMinute = 1020) {
    const row = el("div", "", "window");
    const day = el("select");
    day.setAttribute("aria-label", "Working day");
    [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ].forEach((name, i) => {
      const o = el("option", name);
      o.value = String(i + 1);
      day.append(o);
    });
    day.value = String(weekday);
    const start = field("From", clock(startMinute), "time");
    const end = field("Until", clock(endMinute), "text");
    start.input.required = true;
    end.input.required = true;
    row.append(
      day,
      start.wrap,
      end.wrap,
      button(
        "Remove",
        () => {
          row.remove();
          controls.splice(
            controls.findIndex((c) => c.row === row),
            1,
          );
        },
        true,
      ),
    );
    controls.push({
      row,
      day,
      start: start.input as HTMLInputElement,
      end: end.input as HTMLInputElement,
    });
    rows.append(row);
  }
  data.windows.forEach((w) => add(w.weekday, w.startMinute, w.endMinute));
  form.append(
    rows,
    button("Add working window", () => add(), true),
  );
  const dates = field(
    "Unavailable dates (YYYY-MM-DD, separate with commas)",
    data.excludedDates.join(", "),
    "text",
    true,
  );
  form.append(dates.wrap);
  const save = button("Save availability", () => {});
  save.type = "submit";
  form.append(save);
  form.onsubmit = (e) => {
    e.preventDefault();
    void submit(form, async () => {
      const updated = await api.request<Availability>(
        "/doctor/availability",
        "POST",
        validateAvailability({
          timezone: zone.input.value.trim(),
          consultationMinutes: Number(duration.input.value),
          bufferMinutes: Number(buffer.input.value),
          acceptingAppointments: (accepting.input as HTMLInputElement).checked,
          windows: controls.map((c) => ({
            weekday: Number(c.day.value),
            startMinute: minute(c.start.value),
            endMinute: minute(c.end.value),
          })),
          excludedDates: dates.input.value
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      );
      data = updated;
      message(form, "Availability saved.");
    });
  };
  content.append(form);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && doctor)
    void api.request("/auth/session").catch(() => {});
});
login();
