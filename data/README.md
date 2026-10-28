# Dataset Directory & Provenance

```text
data/
├── raw/
│   ├── SMSSpamCollection            # Raw tab-separated text dataset from UCI repository
│   └── sms_spam_collection.zip      # Downloaded UCI zip archive
└── processed/
    ├── combined_spam_dataset.csv    # Deduplicated, normalized dataset (5,176 records)
    └── dataset_statistics.json      # Precomputed class balance and statistics
```

## Dataset Details
- **Raw UCI Benchmark:** 5,574 messages (4,827 ham, 747 spam).
- **Synthetic Injected Bureaucratic Notices:** 16 domain-adapted examples (Aadhaar KYC, Income Tax refund, Electricity disconnect, PM-Kisan).
- **Cleaned Dataset:** 5,176 messages after deduplication (4,519 ham, 657 spam).
- **Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0).

## Reproduction Commands
```bash
python scripts/acquire_and_prepare_dataset.py
```
