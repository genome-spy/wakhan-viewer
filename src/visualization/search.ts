import {
  formatCoordinates,
  parseCoordinates,
} from "@genome-spy/core/coordinates";
import { createDatumSearch } from "@genome-spy/core/search";
import type { CoordinateLocus } from "@genome-spy/core/types/coordinates.js";
import type { EmbedResult } from "@genome-spy/core/types/embedApi.js";
import type { DatumSearchMatch } from "@genome-spy/core/types/search.js";

export class GenomeSearch {
  /** Reference annotations stay fixed for the lifetime of this embed. */
  readonly examples: readonly string[];
  private readonly scale;
  private readonly datums;
  private readonly genes;

  constructor(api: Pick<EmbedResult, "views" | "getScaleResolutionByName">) {
    const scale = api.getScaleResolutionByName("genome");
    if (!scale) throw Error("The genome scale is missing.");
    this.scale = scale;
    this.datums = createDatumSearch(api.views);
    this.genes = api.views.get({ scope: [], view: "genes" });
    this.examples = this.datums
      .listSearchableViews({ view: this.genes, exampleLimit: 3 })
      .flatMap(({ fields }) => fields.flatMap(({ examples }) => examples));
  }

  region() {
    const [begin, end] = this.scale.getComplexDomain() as [
      CoordinateLocus,
      CoordinateLocus,
    ];
    // Core's locus domain snapshots have an inclusive upper endpoint.
    return formatCoordinates([begin, { ...end, pos: end.pos + 1 }]);
  }

  subscribe(listener: () => void) {
    // Match App's trailing debounce so coordinates settle after navigation.
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onDomain = () => {
      clearTimeout(timeout);
      timeout = setTimeout(listener, 60);
    };
    this.scale.addEventListener("domain", onDomain);
    return () => {
      this.scale.removeEventListener("domain", onDomain);
      clearTimeout(timeout);
    };
  }

  /** Navigates a unique result; multiple gene loci are returned for a choice. */
  async search(term: string): Promise<DatumSearchMatch[]> {
    const query = term.trim();
    if (!query)
      throw Error("Enter a genomic coordinate or cancer-driver gene.");

    const parsed = parseCoordinates(query, this.scale.getAssembly());
    switch (parsed.kind) {
      case "invalid-coordinate":
        throw Error(parsed.message);
      case "coordinate": {
        const [begin, end] = parsed.interval;
        // Convert the parser's half-open interval to Core's navigation convention.
        await this.scale.zoomTo([begin, { ...end, pos: end.pos - 1 }], {
          duration: 450,
        });
        return [];
      }
      case "not-coordinate": {
        const { matches, truncated } = this.datums.findDatums(query, {
          view: this.genes,
          limit: 10,
          target: "zoomable",
        });
        if (!matches.length)
          throw Error(`No cancer-driver gene matches “${query}”.`);
        if (truncated)
          throw Error("Too many matching loci. Enter a genomic coordinate.");
        if (matches.length > 1) return matches;

        await this.navigate(matches[0]);
        return [];
      }
      default:
        throw Error("Unexpected coordinate search result.");
    }
  }

  async navigate(match: DatumSearchMatch) {
    const target = match.targets.find(
      ({ channel, kind, zoomable }) =>
        channel === "x" && kind === "locus" && zoomable,
    );
    if (!target) throw Error("The gene has no navigable genomic interval.");

    const [begin, end] = target.interval;
    const padding = (end - begin) * 0.1;
    const size = target.scale
      .getAssembly()
      .contigs.reduce((sum, contig) => sum + contig.size, 0);
    await target.scale.zoomTo(
      [Math.max(0, begin - padding), Math.min(size, end + padding) - 1],
      { duration: 450 },
    );
  }
}
