import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractArchive } from "./archive";
import { parseBaf, parseCoverage, parseMembers, parseSegments } from "./parse";

const header =
  "#chr\tstart\tend\thp1_coverage\thp1_copynumber_state\thp1_confidence\thp2_coverage\thp2_copynumber_state\thp2_confidence\tsvs_breakpoints_ids";
const cn = `${header}\nchr1\t0\t50000\t10\t1\t0.9\t20\t2\t0.8\tsv1\nchr1\t50001\t100000\t3300\t3300\t0\t0\t0\t0\t.\n`;

describe("observed Wakhan table contract", () => {
  it("normalizes adjoining intervals and masks sentinel values without dropping genuine zero", () => {
    const rows = parseSegments(cn, "integer");
    expect(rows[0]).toMatchObject({
      start: 0,
      end: 50000,
      copyNumber: 1,
      status: "reported",
    });
    expect(rows[2]).toMatchObject({
      start: 50000,
      end: 100000,
      copyNumber: null,
      status: "masked",
    });
    expect(rows[3]).toMatchObject({ copyNumber: 0, status: "reported" });
  });

  it("joins BAF by source bin start and retains unknown support on zero", () => {
    const coverage = parseCoverage(
      "chr1\t0\t50000\t10\t20\t0\nchr1\t50001\t100000\t30\t40\t0",
    );
    const baf = parseBaf("chr1,50001,0\nchr1,0,3300", coverage);
    expect(baf[0]).toMatchObject({
      start: 50000,
      end: 100000,
      baf: 0,
      status: "zero; SNP support unknown",
    });
    expect(baf[1]).toMatchObject({
      start: 0,
      end: 50000,
      baf: null,
      status: "unavailable",
    });
  });

  it("extracts a single enclosing folder and rejects duplicate required names", () => {
    const bytes = zipSync({
      "result/integer_profile.bed": strToU8(cn),
      "ignore.html": strToU8("x"),
    });
    expect(extractArchive(bytes)["integer_profile.bed"]).toBe(cn);
    const duplicate = zipSync({
      "a/integer_profile.bed": strToU8(cn),
      "b/integer_profile.bed": strToU8(cn),
    });
    expect(() => extractArchive(duplicate)).toThrow(/Duplicate/);
  });

  it("imports a CN-only ZIP with a declared GRCh38 centromere table", async () => {
    const result = await parseMembers("test.zip", {
      "integer_profile.bed": cn,
      "grch38.cen_coord.curated.bed": "chr1\t120000000\t151000000",
    });
    expect(result.profiles).toEqual(["integer"]);
    expect(result.segments.integer).toHaveLength(4);
    expect(
      result.diagnostics.some((d) => d.message.includes("calibration")),
    ).toBe(true);
  });

  it("recognizes Wakhan's single-track writer schema and clips LOH at masks", async () => {
    const single =
      "#chr\tstart\tend\tcoverage\tcopynumber_state\tconfidence\nchr1\t0\t50000\t35\t2\t0.8\n";
    const result = await parseMembers("single.zip", {
      "integer_profile.bed": single,
      "phase_corrected_coverage.csv": "chr1\t0\t50000\t35",
      "grch38.cen_coord.curated.bed": "chr1\t20000\t30000",
      "sample_loh_segments.csv": "chr1\t10000\t40000",
    });
    expect(result.mode).toBe("unphased");
    expect(result.segments.integer).toHaveLength(1);
    expect(result.coverage[0].total).toBe(35);
    expect(result.loh).toMatchObject([
      { start: 10000, end: 20000 },
      { start: 30000, end: 40000 },
    ]);
  });
});
