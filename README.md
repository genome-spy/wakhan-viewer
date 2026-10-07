# Wakhan Viewer

Open a Wakhan results ZIP in the browser and explore its copy-number calls,
read depth, structural variants, and folded BAF on linked genomic tracks.
The app parses the local file in a Worker; it has no data-upload endpoint.
Open one or more ZIPs at once, then switch between results to compare the same
genomic locus without losing your zoom. Files import in order; additional drops
join the queue. The first successful import is displayed, and adding files keeps
the current result and zoom. A failed file is reported without stopping the
remaining imports.

New users can choose **Load HCC1937 example** on the welcome screen to explore
the bundled [HCC1937 ZIP](public/examples/HCC1937_plots_data.zip) without providing
their own files. The archive is downloaded only when requested, then processed
in the browser by the same importer as local ZIPs. It is an unchanged copy of
the supplied archive; its contents and checksum are recorded in the
[ZIP format report](docs/wakhan-zip-format.md).

Once a result is open, GenomeSpy fills the window beneath a compact toolbar.
Tracks resize with the window; short windows scroll within the visualization.
Result metadata, notes, and credits are available in the toolbar's **About** panel.

The app adapts the visual design of the
[HCC1954 Wakhan GenomeSpy recipe](https://github.com/genome-spy/genomespy-dataset-recipes/tree/main/recipes/hcc1954-wakhan-explorer)
and the simple file-opening workflow of
[SegmentModel Spy](https://github.com/genome-spy/segment-model-spy).
It uses [GenomeSpy](https://genomespy.app/) Core's **minimal** entry point,
linked genomic scales, named data sources, and PNG/SVG image exports. ZIP-derived
rows are supplied to GenomeSpy through its runtime dataset API.

## Run locally

Requires a current Node.js release and npm.

~~~sh
npm ci
npm run dev
~~~

Open the URL printed by Vite, usually http://localhost:5173/. Load the HCC1937
example, choose one or more ZIPs, or drag them onto the page. An additional
HCC1954 archive in ignored tmp/ is used by optional development tests.
Use the navigator, scroll wheel, and drag to explore.
Switch the result or integer/subclonal profile from the toolbar; the detail x
domain is retained.

~~~sh
npm run typecheck
npm run test:run
npm run build
npm run preview
~~~

## GitHub Pages

[CI and GitHub Pages](.github/workflows/pages.yml) runs tests and builds the
static app on every push and pull request using Node.js 24 and `npm ci`.
Every successful push to `main` deploys `dist/` to
[genome-spy.github.io/wakhan-viewer](https://genome-spy.github.io/wakhan-viewer/).
The workflow can also be run manually from the Actions tab.

In the repository's **Settings → Pages → Build and deployment**, select
**GitHub Actions** as the source once. The workflow uses GitHub's built-in token
and the `github-pages` environment; no additional secrets are needed.

To build and preview the same deployment locally:

~~~sh
GITHUB_PAGES=1 npm run build
GITHUB_PAGES=1 npm run preview
~~~

Open the `/wakhan-viewer/` URL printed by Vite. The base path applies to the
app, its import Worker, and the bundled HCC1937 example ZIP.

## What the current ZIPs support

The HCC1937 and HCC1954 ZIPs render phased HP1/HP2 integer and subclonal CN
profiles, raw binned read depth, folded BAF, Severus SV links and sites,
centromeric/masked regions, GRCh38 cytobands, and NCG 7.2 cancer-driver genes.
Optional Wakhan LOH tables and the source's single-track unphased CN schema
have synthetic parser tests. No real ZIP for those modes was supplied, and
Wakhan's inspected ZIP exporter currently skips the unphased branch. Plot-only
purity/ploidy and phasing diagnostics need exported data before they can be
shown here.

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

~~~sh
npm run calibration:estimate -- public/examples/HCC1937_plots_data.zip
~~~

## Reference data and citations

Bundled GRCh38 annotations live in [data/](data/README.md), with source URLs,
transformation details, checksums, and attribution. NCG literature counts rank
labels; they are not measures of sample-specific significance.

- Ahmad et al., *Wakhan: reconstruction of chromosome-scale copy number
  profiles of tumor genomes with long-read sequencing* (2025 preprint),
  [DOI: 10.64898/2025.12.11.25342098](https://doi.org/10.64898/2025.12.11.25342098).
- Lavikka et al., *Deciphering Cancer Genomes with GenomeSpy: A Grammar-Based
  Visualization Toolkit*, GigaScience (2024),
  [DOI: 10.1093/gigascience/giae040](https://doi.org/10.1093/gigascience/giae040).
- Keskus et al., *Severus* structural variants,
  [DOI: 10.1038/s41587-025-02618-8](https://doi.org/10.1038/s41587-025-02618-8).
- Dressler et al., Network of Cancer Genes 7.2,
  [DOI: 10.1186/s13059-022-02607-z](https://doi.org/10.1186/s13059-022-02607-z).
- [UCSC Genome Browser](https://genome.ucsc.edu/) and
  [NCBI RefSeq](https://www.ncbi.nlm.nih.gov/refseq/) provide genomic context.

The original recipe used published
[Wakhan/CASTLE data on Zenodo](https://zenodo.org/records/17780982). Its
sample-specific claims and rights do not automatically apply to arbitrary
ZIPs opened in this app.

## License

The application is licensed under the [MIT License](LICENSE).
Copyright (c) 2026 Kari Lavikka.
Third-party dependencies and bundled data retain their respective terms and
attribution requirements.
