import json
import os

path = "fine_tune_finbert.ipynb"
with open(path, "r", encoding="utf-8") as f:
    nb = json.load(f)

for cell in nb.get("cells", []):
    if cell.get("cell_type") == "code":
        source = "".join(cell.get("source", []))
        if "compute_metrics" in source and "clf_metrics.compute" in source:
            # Replace the bad compute_metrics combining
            new_source = source.replace(
                "return clf_metrics.compute(predictions=predictions, references=labels, average=\"macro\")",
                "import evaluate\n    acc = evaluate.load('accuracy')\n    res = acc.compute(predictions=predictions, references=labels)\n    return res"
            )
            # Since they are trying to print accuracy in the next cell:
            # metrics.get('eval_accuracy', 0)
            
            # Let's just provide a pure scikit-learn fix or evaluate fix
            new_cell_content = """import evaluate
import numpy as np

accuracy_metric = evaluate.load("accuracy")

def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=1)
    return accuracy_metric.compute(predictions=predictions, references=labels)
"""
            cell["source"] = [line + "\n" if not line.endswith("\n") else line for line in new_cell_content.split("\n")]
            print("Fixed compute_metrics cell")

with open(path, "w", encoding="utf-8") as f:
    json.dump(nb, f, indent=1)
print("Saved notebook")
