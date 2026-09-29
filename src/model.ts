export type Profile = "integer" | "subclonal";
export type Diagnostic = { level: "warning" | "info"; message: string };
export type Row = Record<string, string | number | boolean | null>;

export interface WakhanResult {
  name: string;
  assembly: "hg38";
  mode: "phased" | "unphased";
  profiles: Profile[];
  segments: Record<Profile, Row[]>;
  coverage: Row[];
  baf: Row[];
  svLinks: Row[];
  svSites: Row[];
  masks: Row[];
  loh: Row[];
  lohAvailable: boolean;
  geneResults: Row[];
  rankings: Row[];
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
