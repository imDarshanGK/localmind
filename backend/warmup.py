"""
Embeddings Cache Warmup Utility
Ensures sentence-transformers weights are pre-downloaded and cached locally.
"""

import os
import sys
import logging

# --- FIX PYTHON PATHS ---
# Dynamically add the current script's directory (backend) to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
# ------------------------

# Set up clean console logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("warmup")

def warmup_model():
    logger.info("Starting embeddings cache warmup sequence...")
    
    try:
        # Import embedder dynamically from the existing RAG service
        from services.rag_service import embedder, EMBED_MODEL
        
        logger.info(f"Target model detected: '{EMBED_MODEL}'")
        
        # Run a small dummy text string through the embedder to force cache verification/loading
        dummy_text = "Warmup query to trigger model cache loading verification sequence."
        logger.info("Encoding dummy sample text to verify weight matrices...")
        
        embedding = embedder.encode([dummy_text], show_progress_bar=False)
        
        logger.info(f"Success! Model warmed up. Vector shape output: {len(embedding[0])}")
        logger.info("Embeddings engine is fully cached and ready for local inference.")
        
    except Exception as e:
        logger.error(f"Warmup sequence failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    warmup_model()