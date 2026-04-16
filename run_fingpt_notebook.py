"""
run_fingpt_notebook.py
Executes fine_tune_fingpt.ipynb cell by cell with live output.
This is equivalent to running the notebook top-to-bottom in Jupyter.
"""

import json
import sys
import os
import traceback

NOTEBOOK_PATH = os.path.join(os.path.dirname(__file__), "fine_tune_fingpt.ipynb")

def run_notebook(path):
    print("=" * 65)
    print(" 🚀 FinGPT Notebook Runner")
    print(f"    Notebook : {path}")
    print("=" * 65)

    with open(path, "r", encoding="utf-8") as f:
        nb = json.load(f)

    code_cells = [
        (i + 1, cell)
        for i, cell in enumerate(nb.get("cells", []))
        if cell.get("cell_type") == "code"
    ]

    total = len(code_cells)
    print(f"\n📋 Found {total} code cells to execute.\n")

    # We'll exec all cells in a shared namespace so variables persist
    ns = {}

    for idx, (cell_num, cell) in enumerate(code_cells, start=1):
        source = "".join(cell.get("source", []))
        if not source.strip():
            continue

        # Print a clean header for each cell
        preview = source.strip().split("\n")[0][:72]
        print("\n" + "─" * 65)
        print(f"  Cell {idx}/{total}  |  {preview}")
        print("─" * 65)

        try:
            exec(compile(source, f"<cell_{idx}>", "exec"), ns)
        except SystemExit:
            pass
        except KeyboardInterrupt:
            print("\n\n⛔ Interrupted by user.")
            sys.exit(0)
        except Exception:
            print(f"\n❌  ERROR in cell {idx}:")
            traceback.print_exc()
            print("\nContinuing to next cell...\n")

    print("\n" + "=" * 65)
    print(" ✅  Notebook execution complete!")
    print("=" * 65)


if __name__ == "__main__":
    run_notebook(NOTEBOOK_PATH)
