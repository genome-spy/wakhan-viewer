import type { RootSpec } from "@genome-spy/core/spec/root.js";
import type { WakhanResult } from "../model";
import recipeSvSpec from "./specs/structural-variants.json";

const locus = (pos: string) => ({
  chrom: "chrom",
  pos,
  type: "locus",
  band: 0,
});
const x = locus("start");
const x2 = { chrom: "chrom", pos: "end", band: 0 };
const tip = (field: string, title: string, format?: string) => ({
  field,
  title,
  ...(format ? { format } : {}),
});

function navigator() {
  return {
    name: "overview",
    height: 22,
    title: "Genome navigator | double-click and drag to brush",
    resolve: { scale: { x: "excluded" } },
    data: { lazy: { type: "axisGenome", channel: "x" } },
    encoding: {
      x: {
        field: "continuousStart",
        type: "locus",
        scale: { zoom: false },
        axis: null,
      },
      x2: { field: "continuousEnd" },
    },
    layer: [
      {
        mark: { type: "rect", clip: true, tooltip: null },
        encoding: {
          color: {
            field: "odd",
            type: "nominal",
            scale: { domain: [true, false], range: ["#e4e9ec", "#f7f9fa"] },
            legend: null,
          },
        },
      },
      {
        mark: { type: "text", size: 11, color: "#4a5c68", tooltip: null },
        encoding: { text: { field: "name" } },
      },
    ],
    params: [
      {
        name: "brush",
        select: {
          type: "interval",
          encodings: ["x"],
          clear: "dblclick",
          mark: { stroke: "#487d91", fill: "#75adbf", fillOpacity: 0.08 },
        },
        push: "outer",
        persist: false,
      },
    ],
  };
}

function sitesTrack() {
  return {
    name: "sv-sites",
    height: 18,
    title: "Insertions and single breakends",
    data: { name: "svSites" },
    mark: { type: "point", size: 28, opacity: 0.7, clip: "x" },
    encoding: {
      x,
      color: {
        field: "svClass",
        type: "nominal",
        scale: { domain: ["INS", "sBND"], range: ["#9b60c6", "#677580"] },
        legend: null,
      },
      tooltip: [
        tip("variantId", "Variant"),
        tip("svClass", "Class"),
        tip("genotype", "GT"),
        tip("variantReads", "DV"),
      ],
    },
  };
}

function cnTrack(hp: "HP1" | "HP2" | "Total", preview = false) {
  const ink = hp === "HP1" ? "#b34141" : hp === "HP2" ? "#3976a5" : "#287a78";
  const segment = {
    data: { name: "segments" },
    transform: [
      {
        type: "filter",
        expr: `datum.haplotype == '${hp}' && datum.status == 'reported'`,
      },
    ],
    mark: { type: "rule", size: 3, minLength: 1, clip: "x", color: ink },
    encoding: {
      x,
      x2,
      y: {
        field: "copyNumber",
        type: "quantitative",
        scale: { zero: true, domain: { source: "viewport" } },
        axis: { title: "Copies", tickCount: 4 },
      },
      tooltip: [
        tip("haplotype", "Haplotype"),
        tip("copyNumber", "Copies"),
        tip("confidence", "CN confidence", ".3f"),
        tip("medianCoverage", "Segment median depth", ".2f"),
        tip("subclonal", "Subclonal flag"),
        tip("breakpointIds", "Breakpoint IDs"),
      ],
    },
  };
  if (!import.meta.env.DEV || !preview || hp === "Total")
    return {
      name: `cn-${hp}`,
      height: 100,
      title: `${hp} | inferred copy number`,
      ...segment,
    };
  return {
    name: `cn-${hp}`,
    height: 100,
    title: `${hp} | copy number + Estimated calibration — development`,
    layer: [
      {
        data: { name: "calibratedCoverage" },
        transform: [{ type: "filter", expr: `datum.haplotype == '${hp}'` }],
        mark: {
          type: "point",
          size: 12,
          opacity: 0.25,
          color: hp === "HP1" ? "#cd6f6f" : "#87aece",
          strokeWidth: 0,
          clip: "x",
        },
        encoding: {
          x,
          x2,
          y: {
            field: "adjustedCopyNumber",
            type: "quantitative",
            scale: { zero: true, domain: { source: "viewport" } },
            axis: { title: "Copies", tickCount: 4 },
          },
          tooltip: [
            tip("rawDepth", "Raw depth", ".2f"),
            tip("adjustedCopyNumber", "Estimated copies", ".2f"),
          ],
        },
      },
      segment,
    ],
  };
}

function depthTrack(hp: "HP1" | "HP2" | "Total") {
  const field = hp === "HP1" ? "hp1" : hp === "HP2" ? "hp2" : "total";
  const ink = hp === "HP1" ? "#cd6f6f" : hp === "HP2" ? "#87aece" : "#6eb0aa";
  return {
    name: `depth-${hp}`,
    height: 82,
    title: `${hp} | raw 50 kb read depth`,
    data: { name: "coverage" },
    mark: {
      type: "point",
      size: 15,
      opacity: 0.35,
      strokeWidth: 0,
      clip: "x",
      color: ink,
    },
    encoding: {
      x,
      x2,
      y: {
        field,
        type: "quantitative",
        scale: { zero: true, domain: { source: "viewport" } },
        axis: { title: "Read depth", tickCount: 4 },
      },
      tooltip: [
        tip(field, "Raw depth", ".2f"),
        tip("chrom", "Chromosome"),
        tip("start", "Bin start", ",d"),
      ],
    },
  };
}

function bafTrack() {
  return {
    name: "baf",
    height: 80,
    title: "Folded BAF | grey zeros have unknown SNP support",
    data: { name: "baf" },
    transform: [{ type: "filter", expr: "datum.baf != null" }],
    mark: { type: "point", size: 14, opacity: 0.35, strokeWidth: 0, clip: "x" },
    encoding: {
      x,
      x2,
      y: {
        field: "baf",
        type: "quantitative",
        scale: { domain: [0, 0.5] },
        axis: { title: "BAF", values: [0, 0.25, 0.5], grid: true },
      },
      color: {
        field: "status",
        type: "nominal",
        scale: {
          domain: ["reported", "zero; SNP support unknown"],
          range: ["#428b81", "#aeb8bd"],
        },
        legend: null,
      },
      tooltip: [
        tip("baf", "Folded BAF", ".3f"),
        tip("status", "Interpretation"),
        tip("bounds", "Bounds"),
      ],
    },
  };
}

function masksTrack() {
  return {
    name: "masks",
    height: 13,
    title: "Wakhan masked regions",
    data: { name: "masks" },
    mark: { type: "rect", color: "#b4a3a0", opacity: 0.7, clip: "x" },
    encoding: { x, x2, tooltip: [tip("reason", "Mask")] },
  };
}

function lohTrack(empty: boolean) {
  return {
    name: "loh",
    height: 17,
    title: empty
      ? "Wakhan LOH | no calls in supplied table"
      : "Wakhan LOH calls",
    data: { name: "loh" },
    mark: { type: "rect", color: "#6195b9", opacity: 0.8, clip: "x" },
    encoding: { x, x2, tooltip: [tip("feature", "Feature")] },
  };
}

function cytobandsTrack() {
  return {
    name: "cytobands",
    height: 17,
    title: "GRCh38 cytobands",
    data: { name: "cytobands" },
    mark: { type: "rect", clip: "x", minWidth: 0.3 },
    encoding: {
      x,
      x2,
      color: {
        field: "stain",
        type: "nominal",
        scale: {
          domain: [
            "gneg",
            "gpos25",
            "gpos50",
            "gpos75",
            "gpos100",
            "acen",
            "gvar",
            "stalk",
          ],
          range: [
            "#f3f5f5",
            "#dce1e3",
            "#bdc6ca",
            "#939fa5",
            "#64747c",
            "#c3988d",
            "#e1e5e6",
            "#d8dddd",
          ],
        },
        legend: null,
      },
      tooltip: [tip("band", "Cytoband")],
    },
  };
}

function genesTrack() {
  return {
    name: "genes",
    height: 30,
    title: "NCG 7.2 canonical cancer drivers | RefSeq GRCh38",
    axes: { x: { title: null } },
    data: { name: "genes" },
    encoding: {
      x,
      x2,
      tooltip: [
        tip("symbol", "Gene"),
        tip("driverRole", "Driver role"),
        tip("supportCount", "Supporting publications"),
      ],
    },
    layer: [
      {
        mark: { type: "rect", color: "#64747c", y: 0.1, y2: 0.3, minWidth: 2 },
      },
      {
        transform: [
          {
            type: "linearizeGenomicCoordinate",
            chrom: "chrom",
            pos: "start",
            as: "_start",
          },
          {
            type: "formula",
            expr: "datum._start + (datum.end - datum.start) / 2",
            as: "_centroid",
          },
          { type: "measureText", field: "symbol", fontSize: 10, as: "_width" },
          {
            type: "filterScoredLabels",
            score: "supportCount",
            width: "_width",
            pos: "_centroid",
            padding: 3,
          },
        ],
        mark: {
          type: "text",
          size: 10,
          color: "#425560",
          y: 0.75,
          align: "center",
          clip: "x",
        },
        encoding: {
          x: { field: "_centroid", type: "locus" },
          x2: null,
          text: { field: "symbol" },
        },
      },
    ],
  };
}

export function layoutSignature(result: WakhanResult): string {
  return [
    result.mode,
    !!result.svLinks.length,
    !!result.svSites.length,
    !!result.coverage.length,
    !!result.baf.length,
    result.lohAvailable,
    result.lohAvailable && result.loh.length === 0,
    !!result.masks.length,
  ].join(":");
}

export function createSpec(result: WakhanResult, preview = false): RootSpec {
  const mode = result.mode;
  const tracks = [
    ...(result.svLinks.length ? [structuredClone(recipeSvSpec)] : []),
    ...(!result.svLinks.length && result.svSites.length ? [sitesTrack()] : []),
    ...(mode === "phased"
      ? [
          cnTrack("HP1", preview),
          ...(result.coverage.length ? [depthTrack("HP1")] : []),
          cnTrack("HP2", preview),
          ...(result.coverage.length ? [depthTrack("HP2")] : []),
        ]
      : [
          cnTrack("Total"),
          ...(result.coverage.length ? [depthTrack("Total")] : []),
        ]),
    ...(result.baf.length ? [bafTrack()] : []),
    ...(result.lohAvailable ? [lohTrack(result.loh.length === 0)] : []),
    ...(result.masks.length ? [masksTrack()] : []),
    cytobandsTrack(),
    genesTrack(),
  ];
  return {
    assembly: "hg38",
    width: "container",
    padding: { left: 8, right: 12, top: 8, bottom: 8 },
    spacing: 5,
    params: [{ name: "brush" }, { name: "showRuler", value: true }],
    datasets: {
      segments: [],
      coverage: [],
      calibratedCoverage: [],
      baf: [],
      svLinks: [],
      svSites: [],
      masks: [],
      loh: [],
      genes: [],
      cytobands: [],
    },
    resolve: { scale: { x: "shared" } },
    vconcat: [
      navigator(),
      {
        name: "detail",
        spacing: 8,
        params: [
          {
            name: "genomicCursor",
            persist: false,
            ruler: {
              disabled: { expr: "!showRuler" },
              encodings: ["x"],
              extent: "container",
              display: "line",
              mark: {
                stroke: "#6b7c85",
                strokeWidth: 1,
                strokeDash: [3, 3],
                opacity: 0.75,
              },
            },
          },
          {
            name: "svRegion",
            persist: false,
            select: {
              type: "interval",
              encodings: ["x"],
              extent: "container",
              on: "mousedown[event.shiftKey]",
              clear: "dblclick",
              zoom: false,
              mark: {
                stroke: "#487d91",
                strokeOpacity: 0.65,
                strokeWidth: 1,
                fill: "#75adbf",
                fillOpacity: 0.01,
                clip: false,
              },
            },
          },
        ],
        resolve: { scale: { x: "shared" }, axis: { x: "shared" } },
        scales: { x: { name: "genome", domain: { param: "brush" } } },
        vconcat: tracks,
      },
    ],
  } as unknown as RootSpec;
}
