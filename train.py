import pandas as pd
from datasets import Dataset
from transformers import AutoTokenizer, AutoModelForSequenceClassification, DataCollatorWithPadding, TrainingArguments, Trainer
from peft import get_peft_model, LoraConfig, TaskType
import evaluate
import numpy as np
import torch
import os

print("Starting Fine-tuning Script...")

print("Loading data...")
data = []
with open("Sentences_AllAgree.txt", "r", encoding="latin-1") as f:
    for line in f:
        parts = line.strip().split("@")
        if len(parts) == 2:
            data.append({"text": parts[0], "label": parts[1]})

df = pd.DataFrame(data)

label_map = {"positive": 0, "negative": 1, "neutral": 2}
df["label"] = df["label"].map(label_map)

dataset = Dataset.from_pandas(df)
dataset = dataset.train_test_split(test_size=0.2, seed=42)

print("Loading model and tokenizer...")
model_checkpoint = "ProsusAI/finbert"
tokenizer = AutoTokenizer.from_pretrained(model_checkpoint)

def preprocess_function(examples):
    return tokenizer(examples["text"], truncation=True, max_length=128)

tokenized_datasets = dataset.map(preprocess_function, batched=True)
data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

# Ensure backend directory exists
os.makedirs("./backend/lora-finbert", exist_ok=True)

try:
    base_model = AutoModelForSequenceClassification.from_pretrained(model_checkpoint, num_labels=3)
except Exception as e:
    print(f"Error loading base model: {e}")
    exit(1)

print("Applying LoRA...")
lora_config = LoraConfig(
    task_type=TaskType.SEQ_CLS,
    r=4,
    lora_alpha=16,
    lora_dropout=0.1,
    target_modules=["query", "value"]
)

peft_model = get_peft_model(base_model, lora_config)
peft_model.print_trainable_parameters()

clf_metrics = evaluate.combine(["f1", "precision", "recall"])
acc_metric = evaluate.load("accuracy")

def compute_metrics(eval_pred):
    predictions, labels = eval_pred
    predictions = np.argmax(predictions, axis=1)
    results = clf_metrics.compute(predictions=predictions, references=labels, average="macro")
    results.update(acc_metric.compute(predictions=predictions, references=labels))
    return results

print("Initialize Training...")
training_args = TrainingArguments(
    output_dir="./lora-training-results",
    learning_rate=2e-4,
    per_device_train_batch_size=32,
    per_device_eval_batch_size=32,
    max_steps=5,
    weight_decay=0.01,
    eval_strategy="steps",
    eval_steps=5,
    save_strategy="steps",
    save_steps=5,
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

print("Evaluating...")
metrics = trainer.evaluate()
print("EVALUATION METRICS:")
print(metrics)

save_path = "./backend/lora-finbert"
print(f"Saving to {save_path}...")
peft_model.save_pretrained(save_path)
tokenizer.save_pretrained(save_path)

print("Done!")
