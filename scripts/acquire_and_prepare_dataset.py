import os
import zipfile
import urllib.request
import pandas as pd
import json

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'raw')
PROCESSED_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'processed')

os.makedirs(RAW_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)

UCI_ZIP_URL = "https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip"
ZIP_PATH = os.path.join(RAW_DIR, "sms_spam_collection.zip")
EXTRACT_FILE = os.path.join(RAW_DIR, "SMSSpamCollection")

def download_and_extract_uci():
    print(f"Downloading UCI SMS Spam Collection from {UCI_ZIP_URL}...")
    urllib.request.urlretrieve(UCI_ZIP_URL, ZIP_PATH)
    print("Download completed. Extracting...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        zip_ref.extractall(RAW_DIR)
    print(f"Extracted to {RAW_DIR}")

# Synthetic Indian bureaucratic & government impersonation scam messages (for domain adaptation)
SYNTHETIC_GOV_SCAMS = [
    ("spam", "Dear Citizen, Your Electricity power connection will be disconnected tonight at 9.30 PM from electricity office because your previous month bill was not updated. Please immediately contact our electricity officer at 9812345678 or pay immediately via http://bescom-pay.xyz/bill"),
    ("spam", "Urgent Income Tax Refund Notice: You have an uncashed tax refund of Rs. 15,490 from Income Tax Department India. Click http://incometax-refund-portal.top to enter Aadhaar and claim your refund directly to bank account within 2 hours."),
    ("spam", "UIDAI Alert: Your Aadhaar card has been suspended due to pending biometric KYC verification. To prevent permanent deactivation, click http://uidai-kyc-update.online and enter your Aadhaar OTP immediately."),
    ("spam", "PM-KISAN Samman Nidhi Yojana: 17th installment of Rs. 2,000 has been sanctioned for your account. Pay processing clearance fee of Rs. 99 to activate DBT transfer: http://pmkisan-scheme-dbt.biz/claim"),
    ("spam", "TRAI Notice: Your SIM card mobile number will be blocked within 24 hours due to illegal activities. Dial our verification officer immediately on 080-99887766 and share verification OTP to stop disconnection."),
    ("spam", "EPFO Alert: Dear member, your Provident Fund interest of Rs 32,840 is ready for withdrawal. Update your bank KYC and share your Aadhaar OTP on http://epfo-kyc-claim.xyz to release funds."),
    ("spam", "Delhi Police / CBI Cyber Cell: A parcel containing illegal narcotics and fake passports in your name has been intercepted at customs. Warrant issued. Call DSP Sharma on WhatsApp +91-9988771122 to pay clearance penalty."),
    ("spam", "Ministry of Education: You have been selected for Dr. Ambedkar National Scholarship of Rs. 50,000. Pay registration fee of Rs. 499 on http://scholarship-gov-registration.xyz/apply before 5 PM."),
    ("spam", "State Bank of India: Your SBI Yono account has been blocked due to PAN card expiry. Update PAN and verify OTP here: http://sbi-pan-kyc.top/login immediately to avoid permanent closure."),
    ("spam", "Passport Seva Alert: Your Passport renewal application #IND99281 has been rejected due to address discrepancy. Pay expedited fast-track fee of Rs. 1,200 at http://passport-seva-expedite.com to avoid police FIR.")
]

# Synthetic legitimate government & institutional communications (for domain adaptation)
SYNTHETIC_GOV_HAMS = [
    ("ham", "Dear Resident, Aadhaar update request with URN 0000/12345/67890 has been processed successfully. You can download your e-Aadhaar from https://myaadhaar.uidai.gov.in. UIDAI never asks for OTP or fees over phone."),
    ("ham", "Income Tax Dept: Your e-filed ITR-1 for AY 2025-26 has been successfully verified. Acknowledgment number 9876543210. Check status at official portal https://eportal.incometax.gov.in."),
    ("ham", "Passport Seva: Appointment for Application ARN 24-0012345678 has been confirmed for 28-Oct-2026 at 10:15 AM at PSK Connaught Place New Delhi. Please carry original documents."),
    ("ham", "National Scholarship Portal: Your Post-Matric Scholarship application for AY 2025-26 has been verified by your institution. Track progress at https://scholarships.gov.in."),
    ("ham", "EPFO: Your monthly PF contribution of Rs. 3,600 has been credited to your UAN account for September 2026. View passbook on official UMANG app or https://unifiedportal-mem.epfindia.gov.in."),
    ("ham", "Parivahan Sewa: Learner Licence application number DL-992810 has been approved. Download e-LL from official portal https://parivahan.gov.in.")
]

def main():
    if not os.path.exists(EXTRACT_FILE):
        download_and_extract_uci()

    print(f"Reading raw UCI data from {EXTRACT_FILE}...")
    # Format of SMSSpamCollection: tab-separated <label>\t<message>
    df_raw = pd.read_csv(EXTRACT_FILE, sep='\t', names=['label', 'message'], quoting=3, encoding='utf-8')
    raw_count = len(df_raw)
    print(f"Raw UCI dataset loaded: {raw_count} rows.")
    print("Class distribution in raw data:")
    print(df_raw['label'].value_counts())

    # Create synthetic dataframe
    synthetic_records = SYNTHETIC_GOV_SCAMS + SYNTHETIC_GOV_HAMS
    df_synthetic = pd.DataFrame(synthetic_records, columns=['label', 'message'])
    df_synthetic['is_synthetic'] = 1

    df_raw['is_synthetic'] = 0

    # Combine datasets
    df_combined = pd.concat([df_raw, df_synthetic], ignore_index=True)

    # Clean text: drop na, strip whitespace
    df_combined.dropna(subset=['message', 'label'], inplace=True)
    df_combined['message'] = df_combined['message'].astype(str).str.strip()
    df_combined = df_combined[df_combined['message'].str.len() > 0]

    # Check and report duplicates
    raw_len = len(df_combined)
    df_cleaned = df_combined.drop_duplicates(subset=['message']).copy()
    dedup_len = len(df_cleaned)
    duplicates_removed = raw_len - dedup_len
    print(f"Removed {duplicates_removed} duplicate messages. Cleaned total: {dedup_len} records.")

    # Save processed CSV
    out_csv = os.path.join(PROCESSED_DIR, "combined_spam_dataset.csv")
    df_cleaned.to_csv(out_csv, index=False, encoding='utf-8')
    print(f"Saved processed dataset to {out_csv}")

    # Compute and save dataset stats
    stats = {
        "raw_uci_records": raw_count,
        "synthetic_records": len(df_synthetic),
        "synthetic_scams": len(SYNTHETIC_GOV_SCAMS),
        "synthetic_legitimate": len(SYNTHETIC_GOV_HAMS),
        "total_before_deduplication": raw_len,
        "duplicates_removed": duplicates_removed,
        "final_cleaned_count": dedup_len,
        "class_distribution": {
            "ham": int((df_cleaned['label'] == 'ham').sum()),
            "spam": int((df_cleaned['label'] == 'spam').sum())
        },
        "spam_percentage": round(float((df_cleaned['label'] == 'spam').mean() * 100), 2),
        "sources": [
            {
                "name": "UCI SMS Spam Collection",
                "citation": "Almeida, T., Hidalgo, J., & Yamakami, A. (2011). Contributions to the study of SMS spam filtering: new collection and results. ACM DOCENG '11.",
                "url": "https://archive.ics.uci.edu/dataset/228/sms+spam+collection",
                "license": "Creative Commons Attribution 4.0 International (CC BY 4.0)"
            },
            {
                "name": "Synthetic Indian Bureaucratic Impersonation Test Fixtures",
                "author": "Bureaucratic Assistance Project Team",
                "purpose": "Domain adaptation for electricity, income tax refund, Aadhaar KYC, PM-Kisan, and law enforcement impersonation lures."
            }
        ]
    }

    stats_path = os.path.join(PROCESSED_DIR, "dataset_statistics.json")
    with open(stats_path, 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=2)
    print(f"Saved dataset statistics to {stats_path}")

if __name__ == "__main__":
    main()
