import { html, nothing } from "lit";
import type { Profile, WakhanResult } from "./model";
import type { CalibrationEstimate } from "./calibration";
import { renderProjectLinks } from "./projectLinks";
import zipReportUrl from "../docs/wakhan-zip-format.md?url";
import "./resultDetails.css";

export function renderResultDetails(
  active: WakhanResult,
  profile: Profile,
  estimate: CalibrationEstimate | undefined,
) {
  return html`<details
    class="details"
    @keydown=${(e: KeyboardEvent) => {
      if (e.key === "Escape")
        (e.currentTarget as HTMLDetailsElement).open = false;
    }}
  >
    <summary
      aria-label=${`About these results (${active.diagnostics.length} notes)`}
    >
      About <span>${active.diagnostics.length}</span>
    </summary>
    <div class="details-panel">
      <h2>${active.name}</h2>
      <p class="details-meta">
        GRCh38,
        ${active.segments[profile].length / (active.mode === "phased" ? 2 : 1)}
        CN intervals (${active.mode})
      </p>
      ${
        active.coverage.length
          ? html`<div class="calibration-note">
              ${
                estimate
                  ? html`
                      <strong>Estimated depth calibration</strong>
                      <p>
                        The ZIP omits Wakhan’s exact calibration and the
                        identity of the plotted solution. We infer the
                        copy/depth mapping from rounded gene values. Its
                        agreement with Wakhan’s original plot is unverified,
                        especially for subclonal profiles. Depth alignment and
                        depth-derived copy estimates are approximate.
                      </p>
                      <p class="calibration-values">
                        Depth ≈ ${estimate.offset.toFixed(3)} +
                        ${estimate.singleCopyDepth.toFixed(3)} × copies
                      </p>
                    `
                  : html`
                      <strong>Depth calibration unavailable</strong>
                      <p>
                        The ZIP omits Wakhan’s exact calibration, and a
                        consistent estimate is unavailable. Copy number and raw
                        read depth are shown in separate tracks.
                      </p>
                    `
              }
            </div>`
          : nothing
      }
      <p>Scroll to zoom, drag to pan, and use the navigator to brush.</p>
      <p>
        HP1 and HP2 are chromosome-local labels. Wakhan CN confidence is
        distinct from phasing confidence.
      </p>
      <ul>
        ${active.diagnostics.map(
          (d) => html`<li class=${d.level}>${d.message}</li>`,
        )}
      </ul>
      <p>
        ${active.svLinks.length} SV links, ${active.svSites.length} SV sites,
        ${active.baf.filter((b) => b.baf !== null).length} BAF bins.
        ${
          active.lohAvailable
            ? `${active.loh.length} LOH intervals.`
            : "LOH not supplied."
        }
        ${active.rankings.length} ranked solutions (included solution
        unspecified). VCF sample: ${active.vcfSample ?? "not supplied"}.
      </p>
      <a href=${zipReportUrl} target="_blank" rel="noopener noreferrer"
        >Wakhan ZIP format findings ↗</a
      >
      <p class="credits">
        ${renderProjectLinks()}<br />
        A viewer for
        <a href="https://github.com/KolmogorovLab/Wakhan">Wakhan</a>
        results, powered by <a href="https://genomespy.app/">GenomeSpy</a>,
        built by Kari Lavikka.
      </p>
    </div>
  </details>`;
}
