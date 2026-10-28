# Dataset Provenance, Statistics & Documentation

## 1. Dataset Provenance & Overview

The machine learning subsystem in this project utilizes a dual-source dataset combining an internationally recognized mobile spam benchmark with synthetic Indian public service impersonation messages.

```text
data/
├── raw/
│   ├── SMSSpamCollection            # Raw tab-delimited text from UCI repository (5,574 rows)
│   └── sms_spam_collection.zip      # Original downloaded archive
└── processed/
    ├── combined_spam_dataset.csv    # Cleaned, deduplicated training dataset (5,176 records)
    └── dataset_statistics.json      # Generated empirical distribution metadata
```

### Primary Benchmark Source
- **Dataset:** UCI SMS Spam Collection
- **Authors:** Tiago A. Almeida, José María Gómez Hidalgo, Akibo Yamakami
- **Citation:** Almeida, T.A., Gómez Hidalgo, J.M., Yamakami, A. Contributions to the Study of SMS Spam Filtering: New Collection and Results. *Proceedings of the 2011 ACM Symposium on Document Engineering (DOCENG'11)*, Mountain View, CA, USA, 2011.
- **Official Repository:** [https://archive.ics.uci.edu/dataset/228/sms+spam+collection](https://archive.ics.uci.edu/dataset/228/sms+spam+collection)
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0).

### Domain-Adapted Synthetic Augmentation
- **Author:** Bureaucratic Assistance Project Research Team
- **Purpose:** Standard SMS spam corpora predominantly feature lottery notifications, ringtone subscriptions, and British telecommunication lures. To adapt the classifier to contemporary civic cyber threats in India, synthetic examples mimicking fraudulent power disconnections, income tax refund portals, Aadhaar biometric deactivation threats, PM-Kisan DBT lures, and cyber police summons were integrated.

---

## 2. Dataset Counts & Class Distribution

The dataset pipeline was executed via `scripts/acquire_and_prepare_dataset.py`. Real measured figures:

| Metric | Measured Value |
| :--- | :--- |
| **Raw UCI Records** | 5,574 |
| **Synthetic Injected Records** | 16 (10 Scam Lures, 6 Legitimate Advisories) |
| **Total Before Deduplication** | 5,590 |
| **Duplicates Removed** | 414 duplicate messages |
| **Final Cleaned Records** | **5,176 records** |
| **Legitimate Messages (`ham`)** | 4,519 (87.31%) |
| **Scam / Spam Messages (`spam`)** | 657 (12.69%) |

---

## 3. Data Cleaning & Preprocessing

1. **Text Normalization:** Stripping trailing carriage returns, tabs, and null characters.
2. **Deduplication:** Repeated broadcast spam messages and identical template hams were removed to prevent data leakage across training and test splits.
3. **Encoding:** Binary label encoding where `ham -> 0` and `spam -> 1`.
4. **Stratified Partition:** An 80/20 stratified split (`random_state=42`) ensuring both splits maintain the authentic 12.69% positive class prevalence:
   - **Training Set (80%):** 4,140 samples (3,614 Ham, 526 Spam)
   - **Held-Out Test Set (20%):** 1,036 samples (905 Ham, 131 Spam)

---

## 4. Other Academic Datasets: Status & Acquisition Instructions

The project requirements specify investigating the accessibility and licensing of external academic document benchmarks:

### FUNSD (Form Understanding in Noisy Scanned Documents)
- **Domain:** Form layout understanding and key-value pair extraction.
- **Licence:** Non-commercial educational research.
- **Accessibility:** Available on Hugging Face and GitHub (`JaidedAI/FUNSD`).
- **Status in Local System:** Evaluated conceptually for document classification. Not embedded locally due to large multi-hundred megabyte uncompressed TIFF footprint.
- **Acquisition Instructions:**
  ```bash
  git clone https://github.com/JaidedAI/FUNSD_dataset.git
  ```

### MIDV-500 (Mobile Identity Document Video Dataset)
- **Domain:** Identification cards, passports, and driving licences from 103 countries.
- **Licence:** CC BY 4.0.
- **Accessibility:** Extremely large (~65 GB uncompressed video frames and synthetic scans).
- **Status in Local System:** Impractical to bundle in university laptop submission. The system uses high-fidelity synthetic text and image fixtures conforming to standard ICAO 9303 (passports) and UIDAI (Aadhaar) layouts.
- **Acquisition Instructions:**
  Download official torrent or archive from the Federal Research Center for Computer Science and Control of the Russian Academy of Sciences:
  [http://midv-500.ru/](http://midv-500.ru/)
