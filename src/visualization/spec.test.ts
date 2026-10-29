import { describe, expect, it, vi } from "vitest";
import { emptyResult } from "../model";
import type { CalibrationEstimate } from "../calibration";
import { calibratedCoverage } from "../calibration";
import { createSpec, layoutSignature } from "./spec";
import { wakhanColorNames, type WakhanColors } from "./theme";

type Track = {
  name: string;
  scales?: {
    color: { domain: string[]; range: { expr: string }[] };
  };
  layer?: { data?: { name?: string }; resolve?: unknown }[];
  vconcat?: Track[];
  params?: unknown[];
  encoding?: {
    color: unknown;
    tooltip: { field: string; title: string }[];
  };
};

function tracks(spec: ReturnType<typeof createSpec>): Track[] {
  return (spec as unknown as { vconcat: [unknown, { vconcat: Track[] }] })
    .vconcat[1].vconcat;
}

const estimate: CalibrationEstimate = {
  offset: 2,
  singleCopyDepth: 16,
  pairs: [],
  excludedGenes: [],
  maxResidual: 0,
  maxLeaveStateOutSlopeChange: 0,
};

const colors = Object.fromEntries(
  wakhanColorNames.map((name) => [name, "rgb(12, 34, 56)"]),
) as WakhanColors;

const site = {
  variantId: "site-1",
  svClass: "sBND",
  sourceSvType: "BND",
  chrom: "chr1",
  start: 100,
  chrom1: "chr1",
  start1: 100,
  genotype: "0/1",
  haplotype: "1",
  phaseSet: "100",
  variantReads: 10,
  referenceReads: 20,
  vaf: 0.33,
  haplotypeVaf: "0.5,0",
  orientation: "+",
  detailedType: "loose_end",
};
const link = {
  ...site,
  variantId: "link-1",
  svClass: "DEL",
  sourceSvType: "DEL",
  chrom2: "chr1",
  start2: 200,
  mateId: "",
  orientation: "+-",
};
const coverage = {
  chrom: "chr1",
  start: 0,
  end: 50000,
  originalStart: 0,
  hp1: 18,
  hp2: 34,
  unphased: 0,
};

it("assigns a color to single breakends when sites and links share the scale", () => {
  const result = emptyResult("single-breakends.zip");
  result.svLinks = [link];
  result.svSites = [site];
  const scale = tracks(createSpec(result, colors))[0].scales!.color;

  expect(scale.range[scale.domain.indexOf("sBND")]).toEqual({
    expr: "wakhanColors.textMuted",
  });
});

it("keeps site details and selection behavior when an archive has no SV links", () => {
  const result = emptyResult("sites.zip");
  result.svSites = [site];
  const sitesOnly = tracks(createSpec(result, colors))[0].vconcat![0];

  result.svLinks = [link];
  const withLinks = tracks(createSpec(result, colors))[0].vconcat!.find(
    (track) => track.name === "single-sites",
  )!;

  expect(sitesOnly.encoding).toEqual(withLinks.encoding);
  expect(sitesOnly.encoding!.tooltip.map(({ field }) => field)).toEqual(
    expect.arrayContaining([
      "sourceSvType",
      "haplotype",
      "phaseSet",
      "referenceReads",
      "haplotypeVaf",
    ]),
  );
  expect(sitesOnly.params).toEqual(withLinks.params);
  expect(sitesOnly.params).toContainEqual({
    name: "svSiteSelect",
    select: "point",
    persist: false,
  });
  expect(sitesOnly.encoding!.color).toMatchObject({
    condition: {
      test: { param: { or: ["svSiteSelect", "svRegion"] } },
    },
  });
});

it("shares the CSS palette with generated tracks and the imported SV spec", () => {
  const result = emptyResult("themed.zip");
  result.svLinks = [link];
  result.svSites = [site];
  result.coverage = [coverage];
  result.baf = [
    {
      chrom: "chr1",
      start: 0,
      end: 50000,
      baf: 0.25,
      status: "reported",
      bounds: "coverage bin",
    },
  ];
  result.lohAvailable = true;
  const references = new Set<string>();

  for (const mode of ["phased", "unphased"] as const) {
    result.mode = mode;
    const spec = createSpec(result, colors, estimate);
    expect(
      spec.params?.find((param) => param.name === "wakhanColors"),
    ).toMatchObject({ value: colors, persist: false });
    expect(
      spec.params?.find((param) => param.name === "defaultThemeColors"),
    ).toMatchObject({
      expr: expect.stringContaining("wakhanColors."),
      persist: false,
    });

    for (const match of JSON.stringify(spec).matchAll(
      /wakhanColors\.([a-zA-Z0-9]+)/g,
    )) {
      expect(colors).toHaveProperty(match[1]);
      references.add(match[1]);
    }
  }

  expect(references).toEqual(new Set(wakhanColorNames));
});

describe("calibrated track layout", () => {
  const phased = emptyResult("phased.zip");
  phased.coverage = [coverage];

  it("layers read depth over copy number when a calibration estimate is available", () => {
    expect(
      tracks(createSpec(phased, colors)).map((track) => track.name),
    ).toEqual([
      "cn-HP1",
      "depth-HP1",
      "cn-HP2",
      "depth-HP2",
      "cytobands",
      "genes",
    ]);

    const calibrated = tracks(createSpec(phased, colors, estimate));
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
        haplotype.layer?.some(
          (layer) => layer.data?.name === "calibratedCoverage",
        ),
      ).toBe(true);
    }
  });

  it("keeps the calibrated overlay available in production", () => {
    vi.stubEnv("DEV", false);
    try {
      expect(tracks(createSpec(phased, colors, estimate))[0].name).toBe(
        "copy-number",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rebuilds calibrated axes when switching to a different sample mapping", () => {
    const signature = layoutSignature(phased, estimate);
    expect(layoutSignature(phased)).not.toBe(signature);
    expect(layoutSignature(phased, { ...estimate, offset: 3 })).not.toBe(
      signature,
    );
    expect(
      layoutSignature(phased, { ...estimate, singleCopyDepth: 20 }),
    ).not.toBe(signature);
    expect(layoutSignature(phased, { ...estimate })).toBe(signature);
  });

  it("omits unavailable depth values from the calibrated overlay", () => {
    expect(
      calibratedCoverage(
        [
          { ...coverage, hp2: 3300 },
          {
            ...coverage,
            start: 50000,
            end: 100000,
            originalStart: 50001,
            hp1: NaN,
          },
        ],
        estimate,
      ),
    ).toMatchObject([
      { haplotype: "HP1", rawDepth: 18, adjustedCopyNumber: 1 },
      { haplotype: "HP2", rawDepth: 34, adjustedCopyNumber: 2 },
    ]);
  });
});
