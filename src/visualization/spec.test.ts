import { describe, expect, it } from "vitest";
import { emptyResult } from "../model";
import type { CalibrationEstimate } from "../dev/calibration";
import { calibratedCoverage } from "../dev/calibration";
import { createSpec } from "./spec";

type Track = {
  name: string;
  layer?: { data?: { name?: string }; resolve?: unknown }[];
  vconcat?: Track[];
};

function tracks(spec: ReturnType<typeof createSpec>): Track[] {
  return (
    spec as unknown as { vconcat: [unknown, { vconcat: Track[] }] }
  ).vconcat[1].vconcat;
}

const estimate: CalibrationEstimate = {
  offset: 2,
  singleCopyDepth: 16,
  pairs: [],
  excludedGenes: [],
  maxResidual: 0,
  maxLeaveStateOutSlopeChange: 0,
};

describe("calibrated track layout", () => {
  const phased = emptyResult("phased.zip");
  phased.coverage = [{ chrom: "chr1", start: 0, end: 50000, hp1: 18, hp2: 34 }];

  it("layers read depth over copy number only when calibration is enabled", () => {
    expect(tracks(createSpec(phased)).map((track) => track.name)).toEqual([
      "cn-HP1",
      "depth-HP1",
      "cn-HP2",
      "depth-HP2",
      "cytobands",
      "genes",
    ]);

    const calibrated = tracks(createSpec(phased, estimate));
    expect(calibrated.map((track) => track.name)).toEqual([
      "copy-number",
      "cytobands",
      "genes",
    ]);
    expect(calibrated[0].vconcat?.map((track) => track.name)).toEqual([
      "cn-HP1",
      "cn-HP2",
    ]);
    for (const haplotype of calibrated[0].vconcat ?? []) {
      expect(
        haplotype.layer?.some((layer) => layer.data?.name === "calibratedCoverage"),
      ).toBe(true);
    }
  });

  it("omits unavailable depth values from the layered preview", () => {
    expect(
      calibratedCoverage(
        [
          { chrom: "chr1", start: 0, end: 50000, hp1: 18, hp2: 3300 },
          { chrom: "chr1", start: 50000, end: 100000, hp1: null, hp2: 34 },
        ],
        estimate,
      ),
    ).toMatchObject([
      { haplotype: "HP1", rawDepth: 18, adjustedCopyNumber: 1 },
      { haplotype: "HP2", rawDepth: 34, adjustedCopyNumber: 2 },
    ]);
  });
});
