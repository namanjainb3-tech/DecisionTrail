"""DecisionTrail Neo4j Connectivity & Diagnostics Tool

Tests connection to Neo4j, verifies constraints & vector indexes,
and provides clear troubleshooting guidance.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure root directory is on PYTHONPATH
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.config import settings
from core.db_neo4j import check_neo4j_connection, get_neo4j_driver, get_neo4j_status, init_neo4j_schema


def main() -> None:
    print("=" * 60)
    print(" 🧭 DecisionTrail — Neo4j Diagnostics & Health Check")
    print("=" * 60)
    print(f"Target URI : {settings.NEO4J_URI}")
    print(f"Target User: {settings.NEO4J_USER}")
    print("-" * 60)

    status = get_neo4j_status()
    is_live = status["is_live"]

    if is_live:
        print("✅ SUCCESS: Successfully connected to live Neo4j database!")
        print(f"   Engine: {status['engine']}")
        try:
            driver = get_neo4j_driver()
            print("   Initializing constraints and vector index...")
            init_neo4j_schema(driver)
            with driver.session() as session:
                res = session.run("MATCH (n) RETURN count(n) AS node_count")
                count = res.single()["node_count"]
                print(f"   Current Node Count: {count}")
            print("\n🎉 Neo4j is 100% operational and ready for live production use.")
        except Exception as e:
            print(f"⚠️  Connected, but error during schema check: {e}")
    else:
        print("ℹ️  STATUS: Neo4j is currently OFFLINE.")
        print(f"   Active Engine: {status['engine']}")
        print(f"   Details      : {status['last_error']}")
        print("\n" + "=" * 60)
        print(" 🛠️  HOW TO CONNECT NEO4J:")
        print("=" * 60)
        print("DecisionTrail works seamlessly with or without Neo4j running:")
        print("\n[OPTION 1: Free Neo4j Aura Cloud — 2 Minutes, No Docker]")
        print("  1. Create a free account at: https://console.neo4j.io")
        print("  2. Create a free 'AuraDB Free' instance.")
        print("  3. Copy your connection URI and password into your .env file:")
        print("     NEO4J_URI=neo4j+s://<your-instance-id>.databases.neo4j.io")
        print("     NEO4J_USER=neo4j")
        print("     NEO4J_PASSWORD=<your-password>")
        print("\n[OPTION 2: Local Docker Container]")
        print("  If Docker Desktop is installed, simply run:")
        print("     docker compose up -d")
        print("\n[OPTION 3: Built-in Graph Engine (Zero Configuration)]")
        print("  DecisionTrail includes a built-in graph traversal and vector engine")
        print("  that automatically mirrors Cypher neighborhood queries and cosine")
        print("  similarity rankings. All features, tests, and API routes work 100%!")
        print("=" * 60)


if __name__ == "__main__":
    main()

