# RAG-based Bureaucratic Chat Assistant

A locally runnable assistant that answers questions about Indian government services using **only** official government PDFs. Every answer is checked against the retrieved text and comes with its source (document, pages and official URL). Questions the documents cannot support are refused instead of guessed.

**Services currently covered:** Passport, Aadhaar, Kisan Credit Card (KCC), Voter ID, Scholarship for Higher Education (SHE), PAN.

---

## Key features

- **Official sources only.** The knowledge base is built from government PDFs. Each PDF is mapped to its official URL in `data/sources.json`.
- **Service-first search.** The user picks a service (e.g. Passport) and the search runs only inside that service's documents.
- **Scope and sufficiency check.** Before any answer is written, the system decides whether the query is `SUFFICIENT`, `INSUFFICIENT` (topic is covered but the detail is missing) or `OUT_OF_SCOPE`. It answers only on `SUFFICIENT`. Thresholds are calibrated on a labelled query set.
- **Wrong-service hint.** If another service matches the question clearly better, the app suggests switching to it.
- **Grounded generation.** A local LLM (Ollama) writes a short, plain-language answer from the retrieved text only. A grounding check then verifies it:
  - every number in the answer must appear in the source text or in the question;
  - every sentence must be semantically close to some part of the source text.

  If the check fails, the app shows the official text itself instead of the LLM's wording.
- **Source attribution.** Each answer lists the supporting document, page numbers and the official URL. Only chunks that actually back a sentence of the answer are cited.
- **Streamlit frontend** with a service picker, chat, sources panel, example questions and an optional developer details view.
- **Evaluation tools** for retrieval quality (Recall@1/3/5) and for scope threshold calibration.

---

## How it works

```
User question
    |
    v
Query validation  ->  Scope / sufficiency check  ->  not SUFFICIENT: tell the user, stop
                                |
                           SUFFICIENT
                                v
                  Retrieve top-k chunks (ChromaDB)
                                v
                 Generate answer (Ollama, context-only prompt)
                                v
                 Grounding check (numbers + sentence similarity)
                     |                           |
                   passed                      failed
                     |                           |
              LLM answer                 Official text shown directly
                     \                         /
                      Source attribution (document, pages, URL)
                                v
                          Final response
```

**Offline pipeline (run once, re-run when documents change):**

```
PDFs -> text extraction -> cleaning -> chunking -> chunks.jsonl -> embeddings -> ChromaDB
```

---

## Tech stack

| Part | Tool |
|---|---|
| PDF text extraction | PyMuPDF |
| Embeddings | Sentence-Transformers, `all-MiniLM-L6-v2` |
| Vector store | ChromaDB (persistent, cosine similarity) |
| Local LLM | Ollama with `llama3.2:3b` |
| Frontend | Streamlit |
| Tests | pytest |

Everything runs locally and uses free, open-source tools.

---

## Project structure

```
rag-assisstant/
├── config.py                  # paths, chunk size, embedding model, vector store settings
├── data/
│   ├── sources.json           # PDF file name -> official government URL
│   ├── scope_thresholds.json  # calibrated scope thresholds (created by calibrate_scope.py)
│   ├── processed/chunks.jsonl # output of build_chunks.py
│   └── vector_store/          # persistent ChromaDB index
├── documents/                 # source PDFs, one sub-folder per service
├── evaluation/
│   ├── retrieval_test_set.json
│   └── scope_test_set.json
├── scripts/                   # command-line tools and the Streamlit app
├── src/
│   ├── ingestion/             # PDF loading, source URL manifest
│   ├── processing/            # cleaning, chunking, JSONL writer
│   ├── indexing/              # embeddings, vector store
│   ├── retrieval/             # retriever, retrieval metrics
│   ├── scope/                 # sufficiency check, threshold calibration
│   ├── generation/            # LLM client, prompts, generator, grounding check
│   ├── attribution/           # source list building
│   └── utils/                 # logging
└── tests/                     # unit tests
```

---

## Setup

### 1. Install Python dependencies

Python 3.10 or newer is recommended.

```bash
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux:  source .venv/bin/activate

pip install -r requirements.txt
```

### 2. Install Ollama and download the model

Install Ollama from <https://ollama.com>, start it, then run:

```bash
ollama pull llama3.2:3b
```

Optional environment variables: `RAG_LLM_MODEL`, `RAG_OLLAMA_URL`, `RAG_LLM_TIMEOUT`.

### 3. Add the source PDFs

Place the PDFs inside `documents/`, in one sub-folder per service. The file names must match the entries in `data/sources.json`, which also holds each document's official URL.

```
documents/
├── passport/
│   ├── application-form-instruction-booklet-v3.0.pdf
│   └── latest-passport-manual-for-disclosure-under-RTI-Act.pdf
├── aadhaar/
│   └── resident-handbook-english-2021.pdf
├── kcc/
│   └── revised-scheme-for-issue-of-kisan-credit-card.pdf
├── voter-id/
│   ├── form-6-english.pdf
│   └── guidelines-for-filling-up-application-form-6.pdf
├── she/                       # Scholarship for Higher Education
│   ├── FAQs.pdf
│   └── Guidelines.pdf
└── pan/
    ├── about-pan-card-income-tax-department.pdf
    ├── documents-required-for-pan.pdf
    ├── e-PAN-FAQ.pdf
    ├── protean-pan.pdf
    └── protean-pan-forms.pdf
```

To add a new service, create a new sub-folder, put its PDFs inside, add their URLs to `data/sources.json`, and re-run the build steps below. The first folder name under `documents/` is used as the service name.

---

## Usage

Run all commands from the project root.

### Build the knowledge base

```bash
python scripts/build_chunks.py      # extract, clean, chunk -> data/processed/chunks.jsonl
python scripts/build_index.py       # embed chunks -> data/vector_store/
```

`build_index.py` is safe to re-run: chunk IDs are deterministic and the index uses upsert, so nothing is duplicated.

### Check the build

```bash
python scripts/inspect_chunks.py    # chunk counts, sizes and sample chunks
python scripts/inspect_index.py     # vector count, services indexed, missing URLs, smoke-test query
```

### Try retrieval only

```bash
python scripts/search_chunks.py --query "how can a minor get a passport" --service passport
python scripts/search_chunks.py     # interactive mode
```

### Ask a question from the terminal

```bash
python scripts/ask.py --query "how can a minor get a passport" --service passport
python scripts/ask.py               # interactive mode
```

Useful flags: `--show-grounding` (per-sentence scores), `--show-context` (chunks used), `--show-raw` (raw LLM text).

### Run the web app

```bash
streamlit run scripts/app.py
```

Make sure Ollama is running and the index has been built first.

---

## Evaluation

### Retrieval quality

```bash
python scripts/eval_retrieval.py                    # "tune" split
python scripts/eval_retrieval.py --also-unfiltered  # compare with and without the service filter
python scripts/eval_retrieval.py --split final      # run once at the end
```

A test case counts as a hit when one of the top-k chunks comes from the expected PDF **and** contains a key phrase from the answer. Chunk IDs are deliberately not used, so changing chunk size does not break the test set. Only cases marked `"verified": true` with a real phrase are scored; unfinished cases are listed and skipped.

### Scope and sufficiency thresholds

```bash
python scripts/calibrate_scope.py --save                      # find and save thresholds
python scripts/calibrate_scope.py --evaluate                  # score saved thresholds (tune split)
python scripts/calibrate_scope.py --evaluate --split final    # run once at the end
```

Calibration is cost-weighted: answering when the documents cannot support an answer is penalised more than refusing too often. It uses labelled queries from `evaluation/scope_test_set.json` plus every verified case from `evaluation/retrieval_test_set.json`.

Re-calibrate whenever documents are added or removed, or the embedding model changes.

### Unit tests

```bash
pytest
```

The tests use fake models and fake LLM responses, so no model download or Ollama server is needed.

---

## Configuration

Defaults live in `config.py` and can be overridden with environment variables.

| Setting | Default | Environment variable |
|---|---|---|
| Chunk size (characters) | 1200 | `RAG_CHUNK_SIZE` |
| Chunk overlap (characters) | 150 | `RAG_CHUNK_OVERLAP` |
| Embedding model | `all-MiniLM-L6-v2` | `RAG_EMBEDDING_MODEL` |
| Vector store folder | `data/vector_store` | `RAG_VECTOR_STORE_DIR` |
| Collection name | `gov_docs` | `RAG_VECTOR_STORE_COLLECTION` |
| Documents folder | `documents` | `RAG_DOCUMENTS_DIR` |
| Source URL manifest | `data/sources.json` | `RAG_SOURCES_MANIFEST` |
| Scope thresholds file | `data/scope_thresholds.json` | `RAG_SCOPE_THRESHOLDS` |

---


