#!/usr/bin/env python3
"""Compatibility entry point for the legacy SQLite origin.

New backend work belongs in services/api. This wrapper remains only while the
React/C++/PostgreSQL migration is in progress.
"""

from legacy.api.server import *  # noqa: F401,F403
from legacy.api.server import main


if __name__ == "__main__":
    main()
