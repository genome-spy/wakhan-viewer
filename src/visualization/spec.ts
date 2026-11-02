import type { RootSpec } from "@genome-spy/core/spec/root.js";
import type {
  LayerSpec,
  UnitSpec,
  VConcatSpec,
  ViewSpec,
} from "@genome-spy/core/spec/view.js";
import type {
  PositionDef,
  Position2Def,
  StringFieldDef,
} from "@genome-spy/core/spec/channel.js";
import type {
  RulerMarkConfig,
  RulerParameter,
} from "@genome-spy/core/spec/parameter.js";
import type { CalibrationEstimate } from "../calibration";
import type { WakhanResult } from "../model";
import recipeSvSpec from "./specs/structural-variants.json";
import { themeColor, type WakhanColors } from "./theme";

const locus = (pos: string): PositionDef => ({
  chrom: "chrom",
  pos,
  type: "locus",
  band: 0,
});
const x = locus("start");
const x2: Position2Def = { chrom: "chrom", pos: "end", band: 0 };
const tip = (
  field: string,
  title: string,
  format?: string,
): StringFieldDef => ({
  field,
  title,
  ...(format ? { format } : {}),
});

const rulerMark: RulerMarkConfig = {
  stroke: themeColor("textMuted"),
  strokeWidth: 1,
  strokeDash: [3, 3],
  opacity: { expr: "rulerOpacity" },
};

function horizontalRuler(name: string): RulerParameter {
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

function maskLayer(): UnitSpec {
  return {
    data: { name: "masks" },
    mark: {
      type: "rect",
      fill: themeColor("surfaceMuted"),
      fillOpacity: 0,
      stroke: themeColor("grid"),
      strokeWidth: 1,
      hatch: "diagonal",
      clip: "x",
    },
    encoding: { x, x2, tooltip: [tip("reason", "Availability")] },
  };
}

function navigator(): LayerSpec {
  return {
    name: "overview",
    height: 20,
    title:
      "Genome navigator | double-click, then drag to brush; scroll to resize; drag selection to move",
    resolve: { scale: { x: "excluded" } },
    data: { lazy: { type: "axisGenome", channel: "x" } },
    view: { stroke: themeColor("border"), strokeZindex: 10 },
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
            scale: {
              domain: [true, false],
              range: [themeColor("surfaceMuted"), themeColor("surface")],
            },
            legend: null,
          },
        },
      },
      {
        mark: {
          type: "text",
          size: 11,
          color: themeColor("textMuted"),
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
            stroke: themeColor("accentStrong"),
            strokeWidth: 1.5,
            strokeOpacity: 0.85,
            fill: themeColor("accent"),
            fillOpacity: 0.02,
            shadowBlur: 10,
            shadowColor: themeColor("accent"),
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

function sitesTrack(withLinks: boolean): UnitSpec {
  return {
    name: "single-sites",
    height: withLinks ? 6 : 18,
    ...(withLinks ? {} : { title: "Insertions and single breakends" }),
    data: { name: "svSites" },
    params: [{ name: "svSiteSelect", select: "point", persist: false }],
    mark: {
      type: "point",
      shape: "triangle-up",
      size: 18,
      clip: "x",
    },
    encoding: {
      x: { chrom: "chrom1", pos: "start1", type: "locus", band: 0 },
      y: { value: 0.5 },
      // Legend category selection requires unconditional color; dim by opacity.
      opacity: {
        condition: [
          {
            test: { not: { param: "svClassSelect", empty: true } },
            value: 0,
          },
          {
            test: {
              param: { or: ["svSiteSelect", "svRegion"] },
              empty: true,
            },
            value: 0.7,
          },
        ],
        value: 0.15,
      },
      tooltip: [
        tip("svClass", "Wakhan SV class"),
        tip("sourceSvType", "Source SVTYPE"),
        tip("variantId", "Original variant ID"),
        tip("orientation", "Strands"),
        tip("haplotype", "Source HP"),
        tip("phaseSet", "Phase set"),
        tip("genotype", "Target genotype"),
        tip("variantReads", "Variant reads"),
        tip("referenceReads", "Reference reads"),
        tip("vaf", "VAF"),
        tip("haplotypeVaf", "Haplotype VAF"),
        tip("detailedType", "Severus detail"),
      ],
    },
  };
}

function cnTrack(
  hp: "HP1" | "HP2" | "Total",
  calibration?: CalibrationEstimate,
): LayerSpec {
  const ink = themeColor(hp === "HP1" ? "hp1" : hp === "HP2" ? "hp2" : "total");
  const segment: UnitSpec = {
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
        value: themeColor("textSubtle"),
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
  const layers: UnitSpec[] = [
    maskLayer(),
    {
      data: { values: [{}] },
      mark: { type: "rule", color: themeColor("grid"), clip: false, y: 0 },
    },
  ];
  if (!calibration || hp === "Total")
    return {
      name: `cn-${hp}`,
      height: { grow: 1 },
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
          size: { expr: "min(pow(zoomLevel(), 2) + 0.5, 100)" },
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
              value: themeColor(hp === "HP1" ? "depthHp1" : "depthHp2"),
            },
            value: themeColor("border"),
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

function depthTrack(hp: "HP1" | "HP2" | "Total"): UnitSpec {
  const field = hp === "HP1" ? "hp1" : hp === "HP2" ? "hp2" : "total";
  const ink = themeColor(
    hp === "HP1" ? "depthHp1" : hp === "HP2" ? "depthHp2" : "depthTotal",
  );
  return {
    name: `depth-${hp}`,
    height: { grow: 0.8 },
    title: `${hp} | raw binned read depth`,
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
        value: themeColor("border"),
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

function bafTrack(): UnitSpec {
  return {
    name: "baf",
    height: { grow: 0.7 },
    title: "Folded BAF | grey zeros have unknown SNP support",
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
            range: [themeColor("textSubtle"), themeColor("total")],
          },
          legend: null,
        },
        value: themeColor("border"),
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

function lohTrack(empty: boolean): LayerSpec {
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
            condition: {
              param: "svRegion",
              empty: true,
              value: themeColor("loh"),
            },
            value: themeColor("textSubtle"),
          },
          stroke: {
            condition: {
              param: "svRegion",
              empty: true,
              value: themeColor("hp2"),
            },
            value: themeColor("textSubtle"),
          },
          tooltip: [tip("feature", "Feature")],
        },
      },
    ],
  };
}

function cytobandsTrack(): LayerSpec {
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
                themeColor("cytobandGneg"),
                themeColor("cytobandGpos25"),
                themeColor("cytobandGpos50"),
                themeColor("cytobandGpos75"),
                themeColor("cytobandGpos100"),
                themeColor("cytobandAcen"),
                themeColor("cytobandGvar"),
                themeColor("cytobandStalk"),
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
              range: stains.map((stain) =>
                themeColor(
                  stain === "gpos100" ? "cytobandTextInverse" : "cytobandText",
                ),
              ),
            },
            legend: null,
          },
        },
      },
    ],
  };
}

function genesTrack(): LayerSpec {
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
        encoding: { search: { field: "symbol" } },
        mark: {
          type: "rect",
          color: themeColor("textMuted"),
          y: 0.1,
          y2: 0.3,
          minWidth: 2,
        },
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
          color: themeColor("textMuted"),
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

export function layoutSignature(
  result: WakhanResult,
  calibration?: CalibrationEstimate,
): string {
  return [
    result.mode,
    !!result.svLinks.length,
    !!result.svSites.length,
    !!result.coverage.length,
    !!result.baf.length,
    result.lohAvailable,
    result.lohAvailable && result.loh.length === 0,
    calibration?.offset,
    calibration?.singleCopyDepth,
  ].join(":");
}

export function createSpec(
  result: WakhanResult,
  colors: WakhanColors,
  estimate?: CalibrationEstimate,
): RootSpec {
  const mode = result.mode;
  const calibration =
    mode === "phased" && result.coverage.length ? estimate : undefined;
  // JSON imports widen discriminant literals; assert only at the import boundary.
  const svSpec = structuredClone(recipeSvSpec) as VConcatSpec;
  const tracks: ViewSpec[] = [
    ...(result.svLinks.length || result.svSites.length
      ? [
          {
            ...svSpec,
            vconcat: [
              ...(result.svLinks.length ? svSpec.vconcat : []),
              ...(result.svSites.length
                ? [sitesTrack(!!result.svLinks.length)]
                : []),
            ],
          },
        ]
      : []),
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
              vconcat: [
                cnTrack("HP1", calibration),
                cnTrack("HP2", calibration),
              ],
            } satisfies VConcatSpec,
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
    height: "container",
    padding: { left: 10, right: 10, top: 8, bottom: 8 },
    spacing: 6,
    params: [
      { name: "wakhanColors", value: colors, persist: false },
      {
        name: "defaultThemeColors",
        expr: `{
          foreground: wakhanColors.text,
          stroke: wakhanColors.border,
          grid: wakhanColors.grid,
          chromosomeTick: wakhanColors.textMuted,
          symbolStroke: wakhanColors.textMuted,
          background: wakhanColors.surface
        }`,
        persist: false,
      },
      { name: "brush" },
      { name: "showRuler", value: true },
    ],
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
      title: {
        anchor: "start",
        fontSize: 11,
        color: themeColor("text"),
        offset: 5,
      },
      axis: {
        labelFontSize: 10,
        titleFontSize: 10,
        labelColor: themeColor("textMuted"),
        grid: false,
      },
      axisLocus: {
        chromGrid: true,
        chromGridColor: themeColor("border"),
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
                stroke: themeColor("accentStrong"),
                strokeOpacity: 0.65,
                strokeWidth: 1,
                fill: themeColor("accent"),
                fillOpacity: 0.01,
                shadowBlur: 10,
                shadowColor: themeColor("accent"),
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
  };
}
