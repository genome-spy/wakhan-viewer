import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractArchive } from "./archive";
import { parseMembers } from "./parse";
import { estimateCalibration } from "../calibration";

const cases = [
  {
    name: "HCC1937",
    path: "public/examples/HCC1937_plots_data.zip",
    cn: 461,
    baf: 60630,
  },
  {
    name: "HCC1954",
    path: "tmp/HCC1954_plots_data.zip",
    cn: 1271,
    baf: 60630,
    optional: true,
  },
];

describe("Wakhan archives", () => {
  it("retains the demo's PASS single breakend at chr4:54,596,602", async () => {
    const name = "HCC1937_plots_data.zip";
    const members = extractArchive(readFileSync(`public/examples/${name}`));
    const result = await parseMembers(name, members);

    expect(
      result.svSites.find((site) => site.variantId === "severus_BND20728"),
    ).toMatchObject({
      svClass: "sBND",
      chrom: "chr4",
      start: 54596601,
      genotype: "0/1",
      variantReads: 196,
      referenceReads: 174,
      vaf: 0.53,
      detailedType: "loose_end",
    });
  });

  for (const sample of cases) {
    it.skipIf(sample.optional && !existsSync(sample.path))(
      `imports ${sample.name} with all expected tracks`,
      async () => {
        const name = `${sample.name}_plots_data.zip`;
        const members = extractArchive(readFileSync(sample.path));
        const result = await parseMembers(name, members);
        expect(result.segments.integer).toHaveLength(sample.cn * 2);
        expect(result.segments.subclonal).toHaveLength(sample.cn * 2);
        expect(result.coverage).toHaveLength(sample.baf);
        expect(result.baf).toHaveLength(sample.baf);
        expect(result.svLinks.length + result.svSites.length).toBeGreaterThan(
          0,
        );
        expect(result.vcfSample).toBe("wakhan_haplotagged");
        expect(result.diagnostics.filter((d) => d.level === "warning")).toEqual(
          [],
        );
        expect(
          result.segments.integer.filter((r) => r.status === "masked"),
        ).toHaveLength(46);
        const estimate = estimateCalibration(result);
        expect(estimate?.pairs.length).toBeGreaterThanOrEqual(6);
        expect(estimate?.maxResidual).toBeLessThan(0.0051);
        expect(estimate?.excludedGenes).toContain("SPIN4");
      },
    );
  }
});
