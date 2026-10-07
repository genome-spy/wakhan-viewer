# Wakhan Viewer

> [!IMPORTANT]
> Wakhan Viewer is still a **work in progress**. The interface and support for
> Wakhan ZIP formats are still evolving.

Wakhan Viewer opens [Wakhan](https://github.com/KolmogorovLab/Wakhan/) results
ZIP in the browser and allows viewing its copy-number calls, read depth,
structural variants, and folded BAF on linked genomic tracks.

The app adapts the visual design of the [HCC1954 Wakhan GenomeSpy
recipe](https://github.com/genome-spy/genomespy-dataset-recipes/tree/main/recipes/hcc1954-wakhan-explorer)
and the simple file-opening workflow of [SegmentModel
Spy](https://github.com/genome-spy/segment-model-spy). It uses
[GenomeSpy](https://genomespy.app/) for visualization.

## Run locally

Requires a current Node.js release and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, usually http://localhost:5173/. Load the HCC1937
example, choose one or more ZIPs, or drag them onto the page.

```sh
npm run typecheck
npm run test:run
npm run build
npm run preview
```

## Supported Wakhan Features

The main phased GRCh38 tracks have been checked with the HCC1937 and HCC1954
ZIPs. Compared with Wakhan's Plotly plots, the viewer currently supports:

- **Haplotype-specific copy number:** separate HP1/HP2 tracks, switching between
  integer and subclonal/fractional profiles, and tooltips for CN, segment median
  depth, confidence, subclonal flags, and associated breakpoint IDs.
- **Binned read depth:** HP1/HP2 depth at the intervals supplied in the ZIP,
  with no fixed bin-size requirement. Depth is overlaid with CN using an inferred
  calibration when available; otherwise it appears in separate aligned tracks.
- **Folded BAF:** a linked 0–0.5 track. Unavailable sentinel values are omitted;
  zeros remain visible with a note that SNP support is unknown.
- **Structural variants:** deletions, duplications, inversions, paired breakends,
  insertions, and single-breakend sites from the observed single-sample Severus
  VCF schema. PASS, non-reference calls are displayed, with strand-directed feet
  and reported haplotype, phase-set, and read-support details in arc tooltips.
- **Centromeres and masked CN intervals:** hatched regions and exclusion of known
  CN sentinel values, including matching integer-profile zero placeholders.
- **Genomic context:** bundled GRCh38 cytobands and NCG 7.2 canonical cancer-driver
  annotations, with gene labels and annotation tooltips. These are reference
  annotations; Wakhan's sample-specific gene results are not displayed yet.
- **Interactive exploration:** linked zoom/pan across tracks, a whole-genome
  navigator, genomic/depth rulers, and SV hover, click, and interval highlighting.
  Multiple ZIPs can be opened and switched at the same genomic locus.
- **Image export:** PNG and SVG of the current view.
- **Unphased schemas (preliminary):** the importer recognizes single-track total
  CN and four-column total-depth tables. This has synthetic test coverage only;
  no real unphased ZIP has been validated, and Wakhan's inspected exporter skips
  the `--without-phasing` branch.

## Unsupported Wakhan Features

The following parts of Wakhan's Plotly output are not currently reproduced:

- **Exact depth/CN calibration:** the ZIP omits Wakhan's plot calibration.
  The viewer's inferred mapping is approximate and has not been verified against
  the original Plotly axes, especially for subclonal profiles. See
  [Inferred depth calibration](#inferred-depth-calibration).
- **The plotted solution's purity, ploidy, confidence, and rank:** these cannot
  be assigned safely from `solutions_ranks.tsv`, which lists all run solutions
  without identifying the enclosed one. About reports the number of ranking
  entries; there is no ranked-solution selector or solution metadata in the title.
- **Sample-specific gene plots:** HP1/HP2 gene copy numbers, actual/adjusted gene
  depths, and Wakhan's selected/custom gene list are not visualized.
  `genes_copynumber_states.bed` is currently used only to estimate calibration.
- **Current Wakhan LOH exports:** the exporter can include a four-column
  `chr/start/end/hp` table, but the viewer's LOH parser accepts only three-column
  intervals. That simpler path has synthetic tests only; neither example ZIP
  contains LOH. Missing or rejected LOH data do not mean there were no LOH calls.
- **Phasing and SNP diagnostics:** phase-block coverage, before/after
  phase-correction plots, per-SNP allele-depth/pileup views, and heterozygous/
  homozygous SNP counts and ratios. Their inputs are absent from the current ZIPs.
- **Purity/ploidy search heatmaps:** the ZIP's ranking table does not contain
  the complete search grid used by Wakhan's optimization plots.
- **Unphased read depth alongside phased tracks:** the third coverage series is
  parsed but is not plotted in phased mode; only HP1 and HP2 are shown.
- **Other assemblies:** GRCh37, T2T-CHM13, mouse, and custom references are not
  supported by this viewer. Its assembly validation and reference annotations
  are currently limited to GRCh38 primary chromosomes.
- **Arbitrary SV callers and multi-sample VCFs:** Wakhan can package other
  breakpoint inputs under the same VCF filename; the viewer currently supports
  the observed single-sample Severus schema.
- **Plotly presentation and output files:** mirrored HP axes, separate
  chromosome HTML pages, Plotly's modebar/trace-visibility controls, and direct
  PDF or standalone interactive HTML export. The viewer uses GenomeSpy tracks
  and navigation, with PNG/SVG export.

This comparison is based on the Wakhan source version recorded in the
[ZIP format report](docs/wakhan-zip-format.md), which also distinguishes missing
export data from features not yet implemented in the viewer.

## What the current ZIPs support

The HCC1937 and HCC1954 ZIPs render phased HP1/HP2 integer and subclonal CN
profiles, raw binned read depth, folded BAF, Severus SV links and sites,
centromeric/masked regions, GRCh38 cytobands, and NCG 7.2 cancer-driver genes.
Neither example contains LOH, and no real unphased ZIP was supplied. Preliminary
schema support and the current LOH incompatibility are described above.

The current ZIPs omit the enclosed solution identity, exact depth calibration,
independent assembly metadata, and explicit missingness information. The app
infers the copy/depth mapping when the gene table supports a consistent fit,
and does not assign a ranked solution to the plot. A source 3300 sentinel is
treated as unavailable or masked; BAF zero is shown with unknown SNP support.
HP1/HP2 are chromosome-local
labels, CN confidence is not phasing confidence, and fractional CN is not a
cellular fraction.

See [the ZIP format report](docs/wakhan-zip-format.md) for observed shortcomings,
their effects, and exact fields requested from Wakhan's authors. The
[implementation plan](PLAN.md) records the architecture and original milestones.

## Inferred depth calibration

By default, the viewer estimates the copy/depth mapping from rounded gene
adjusted-depth centers and integer states. When a fit is available, read-depth
points and copy-number segments share the HP1 and HP2 tracks, with a calibrated
read-depth axis on the right. This applies to development and production builds,
including image exports.

The estimate is recalculated per archive, excludes genes overlapping masked
subclonal segments, and requires at least three distinct states, residuals
consistent with two-decimal rounding, and a stable slope when each state is
left out. If those checks fail or the required data are missing, CN and raw depth
remain on separate tracks.

The **About** panel highlights that the exact Wakhan calibration and plotted
solution identity are absent. Agreement with Wakhan's original plot is
unverified, especially for subclonal profiles; depth alignment and depth-derived
copy estimates are approximate. This estimate does not resolve the upstream
request for explicit calibration.

For a numerical report without the browser:

```sh
npm run calibration:estimate -- public/examples/HCC1937_plots_data.zip
```

## Reference data and citations

Bundled GRCh38 annotations live in [data/](data/README.md), with source URLs,
transformation details, checksums, and attribution. NCG literature counts rank
labels; they are not measures of sample-specific significance.

- Ahmad et al., _Wakhan: reconstruction of chromosome-scale copy number
  profiles of tumor genomes with long-read sequencing_ (2025 preprint),
  [DOI: 10.64898/2025.12.11.25342098](https://doi.org/10.64898/2025.12.11.25342098).
- Lavikka et al., _Deciphering Cancer Genomes with GenomeSpy: A Grammar-Based
  Visualization Toolkit_, GigaScience (2024),
  [DOI: 10.1093/gigascience/giae040](https://doi.org/10.1093/gigascience/giae040).
- Keskus et al., _Severus_ structural variants,
  [DOI: 10.1038/s41587-025-02618-8](https://doi.org/10.1038/s41587-025-02618-8).
- Dressler et al., Network of Cancer Genes 7.2,
  [DOI: 10.1186/s13059-022-02607-z](https://doi.org/10.1186/s13059-022-02607-z).
- [UCSC Genome Browser](https://genome.ucsc.edu/) and
  [NCBI RefSeq](https://www.ncbi.nlm.nih.gov/refseq/) provide genomic context.

The original recipe used published
[Wakhan/CASTLE data on Zenodo](https://zenodo.org/records/17780982). Its
sample-specific claims and rights do not automatically apply to arbitrary
ZIPs opened in this app.

Development makes extensive use of AI assistance from **OpenAI Codex**.

## License

The application is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 Kari Lavikka.
Third-party dependencies and bundled data retain their respective terms and
attribution requirements.
