import { unzipSync, strFromU8 } from "fflate";

const recognized = new Set([
  "integer_profile.bed",
  "subclonal_profile.bed",
  "phase_corrected_coverage.csv",
  "baf.csv",
  "genes_copynumber_states.bed",
  "grch38.cen_coord.curated.bed",
  "severus_somatic.vcf",
  "solutions_ranks.tsv",
  "coverage.csv",
]);

export function extractArchive(bytes: Uint8Array): Record<string, string> {
  if (bytes.length > 250_000_000)
    throw Error("ZIP exceeds the 250 MB import limit.");
  let count = 0;
  let expanded = 0;
  const found = new Set<string>();
  const entries = unzipSync(bytes, {
    filter(info) {
      if (++count > 100) throw Error("ZIP contains more than 100 entries.");
      const basename = info.name.split("/").at(-1) ?? "";
      if (!recognized.has(basename) && !basename.endsWith("_loh_segments.csv"))
        return false;
      if (found.has(basename)) throw Error(`Duplicate ZIP member: ${basename}`);
      if (info.compression !== 0 && info.compression !== 8)
        throw Error(`Unsupported ZIP compression: ${info.name}`);
      if (
        info.originalSize > 100_000_000 ||
        (expanded += info.originalSize) > 150_000_000
      ) {
        throw Error("ZIP expanded data exceeds the 150 MB import limit.");
      }
      found.add(basename);
      return true;
    },
  });
  const result: Record<string, string> = {};
  let actualExpanded = 0;
  for (const [path, value] of Object.entries(entries)) {
    actualExpanded += value.byteLength;
    if (actualExpanded > 150_000_000)
      throw Error("ZIP expanded data exceeds the 150 MB import limit.");
    result[path.split("/").at(-1)!] = strFromU8(value);
  }
  return result;
}
