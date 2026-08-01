# Vector Retrieval Benchmark Harness & Deployment Guidelines

LocalMind processes vector retrieval context matches using ChromaDB and `sentence-transformers` (`all-MiniLM-L6-v2`). To ensure optimal query response times and detect performance regressions prior to production deployments, LocalMind includes a **Vector Retrieval Benchmark Harness**.

## How the Benchmark Harness Works

The benchmark harness measures end-to-end embedding generation and vector search latency under varying workload conditions:
1. **Single Query Latency**: Verifies that individual document retrieval queries execute within nominal execution bounds.
2. **Repeated Query Performance**: Evaluates mean, median, min, max, and standard deviation latencies across multiple query executions (`runs=10`).
3. **Collection Scaling**: Tests retrieval performance against small (10 chunks) and large (200 chunks) vector collections.
4. **`top_k` Result Variation**: Measures latency impact across different retrieval candidate counts (`top_k` = 1, 4, 8).
5. **Cold/Empty Collection Latency**: Confirms fast fallback handling when collections contain no stored documents.
6. **Latency Consistency**: Validates that latency variance (standard deviation) remains within acceptable statistical thresholds (`stdev < 2 * mean`).

## Implementation Details

The benchmark suite is implemented in `backend/tests/test_chromadb_benchmark.py` using `TestChromaDBRetrievalLatency`:

```python
# backend/tests/test_chromadb_benchmark.py
from sentence_transformers import SentenceTransformer
import chromadb

embedder = SentenceTransformer("all-MiniLM-L6-v2")
chroma_client = chromadb.PersistentClient(path="./data/chromadb_benchmark_test")
```

The harness generates synthetic chunks, constructs normalized embeddings, queries the isolated test collection, and records millisecond timing stats (`time.perf_counter()`).

## Pre-Deployment Verification

Run the benchmark harness as part of pre-deployment CI pipelines or staging verification checklists:

```bash
cd backend
pytest tests/test_chromadb_benchmark.py -v -s
```

### Build & Deployment Guidelines
- **Performance Baseline**: Run benchmark tests prior to deploying database or model configuration changes to establish baseline query latency.
- **Hardware & Storage Tuning**: Use benchmark outputs to evaluate persistent storage IOPS and CPU/GPU allocation when hosting ChromaDB instances in cloud environments.
- **Fast Diagnostic Validation**: Executing `pytest tests/test_chromadb_benchmark.py` validates vector embedding pipeline integrity without modifying production ChromaDB data directories.
