# Wakhan ZIP format findings and requests

This is a working format report for discussions with Wakhan's authors. It records
what the current Explorer can read, what the two supplied archives actually say,
and the small additions that would remove uncertainty. The observations below
come from the Wakhan checkout at `38ca70e3df821837e97b6489101f2fccc86eb503`
and these two local ZIPs:

| Archive | SHA-256 | Observed contents |
| --- | --- | --- |
| `HCC1937_plots_data.zip` | `2ad40c05d58fdc9ff9065785829b611505f6001757f558f188e6d5cf57de7526` | 8 flat members; 461 integer and 461 subclonal CN intervals; 60,630 coverage and BAF rows; 1,018 VCF records |
| `HCC1954_plots_data.zip` | `c867e910c12af55ad02aafe8eb560874c07ebe3d9237fe918457175f7d7cd1df` | 8 flat members; 1,271 integer and 1,271 subclonal CN intervals; 60,630 coverage and BAF rows; 1,926 VCF records |

Both archives contain `integer_profile.bed`, `subclonal_profile.bed`,
`phase_corrected_coverage.csv`, `baf.csv`, `genes_copynumber_states.bed`,
`grch38.cen_coord.curated.bed`, `severus_somatic.vcf`, and
`solutions_ranks.tsv`. The files have no schema version or manifest.
The observations in this section are **observed**, not yet author-confirmed
format guarantees.

## What the Explorer does today

- The two phased archives are imported and rendered in Chrome through a Vite
  dev server. The parser also recognizes Wakhan's single-track CN writer header
  and optional `<genome-name>_loh_segments.csv`; those paths have only synthetic
  tests because neither supplied ZIP contains them and the current ZIP exporter
  skips the `--without-phasing` branch.
- The app reads only recognized members. It supports flat archives and one
  enclosing folder, and rejects duplicate recognized filenames. fflate extracts
  entries in a Worker. A primary CN profile is required; optional tables can
  be absent or report a diagnostic. ZIP-origin rows enter GenomeSpy through
  named datasets.
- The observed CN and coverage convention has adjacent coordinates such as
  `0–50000` then `50001–100000`. The app maps these to half-open intervals
  `[0,50000)` and `[50000,100000)` by subtracting one from each positive start.
  VCF POS is mapped separately as `POS-1`. The centromere BED and LOH BED are
  read as half-open, with a `1` start in the centromere BED mapped to zero.
- A VCF with all GRCh38 primary chromosome lengths provides reference
  validation. Without a VCF, the exact `grch38.cen_coord.curated.bed` member
  identifies the currently supported reference. NCG genes and cytobands are
  only supplied for GRCh38.
- The `3300` CN/depth sentinel is withheld from CN plots. Subclonal sentinel
  intervals, when present, form the displayed mask. In each sample archive,
  exactly 46 integer-profile zero rows match a sentinel interval, chromosome,
  and haplotype; those matching rows are also masked. BAF `3300` is unavailable,
  while BAF zero remains visible with unknown SNP support. LOH intervals are
  clipped against the displayed mask. A zero CN outside a known mask remains a
  reported zero because the current files do not say more.
- SVs are parsed with GenomeSpy Core's eager VCF reader. The app selects the
  sole target sample, filters to PASS/non-reference calls, validates reciprocal
  BND mates, and shows paired links plus insertion and single-breakend sites.
  Failed optional VCF parsing is reported without discarding valid CN data.

## Requests to add to Wakhan ZIPs

| Priority / status | Gap and effect | Exact addition requested | Current Explorer behavior |
| --- | --- | --- | --- |
| Essential · proposed | `solutions_ranks.tsv` lists multiple solutions but the ZIP does not identify the one enclosed. HCC1954 lists two ranks and HCC1937 lists three. We cannot label the plotted ploidy, purity, rank, or confidence safely. | In a small manifest, include `included_solution_id` matching `repository_name`, `solution_rank`, and the associated `ploidy`, `dna_purity`, `cell_purity`, and `confidence`, plus the target VCF sample name. | Shows the rank table count but does not assign any row to the plotted CN. |
| Essential for calibrated overlay · proposed | The plot's read-depth-to-CN calibration is not exported. The selected Plotly axis cannot be recreated exactly from the ZIP. | Export the exact `cen_out` vector for the enclosed solution and profile, with its CN labels and units. For the current phased integer path, `cen_out[i] = normal_coverage + i * single_copy_cov`; include the original floating-point values rather than values rounded for display. | Keeps CN and raw depth in separate tracks by default. An opt-in development preview estimates calibration from the rounded gene table and layers the two series. |
| Essential for arbitrary modes · proposed | No independent reference assembly declaration or complete contig dictionary. The current VCF happens to contain GRCh38 primary lengths. Modes without VCF may not be identifiable. | `reference_assembly` (name and accession/build), ordered `{name,length}` contigs, and analyzed contigs in the manifest. | Validates the current VCF dictionary against GRCh38 or relies on the exact GRCh38 centromere member name. Rejects unresolved references. |
| Essential for reliable coordinates · proposed | The files mix BED-like and CSV-like conventions, and the adjacency convention is inferred from observed rows. | Document coordinate base and interval closure for each member and ZIP schema version; preferably export new tables as zero-based half-open intervals. State the meaning of VCF END and BAF start explicitly. | Uses the bounded observed conversions above. Unknown schemas are rejected. |
| Essential for missingness · proposed | CN/depth `3300` is a sentinel. The integer profile can contain zero placeholders in masked regions; a missing haplotype can also be zero-filled. A true zero and an unavailable measurement cannot always be distinguished. | Export per-series, per-row `status` (`reported`, `masked`, `unavailable`) and explicit mask intervals with series/profile scope. Preserve genuine zero measurements. | Excludes known sentinel values, uses subclonal sentinel intervals for masks, and retains other zero values with a caution. |
| High · proposed | BAF has only chromosome, start, and a value. `3300` means unavailable; zero has unknown SNP support; interval end and sample support are absent. | Include `[start,end)`, folded/unfolded semantics, support SNP count, and a status/reason for empty or filtered bins. | Joins BAF to coverage by chromosome and original start; shows unmatched values as positions, and grey zeros as uncertain. |
| High · proposed | There is no archive-level distinction between no LOH calls and LOH not computed. The 6-column coverage files have an all-zero `unphased` series in both examples, with unclear availability semantics. | Declare each optional track as `present`, `empty`, `not_computed`, or `not_applicable`; state whether the unphased depth series was computed and what zero means. | Omits absent LOH. Hides the unphased series in phased mode. |
| High · proposed | The inspected ZIP exporter requires phased outputs and skips `--without-phasing`, even though Wakhan has a single-track CN writer. Modes cannot be verified from real ZIPs. | Produce representative ZIPs for phased, unphased, breakpoint, half-ploidy, and relevant subclonal/LOH modes, with stable member roles and optional status. | Supports the observed phased files and the source-derived single-track header in synthetic tests. Other plot-only diagnostics are pending export data. |
| High · proposed | There is no reproducible machine-readable format/version contract. Member roles are only encoded in filenames. | Add a small `manifest.json` with `schema_version`, Wakhan version and build commit, run mode flags, member roles/paths, table schema IDs, solution identity, reference, and availability statuses. | Supports the current observed layout explicitly. |

Suggested minimal manifest shape (illustrative; names can be agreed with authors):

```json
{
  "schema_version": 1,
  "wakhan_version": "0.5.0",
  "wakhan_commit": "...",
  "mode": { "phasing": "phased", "profile": "integer" },
  "included_solution_id": "solution_...",
  "solution_rank": 1,
  "reference": { "assembly": "GRCh38", "contigs": [{ "name": "chr1", "length": 248956422 }] },
  "coordinates": { "integer_profile.bed": "0-based-half-open" },
  "calibration": { "profile": "integer", "series": "HP1", "depth_offset": 2.0, "single_copy_depth": 16.84, "unit": "reads per bin" },
  "members": { "loh": { "path": "sample_loh_segments.csv", "status": "not_computed" } }
}
```

The calibration numbers above are illustrative and **must not be treated as
HCC1954 plot metadata**. In particular, the current `solutions_ranks.tsv` does
not establish which solution's centers appear in the ZIP.

## Where Wakhan computes and stores plot calibration

These findings are from the checked-out Wakhan source at the commit named
above. They describe the implementation, not an author-confirmed file-format
contract.

1. `peak_detection_optimization` in `src/cna/optimization.py` calls
   `cn_one_inference` on coverage segments. It sets `single_copy_cov` to the
   inferred CN=1 peak (or `--first-copy` override) and makes an initial
   evenly spaced `centers` vector. It also computes an alternative spacing
   when it detects a half peak.
2. For phased output, `copy_numbers_assignment_haplotypes` in `src/main.py`
   searches candidate `normal_coverage` values in 0.1-depth increments. For
   each candidate, it builds
   `cen_out[i] = normal_coverage + i * single_copy_cov`. Each selected
   solution retains its own vector as `solution[2]`. Here
   `normal_coverage` is the **haplotype-level depth offset**; Wakhan doubles
   it separately when calculating diploid-normal purity.
3. Wakhan passes the selected `cen_out` to the integer-profile BED and gene
   writers and to `copy_number_plots_genome` or its breakpoint variant. The
   Plotly code places CN labels at these depth positions (`tickvals=centers`)
   on an axis overlaid with binned read depth. In the subclonal branch, Wakhan
   converts the centers to integers before creating the subclonal Plotly plot,
   so the exact plotted axis for that profile can differ from the integer
   profile. The unphased path uses the initial `centers` directly and skips
   the phased offset search.
4. The full vector is logged as `Normal optimized clusters means` to
   `wakhan.log` at DEBUG level. Wakhan also saves Plotly HTML containing its
   axis tick positions. Neither the log nor HTML is included by
   `create_hiscanner_plot_data_archives` in `src/output/compressed_output.py`:
   its ZIP writer adds the profile BEDs, gene table, coverage, BAF, optional
   LOH, centromeres, VCF, and solution ranking only. Both supplied ZIPs have
   exactly these eight members and no calibration file.

The smallest upstream change is to write the selected solution's unrounded
`cen_out` and CN labels to a small machine-readable member at the point where
the corresponding BED and Plotly HTML are produced, then include that member
and the solution ID in its ZIP. If integer and subclonal plots retain different
center vectors, export both explicitly. The current `solutions_ranks.tsv`
alone cannot recover either vector: it lacks the peak spacing and offset.

## Development calibration experiment

The gene table has rounded `adjusted_coverage_hp1/hp2` values paired with
integer `hp1_state/hp2_state`. A preliminary fit of distinct, unmasked
CN/depth pairs gave these indicative results:

| Archive | States | Estimated slope | Estimated offset | Largest absolute residual |
| --- | --- | ---: | ---: | ---: |
| HCC1937 | 0–5 | 23.3763 | 1.6010 | 0.0039 |
| HCC1954 | 0, 1, 2, 3, 5, 8, 12 | 16.8376 | 1.9993 | 0.0045 |

Those residuals fit the two-decimal rounding in the gene writer, but they do
not prove that the interactive Plotly plot used those coefficients. Masked
genes must be excluded. In particular, SPIN4 has apparent state 141/196 and
adjusted depth near 3300 in the sample archives. The opt-in development
script and Vite preview show an **Estimated calibration — development** overlay
after a rounding and leave-one-state-out stability check. The upstream
calibration request remains open until exact plot parameters are exported and
checked across solutions and high/fractional states.

## Acceptance checks for an author-supplied revision

1. A manifest identifies the exact solution and selected target sample; the
   reported rank and metadata match the directory and plotted solution.
2. Each numeric field has units, coordinate semantics, and availability status.
   A reported zero, masked interval, and unavailable value have distinct rows.
3. The calibration recreates Wakhan's own plot axes for integer, fractional,
   high-CN, and masked examples from the same solution.
4. Phased and unphased ZIP fixtures cover present, empty, and absent optional
   tracks. The Explorer renders a single total-CN series for unphased output.
5. The reference dictionary permits chromosome placement without an SV VCF.

Please include the producing Wakhan commit, the chosen ZIP, and a small row
example when confirming or changing any of these observations. The report is
updated from real exporter revisions, rather than adding silent inference rules
to the browser importer.
