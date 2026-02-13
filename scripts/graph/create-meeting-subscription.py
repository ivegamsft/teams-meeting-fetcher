#!/usr/bin/env python3
"""
Create tenant-wide meeting-started webhook subscription for the bot API.
Wrapper per TEAMS_BOT_SPEC.md (Phase 1: Meeting Event Subscription).
"""
import argparse
import importlib.util
from pathlib import Path


def load_meeting_started_module():
    script_path = Path(__file__).with_name("create-meeting-started-subscription.py")
    spec = importlib.util.spec_from_file_location(
        "create_meeting_started_subscription",
        script_path,
    )
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load module from {script_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description="Create meeting-started Graph subscription")
    parser.add_argument(
        "--expiration-hours",
        type=int,
        default=24,
        help="Subscription expiration in hours (default: 24)",
    )
    args = parser.parse_args()

    module = load_meeting_started_module()
    module.create_meeting_started_subscription(expiration_hours=args.expiration_hours)


if __name__ == "__main__":
    main()
