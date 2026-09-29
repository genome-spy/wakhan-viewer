import { readFileSync } from "node:fs";
import { extractArchive } from "../src/import/archive.ts";
import { parseMembers } from "../src/import/parse.ts";
import { estimateCalibration } from "../src/dev/calibration.ts";

const archive = process.argv[2];
if (!archive) throw Error("Usage: npm run calibration:estimate -- path/to/Wakhan.zip");
const result = await parseMembers(archive,extractArchive(readFileSync(archive)));
const estimate = estimateCalibration(result);
if (!estimate) throw Error("No rounding-consistent calibration estimate passed the development checks.");
console.log(JSON.stringify({archive, ...estimate, caveat:"Estimated calibration — development; not verified against Wakhan plot parameters"},null,2));
