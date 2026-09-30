import type { RootSpec } from "@genome-spy/core/spec/root.js";
import type { CalibrationEstimate } from "../dev/calibration";
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

const rulerMark = {
  stroke: "#6b7c85",
  strokeWidth: 1,
  strokeDash: [3, 3],
  opacity: { expr: "rulerOpacity" },
};

function horizontalRuler(name: string) {
  return {
    name,
    persist: false,
    ruler: {
      disabled: { expr: "!showRuler" },
      encodings: ["y"],
      extent: "view",
      display: "line",
      mark: rulerMark,
    },
  };
}

function maskLayer() {
  return {
    data: { name: "masks" },
    mark: {
      type: "rect",
      fill: "#f7f9fa",
      fillOpacity: 0,
      stroke: "#dce2e4",
      strokeWidth: 1,
      hatch: "diagonal",
      clip: "x",
    },
    encoding: { x, x2, tooltip: [tip("reason", "Availability")] },
  };
}

function navigator() {
  return {
    name: "overview",
    height: 20,
    title:
      "Genome navigator | double-click, then drag to brush; scroll to resize; drag selection to move",
    resolve: { scale: { x: "excluded" } },
    data: { lazy: { type: "axisGenome", channel: "x" } },
    view: { stroke: "#ccd4d8", strokeZindex: 10 },
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
        mark: {
          type: "text",
          size: 11,
          color: "#4a5c68",
          paddingX: 2,
          tooltip: null,
        },
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
          mark: {
            stroke: "#487d91",
            strokeWidth: 1.5,
            strokeOpacity: 0.85,
            fill: "#75adbf",
            fillOpacity: 0.02,
            shadowBlur: 10,
            shadowColor: "#75adbf",
            shadowOpacity: 0.5,
            zindex: 11,
            clip: false,
          },
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

function cnTrack(hp: "HP1" | "HP2" | "Total", calibration?: CalibrationEstimate) {
  const ink =
    hp === "HP1" ? "firebrick" : hp === "HP2" ? "steelblue" : "#287a78";
  const segment = {
    data: { name: "segments" },
    transform: [
      {
        type: "filter",
        expr: `datum.haplotype == '${hp}' && datum.status == 'reported'`,
      },
    ],
    mark: { type: "rule", size: 3, minLength: 1, clip: "x" },
    encoding: {
      x,
      x2,
      color: {
        condition: { param: "svRegion", empty: true, value: ink },
        value: "#8f999e",
      },
      y: {
        field: "copyNumber",
        type: "quantitative",
        ...(calibration
          ? {}
          : { scale: { zero: true, domain: { source: "viewport" } } }),
        axis: { title: "Copies", tickCount: 4, tickMinStep: 1 },
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
  const layers = [
    maskLayer(),
    {
      data: { values: [{}] },
      mark: { type: "rule", color: "#d8e0e1", clip: false, y: 0 },
    },
  ];
  if (!calibration || hp === "Total")
    return {
      name: `cn-${hp}`,
      height: 100,
      title: `${hp} | inferred copy number`,
      params: [horizontalRuler(`cnCursor${hp}`)],
      layer: [...layers, segment],
    };
  return {
    name: `cn-${hp}`,
    height: { grow: 1 },
    title: `${hp} | copy number + binned read depth`,
    params: [horizontalRuler(`cnCursor${hp}`)],
    resolve: { axis: { y: "independent" } },
    layer: [
      ...layers,
      {
        data: { name: "calibratedCoverage" },
        transform: [{ type: "filter", expr: `datum.haplotype == '${hp}'` }],
        mark: {
          type: "point",
          size: { expr: "min(pow(zoomLevel(), 1.5) + 2, 100)" },
          opacity: 0.25,
          strokeWidth: 0,
          clip: true,
        },
        encoding: {
          x,
          x2,
          color: {
            condition: {
              param: "svRegion",
              empty: true,
              value: hp === "HP1" ? "#cd6f6f" : "#87aece",
            },
            value: "#cbd2d6",
          },
          y: {
            field: "rawDepth",
            type: "quantitative",
            scale: {
              type: "linear",
              nice: false,
              zero: false,
              domainTransition: false,
              clamp: false,
              domain: {
                expr: "[cnDomain[0] * singleCopyDepth + depthOffset, cnDomain[1] * singleCopyDepth + depthOffset]",
              },
            },
            axis: { orient: "right", title: "Read depth", tickCount: 4 },
          },
          tooltip: [
            tip("rawDepth", "Raw depth", ".2f"),
            tip("adjustedCopyNumber", "Estimated copies", ".2f"),
          ],
        },
        resolve: { scale: { y: "excluded" } },
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
    params: [horizontalRuler(`depthCursor${hp}`)],
    data: { name: "coverage" },
    mark: {
      type: "point",
      size: { expr: "min(pow(zoomLevel(), 1.5) + 2, 100)" },
      opacity: 0.25,
      strokeWidth: 0,
      clip: true,
    },
    encoding: {
      x,
      x2,
      color: {
        condition: { param: "svRegion", empty: true, value: ink },
        value: "#cbd2d6",
      },
      y: {
        field,
        type: "quantitative",
        scale: { zero: true, domain: { source: "viewport" } },
        axis: { orient: "right", title: "Read depth", tickCount: 4 },
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
    title: "Folded BAF | 50 kb means | grey zeros have unknown SNP support",
    params: [horizontalRuler("bafHorizontalCursor")],
    data: { name: "baf" },
    transform: [{ type: "filter", expr: "datum.baf != null" }],
    mark: {
      type: "point",
      size: { expr: "min(pow(zoomLevel(), 1.5), 100)" },
      opacity: 0.25,
      strokeWidth: 0,
      clip: "x",
    },
    encoding: {
      x,
      x2,
      y: {
        field: "baf",
        type: "quantitative",
        scale: { domain: [0, 0.5] },
        axis: {
          title: null,
          values: [0, 0.25, 0.5],
          grid: true,
          gridDash: [3, 3],
        },
      },
      color: {
        condition: {
          param: "svRegion",
          empty: true,
          field: "status",
          type: "nominal",
          scale: {
            type: "ordinal",
            domain: ["zero; SNP support unknown", "reported"],
            range: ["#aeb8bd", "#428b81"],
          },
          legend: null,
        },
        value: "#cbd2d6",
      },
      shape: {
        field: "status",
        type: "nominal",
        scale: {
          type: "ordinal",
          domain: ["zero; SNP support unknown", "reported"],
          range: ["cross", "circle"],
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

function lohTrack(empty: boolean) {
  return {
    name: "loh",
    height: 12,
    title: empty
      ? "Wakhan LOH | no calls in supplied table"
      : "Wakhan LOH calls",
    layer: [
      maskLayer(),
      {
        data: { name: "loh" },
        mark: { type: "rect", opacity: 0.78, strokeWidth: 0.5, clip: "x" },
        encoding: {
          x,
          x2,
          fill: {
            condition: { param: "svRegion", empty: true, value: "#6195b9" },
            value: "#8f999e",
          },
          stroke: {
            condition: { param: "svRegion", empty: true, value: "#417497" },
            value: "#768187",
          },
          tooltip: [tip("feature", "Feature")],
        },
      },
    ],
  };
}

function cytobandsTrack() {
  const stains = [
    "gneg",
    "gpos25",
    "gpos50",
    "gpos75",
    "gpos100",
    "acen",
    "gvar",
    "stalk",
  ];
  return {
    name: "cytobands",
    height: 16,
    data: { name: "cytobands" },
    encoding: { x, x2 },
    resolve: { scale: { color: "independent" } },
    layer: [
      {
        mark: { type: "rect", minWidth: 0.3 },
        encoding: {
          color: {
            field: "stain",
            type: "nominal",
            scale: {
              domain: stains,
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
      },
      {
        mark: {
          type: "text",
          size: 10,
          align: "center",
          baseline: "middle",
          paddingX: 4,
          clip: "x",
          tooltip: null,
        },
        encoding: {
          text: { field: "band" },
          color: {
            field: "stain",
            type: "nominal",
            scale: {
              domain: stains,
              range: [
                "#263741",
                "#263741",
                "#263741",
                "#263741",
                "#ffffff",
                "#263741",
                "#263741",
                "#263741",
              ],
            },
            legend: null,
          },
        },
      },
    ],
  };
}

function genesTrack() {
  return {
    name: "genes",
    height: 25,
    title: "NCG canonical cancer drivers | RefSeq / GRCh38",
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
          yOffset: 2,
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
  ].join(":");
}

export function createSpec(
  result: WakhanResult,
  estimate?: CalibrationEstimate,
): RootSpec {
  const mode = result.mode;
  const calibration =
    import.meta.env.DEV && mode === "phased" && result.coverage.length
      ? estimate
      : undefined;
  const tracks = [
    ...(result.svLinks.length ? [structuredClone(recipeSvSpec)] : []),
    ...(!result.svLinks.length && result.svSites.length ? [sitesTrack()] : []),
    ...(mode === "phased"
      ? calibration
        ? [
            {
              name: "copy-number",
              params: [
                { name: "singleCopyDepth", value: calibration.singleCopyDepth },
                { name: "depthOffset", value: calibration.offset },
                { name: "cnDomain", expr: "domain('y')" },
              ],
              spacing: 10,
              resolve: { scale: { y: "shared" }, axis: { x: "shared" } },
              scales: {
                y: {
                  domain: { source: "viewport" },
                  zero: true,
                  nice: true,
                  name: "copyNumber",
                  clamp: true,
                },
              },
              vconcat: [cnTrack("HP1", calibration), cnTrack("HP2", calibration)],
            },
          ]
        : [
            cnTrack("HP1"),
            ...(result.coverage.length ? [depthTrack("HP1")] : []),
            cnTrack("HP2"),
            ...(result.coverage.length ? [depthTrack("HP2")] : []),
          ]
      : [
          cnTrack("Total"),
          ...(result.coverage.length ? [depthTrack("Total")] : []),
        ]),
    ...(result.baf.length ? [bafTrack()] : []),
    ...(result.lohAvailable ? [lohTrack(result.loh.length === 0)] : []),
    cytobandsTrack(),
    genesTrack(),
  ];
  return {
    assembly: "hg38",
    width: "container",
    padding: { left: 10, right: 10, top: 8, bottom: 8 },
    spacing: 6,
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
    config: {
      title: { anchor: "start", fontSize: 11, color: "#364653", offset: 5 },
      axis: {
        labelFontSize: 10,
        titleFontSize: 10,
        labelColor: "#6b7c85",
        domainColor: "#ced6da",
        tickColor: "#ced6da",
        gridColor: "#e9edef",
        grid: false,
      },
      axisLocus: {
        chromGrid: true,
        chromGridColor: "#e0e6e9",
        chromGridOpacity: 0.6,
        title: null,
      },
      legend: { labelFontSize: 10, titleFontSize: 10 },
    },
    vconcat: [
      navigator(),
      {
        name: "detail",
        spacing: 10,
        params: [
          {
            name: "genomicCursor",
            persist: false,
            ruler: {
              disabled: { expr: "!showRuler" },
              encodings: ["x"],
              extent: "container",
              display: "line",
              mark: rulerMark,
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
                shadowBlur: 10,
                shadowColor: "#75adbf",
                shadowOpacity: 0.5,
                clip: false,
                measure: "inside",
              },
            },
          },
          {
            name: "pointerOverSvRegion",
            expr: "genomicCursor.values.x != null && svRegion.intervals.x != null && linearize('x', genomicCursor.values.x) >= svRegion.intervals.x[0] && linearize('x', genomicCursor.values.x) <= svRegion.intervals.x[1]",
          },
          {
            name: "rulerOpacity",
            expr: "pointerOverSvRegion ? 0 : 0.75",
            transition: { type: "lerp", halfLife: 50, epsilon: 0.01 },
          },
        ],
        resolve: { scale: { x: "shared" }, axis: { x: "shared" } },
        scales: { x: { name: "genome", domain: { param: "brush" } } },
        vconcat: tracks,
      },
    ],
  } as unknown as RootSpec;
}
