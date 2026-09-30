import type { Row, WakhanResult } from "../model";

export interface CalibrationEstimate {
  offset: number;
  singleCopyDepth: number;
  pairs: { copyNumber: number; adjustedDepth: number }[];
  excludedGenes: string[];
  maxResidual: number;
  maxLeaveStateOutSlopeChange: number;
}

function fit(pairs: { copyNumber: number; adjustedDepth: number }[]) {
  const n = pairs.length;
  const sumX = pairs.reduce((a, p) => a + p.copyNumber, 0);
  const sumY = pairs.reduce((a, p) => a + p.adjustedDepth, 0);
  const sumXX = pairs.reduce((a, p) => a + p.copyNumber * p.copyNumber, 0);
  const sumXY = pairs.reduce((a, p) => a + p.copyNumber * p.adjustedDepth, 0);
  const divisor = n * sumXX - sumX * sumX;
  if (!divisor) return undefined;
  const singleCopyDepth = (n * sumXY - sumX * sumY) / divisor;
  const offset = (sumY - singleCopyDepth * sumX) / n;
  return { singleCopyDepth, offset };
}

/** Development-only estimate from Wakhan's rounded adjusted gene centers. */
export function estimateCalibration(
  result: WakhanResult,
): CalibrationEstimate | undefined {
  if (
    result.mode !== "phased" ||
    !result.geneResults.length ||
    !result.segments.subclonal.length
  )
    return;
  const masked = result.segments.subclonal.filter((r) => r.status === "masked");
  const excludedGenes = new Set<string>();
  const unique = new Map<
    string,
    { copyNumber: number; adjustedDepth: number }
  >();
  for (const gene of result.geneResults) {
    for (const hp of [1, 2]) {
      const haplotype = `HP${hp}`;
      const overlapsMask = masked.some(
        (m) =>
          m.haplotype === haplotype &&
          m.chrom === gene.chrom &&
          (m.start as number) < (gene.end as number) &&
          (gene.start as number) < (m.end as number),
      );
      if (overlapsMask) {
        excludedGenes.add(String(gene.gene));
        continue;
      }
      const copyNumber = gene[`stateHp${hp}`];
      const adjustedDepth = gene[`adjustedHp${hp}`];
      if (
        typeof copyNumber !== "number" ||
        typeof adjustedDepth !== "number" ||
        !Number.isFinite(copyNumber) ||
        !Number.isFinite(adjustedDepth)
      )
        continue;
      unique.set(`${copyNumber}:${adjustedDepth}`, {
        copyNumber,
        adjustedDepth,
      });
    }
  }
  const pairs = [...unique.values()].sort(
    (a, b) => a.copyNumber - b.copyNumber || a.adjustedDepth - b.adjustedDepth,
  );
  const states = new Set(pairs.map((p) => p.copyNumber));
  if (states.size < 3) return;
  const coefficients = fit(pairs);
  if (
    !coefficients ||
    !Number.isFinite(coefficients.singleCopyDepth) ||
    coefficients.singleCopyDepth <= 0 ||
    !Number.isFinite(coefficients.offset)
  )
    return;
  const maxResidual = Math.max(
    ...pairs.map((p) =>
      Math.abs(
        p.adjustedDepth -
          (coefficients.offset + coefficients.singleCopyDepth * p.copyNumber),
      ),
    ),
  );
  const maxLeaveStateOutSlopeChange = Math.max(
    ...[...states].map((state) => {
      const leaveOut = fit(pairs.filter((p) => p.copyNumber !== state));
      return leaveOut
        ? Math.abs(leaveOut.singleCopyDepth / coefficients.singleCopyDepth - 1)
        : Infinity;
    }),
  );
  if (maxResidual > 0.0051 || maxLeaveStateOutSlopeChange > 0.02) return;
  return {
    ...coefficients,
    pairs,
    excludedGenes: [...excludedGenes].sort(),
    maxResidual,
    maxLeaveStateOutSlopeChange,
  };
}

export function calibratedCoverage(
  coverage: Row[],
  estimate: CalibrationEstimate,
): Row[] {
  return coverage.flatMap((row) =>
    [1, 2].flatMap((hp) => {
      const rawDepth = row[`hp${hp}`];
      if (
        typeof rawDepth !== "number" ||
        !Number.isFinite(rawDepth) ||
        rawDepth === 3300
      )
        return [];
      return [
        {
          chrom: row.chrom,
          start: row.start,
          end: row.end,
          haplotype: `HP${hp}`,
          adjustedCopyNumber:
            (rawDepth - estimate.offset) / estimate.singleCopyDepth,
          rawDepth,
        },
      ];
    }),
  );
}
