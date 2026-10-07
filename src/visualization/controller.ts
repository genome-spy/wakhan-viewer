import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/svg.js";
import "@genome-spy/core/rendering/canvas.js";
import type { EmbedResult } from "@genome-spy/core/types/embedApi.js";
import type { CalibrationEstimate } from "../dev/calibration";
import type { Profile, Row, WakhanResult } from "../model";
import { createSpec } from "./spec";

export type Domain = [
  { chrom: string; pos: number },
  { chrom: string; pos: number },
];

export class WakhanView {
  private api?: EmbedResult;
  constructor(private host: HTMLElement) {}

  async initialize(
    genes: Row[],
    cytobands: Row[],
    result: WakhanResult,
    calibration?: CalibrationEstimate,
  ) {
    this.api = await embed(this.host, createSpec(result, calibration), {
      inputBindingContainer: "none",
    });
    this.api.datasets.set("genes", structuredClone(genes));
    this.api.datasets.set("cytobands", structuredClone(cytobands));
  }

  domain(): Domain | undefined {
    const d = this.api?.getScaleResolutionByName("genome")?.getComplexDomain();
    return Array.isArray(d) &&
      typeof d[0] === "object" &&
      d[0] &&
      "chrom" in d[0]
      ? (structuredClone(d) as Domain)
      : undefined;
  }

  show(
    result: WakhanResult,
    profile: Profile,
    preserve = true,
    calibrated: Row[] = [],
  ) {
    if (!this.api) throw Error("GenomeSpy is not ready.");
    const prior = preserve ? this.domain() : undefined;
    const rows: Record<string, Row[]> = {
      segments: result.segments[profile],
      coverage: result.coverage,
      calibratedCoverage: calibrated,
      baf: result.baf,
      svLinks: result.svLinks,
      svSites: result.svSites,
      masks: result.masks,
      loh: result.loh,
    };
    for (const [name, data] of Object.entries(rows))
      this.api.datasets.set(name, structuredClone(data));
    if (prior) this.zoom(prior, 0);
  }

  zoom(domain: Domain, duration = 450) {
    this.api?.getScaleResolutionByName("genome")?.zoomTo(domain, { duration });
  }

  async export(format: "png" | "svg") {
    if (!this.api) throw Error("GenomeSpy is not ready.");
    return format === "svg"
      ? this.api.imageExport.svg({
          rasterization: { maxVectorInstances: 5000 },
        })
      : this.api.imageExport.raster({ pixelRatio: 3 });
  }

  dispose() {
    this.api?.finalize();
    this.api = undefined;
  }
}
