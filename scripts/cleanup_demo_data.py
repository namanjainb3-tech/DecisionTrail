"""DecisionTrail Demo Data Cleaner

Removes all seeded demo records (psf/black and discourse demo seeds)
from SQLite database and rebuilds the knowledge graph.
"""

import sys
from pathlib import Path

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import sqlite3
import logging
from graph.loader import rebuild_from_sqlite

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cleanup_demo_data")

DB_PATH = Path("data/decisiontrail.db")

def cleanup():
    conn = sqlite3.connect(str(DB_PATH))
    with conn:
        logger.info("Deleting demo decisions...")
        conn.execute("DELETE FROM decisions WHERE repo_or_forum IN ('psf/black', 'discourse') OR thread_id LIKE 'github_psf/black%' OR thread_id LIKE 'discourse%';")
        
        logger.info("Deleting demo comments...")
        conn.execute("DELETE FROM comments WHERE thread_id LIKE 'github_psf/black%' OR thread_id LIKE 'discourse%';")
        
        logger.info("Deleting demo documents...")
        conn.execute("DELETE FROM documents WHERE thread_id LIKE 'github_psf/black%' OR thread_id LIKE 'discourse%';")
        
        logger.info("Deleting demo cursors...")
        conn.execute("DELETE FROM ingest_cursors WHERE source_id IN ('psf/black', 'discourse');")

    remaining_repos = [r[0] for r in conn.execute("SELECT DISTINCT repo_or_forum FROM decisions WHERE repo_or_forum != ''").fetchall()]
    remaining_docs = conn.execute("SELECT count(*) FROM documents").fetchone()[0]
    remaining_decisions = conn.execute("SELECT count(*) FROM decisions").fetchone()[0]
    conn.close()

    logger.info(f"Cleanup complete! Remaining repos in decisions: {remaining_repos}")
    logger.info(f"Total authentic documents: {remaining_docs}, decisions: {remaining_decisions}")

    logger.info("Rebuilding knowledge graph from authentic SQLite data...")
    rebuild_from_sqlite(db_path=DB_PATH)
    logger.info("Graph rebuild finished successfully.")

if __name__ == "__main__":
    cleanup()
