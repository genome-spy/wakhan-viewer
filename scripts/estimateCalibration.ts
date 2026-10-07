import { readFileSync } from "node:fs";
import { extractArchive } from "../src/import/archive.ts";
import { parseMembers } from "../src/import/parse.ts";
import { estimateCalibration } from "../src/calibration.ts";

const archive = process.argv[2];
if (!archive) throw Error("Usage: npm run calibration:estimate -- path/to/Wakhan.zip");
const result = await parseMembers(archive,extractArchive(readFileSync(archive)));
const estimate = estimateCalibration(result);
if (!estimate) throw Error("No rounding-consistent calibration estimate passed the fit checks.");
console.log(JSON.stringify({archive, ...estimate, caveat:"Inferred from rounded gene values; not verified against Wakhan plot parameters"},null,2));
