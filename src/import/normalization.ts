import { getContigs } from "@genome-spy/core/genome/genomes.js";
import type {
  GenomicInterval,
  LohInterval,
  MaskInterval,
  Profile,
  Segment,
  WakhanResult,
} from "../model";

/**
 * Subclonal sentinel intervals define the displayed mask when available.
 * Mutates only integer zeros with an exact interval/haplotype match; see
 * docs/wakhan-zip-format.md for the observed archive compatibility policy.
 */
export function normalizeMasks(
  segments: Record<Profile, Segment[]>,
  centromeres: MaskInterval[],
): MaskInterval[] {
  const maskedSegments = segments.subclonal.filter(
    (row) => row.status === "masked",
  );
  if (!maskedSegments.length) return centromeres;

  // Compatibility repair for the example archives: some integer zeros match
  // subclonal 3300 intervals exactly. This is observed evidence, not a writer
  // guarantee; src/output/writers.py:merge_haplotype_segments can also emit
  // zeros for missing haplotypes. Mask only an exact interval/haplotype match.
  const maskKeys = new Set(
    maskedSegments.map((r) => `${r.chrom}:${r.start}-${r.end}:${r.haplotype}`),
  );
  for (const row of segments.integer) {
    if (
      row.copyNumber === 0 &&
      maskKeys.has(`${row.chrom}:${row.start}-${row.end}:${row.haplotype}`)
    ) {
      row.copyNumber = null;
      row.medianCoverage = null;
      row.status = "masked";
    }
  }
  const seen = new Set<string>();
  return maskedSegments
    .filter((r) => {
      const key = `${r.chrom}:${r.start}-${r.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ chrom, start, end }) => ({
      chrom,
      start,
      end,
      reason: "Wakhan masked segment (sentinel 3300)",
    }));
}

export function clipLohAtMasks(
  loh: LohInterval[],
  masks: MaskInterval[],
): LohInterval[] {
  if (!loh.length || !masks.length) return loh;

  return loh.flatMap((row) => {
    let fragments = [{ start: row.start, end: row.end }];
    for (const mask of masks) {
      if (mask.chrom !== row.chrom) continue;
      fragments = fragments.flatMap((part) => {
        const a = mask.start,
          b = mask.end;
        if (b <= part.start || a >= part.end) return [part];
        return [
          part.start < a ? { start: part.start, end: a } : null,
          b < part.end ? { start: b, end: part.end } : null,
        ].filter((x): x is { start: number; end: number } => !!x);
      });
    }
    return fragments.map((part) => ({ ...row, ...part }));
  });
}

export function validateResultIntervals(result: WakhanResult): void {
  const lengths = new Map(
    getContigs(result.assembly).map((x) => [x.name, x.size]),
  );
  const checkedTables: [string, GenomicInterval[]][] = [
    ...result.profiles.map((p): [string, GenomicInterval[]] => [
      `${p} segments`,
      result.segments[p],
    ]),
    ["coverage", result.coverage],
    ["baf", result.baf],
    ["masks", result.masks],
    ["loh", result.loh],
  ];
  for (const [tableName, rows] of checkedTables) {
    for (const row of rows) {
      const length = lengths.get(row.chrom);
      if (
        !length ||
        row.start < 0 ||
        row.end > length ||
        row.end <= row.start
      ) {
        throw Error(
          `${tableName}: interval lies outside GRCh38: ${row.chrom}:${row.start}-${row.end}`,
        );
      }
    }
  }
}
