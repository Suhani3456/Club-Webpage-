// scripts/seed-excel.js — create data/club.xlsx pre-filled with the exact
// events, projects and stats that used to be hard-coded in index.html,
// so nothing is lost when the site switches to the Excel source.
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "club.xlsx");

const EVENTS = [
  {
    title: "Git without fear",
    date: "2026-11-06",
    seats: 40,
    time: "6:00 PM",
    venue: "Lab 204, CS Block",
    bring: "A laptop with Git installed",
    description: "Branches, merges and fixing a broken history. Bring a laptop with Git installed. Lab 204, 6:00 PM. Open to all years.",
    published: "yes",
  },
  {
    title: "Capture-the-flag night",
    date: "2026-11-20",
    time: "",
    venue: "",
    bring: "",
    description: "Four hours of beginner-friendly puzzles on the FlagForge platform. Teams of up to three. Pizza included.",
    published: "yes",
  },
  {
    title: "Club Jam, 24-hour hackathon",
    date: "2026-12-05",
    time: "",
    venue: "",
    bring: "",
    description: "Build anything that helps campus life. Mentors from the final-year team will be on hand. Demos at noon on Dec 06.",
    published: "yes",
  },
  {
    title: "Orientation build night",
    date: "2026-09-14",
    time: "",
    venue: "",
    bring: "",
    description: "New members built a personal landing page in two hours. Several of those pages are now on our members wall.",
    published: "yes",
  },
];

const PROJECTS = [
  {
    name: "CampusConnect",
    description: "A timetable and notice-board app that pulls department announcements into one searchable feed.",
    categories: "web",
    stack: "HTML,JavaScript,Node.js",
    link: "https://github.com",
    featured: "yes",
  },
  {
    name: "NotesNet",
    description: "Summarises lecture slides into revision cards using a small language model.",
    categories: "ai",
    stack: "Python,ML",
    link: "https://github.com",
    featured: "no",
  },
  {
    name: "FlagForge",
    description: "Our own beginner CTF platform with challenges written by members.",
    categories: "security",
    stack: "Security,Docker",
    link: "https://github.com",
    featured: "no",
  },
  {
    name: "LabWatch",
    description: "Low-cost sensors that report lab temperature and occupancy to a live dashboard.",
    categories: "hardware",
    stack: "Arduino,IoT",
    link: "https://github.com",
    featured: "no",
  },
  {
    name: "Seat Finder",
    description: "Shows which library floors have free desks, estimated from Wi-Fi activity.",
    categories: "web ai",
    stack: "React-free,Python,Web",
    link: "https://github.com",
    featured: "no",
  },
];

const STATS = [
  { label: "active members", value: 42 },
  { label: "projects shipped", value: 9 },
  { label: "workshops held", value: 14 },
  { label: "hackathons run", value: 3 },
];

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const wb = new ExcelJS.Workbook();

  const events = wb.addWorksheet("Events");
  events.columns = [
    { header: "title", width: 28 },
    { header: "date", width: 12 },
    { header: "time", width: 12 },
    { header: "venue", width: 22 },
    { header: "bring", width: 26 },
    { header: "description", width: 50 },
    { header: "published", width: 11 },
    { header: "seats", width: 8 },
  ];
  EVENTS.forEach((e) => events.addRow([e.title, e.date, e.time, e.venue, e.bring, e.description, e.published, e.seats || ""]));

  const projects = wb.addWorksheet("Projects");
  projects.columns = [
    { header: "name", width: 20 },
    { header: "description", width: 60 },
    { header: "categories", width: 20 },
    { header: "stack", width: 30 },
    { header: "link", width: 24 },
    { header: "featured", width: 10 },
  ];
  PROJECTS.forEach((p) => projects.addRow([p.name, p.description, p.categories, p.stack, p.link, p.featured]));

  const stats = wb.addWorksheet("Stats");
  stats.columns = [
    { header: "label", width: 22 },
    { header: "value", width: 10 },
  ];
  STATS.forEach((s) => stats.addRow([s.label, s.value]));

  await wb.xlsx.writeFile(FILE);
  console.log("Wrote " + FILE);
  console.log("  Events: " + EVENTS.length + " rows, Projects: " + PROJECTS.length + " rows, Stats: " + STATS.length + " rows");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
