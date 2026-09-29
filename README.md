# Wakhan Explorer

A planned browser application for exploring [Wakhan](https://github.com/KolmogorovLab/Wakhan)
copy-number results: open a ZIP, zoom to a locus, and switch between results while
keeping the same genomic view.

**Status:** design and source inspection are complete. The application is not
implemented yet. See [the implementation plan](PLAN.md) for the architecture,
input contracts, supported-mode roadmap, and tentative commits.

## Why this tool?

Wakhan estimates haplotype-specific copy number from long-read sequencing and
produces plots and result tables. Wakhan Explorer will turn its result ZIPs into
linked, continuously zoomable genomic tracks, with no manual unpacking or data
preparation in the usual workflow.

The application follows the simplicity of
[SegmentModel Spy](https://github.com/genome-spy/segment-model-spy) and adapts the
visualization developed in the
[HCC1954 Wakhan recipe](https://github.com/genome-spy/genomespy-dataset-recipes/tree/main/recipes/hcc1954-wakhan-explorer).
The intended workflow adds a single-file opener and fast comparison at a retained
locus, including integer and subclonal profiles when available.

## Powered by GenomeSpy

[GenomeSpy](https://genomespy.app/) provides the declarative genomic visualization
grammar and GPU rendering. Its linked scales, genomic navigation, selections,
tooltips, and export API let this application concentrate on reading Wakhan data
and making the results easy to explore. This project will also serve as a compact
example of embedding GenomeSpy Core in a Lit application.

The design includes SV arcs, copy number and depth, folded BAF, optional LOH,
cytobands, and cancer genes. ZIP-derived data will be supplied through named
datasets at runtime. Processing will happen locally in the browser; the planned
application has no server upload endpoint.

## Development

Planned stack: **Vite, TypeScript, Lit, plain CSS, Vitest, npm, and
`@genome-spy/core/minimal`**.

Once milestone 1 creates `package.json` and the lockfile, development will use:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173/`.
The planned verification and production commands are:

```sh
npm run typecheck
npm run test:run
npm run build
npm run preview
```

These commands are the implementation contract; they are **not runnable in the
current planning-only project**. The initial app will run through Vite. A later
GitHub Pages deployment will serve the static build with a repository base path.

## Data and interpretation

The supplied local HCC1937/HCC1954 ZIPs are development inputs in ignored `tmp/`.
They contain merged haplotype CN profiles, raw depth, BAF, Severus variants, gene
results, masks, and rankings. They do not explicitly identify which ranked
solution is inside each ZIP. The importer must also distinguish unavailable/masked
values from biological zero. In normal use, calibrated depth overlays will require
calibration exported by Wakhan; current ZIPs will use separate CN and raw-depth tracks.
An optional development experiment will estimate calibration from rounded gene
depth centers to preview the overlay. Early fits look promising on both ZIPs;
the preview will be explicitly labeled and excluded from production builds.
The implementation will include `docs/wakhan-zip-format.md`, documenting observed
shortcomings, their effects, and concrete additions for the Wakhan authors.
See the [planned format report](PLAN.md#7-zip-shortcomings-and-upstream-requests).

Bundled GRCh38 annotations are already included in [data/](data/README.md):
NCG 7.2 canonical cancer drivers positioned with NCBI RefSeq, and UCSC cytobands.
Their exact sources, transformations, checksums, and attribution are recorded
there. Reference cancer genes provide genomic context; their literature counts
rank labels and do not measure alteration or significance in an opened sample.

HP1 and HP2 are chromosome-local labels, not maternal/paternal assignments.
Wakhan CN confidence is not phasing confidence. Fractional copy number is not a
subclonal cell fraction. The implementation plan records which output modes can
be supported with the current ZIP contents and which still need example files.

## Citations and related work

- Ahmad et al. **Wakhan: reconstruction of chromosome-scale copy number
  profiles of tumor genomes with long-read sequencing** (2025 preprint).
  [DOI: 10.64898/2025.12.11.25342098](https://doi.org/10.64898/2025.12.11.25342098).
- Lavikka et al. **Deciphering Cancer Genomes with GenomeSpy: A Grammar-Based
  Visualization Toolkit.** GigaScience (2024).
  [DOI: 10.1093/gigascience/giae040](https://doi.org/10.1093/gigascience/giae040).
- **Severus**, the source of SV annotations in the inspected bundles.
  [Publication](https://doi.org/10.1038/s41587-025-02618-8).
- Dressler et al. **Comparative assessment of genes driving cancer and somatic
  evolution in non-cancer tissues: an update of the Network of Cancer Genes (NCG)
  resource.** Genome Biology (2022).
  [DOI: 10.1186/s13059-022-02607-z](https://doi.org/10.1186/s13059-022-02607-z).
- [UCSC Genome Browser](https://genome.ucsc.edu/) and
  [NCBI RefSeq](https://www.ncbi.nlm.nih.gov/refseq/) supply annotation coordinates.

The original recipe used published
[Wakhan/CASTLE data on Zenodo](https://zenodo.org/records/17780982). Its rights and
sample-specific claims should not be assumed to apply to arbitrary user-opened ZIPs.
