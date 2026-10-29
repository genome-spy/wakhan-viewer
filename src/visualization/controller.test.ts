import { beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { emptyResult, type Segment } from "../model";
import { WakhanView, type Domain } from "./controller";

const { embed, unbindColors } = vi.hoisted(() => ({
  embed: vi.fn(),
  unbindColors: vi.fn(),
}));
vi.mock("@genome-spy/core/minimal", () => ({ embed }));
vi.mock("@genome-spy/core/rendering/webgl.js", () => ({}));
vi.mock("@genome-spy/core/rendering/svg.js", () => ({}));
vi.mock("@genome-spy/core/rendering/canvas.js", () => ({}));
vi.mock("./search", () => ({ GenomeSearch: class {} }));
vi.mock("./theme", () => ({
  readWakhanColors: () => ({}),
  bindWakhanColors: () => unbindColors,
  themeColor: (name: string) => ({ expr: `wakhanColors.${name}` }),
}));

class Host {
  className = "";
  style = { visibility: "" };
  children: Host[] = [];
  parent?: Host;

  append(child: Host) {
    this.children.push(child);
    child.parent = this;
  }

  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
  }
}

const domain: Domain = [
  { chrom: "chr17", pos: 39000000 },
  { chrom: "chr17", pos: 40000000 },
];

function api() {
  const scale = {
    getComplexDomain: vi.fn(() => domain),
    zoomTo: vi.fn(async () => {}),
  };
  return {
    scale,
    getScaleResolutionByName: () => scale,
    datasets: { set: vi.fn() },
    params: { get: vi.fn() },
    finalize: vi.fn(),
  };
}

function profileResult() {
  const result = emptyResult("profiles.zip");
  result.profiles = ["integer", "subclonal"];
  const segment: Segment = {
    chrom: "chr1",
    start: 0,
    end: 100,
    haplotype: "HP1",
    copyNumber: 2,
    medianCoverage: 32,
    sourceCopyNumber: 2,
    sourceMedianCoverage: 32,
    confidence: 0.9,
    status: "reported",
    subclonal: false,
    breakpointIds: "",
  };
  result.segments.integer = [segment];
  result.segments.subclonal = [
    { ...segment, copyNumber: 2.5, subclonal: true },
  ];
  return result;
}

function setup() {
  const host = document.createElement("div");
  const view = new WakhanView(host, [], []);
  onTestFinished(() => view.dispose());
  return { host, view };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("document", { createElement: () => new Host() });
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
});

it("reuses compatible embeds and restores the current locus once", async () => {
  const current = api();
  embed.mockResolvedValue(current);
  const { view } = setup();
  await view.show(emptyResult("first.zip"), "integer");
  const search = view.search;
  await view.show(emptyResult("second.zip"), "integer");

  expect(embed).toHaveBeenCalledTimes(1);
  expect(view.search).toBe(search);
  expect(current.scale.zoomTo).toHaveBeenCalledExactlyOnceWith(domain, {
    duration: 0,
  });
  expect(current.finalize).not.toHaveBeenCalled();
});

it("keeps the current embed usable when replacement initialization fails", async () => {
  const current = api();
  const failed = api();
  failed.datasets.set.mockImplementation(() => {
    throw Error("Dataset initialization failed");
  });
  embed.mockResolvedValueOnce(current).mockResolvedValueOnce(failed);
  const { host, view } = setup();
  await view.show(emptyResult("first.zip"), "integer");
  const search = view.search;
  const next = emptyResult("different-layout.zip");
  next.lohAvailable = true;

  await expect(view.show(next, "integer")).rejects.toThrow(
    "Dataset initialization failed",
  );
  expect(view.search).toBe(search);
  expect(view.domain()).toEqual(domain);
  expect(current.finalize).not.toHaveBeenCalled();
  expect(failed.finalize).toHaveBeenCalledOnce();
  expect(host.children).toHaveLength(1);
});

it("reveals a successful replacement after publication and locus restoration", async () => {
  const current = api();
  const next = api();
  embed.mockResolvedValueOnce(current).mockResolvedValueOnce(next);
  const { host, view } = setup();
  await view.show(emptyResult("first.zip"), "integer");
  const oldSearch = view.search;
  const result = emptyResult("different-layout.zip");
  result.lohAvailable = true;
  await view.show(result, "integer");

  expect(next.scale.zoomTo).toHaveBeenCalledExactlyOnceWith(domain, {
    duration: 0,
  });
  expect(current.finalize).toHaveBeenCalledOnce();
  expect(view.search).not.toBe(oldSearch);
  expect(host.children).toHaveLength(1);
  expect(host.children[0]).toMatchObject({ style: { visibility: "" } });
});

it("removes a failed first embed so another activation can be attempted", async () => {
  embed.mockRejectedValueOnce(Error("Cannot initialize"));
  const { host, view } = setup();
  await expect(view.show(emptyResult("first.zip"), "integer")).rejects.toThrow(
    "Cannot initialize",
  );
  expect(host.children).toHaveLength(0);
  expect(view.search).toBeUndefined();

  embed.mockResolvedValueOnce(api());
  await view.show(emptyResult("second.zip"), "integer");
  expect(view.search).toBeDefined();
});

it("cleans up an embed that finishes initializing after disposal", async () => {
  const pending = api();
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => (finish = resolve));
  embed.mockImplementationOnce(async () => {
    await gate;
    return pending;
  });
  const { host, view } = setup();
  const activation = view.show(emptyResult("first.zip"), "integer");
  view.dispose();
  finish();

  await expect(activation).rejects.toThrow("disposed");
  expect(pending.finalize).toHaveBeenCalledOnce();
  expect(host.children).toHaveLength(0);
  expect(view.search).toBeUndefined();
});

it("changes only segments on profile switches and retains the locus", async () => {
  const current = api();
  embed.mockResolvedValue(current);
  const { view } = setup();
  const result = profileResult();
  await view.show(result, "integer");
  current.datasets.set.mockClear();

  await view.setProfile("subclonal");
  expect(current.datasets.set).toHaveBeenCalledExactlyOnceWith(
    "segments",
    result.segments.subclonal,
  );
  expect(current.scale.zoomTo).toHaveBeenCalledExactlyOnceWith(domain, {
    duration: 0,
  });
  expect(result.segments.integer[0].copyNumber).toBe(2);
  expect(embed).toHaveBeenCalledTimes(1);
});

it("restores the active profile if a compatible result publication fails", async () => {
  const current = api();
  embed.mockResolvedValue(current);
  const { view } = setup();
  const result = profileResult();
  await view.show(result, "integer");
  await view.setProfile("subclonal");
  const search = view.search;
  current.datasets.set.mockClear();
  current.scale.zoomTo.mockClear();
  current.datasets.set
    .mockImplementationOnce(() => {})
    .mockImplementationOnce(() => {
      throw Error("Cannot replace coverage");
    });

  await expect(view.show(emptyResult("next.zip"), "integer")).rejects.toThrow(
    "Cannot replace coverage",
  );
  expect(view.search).toBe(search);
  expect(
    current.datasets.set.mock.calls.slice(2).map(([name]) => name),
  ).toEqual([
    "segments",
    "coverage",
    "calibratedCoverage",
    "baf",
    "svLinks",
    "svSites",
    "masks",
    "loh",
  ]);
  expect(current.datasets.set.mock.calls[2]).toEqual([
    "segments",
    result.segments.subclonal,
  ]);
  expect(current.scale.zoomTo).toHaveBeenCalledExactlyOnceWith(domain, {
    duration: 0,
  });
});
