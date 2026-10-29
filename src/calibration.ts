import type { CalibratedCoverage, Coverage, WakhanResult } from "./model";

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

/** Approximate mapping from rounded gene centers, not exported plot calibration. */
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
    for (const hp of [1, 2] as const) {
      const haplotype = `HP${hp}`;
      const overlapsMask = masked.some(
        (m) =>
          m.haplotype === haplotype &&
          m.chrom === gene.chrom &&
          m.start < gene.end &&
          gene.start < m.end,
      );
      if (overlapsMask) {
        excludedGenes.add(gene.gene);
        continue;
      }
      const copyNumber = gene[`stateHp${hp}`];
      const adjustedDepth = gene[`adjustedHp${hp}`];
      if (!Number.isFinite(copyNumber) || !Number.isFinite(adjustedDepth))
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
  coverage: Coverage[],
  estimate: CalibrationEstimate,
): CalibratedCoverage[] {
  return coverage.flatMap((row) => {
    if (!("hp1" in row)) return [];

    return ([1, 2] as const).flatMap((hp) => {
      const rawDepth = row[`hp${hp}`];
      if (!Number.isFinite(rawDepth) || rawDepth === 3300) return [];
      return [
        {
          chrom: row.chrom,
          start: row.start,
          end: row.end,
          haplotype: `HP${hp}` as const,
          adjustedCopyNumber:
            (rawDepth - estimate.offset) / estimate.singleCopyDepth,
          rawDepth,
        },
      ];
    });
  });
}
