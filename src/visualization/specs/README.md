# Specification provenance

`structural-variants.json` is adapted from the HCC1954 Wakhan Explorer recipe
at commit `cf3aa5b436aa877da7718a588e8dd172639dfa82` in the
[GenomeSpy dataset recipes](https://github.com/genome-spy/genomespy-dataset-recipes/tree/main/recipes/hcc1954-wakhan-explorer/specs).
The recipe's [rights review](https://github.com/genome-spy/genomespy-dataset-recipes/blob/main/recipes/hcc1954-wakhan-explorer/RIGHTS.md)
states that its original specs are CC0. This copy replaces sample-specific
file URLs with the `svLinks` and `svSites` named sources. The app supplies
normalized Severus VCF records to those sources through GenomeSpy's API.
