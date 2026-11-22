#!/bin/sh
# Rebuild the Dynasty Board's data as of the newest fully finished week (or DYN_THROUGH=<season x 100 + week>), in order:
# the Contender's production numbers (34 games), the Rebuilder's (17 games), then the board (web/data/dynasty-*.json).
# The age curve (dynasty_age_value.R) is fit on history and doesn't change week to week. Called by web/scripts/weekly-run.mjs.
set -e
cd "$(dirname "$0")"
Rscript dynasty_production_value.R
DYN_WINDOW=17 DYN_HALF_LIFE=8 DYN_SUFFIX=_short Rscript dynasty_production_value.R
Rscript dynasty_value.R
