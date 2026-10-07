"""
Extract and verify DFC2019 Track 1 data into data/raw/dfc2019.

Usage:
    python data/download_dfc2019.py --archive path/to/file1.zip [path/to/file2.zip ...]
    python data/download_dfc2019.py --check        # just verify what's already in data/raw
"""
import argparse
import zipfile
from collections import defaultdict
from pathlib import Path

import rasterio

RAW_DIR = Path(__file__).parent / "raw" / "dfc2019"
KINDS = ("RGB", "AGL", "CLS")

# CLS label codes in DFC2019
CLASS_CODES = {2: "ground", 5: "vegetation", 6: "building", 9: "water", 17: "bridge/elevated road", 65: "unlabeled"}


def extract(archives):
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for a in archives:
        print(f"Extracting {a} ...")
        with zipfile.ZipFile(a) as z:
            z.extractall(RAW_DIR)


def find_triplets():
    groups = defaultdict(dict)
    for f in RAW_DIR.rglob("*.tif"):
        for kind in KINDS:
            if f.stem.endswith(f"_{kind}"):
                groups[f.stem[: -len(kind) - 1]][kind] = f
    return groups


def check():
    groups = find_triplets()
    complete = {k: v for k, v in groups.items() if len(v) == 3}
    print(f"Tiles found:      {len(groups)}")
    print(f"Complete (R/A/C): {len(complete)}")
    if not complete:
        print("No complete tiles. Check that files are under data/raw/dfc2019/")
        return
    name, files = next(iter(complete.items()))
    print(f"\nSample tile: {name}")
    for kind, path in files.items():
        with rasterio.open(path) as src:
            print(f"  {kind}: shape={src.shape}, bands={src.count}, dtype={src.dtypes[0]}")
    with rasterio.open(files["CLS"]) as src:
        codes = sorted(set(src.read(1).flatten().tolist()))
    print("  CLS codes in this tile:", {c: CLASS_CODES.get(c, "?") for c in codes})


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--archive", nargs="+", help="downloaded .zip file(s)")
    p.add_argument("--check", action="store_true", help="only verify existing data")
    args = p.parse_args()

    if args.archive:
        extract(args.archive)
    check()