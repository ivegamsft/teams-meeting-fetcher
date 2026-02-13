#!/usr/bin/env python3
"""
Upload or update a Teams app package in the tenant app catalog.
Requires Graph permissions: AppCatalog.ReadWrite.All (admin consent).
"""
import argparse
import json
from pathlib import Path
import sys

import requests

sys.path.append("scripts/graph")
from auth_helper import get_graph_headers


def load_manifest_id(manifest_path: Path) -> str:
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    app_id = data.get("id")
    if not app_id:
        raise ValueError(f"Manifest missing 'id': {manifest_path}")
    return app_id


def find_existing_app(app_id: str, headers: dict) -> str | None:
    url = (
        "https://graph.microsoft.com/v1.0/appCatalogs/teamsApps"
        f"?$filter=externalId eq '{app_id}'&$select=id,externalId,displayName"
    )
    resp = requests.get(url, headers=headers, timeout=30)
    resp.raise_for_status()
    apps = resp.json().get("value", [])
    if not apps:
        return None
    return apps[0].get("id")


def upload_new_app(package_path: Path, headers: dict) -> None:
    url = "https://graph.microsoft.com/v1.0/appCatalogs/teamsApps"
    with package_path.open("rb") as handle:
        resp = requests.post(
            url,
            headers={**headers, "Content-Type": "application/zip"},
            data=handle,
            timeout=120,
        )
    resp.raise_for_status()


def update_existing_app(app_catalog_id: str, package_path: Path, headers: dict) -> None:
    url = (
        "https://graph.microsoft.com/v1.0/appCatalogs/teamsApps/"
        f"{app_catalog_id}/appDefinitions"
    )
    with package_path.open("rb") as handle:
        resp = requests.post(
            url,
            headers={**headers, "Content-Type": "application/zip"},
            data=handle,
            timeout=120,
        )
    resp.raise_for_status()


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload Teams app package")
    parser.add_argument(
        "--package",
        default="teams-app/teams-app.zip",
        help="Path to Teams app zip package",
    )
    parser.add_argument(
        "--manifest",
        default="teams-app/manifest.json",
        help="Path to Teams app manifest (used for app ID)",
    )
    args = parser.parse_args()

    package_path = Path(args.package)
    manifest_path = Path(args.manifest)

    if not package_path.exists():
        raise FileNotFoundError(f"Package not found: {package_path}")
    if not manifest_path.exists():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}")

    headers = get_graph_headers()
    app_id = load_manifest_id(manifest_path)

    app_catalog_id = find_existing_app(app_id, headers)
    if app_catalog_id:
        print(f"Updating Teams app (catalog id: {app_catalog_id})...")
        update_existing_app(app_catalog_id, package_path, headers)
        print("✅ Teams app updated in catalog.")
    else:
        print("Uploading new Teams app to catalog...")
        upload_new_app(package_path, headers)
        print("✅ Teams app uploaded to catalog.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
