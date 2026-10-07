import { describe, expect, it } from "vitest";
import { estimateCalibration } from "./calibration";
import { emptyResult } from "./model";

function resultWithDepths(depths = [2, 18, 34]) {
  const result = emptyResult("sample.zip");
  result.segments.subclonal = [{ status: "reported" }];
  result.geneResults = depths.map((depth, state) => ({
    gene: `GENE${state}`,
    chrom: "chr1",
    start: state * 100,
    end: state * 100 + 50,
    stateHp1: state,
    adjustedHp1: depth,
  }));
  return result;
}

describe("inferred depth calibration", () => {
  it("fits distinct gene centers without weighting repeated genes", () => {
    const result = resultWithDepths([2, 18.84, 35.67, 52.51]);
    const estimate = estimateCalibration(result)!;
    expect(estimate.offset).toBeCloseTo(2.001, 3);
    expect(estimate.singleCopyDepth).toBeCloseTo(16.836, 3);
    result.geneResults.push(...Array(30).fill(result.geneResults[1]));
    expect(estimateCalibration(result)).toEqual(estimate);
  });

  it("excludes masked haplotypes without discarding the other haplotype", () => {
    const result = resultWithDepths();
    result.segments.subclonal.push({
      chrom: "chrX", start: 100, end: 200, haplotype: "HP1", status: "masked",
    });
    result.geneResults.push({
      gene: "MASKED", chrom: "chrX", start: 150, end: 175,
      stateHp1: 141, adjustedHp1: 3300, stateHp2: 3, adjustedHp2: 50,
    });
    const estimate = estimateCalibration(result)!;
    expect(estimate.excludedGenes).toEqual(["MASKED"]);
    expect(estimate.pairs.map((pair) => pair.copyNumber)).toEqual([0, 1, 2, 3]);
    expect(estimate.offset).toBe(2);
    expect(estimate.singleCopyDepth).toBe(16);
  });

  it.each([
    { reason: "too few distinct states", depths: [2, 18] },
    { reason: "inconsistent centers", depths: [2, 18, 36] },
    { reason: "negative slope", depths: [34, 18, 2] },
    { reason: "zero slope", depths: [2, 2, 2] },
    { reason: "unstable slope", depths: [2, 2.01, 2.023] },
    { reason: "non-finite centers", depths: [2, Infinity, 34] },
  ])("falls back for $reason", ({ depths }) => {
    expect(estimateCalibration(resultWithDepths(depths))).toBeUndefined();
  });

  it("falls back for unsupported modes or missing tables", () => {
    const unphased = resultWithDepths();
    unphased.mode = "unphased";
    expect(estimateCalibration(unphased)).toBeUndefined();
    const noGenes = resultWithDepths();
    noGenes.geneResults = [];
    expect(estimateCalibration(noGenes)).toBeUndefined();
    const noSubclonal = resultWithDepths();
    noSubclonal.segments.subclonal = [];
    expect(estimateCalibration(noSubclonal)).toBeUndefined();
  });
});
