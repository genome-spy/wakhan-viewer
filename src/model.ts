export type Profile = "integer" | "subclonal";
export type Diagnostic = { level: "warning" | "info"; message: string };
/** Open records are used only at the visualization data boundary. */
export type Row = Record<string, string | number | boolean | null>;

export type GenomicInterval = { chrom: string; start: number; end: number };
export type Haplotype = "HP1" | "HP2" | "Total";

export type Segment = GenomicInterval & {
  haplotype: Haplotype;
  copyNumber: number | null;
  medianCoverage: number | null;
  sourceCopyNumber: number;
  sourceMedianCoverage: number;
  confidence: number;
  status: "reported" | "masked";
  subclonal: boolean;
  breakpointIds: string;
};

type CoverageInterval = GenomicInterval & { originalStart: number };
export type PhasedCoverage = CoverageInterval & {
  hp1: number;
  hp2: number;
  unphased: number;
};
export type TotalCoverage = CoverageInterval & { total: number };
export type Coverage = PhasedCoverage | TotalCoverage;

export type CalibratedCoverage = GenomicInterval & {
  haplotype: "HP1" | "HP2";
  adjustedCopyNumber: number;
  rawDepth: number;
};

export type BafBin = GenomicInterval & {
  baf: number | null;
  status: "unavailable" | "zero; SNP support unknown" | "reported";
  bounds: "coverage bin" | "position only";
};

export type SvSite = {
  variantId: string;
  svClass: string;
  sourceSvType: string;
  chrom: string;
  start: number;
  chrom1: string;
  start1: number;
  genotype: string;
  haplotype: string;
  phaseSet: string;
  variantReads: number;
  referenceReads: number;
  vaf: number;
  haplotypeVaf: string;
  orientation: string;
  detailedType: string;
};
export type SvLink = SvSite & {
  chrom2: string;
  start2: number;
  mateId: string;
};

export type MaskInterval = GenomicInterval & { reason: string };
export type LohInterval = GenomicInterval & { feature: "LOH" };
export type GeneResult = GenomicInterval & {
  gene: string;
  actualHp1: number;
  actualHp2: number;
  adjustedHp1: number;
  adjustedHp2: number;
  stateHp1: number;
  stateHp2: number;
};
export type Ranking = {
  repositoryName: string;
  dnaPurity: number;
  cellPurity: number;
  ploidy: number;
  confidence: number;
  rank: number;
};

export interface WakhanResult {
  name: string;
  assembly: "hg38";
  mode: "phased" | "unphased";
  profiles: Profile[];
  segments: Record<Profile, Segment[]>;
  coverage: Coverage[];
  baf: BafBin[];
  svLinks: SvLink[];
  svSites: SvSite[];
  masks: MaskInterval[];
  loh: LohInterval[];
  lohAvailable: boolean;
  geneResults: GeneResult[];
  rankings: Ranking[];
  diagnostics: Diagnostic[];
  vcfSample?: string;
}

export const emptyResult = (name: string): WakhanResult => ({
  name,
  assembly: "hg38",
  mode: "phased",
  profiles: [],
  segments: { integer: [], subclonal: [] },
  coverage: [],
  baf: [],
  svLinks: [],
  svSites: [],
  masks: [],
  loh: [],
  lohAvailable: false,
  geneResults: [],
  rankings: [],
  diagnostics: [],
});
