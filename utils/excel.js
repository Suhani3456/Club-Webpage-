// utils/excel.js — the workbook in data/club.xlsx is the content source.
// Read on request, cached by file mtime, resilient to half-saved/locked files.
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const DATA_DIR = path.join(__dirname, "..", "data");
const CLUB_FILE = path.join(DATA_DIR, "club.xlsx");
const SIGNUPS_FILE = path.join(DATA_DIR, "signups.xlsx");

// The club sits in Bengaluru: India has no DST, so IST is always UTC+5:30.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

let cache = { mtimeMs: -1, data: null };

function ymd(d) {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Used for new signups.xlsx when the file does not exist yet.
const SIGNUPS_HEADER = ["Name", "Email", "Year", "Message", "Joined on"];

// ---------- reading ----------

function cellText(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return ymd(v);
  if (v instanceof Object && "text" in v) return String(v.text).trim(); // rich text / hyperlinks
  if (v instanceof Object && "result" in v) return String(v.result).trim(); // formula
  if (v instanceof Object && "richText" in v) {
    return v.richText.map((t) => t.text).join("").trim();
  }
  return String(v).trim();
}

// Excel date cells come out as Date objects (or DD/MM/YYYY-style text).
// Normalise everything to YYYY-MM-DD without shifting through a timezone.
function cellDate(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return ymd(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const a = m[1].padStart(2, "0");
    const b = m[2].padStart(2, "0");
    const c = m[3].length === 2 ? "20" + m[3] : m[3];
    // Day-first is how the club would type it: 06/11/2026 = 6 Nov 2026.
    if (+m[1] > 12 || +m[2] <= 12) return `${c}-${b}-${a}`;
    return `${c}-${a}-${b}`;
  }
  return null;
}

function yesNo(v) {
  return String(v == null ? "yes" : v).trim().toLowerCase() === "yes";
}

async function readWorkbook() {
  try {
    const stat = fs.statSync(CLUB_FILE);
    if (cache.mtimeMs === stat.mtimeMs) return cache.data; // unchanged

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(CLUB_FILE);

    const data = { events: [], projects: [], stats: [], version: String(stat.mtimeMs) };

    // --- Events: title | date | time | venue | bring | description | published ---
    const events = wb.getWorksheet("Events");
    if (events) {
      events.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // header
        const title = cellText(row.getCell(1).value);
        if (!title) return; // skip empty rows
        if (!yesNo(row.getCell(7).value)) return; // published=no or blank => skip
        const date = cellDate(row.getCell(2).value);
        if (!date) return; // no parseable date => skip
        const seatsRaw = row.getCell(8).value; // 8th column: seats limit (blank = unlimited)
        const seatsNum = Number(seatsRaw instanceof Object ? (seatsRaw.result ?? NaN) : seatsRaw);
        data.events.push({
          title,
          date,
          time: cellText(row.getCell(3).value),
          venue: cellText(row.getCell(4).value),
          bring: cellText(row.getCell(5).value),
          description: cellText(row.getCell(6).value),
          seats: Number.isFinite(seatsNum) && seatsNum > 0 ? Math.floor(seatsNum) : null,
        });
      });
    }

    // --- Projects: name | description | categories | stack | link | featured ---
    const projects = wb.getWorksheet("Projects");
    if (projects) {
      projects.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const name = cellText(row.getCell(1).value);
        if (!name) return;
        const rawLink = cellText(row.getCell(5).value);
        // Only http(s) links are ever shown — everything else is dropped.
        let link = "";
        if (/^https?:\/\/\S+$/i.test(rawLink)) link = rawLink;
        const categories = String(cellText(row.getCell(3).value) || "")
          .split(/[,\s]+/).filter(Boolean);
        data.projects.push({
          name,
          description: cellText(row.getCell(2).value),
          categories,
          stack: String(cellText(row.getCell(4).value) || "")
            .split(",").map((s) => s.trim()).filter(Boolean),
          link,
          featured: yesNo(row.getCell(6).value),
        });
      });
    }

    // --- Stats: label | value ---
    const stats = wb.getWorksheet("Stats");
    if (stats) {
      stats.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const label = cellText(row.getCell(1).value);
        if (!label) return;
        const value = row.getCell(2).value;
        const num = Number(value instanceof Object ? (value.result ?? 0) : value);
        if (!Number.isFinite(num)) return;
        data.stats.push({ label, value: num });
      });
    }

    cache = { mtimeMs: stat.mtimeMs, data };
    console.log("Loaded club.xlsx at " + new Date(stat.mtimeMs).toLocaleTimeString());
    return data;
  } catch (err) {
    // File locked or half-saved while Freebuff edits it: keep serving the last good data.
    if (cache.data) {
      console.warn("Could not re-read club.xlsx (" + err.message + ") — serving last good data.");
      return cache.data;
    }
    throw err; // nothing read yet; the route answers 500 and the site falls back
  }
}

function todayIst() {
  return ymd(new Date(Date.now() + IST_OFFSET_MS));
}

// Stable identity for an Excel event row, shared by the seat-counting
// endpoints (GET /api/events and POST /api/event-register must agree).
function eventKeyOf(event) {
  return (event.date || "") + "|" + String(event.title || "").trim().toLowerCase();
}

// ---------- public API ----------

async function getEvents() {
  const data = await readWorkbook();
  const today = todayIst();

  // Past vs upcoming is decided here on the server, not in the browser.
  const all = data.events.map((e) => ({ ...e, status: e.date < today ? "past" : "upcoming" }));

  // Next-up events first (ascending), past events last (most recent first) —
  // the same order the page used to show when everything was hard-coded.
  const upcoming = all
    .filter((e) => e.status !== "past")
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = all
    .filter((e) => e.status === "past")
    .sort((a, b) => b.date.localeCompare(a.date));

  const next = upcoming[0];
  if (next) next.status = "next";

  return { events: upcoming.concat(past), today };
}

async function getProjects() {
  const data = await readWorkbook();
  // Featured first, then alphabetical.
  const projects = [...data.projects].sort((a, b) =>
    a.featured === b.featured ? a.name.localeCompare(b.name) : a.featured ? -1 : 1
  );
  return { projects };
}

async function getStats() {
  const data = await readWorkbook();
  return { stats: data.stats };
}

function getVersion() {
  try {
    return String(fs.statSync(CLUB_FILE).mtimeMs);
  } catch {
    return cache.version || "0";
  }
}

// ---------- signups.xlsx mirror (never fails the real signup) ----------

async function appendSignup(row) {
  const wb = new ExcelJS.Workbook();
  let ws;
  try {
    if (fs.existsSync(SIGNUPS_FILE)) {
      await wb.xlsx.readFile(SIGNUPS_FILE);
      ws = wb.getWorksheet("Signups");
    }
  } catch {
    // One short retry (Excel may still hold a write lock), then give up.
    let wb2 = null;
    await new Promise((r) => setTimeout(r, 250));
    try {
      wb2 = new ExcelJS.Workbook();
      await wb2.xlsx.readFile(SIGNUPS_FILE);
    } catch {
      throw new Error("signups.xlsx is locked — skipping mirror (MongoDB has the row)");
    }
    wb = wb2;
    ws = wb.getWorksheet("Signups");
  }

  if (!ws) {
    const sheet = wb.addWorksheet("Signups");
    sheet.addRow(SIGNUPS_HEADER);
    ws = sheet;
  }

  ws.addRow([row.name, row.email, row.year, row.msg, row.joinedOn]);
  await wb.xlsx.writeFile(SIGNUPS_FILE); // throws if the file is still locked; join handles it
}

module.exports = { getEvents, getProjects, getStats, appendSignup, getVersion, eventKeyOf, SIGNUPS_FILE, CLUB_FILE };
