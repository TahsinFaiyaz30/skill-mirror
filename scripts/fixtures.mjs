import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";

const cv = await PDFDocument.create();
const font = await cv.embedFont(StandardFonts.Helvetica);
const page = cv.addPage([612, 792]);
page.drawText("Jamie Morgan\nSoftware engineer\n\nNorthstar Labs - Software Engineer, 2022 to present\nOwned partner API reliability and mentored new engineers.\n\nProjects\nPayments Reliability - Reduced duplicate requests.\n\nSkills\nTypeScript, SQL, system design, backend APIs", { x: 52, y: 727, font, size: 14, lineHeight: 22 });
const bytes = await cv.save();
await mkdir("tests/fixtures", { recursive: true });
await mkdir("supabase/seed", { recursive: true });
await writeFile("tests/fixtures/sample-cv.pdf", bytes);
await writeFile("supabase/seed/sample-cv.pdf", bytes);
