import { embed } from "@genome-spy/core/minimal";
import "./styles.css";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/svg.js";
import "@genome-spy/core/rendering/canvas.js";
import type { EmbedResult } from "@genome-spy/core/types/embedApi.js";
import type { CalibrationEstimate } from "../calibration";
import type { CalibratedCoverage, Profile, Row, WakhanResult } from "../model";
import { createSpec, layoutSignature } from "./spec";
import { GenomeSearch } from "./search";
import { bindWakhanColors, readWakhanColors, type WakhanColors } from "./theme";

export type Domain = [
  { chrom: string; pos: number },
  { chrom: string; pos: number },
];

type ViewData = {
  result: WakhanResult;
  profile: Profile;
  calibrated: CalibratedCoverage[];
};

type ViewSession = {
  host: HTMLElement;
  api: EmbedResult;
  search: GenomeSearch;
  unbindColors: () => void;
  layout: string;
  data: ViewData;
};

export class WakhanView {
  private session?: ViewSession;
  private disposed = false;

  constructor(
    private host: HTMLElement,
    private genes: Row[],
    private cytobands: Row[],
  ) {}

  get search() {
    return this.session?.search;
  }

  /** Activate data and reveal a replacement only after it is ready. */
  async show(
    result: WakhanResult,
    profile: Profile,
    calibration?: CalibrationEstimate,
    calibrated: CalibratedCoverage[] = [],
  ) {
    if (this.disposed) throw Error("The visualization has been disposed.");
    const prior = this.domain();
    const layout = layoutSignature(result, calibration);
    const data = { result, profile, calibrated };
    const current = this.session;

    if (current?.layout === layout) {
      try {
        this.publish(current.api, data);
        if (prior) await this.restoreDomain(current.api, prior);
        current.data = data;
      } catch (error) {
        this.publish(current.api, current.data);
        if (prior) await this.restoreDomain(current.api, prior);
        throw error;
      }
      return;
    }

    const host = document.createElement("div");
    host.className = "visualization-host";
    host.style.visibility = "hidden";
    this.host.append(host);
    let api: EmbedResult | undefined;
    let unbindColors: (() => void) | undefined;
    try {
      api = await embed(
        host,
        createSpec(result, readWakhanColors(host), calibration),
        { inputBindingContainer: "none" },
      );
      if (this.disposed) throw Error("The visualization has been disposed.");
      unbindColors = bindWakhanColors(
        host,
        api.params.get<WakhanColors>("wakhanColors"),
      );
      api.datasets.set("genes", structuredClone(this.genes));
      api.datasets.set("cytobands", structuredClone(this.cytobands));
      this.publish(api, data);
      if (prior) await this.restoreDomain(api, prior);
      if (this.disposed) throw Error("The visualization has been disposed.");
      const search = new GenomeSearch(api);

      if (current) this.disposeSession(current);
      this.session = { host, api, search, unbindColors, layout, data };
      host.style.visibility = "";
    } catch (error) {
      unbindColors?.();
      api?.finalize();
      host.remove();
      throw error;
    }
  }

  /** Change only CN segments; all other sample datasets remain installed. */
  async setProfile(profile: Profile) {
    const session = this.session;
    if (!session) throw Error("GenomeSpy is not ready.");
    const { result } = session.data;
    if (!result.profiles.includes(profile))
      throw Error(`The result has no ${profile} profile.`);
    if (session.data.profile === profile) return;

    const prior = this.domain();
    const publish = (value: Profile) =>
      session.api.datasets.set(
        "segments",
        structuredClone(result.segments[value]),
      );
    try {
      publish(profile);
      if (prior) await this.restoreDomain(session.api, prior);
      session.data.profile = profile;
    } catch (error) {
      publish(session.data.profile);
      if (prior) await this.restoreDomain(session.api, prior);
      throw error;
    }
  }

  domain(): Domain | undefined {
    const domain = this.session?.api
      .getScaleResolutionByName("genome")
      ?.getComplexDomain();
    return domain ? (structuredClone(domain) as Domain) : undefined;
  }

  private restoreDomain(api: EmbedResult, domain: Domain) {
    const scale = api.getScaleResolutionByName("genome");
    if (!scale) throw Error("The genome scale is missing.");
    return scale.zoomTo(domain, { duration: 0 });
  }

  private publish(api: EmbedResult, { result, profile, calibrated }: ViewData) {
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
      api.datasets.set(name, structuredClone(data));
  }

  async export(format: "png" | "svg") {
    const api = this.session?.api;
    if (!api) throw Error("GenomeSpy is not ready.");
    return format === "svg"
      ? api.imageExport.svg({
          rasterization: { maxVectorInstances: 5000 },
        })
      : api.imageExport.raster({ pixelRatio: 3 });
  }

  private disposeSession(session: ViewSession) {
    session.unbindColors();
    session.api.finalize();
    session.host.remove();
  }

  dispose() {
    this.disposed = true;
    if (this.session) this.disposeSession(this.session);
    this.session = undefined;
  }
}
