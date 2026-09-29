import type { Row, WakhanResult, Profile } from "../model";
import { emptyResult } from "../model";
import parseVcf from "@genome-spy/core/data/formats/vcf.js";
import { getContigs } from "@genome-spy/core/genome/genomes.js";

const number = (s: string, member: string, line: number): number => {
  const n = Number(s);
  if (!s || !Number.isFinite(n))
    throw Error(`${member}:${line}: invalid number ${JSON.stringify(s)}`);
  return n;
};
const chrom = (s: string): string =>
  /^chr(?:[1-9]|1\d|2[0-2]|X|Y)$/.test(s)
    ? s
    : /^([1-9]|1\d|2[0-2]|X|Y)$/.test(s)
      ? `chr${s}`
      : "";
const interval = (fields: string[], member: string, line: number) => {
  const c = chrom(fields[0]);
  const start = Math.max(0, number(fields[1], member, line) - 1);
  const end = number(fields[2], member, line);
  if (!c || end <= start)
    throw Error(`${member}:${line}: invalid chromosome or interval`);
  return { chrom: c, start, end };
};

function lines(text: string): { value: string; line: number }[] {
  return text
    .split(/\r?\n/)
    .map((value, i) => ({ value, line: i + 1 }))
    .filter((row) => !!row.value);
}

function table(
  text: string,
  member: string,
  columns: string[],
  delimiter = "\t",
  commentHeader = false,
): string[][] {
  const ls = lines(text);
  const headerLine = commentHeader
    ? [...ls].reverse().find((x) => x.value.startsWith("#chr\t"))
    : ls[0];
  if (commentHeader) {
    if (
      !headerLine ||
      headerLine.value.slice(1).split(delimiter).join("\t") !==
        columns.join("\t")
    )
      throw Error(`${member}: unexpected header`);
  } else if (columns.length && headerLine?.value !== columns.join(delimiter))
    throw Error(`${member}: unexpected header`);
  return ls
    .filter((x) =>
      commentHeader ? !x.value.startsWith("#") : x !== headerLine,
    )
    .map((x) => {
      const cells = x.value.split(delimiter);
      if (cells.length !== (columns.length || cells.length))
        throw Error(
          `${member}:${x.line}: expected ${columns.length} columns, found ${cells.length}`,
        );
      return cells;
    });
}

const integerColumns = [
  "chr",
  "start",
  "end",
  "hp1_coverage",
  "hp1_copynumber_state",
  "hp1_confidence",
  "hp2_coverage",
  "hp2_copynumber_state",
  "hp2_confidence",
  "svs_breakpoints_ids",
];
const subclonalColumns = [
  ...integerColumns.slice(0, 9),
  "hp1_is_subclonal",
  "hp2_is_subclonal",
  "svs_breakpoints_ids",
];
const geneColumns = [
  "chr",
  "start",
  "end",
  "gene",
  "actual_coverage_hp1",
  "actual_coverage_hp2",
  "adjusted_coverage_hp1",
  "adjusted_coverage_hp2",
  "hp1_state",
  "hp2_state",
];
const unphasedColumns = [
  "chr",
  "start",
  "end",
  "coverage",
  "copynumber_state",
  "confidence",
];

export function parseSegments(text: string, profile: Profile): Row[] {
  const member = `${profile}_profile.bed`;
  const header =
    lines(text)
      .find((x) => x.value.startsWith("#chr\t"))
      ?.value.slice(1)
      .split("\t") ?? [];
  if (header.slice(0, 6).join("\t") === unphasedColumns.join("\t")) {
    const expected = [
      ...unphasedColumns,
      ...(profile === "subclonal" ? ["is_subclonal"] : []),
      ...(header.includes("svs_breakpoints_ids")
        ? ["svs_breakpoints_ids"]
        : []),
    ];
    const rows = table(text, member, expected, "\t", true);
    return rows.map((f, i) => {
      const coverage = number(f[3], member, i + 1);
      const copyNumber = number(f[4], member, i + 1);
      const masked = coverage === 3300 || copyNumber === 3300;
      return {
        ...interval(f, member, i + 1),
        haplotype: "Total",
        copyNumber: masked ? null : copyNumber,
        medianCoverage: masked ? null : coverage,
        sourceCopyNumber: copyNumber,
        sourceMedianCoverage: coverage,
        confidence: number(f[5], member, i + 1),
        status: masked ? "masked" : "reported",
        subclonal: profile === "subclonal" && f[6] === "Y",
        breakpointIds: header.includes("svs_breakpoints_ids") ? f.at(-1)! : "",
      };
    });
  }
  const rows = table(
    text,
    member,
    profile === "integer" ? integerColumns : subclonalColumns,
    "\t",
    true,
  );
  const result: Row[] = [];
  rows.forEach((f, i) => {
    const loc = interval(f, member, i + 1);
    for (const hp of [1, 2]) {
      const coverage = number(f[hp === 1 ? 3 : 6], member, i + 1);
      const copyNumber = number(f[hp === 1 ? 4 : 7], member, i + 1);
      const confidence = number(f[hp === 1 ? 5 : 8], member, i + 1);
      const masked = copyNumber === 3300 || coverage === 3300;
      result.push({
        ...loc,
        haplotype: `HP${hp}`,
        copyNumber: masked ? null : copyNumber,
        medianCoverage: masked ? null : coverage,
        sourceCopyNumber: copyNumber,
        sourceMedianCoverage: coverage,
        confidence,
        status: masked ? "masked" : "reported",
        subclonal: profile === "subclonal" && f[hp === 1 ? 9 : 10] === "Y",
        breakpointIds: f[profile === "integer" ? 9 : 11],
      });
    }
  });
  return result;
}

export function parseCoverage(text: string): Row[] {
  return lines(text).map(({ value, line }) => {
    const f = value.split("\t");
    if (f.length !== 6 && f.length !== 4)
      throw Error(
        `phase_corrected_coverage.csv:${line}: expected 4 or 6 columns`,
      );
    return {
      ...interval(f, "phase_corrected_coverage.csv", line),
      originalStart: number(f[1], "coverage", line),
      ...(f.length === 6
        ? {
            hp1: number(f[3], "coverage", line),
            hp2: number(f[4], "coverage", line),
            unphased: number(f[5], "coverage", line),
          }
        : { total: number(f[3], "coverage", line) }),
    };
  });
}

export function parseLoh(text: string, member: string): Row[] {
  return lines(text)
    .filter((x) => !x.value.startsWith("#"))
    .map(({ value, line }) => {
      const f = value.split("\t");
      if (f.length !== 3) throw Error(`${member}:${line}: expected 3 columns`);
      const c = chrom(f[0]);
      const start = number(f[1], member, line);
      const end = number(f[2], member, line);
      if (!c || end <= start)
        throw Error(`${member}:${line}: invalid interval`);
      return { chrom: c, start, end, feature: "LOH" };
    });
}

export function parseBaf(text: string, coverage: Row[]): Row[] {
  const bins = new Map(
    coverage.map((r) => [`${r.chrom}:${r.originalStart}`, r]),
  );
  return lines(text).map(({ value, line }) => {
    const f = value.split(",");
    if (f.length !== 3) throw Error(`baf.csv:${line}: expected 3 columns`);
    const c = chrom(f[0]);
    const originalStart = number(f[1], "baf.csv", line);
    const bafValue = number(f[2], "baf.csv", line);
    if (bafValue !== 3300 && (bafValue < 0 || bafValue > 0.5))
      throw Error(`baf.csv:${line}: folded BAF outside 0–0.5`);
    const bin = bins.get(`${c}:${originalStart}`);
    if (!c) throw Error(`baf.csv:${line}: unknown chromosome`);
    return {
      chrom: c,
      start: bin?.start ?? Math.max(0, originalStart - 1),
      end: bin?.end ?? Math.max(0, originalStart - 1) + 1,
      baf: bafValue === 3300 ? null : bafValue,
      status:
        bafValue === 3300
          ? "unavailable"
          : bafValue === 0
            ? "zero; SNP support unknown"
            : "reported",
      bounds: bin ? "coverage bin" : "position only",
    };
  });
}

export function parseMasks(text: string): Row[] {
  return lines(text).map(({ value, line }) => {
    const f = value.split("\t");
    if (f.length !== 3)
      throw Error(`grch38.cen_coord.curated.bed:${line}: expected 3 columns`);
    const c = chrom(f[0]);
    const sourceStart = number(f[1], "centromere", line);
    const end = number(f[2], "centromere", line);
    const start = sourceStart === 1 ? 0 : sourceStart;
    if (!c || end <= start)
      throw Error(`grch38.cen_coord.curated.bed:${line}: invalid interval`);
    return { chrom: c, start, end, reason: "Wakhan centromere region" };
  });
}

export function parseGenes(text: string): Row[] {
  return table(
    text,
    "genes_copynumber_states.bed",
    geneColumns,
    "\t",
    true,
  ).map((f, i) => ({
    ...interval(f, "genes_copynumber_states.bed", i + 1),
    gene: f[3],
    actualHp1: number(f[4], "genes", i + 1),
    actualHp2: number(f[5], "genes", i + 1),
    adjustedHp1: number(f[6], "genes", i + 1),
    adjustedHp2: number(f[7], "genes", i + 1),
    stateHp1: number(f[8], "genes", i + 1),
    stateHp2: number(f[9], "genes", i + 1),
  }));
}

export function parseRankings(text: string): Row[] {
  const cols = [
    "repository_name",
    "dna_purity",
    "cell_purity",
    "ploidy",
    "confidence",
    "solution_rank",
  ];
  return table(text, "solutions_ranks.tsv", cols).map((f, i) => ({
    repositoryName: f[0],
    dnaPurity: number(f[1], "solutions_ranks.tsv", i + 2),
    cellPurity: number(f[2], "solutions_ranks.tsv", i + 2),
    ploidy: number(f[3], "solutions_ranks.tsv", i + 2),
    confidence: number(f[4], "solutions_ranks.tsv", i + 2),
    rank: number(f[5], "solutions_ranks.tsv", i + 2),
  }));
}

type VcfRow = {
  CHROM: string;
  POS: number;
  ID: string[];
  FILTER: string;
  INFO: Record<string, unknown>;
  SAMPLES: Record<string, Record<string, unknown>>;
};
const first = (v: unknown): string =>
  String(Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const firstNumber = (v: unknown): number => Number(Array.isArray(v) ? v[0] : v);

export async function parseVariants(
  text: string,
  result: WakhanResult,
): Promise<void> {
  validateVcfAssembly(text);
  const sampleLine = lines(text).find((x) =>
    x.value.startsWith("#CHROM\t"),
  )?.value;
  const samples = sampleLine?.split("\t").slice(9) ?? [];
  if (samples.length !== 1)
    throw Error(
      `severus_somatic.vcf: expected one target sample, found ${samples.length}`,
    );
  result.vcfSample = samples[0];
  const records = (await parseVcf(text)) as VcfRow[];
  const byId = new Map(records.map((v) => [first(v.ID), v]));
  const seen = new Set<string>();
  for (const v of records) {
    const c = chrom(v.CHROM);
    const type = first(v.INFO.SVTYPE);
    const id = first(v.ID);
    const sample = v.SAMPLES[samples[0]];
    const gt = first(sample?.GT);
    if (!c || v.FILTER !== "PASS" || !gt || gt === "0/0" || gt === "./.")
      continue;
    const basic = {
      variantId: id,
      svClass: type,
      sourceSvType: type,
      chrom: c,
      start: v.POS - 1,
      chrom1: c,
      start1: v.POS - 1,
      genotype: gt,
      haplotype: first(v.INFO.HP),
      phaseSet: first(v.INFO.PHASESETID),
      variantReads: firstNumber(sample?.DV),
      referenceReads: firstNumber(sample?.DR),
      vaf: firstNumber(sample?.VAF),
      haplotypeVaf: Array.isArray(sample?.hVAF)
        ? sample.hVAF.join(",")
        : first(sample?.hVAF),
      orientation: first(v.INFO.STRANDS),
      detailedType: first(v.INFO.DETAILED_TYPE),
    };
    if (type === "BND") {
      const mateId = first(v.INFO.MATE_ID);
      const mate = byId.get(mateId);
      if (
        !mate ||
        first(mate.INFO.MATE_ID) !== id ||
        seen.has(id) ||
        seen.has(mateId)
      ) {
        if (!mate)
          result.diagnostics.push({
            level: "warning",
            message: `Unpaired BND ${id} was shown as a site.`,
          });
        if (!mate) result.svSites.push(basic);
        continue;
      }
      seen.add(id);
      seen.add(mateId);
      const c2 = chrom(mate.CHROM);
      if (!c2) continue;
      result.svLinks.push({
        ...basic,
        chrom1: c,
        start1: v.POS - 1,
        chrom2: c2,
        start2: mate.POS - 1,
        mateId,
        orientation: first(v.INFO.STRANDS),
      });
    } else if (["DEL", "DUP", "INV"].includes(type)) {
      const end = firstNumber(v.INFO.END);
      if (Number.isFinite(end) && end > v.POS)
        result.svLinks.push({
          ...basic,
          chrom1: c,
          start1: v.POS - 1,
          chrom2: c,
          start2: end - 1,
          mateId: "",
          orientation: first(v.INFO.STRANDS),
        });
      else result.svSites.push(basic);
    } else {
      result.svSites.push(basic);
    }
  }
}

function validateVcfAssembly(text: string): void {
  const expectedContigs = getContigs("hg38").filter((x) => x.name !== "chrM");
  const declared = new Map(
    [...text.matchAll(/^##contig=<ID=([^,>]+),length=(\d+)>/gm)].map((m) => [
      m[1],
      Number(m[2]),
    ]),
  );
  if (expectedContigs.some((x) => declared.get(x.name) !== x.size)) {
    throw Error(
      "severus_somatic.vcf: contig dictionary does not match GRCh38 primary chromosomes",
    );
  }
}

export async function parseMembers(
  name: string,
  members: Record<string, string>,
): Promise<WakhanResult> {
  const result = emptyResult(name);
  for (const profile of ["integer", "subclonal"] as const) {
    const text = members[`${profile}_profile.bed`];
    if (text) {
      result.segments[profile] = parseSegments(text, profile);
      result.profiles.push(profile);
    }
  }
  if (!result.profiles.length)
    throw Error(
      "ZIP has no supported copy-number profile (integer_profile.bed or subclonal_profile.bed).",
    );
  if (result.profiles.every((p) => result.segments[p].length === 0))
    throw Error("ZIP has no copy-number intervals.");
  const firstProfile = result.segments[result.profiles[0]];
  result.mode = firstProfile[0]?.haplotype === "Total" ? "unphased" : "phased";
  if (
    result.profiles.some(
      (p) =>
        (result.segments[p][0]?.haplotype === "Total") !==
        (result.mode === "unphased"),
    )
  ) {
    throw Error("ZIP mixes phased and unphased profile schemas.");
  }
  const coverageText =
    members["phase_corrected_coverage.csv"] ?? members["coverage.csv"];
  if (coverageText) result.coverage = parseCoverage(coverageText);
  else
    result.diagnostics.push({
      level: "warning",
      message: "Raw coverage is absent.",
    });
  if (
    result.coverage.length &&
    result.coverage.some((r) => "total" in r !== (result.mode === "unphased"))
  ) {
    throw Error("Coverage columns do not match the copy-number profile mode.");
  }
  if (
    result.mode === "phased" &&
    result.coverage.length &&
    result.coverage.every((r) => r.unphased === 0)
  ) {
    result.diagnostics.push({
      level: "info",
      message:
        "The unphased coverage column is all zero; the ZIP does not say whether this series was computed.",
    });
  }
  const optional = async (member: string, work: () => void | Promise<void>) => {
    if (!members[member]) return;
    try {
      await work();
    } catch (error) {
      result.diagnostics.push({
        level: "warning",
        message: `${member}: ${String(error)}`,
      });
    }
  };
  await optional("baf.csv", () => {
    result.baf = parseBaf(members["baf.csv"], result.coverage);
  });
  await optional("grch38.cen_coord.curated.bed", () => {
    result.masks = parseMasks(members["grch38.cen_coord.curated.bed"]);
  });
  const maskedSegments = result.segments.subclonal.filter(
    (row) => row.status === "masked",
  );
  if (maskedSegments.length) {
    const maskKeys = new Set(
      maskedSegments.map(
        (r) => `${r.chrom}:${r.start}-${r.end}:${r.haplotype}`,
      ),
    );
    for (const row of result.segments.integer) {
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
    result.masks = maskedSegments
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
  await optional("genes_copynumber_states.bed", () => {
    result.geneResults = parseGenes(members["genes_copynumber_states.bed"]);
  });
  await optional("solutions_ranks.tsv", () => {
    result.rankings = parseRankings(members["solutions_ranks.tsv"]);
  });
  if (members["severus_somatic.vcf"])
    validateVcfAssembly(members["severus_somatic.vcf"]);
  await optional("severus_somatic.vcf", () =>
    parseVariants(members["severus_somatic.vcf"], result),
  );
  const lohMembers = Object.keys(members).filter((name) =>
    name.endsWith("_loh_segments.csv"),
  );
  if (lohMembers.length > 1)
    result.diagnostics.push({
      level: "warning",
      message: "Multiple LOH files found; the LOH track is unavailable.",
    });
  else if (lohMembers.length === 1)
    await optional(lohMembers[0], () => {
      result.loh = parseLoh(members[lohMembers[0]], lohMembers[0]);
      result.lohAvailable = true;
    });
  else
    result.diagnostics.push({
      level: "info",
      message:
        "No LOH file is supplied; this does not establish that there were no LOH calls.",
    });
  if (result.loh.length && result.masks.length) {
    result.loh = result.loh.flatMap((row) => {
      let fragments = [{ start: row.start as number, end: row.end as number }];
      for (const mask of result.masks) {
        if (mask.chrom !== row.chrom) continue;
        fragments = fragments.flatMap((part) => {
          const a = mask.start as number,
            b = mask.end as number;
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
  result.diagnostics.push({
    level: "info",
    message:
      "Depth calibration and enclosed solution identity are absent from this ZIP.",
  });
  result.diagnostics.push({
    level: "info",
    message:
      "Reference identity comes from the GRCh38 VCF and centromere filenames; the ZIP has no independent manifest.",
  });
  if (
    !members["severus_somatic.vcf"] &&
    !members["grch38.cen_coord.curated.bed"]
  )
    throw Error("The ZIP does not identify a supported reference assembly.");
  const lengths = new Map(getContigs("hg38").map((x) => [x.name, x.size]));
  const checkedTables: [string, Row[]][] = [
    ...result.profiles.map((p): [string, Row[]] => [
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
      const length = lengths.get(String(row.chrom));
      if (
        !length ||
        typeof row.start !== "number" ||
        typeof row.end !== "number" ||
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
  return result;
}
