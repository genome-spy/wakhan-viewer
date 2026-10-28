import { expect, it, onTestFinished, vi } from "vitest";
import "@genome-spy/core/data/sources/lazy/registerCoreLazySources.js";
import { createHeadlessEngine } from "@genome-spy/core/genomeSpy/headlessBootstrap.js";
import { createViewMutationApi } from "@genome-spy/core/view/viewMutationApi.js";
import type { ScaleResolutionApi } from "@genome-spy/core/types/scaleResolutionApi.js";
import { genes, cytobands } from "../annotations";
import { emptyResult } from "../model";
import { createSpec } from "./spec";
import { wakhanColorNames, type WakhanColors } from "./theme";
import { GenomeSearch } from "./search";

async function setup() {
  const colors = Object.fromEntries(
    wakhanColorNames.map((name) => [name, "rgb(12, 34, 56)"]),
  ) as WakhanColors;
  const spec = createSpec(emptyResult("search.zip"), colors);
  spec.datasets = { ...spec.datasets, genes, cytobands };
  const { view: root } = await createHeadlessEngine(spec);
  onTestFinished(() => root.disposeSubtree());

  // The headless facade uses the same view runtime as a browser embed.
  const views = createViewMutationApi({ viewRoot: root } as Parameters<
    typeof createViewMutationApi
  >[0]);
  let scale: ScaleResolutionApi | undefined;
  root.visit((view) => {
    const candidate = view.resolutions.scale.x;
    if (candidate?.name === "genome") scale = candidate;
  });
  if (!scale) throw Error("Missing genome scale in the test spec.");
  const search = new GenomeSearch({
    views,
    getScaleResolutionByName: (name) => (name === "genome" ? scale : undefined),
  });
  return { search, scale, root };
}

it("navigates coordinates with exact endpoints and updates the navigator brush", async () => {
  const { search, scale, root } = await setup();
  await search.search("chr1:100-200");
  expect(scale.getDomain()).toEqual([99, 200]);
  expect(search.region()).toBe("chr1:100-200");
  expect(root.paramRuntime.findValue("brush").intervals.x).toEqual([99, 200]);

  await search.search("chr1:1");
  expect(scale.getDomain()).toEqual([0, 1]);
  expect(search.region()).toBe("chr1:1-1");
  await search.search("chr1:248,956,422-chr2:1");
  expect(scale.getDomain()).toEqual([248956421, 248956423]);
  expect(search.region()).toBe("chr1:248,956,422-chr2:1");
});

it("searches full gene spans once, regardless of visible labels", async () => {
  const { search, scale } = await setup();
  expect(await search.search(" tp53 ")).toEqual([]);
  expect(scale.getDomain()).toEqual([2498447075, 2498469959]);
  expect(search.region()).toBe("chr17:7,666,514-7,689,397");
});

it("keeps help examples readable while a disposed view is being replaced", async () => {
  const { search, root } = await setup();
  root.disposeSubtree();
  expect(search.examples).toHaveLength(3);
  expect(search.examples).toContain("SKI");
});

it("offers distinct X/Y loci without navigating until a locus is chosen", async () => {
  const { search, scale } = await setup();
  const before = scale.getDomain();
  const matches = await search.search("CRLF2");
  expect(matches.map(({ datum }) => datum.chrom)).toEqual(["chrX", "chrY"]);
  expect(scale.getDomain()).toEqual(before);
  await search.navigate(matches[1]);
  expect(search.region()).toBe("chrY:1,188,274-1,214,865");
});

it("reports invalid input and missing genes without changing the region", async () => {
  const { search, scale } = await setup();
  await search.search("chr8");
  const before = scale.getDomain();
  for (const [query, message] of [
    ["", /Enter a genomic coordinate/],
    ["chr1:200-100", /reversed/],
    ["chr1:999999999", /bounds/],
    ["not-a-gene", /No cancer-driver gene/],
  ] as const) {
    await expect(search.search(query)).rejects.toThrow(message);
    expect(scale.getDomain()).toEqual(before);
  }
});

it("debounces coordinate updates and cancels pending updates on unsubscribe", async () => {
  const { search } = await setup();
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const listener = vi.fn(() => search.region());
  const unsubscribe = search.subscribe(listener);

  await search.search("chr8");
  vi.advanceTimersByTime(40);
  await search.search("chr9");
  vi.advanceTimersByTime(59);
  expect(listener).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener).toHaveReturnedWith("chr9:1-138,394,717");

  listener.mockClear();
  await search.search("chr10");
  unsubscribe();
  vi.advanceTimersByTime(60);
  expect(listener).not.toHaveBeenCalled();
  await search.search("chr11");
  vi.advanceTimersByTime(60);
  expect(listener).not.toHaveBeenCalled();
});
