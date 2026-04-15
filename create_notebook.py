import nbformat as nbf

nb = nbf.v4.new_notebook()

# 1. Setup Cell
setup_code = """!pip install -q transformers datasets peft accelerate evaluate scikit-learn torch"""
nb.cells.append(nbf.v4.new_code_cell(setup_code))

# 2. Imports and Data Loading
data_code = """import pandas as pd
from datasets import Dataset

# Load the dataset
data = []
with open("Sentences_AllAgree.txt", "r", encoding="latin-1") as f:
    for line in f:
        parts = line.strip().split("@")
        if len(parts) == 2:
            data.append({"text": parts[0], "label": parts[1]})

df = pd.DataFrame(data)
print(df["label"].value_counts())

# Mapping for ProsusAI/finbert (0: positive, 1: negative, 2: neutral)
label_map = {"positive": 0, "negative": 1, "neutral": 2}
df["label"] = df["label"].map(label_map)

dataset = Dataset.from_pandas(df)
dataset = dataset.train_test_split(test_size=0.2, seed=42)
print(dataset)
"""
nb.cells.append(nbf.v4.new_markdown_cell("## Data Loading and Preprocessing"))
nb.cells.append(nbf.v4.new_code_cell(data_code))

# 3. Tokenization and Model setup
model_code = """from transformers import AutoTokenizer, AutoModelForSequenceClassification, DataCollatorWithPadding

model_checkpoint = "ProsusAI/finbert"
tokenizer = AutoTokenizer.from_pretrained(model_checkpoint)

def preprocess_function(examples):
    return tokenizer(examples["text"], truncation=True, max_length=128)

tokenized_datasets = dataset.map(preprocess_function, batched=True)
data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

# Load base model
base_model = AutoModelForSequenceClassification.from_pretrained(model_checkpoint, num_labels=3)
"""
nb.cells.append(nbf.v4.new_markdown_cell("## Tokenization & Base Model"))
nb.cells.append(nbf.v4.new_code_cell(model_code))

# 4. LoRA Setup
lora_code = """from peft import get_peft_model, LoraConfig, TaskType

print("===================================================================")
print("Initializing LoRA (Low-Rank Adaptation) Configuration")
print("===================================================================")
print("Instead of fine-tuning all 109 million parameters of FinBERT,")
print("LoRA injects small trainable rank decomposition matrices into the ")
print("attention layers ('query' and 'value'). This massively speeds up training")
print("and prevents catastrophic forgetting of existing financial knowledge.")

lora_config = LoraConfig(
    task_type=TaskType.SEQ_CLS,
    r=4,
    lora_alpha=16,
    lora_dropout=0.1,
    target_modules=["query", "value"]  # Targets BERT attention layers
)

peft_model = get_peft_model(base_model, lora_config)
print("\\nLoRA Model Overview (Notice how few parameters are trainable!):")
peft_model.print_trainable_parameters()
"""
nb.cells.append(nbf.v4.new_markdown_cell("## LoRA Configuration"))
nb.cells.append(nbf.v4.new_code_cell(lora_code))

# 5. Training
train_code = """from transformers import TrainingArguments, Trainer
import evaluate
import numpy as np
import torch

clf_metrics = evaluate.combine(["accuracy", "f1", "precision", "recall"])

def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=1)
    return clf_metrics.compute(predictions=predictions, references=labels, average="macro")

# Using CPU/MPS/GPU automatically
device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"

training_args = TrainingArguments(
    output_dir="./lora-training-results",
    learning_rate=2e-4,
    per_device_train_batch_size=32,
    per_device_eval_batch_size=32,
    num_train_epochs=1,
    weight_decay=0.01,
    eval_strategy="epoch",
    save_strategy="epoch",
    load_best_model_at_end=True,
    report_to="none"
)

trainer = Trainer(
    model=peft_model,
    args=training_args,
    train_dataset=tokenized_datasets["train"],
    eval_dataset=tokenized_datasets["test"],
    processing_class=tokenizer,
    data_collator=data_collator,
    compute_metrics=compute_metrics,
)

import os
from peft import PeftModel

save_path = "./backend/lora-finbert"

if os.path.exists(save_path):
    print(f"\\n-> Model already found at {save_path}. Skipping training!")
    print("Loading the existing fine-tuned weights for evaluation...")
    peft_model = PeftModel.from_pretrained(base_model, save_path)
    
    # Re-initialize trainer with the loaded PEFT model so we can evaluate it
    trainer = Trainer(
        model=peft_model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["test"],
        processing_class=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )
else:
    print("\\n🚀 Starting LoRA Training...")
    trainer.train()
"""
nb.cells.append(nbf.v4.new_markdown_cell("## Training"))
nb.cells.append(nbf.v4.new_code_cell(train_code))

# 6. Evaluation and Save
eval_save_code = """# Final evaluation metrics
print("\\n===================================================================")
print("Evaluating Fine-Tuned Model Performance")
print("===================================================================")
metrics = trainer.evaluate()

print("\\n✅ FINAL EVALUATION METRICS:")
print(f"  • Accuracy:  {metrics.get('eval_accuracy', 0):.4f} (Percentage of correct sentiment predictions)")
print(f"  • Precision: {metrics.get('eval_precision', 0):.4f} (Accuracy of positive predictions)")
print(f"  • Recall:    {metrics.get('eval_recall', 0):.4f} (Ability to find all true positive instances)")
print(f"  • F1-Score:  {metrics.get('eval_f1', 0):.4f} (Harmonic mean of precision and recall)")
print(f"  • Loss:      {metrics.get('eval_loss', 0):.4f}")

# Save the PEFT adapter
save_path = "./backend/lora-finbert"
peft_model.save_pretrained(save_path)
tokenizer.save_pretrained(save_path)

print(f"\\n💾 SUCCESS: Model adapters and tokenizer successfully saved to {save_path}!")
print("The web application is now ready to use this customized financial sentiment engine.")
"""
nb.cells.append(nbf.v4.new_markdown_cell("## Evaluation & Model Saving"))
nb.cells.append(nbf.v4.new_code_cell(eval_save_code))

with open('fine_tune_finbert.ipynb', 'w', encoding='utf-8') as f:
    nbf.write(nb, f)

print("Notebook fine_tune_finbert.ipynb generated successfully!")
