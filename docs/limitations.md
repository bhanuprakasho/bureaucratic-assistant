# System Limitations & Operational Boundaries

## 1. Machine Learning & Scam Detection Boundaries
- **SMS Distribution Assumption:** The model is trained on short SMS formats. Multi-page email phishing lures or obfuscated QR code PDFs may require optical multimodal classifiers.
- **Adversarial Circumvention:** Zero-day lures utilizing non-ASCII lookalike characters or URL redirectors (such as compromised URL shorteners) may lower model certainty. The application explicitly supplements ML inference with transparent heuristic domain checks.
- **Advisory Nature:** The model provides a probabilistic screening score. It does not replace official police or CERT-In forensics.

## 2. OCR & Document Processing Boundaries
- **Optical Degradation:** Severely crumpled, blurred, low-resolution camera captures or handwritten notes can degrade OCR character recognition.
- **Human-in-the-Loop Requirement:** Extracted OCR text is never treated as legal proof of authenticity. The application provides an explicit user confirmation step where citizens review and correct recognized fields before saving.
- **Physical Security Features:** Local optical OCR cannot verify physical security watermarks, UV fibers, holographic overlays, or embedded contactless RFID passport chips. It performs consistency and syntax screening only.

## 3. Grounded Knowledge & External Integrations
- **Live Government Database Connectivity:** Connecting directly to UIDAI CIDR or DigiLocker production environments requires statutory organizational agreements and dedicated hardware security modules (HSM). The system uses an offline verified gazette architecture.
- **LLM Hallucination Boundaries:** When `GEMINI_API_KEY` is not provided, the assistant uses deterministic template synthesis over verified database records rather than relying on hallucination-prone ungrounded models.
