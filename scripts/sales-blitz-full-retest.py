"""
Sales Blitz Full Retest - Comprehensive end-to-end pipeline test
Creates 5 events for a single day, applies targeted mutations,
waits for pipeline processing, verifies DynamoDB/S3/Lambda, and reports timing.
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'graph'))

from datetime import datetime, timedelta
import time
import random
import json
import subprocess
import statistics
import requests
from auth_helper import get_graph_headers


# ── Configuration ──────────────────────────────────────────────────────────
REPS = [
    "trustingboar@ibuyspy.net",
]
BASE_DATE = datetime(2026, 4, 6)  # Monday, April 6, 2026
DYNAMODB_TABLE = "tmf-meetings-8akfpg"
S3_BUCKET = "tmf-webhooks-eus-dev"
S3_PREFIX = "eventhub/"
LAMBDA_LOG_GROUP = "/aws/lambda/tmf-eventhub-processor-dev"
PACING_DELAY = 0.1  # seconds between API calls

random.seed(42)  # reproducible mutation patterns

# ── Test data pools ────────────────────────────────────────────────────────
COMPANY_NAMES = [
    "Contoso", "Fabrikam", "AdventureWorks", "Northwind", "WideWorldImporters",
    "TailspinToys", "Relecloud", "FourthCoffee", "Proseware", "Lucerne Publishing",
    "Woodgrove Bank", "BlueLynx", "Margie's Travel", "Alpine Ski House", "VanArsdel",
    "CohoWinery", "ContosoPharmaceuticals", "LitwareInc", "WingTipToys", "TreyResearch",
    "Datum Corporation", "BaldwinMuseum", "SchoolofFineArt", "City Power & Light",
    "NorthernTraders", "SouthridgeVideo", "CityBank", "MountainResort", "CoastalHotels",
    "MetroTransit", "GlobalImports", "PacificTrading", "AtlanticShipping", "CentralLogistics",
    "NationalRetail", "RegionalWholesale", "InternationalConsulting", "DomesticServices",
    "OverseasManufacturing", "LocalDistribution", "ContinentalSupply", "UniversalSolutions",
    "GeneralIndustries", "SpecificTechnologies", "IntegratedSystems", "AdvancedEngineering",
    "ModernDesign", "ClassicConstruction", "FutureEnergy", "GreenEnvironmental",
]

FIRST_NAMES = [
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
    "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
    "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
    "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
    "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
]

LEAD_SOURCES = ["Website", "LinkedIn", "Referral", "Conference", "Cold Outreach", "Webinar"]

NOTES_TEMPLATES = [
    "Hot lead - budget approved for Q2",
    "Interested in enterprise plan, needs pricing",
    "Current solution contract expires next month",
    "Evaluated 3 competitors, we're in final round",
    "Looking to modernize legacy systems",
    "Growing fast, needs scalable solution",
    "Inbound inquiry from website demo",
    "Referral from existing customer",
    "Met at industry conference last week",
    "Responded to LinkedIn outreach campaign",
    "High intent - requested technical deep dive",
    "Decision maker confirmed for call",
    "Pilot project approved, discussing scope",
    "Compliance requirements are key driver",
    "Cost savings initiative - quantify ROI",
    "New CTO wants to evaluate options",
    "Expansion opportunity - 3 divisions interested",
    "Urgent need - go-live target in 60 days",
]

TITLE_PREFIXES = ["RESCHEDULED:", "PRIORITY:", "FOLLOW-UP:"]

FOLLOW_UP_NOTES = [
    "<h3>FOLLOW-UP NOTES</h3><ul><li>Strong interest in enterprise features</li>"
    "<li>Requested pricing proposal for 100+ users</li>"
    "<li>Next call scheduled with technical team</li></ul>",
    "<h3>FOLLOW-UP NOTES</h3><ul><li>Budget confirmed for Q2</li>"
    "<li>Legal review in progress</li>"
    "<li>Need security compliance documentation</li></ul>",
    "<h3>FOLLOW-UP NOTES</h3><ul><li>POC approved by CTO</li>"
    "<li>Integration with existing CRM is key requirement</li>"
    "<li>Timeline: 60-day implementation window</li></ul>",
]

CANCEL_COMMENTS = [
    "Prospect no longer interested - budget cut",
    "Rescheduling due to conflict",
    "Contact left the company",
    "Deal moved to next quarter",
]


# ── Helpers ────────────────────────────────────────────────────────────────

def percentile(data, p):
    """Calculate percentile from a sorted-capable list"""
    if not data:
        return 0
    sorted_data = sorted(data)
    idx = int(len(sorted_data) * p / 100)
    return sorted_data[min(idx, len(sorted_data) - 1)]


def ms(seconds):
    """Convert seconds to integer milliseconds"""
    return int(seconds * 1000)


def fmt_duration(seconds):
    """Format seconds into Xm Ys string"""
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m}m {s}s"


def generate_fake_leads(count):
    """Generate realistic fake sales leads"""
    leads = []
    used_emails = set()
    for _ in range(count):
        while True:
            first = random.choice(FIRST_NAMES)
            last = random.choice(LAST_NAMES)
            company = random.choice(COMPANY_NAMES)
            domain = company.lower().replace(" ", "").replace("'", "").replace("&", "and")
            email = f"{first.lower()}.{last.lower()}@{domain}.com"
            if email not in used_emails:
                used_emails.add(email)
                break
        phone = f"(555) {random.randint(100, 999)}-{random.randint(1000, 9999)}"
        leads.append({
            "first_name": first, "last_name": last, "company": company,
            "email": email, "phone": phone,
            "source": random.choice(LEAD_SOURCES),
            "notes": random.choice(NOTES_TEMPLATES),
        })
    return leads


def get_daily_slots():
    """5 morning slots (15-min appointments)"""
    return [(9, 0), (9, 15), (9, 30), (9, 45), (10, 0)]


def run_aws_command(cmd):
    """Run AWS CLI command and return parsed JSON output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
        elif result.returncode != 0:
            print(f"  AWS error: {result.stderr[:200]}")
        return None
    except Exception as e:
        print(f"  Exception: {str(e)[:150]}")
        return None


# ── Phase 1: Create Events ────────────────────────────────────────────────

def create_single_event(rep_email, lead, start_dt, end_dt, index, total):
    """Create one event via Graph API with retry. Returns (success, event_id, latency_s, retried)."""
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{rep_email}/events"

    body_html = (
        f"<h3>Lead Details</h3><ul>"
        f"<li><b>Contact:</b> {lead['first_name']} {lead['last_name']}</li>"
        f"<li><b>Company:</b> {lead['company']}</li>"
        f"<li><b>Email:</b> {lead['email']}</li>"
        f"<li><b>Phone:</b> {lead['phone']}</li>"
        f"<li><b>Source:</b> {lead['source']}</li>"
        f"<li><b>Notes:</b> {lead['notes']}</li></ul>"
        f"<h3>Agenda</h3><ol>"
        f"<li>Introduction &amp; company overview</li>"
        f"<li>Needs assessment</li>"
        f"<li>Product fit discussion</li>"
        f"<li>Next steps</li></ol>"
    )

    payload = {
        "subject": f"Sales Call: {lead['company']} - {lead['first_name']} {lead['last_name']}",
        "body": {"contentType": "HTML", "content": body_html},
        "start": {"dateTime": start_dt.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "Eastern Standard Time"},
        "end": {"dateTime": end_dt.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "Eastern Standard Time"},
        "location": {"displayName": "Microsoft Teams Meeting"},
        "isOnlineMeeting": True,
        "onlineMeetingProvider": "teamsForBusiness",
    }

    max_retries = 5
    retry_count = 0
    base_wait = 1.0
    retried = False

    while retry_count <= max_retries:
        t0 = time.time()
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            latency = time.time() - t0

            if response.status_code == 201:
                event_id = response.json().get("id", "unknown")
                if retry_count > 0:
                    retried = True
                return True, event_id, latency, retried

            elif response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                wait = int(retry_after) if retry_after else base_wait * (2 ** retry_count)
                print(f"  [{index}/{total}] 429 - waiting {wait}s (retry {retry_count+1})")
                time.sleep(wait)
                retry_count += 1

            else:
                print(f"  [{index}/{total}] HTTP {response.status_code}: {response.text[:100]}")
                return False, None, latency, retried

        except Exception as e:
            latency = time.time() - t0
            if retry_count < max_retries:
                wait = base_wait * (2 ** retry_count)
                print(f"  [{index}/{total}] Error: {str(e)[:80]} - retrying in {wait}s")
                time.sleep(wait)
                retry_count += 1
            else:
                return False, None, latency, retried

    return False, None, 0, retried


def phase1_create_events():
    """Phase 1: Create 5 events, return dict of event info keyed by event_id."""
    print("=" * 64)
    print("PHASE 1: EVENT CREATION")
    print("=" * 64)

    daily_slots = get_daily_slots()
    num_days = 1
    total = num_days * len(daily_slots) * len(REPS)  # 5
    leads = generate_fake_leads(total)

    print(f"Target: {total} events | {len(daily_slots)} slots/day/rep | April 6 2026")
    print(f"Reps: {', '.join(r.split('@')[0] for r in REPS)}")
    print()

    created_events = {}  # event_id -> {rep, day, slot, subject}
    latencies = []
    stats = {"success": 0, "failed": 0, "retried": 0, "rate_limited_429": 0}
    rep_counts = {r: 0 for r in REPS}

    phase_start = time.time()
    lead_idx = 0

    for day in range(num_days):
        day_date = BASE_DATE + timedelta(days=day)
        print(f"--- {day_date.strftime('%A %b %d')} ---")

        for hour, minute in daily_slots:
            for rep in REPS:
                slot_start = day_date.replace(hour=hour, minute=minute)
                slot_end = slot_start + timedelta(minutes=15)
                lead = leads[lead_idx]
                lead_idx += 1

                ok, eid, lat, retried = create_single_event(
                    rep, lead, slot_start, slot_end, lead_idx, total
                )

                if ok:
                    stats["success"] += 1
                    rep_counts[rep] += 1
                    latencies.append(lat)
                    created_events[eid] = {
                        "rep": rep,
                        "day": day,
                        "slot_start": slot_start.isoformat(),
                        "subject": f"Sales Call: {lead['company']} - {lead['first_name']} {lead['last_name']}",
                    }
                    if retried:
                        stats["retried"] += 1
                else:
                    stats["failed"] += 1

                # progress every 20 events
                if lead_idx % 20 == 0:
                    elapsed = time.time() - phase_start
                    rate = stats["success"] / elapsed if elapsed > 0 else 0
                    print(f"  [{lead_idx}/{total}] {stats['success']} ok / {stats['failed']} fail | {rate:.2f}/sec")

                time.sleep(PACING_DELAY)

    phase_dur = time.time() - phase_start

    # stats
    print()
    print(f"Phase 1 complete in {fmt_duration(phase_dur)}")
    print(f"  Total: {total} | Success: {stats['success']} | Failed: {stats['failed']} | Retried: {stats['retried']}")
    for rep in REPS:
        print(f"  {rep.split('@')[0]}: {rep_counts[rep]} created")
    if latencies:
        print(f"  Latency (ms): avg={ms(statistics.mean(latencies))} "
              f"min={ms(min(latencies))} max={ms(max(latencies))} "
              f"p50={ms(percentile(latencies, 50))} p95={ms(percentile(latencies, 95))}")
        print(f"  Rate: {stats['success'] / phase_dur:.2f} events/sec")

    return created_events, latencies, stats, phase_dur, rep_counts


# ── Phase 2: Randomized Mutations ─────────────────────────────────────────

def make_mutation_request(method, url, headers, payload=None):
    """Make a single HTTP request with retry for 429. Returns (success, latency_s, was_429)."""
    max_retries = 5
    retry_count = 0
    base_wait = 1.0
    was_429 = False

    while retry_count <= max_retries:
        t0 = time.time()
        try:
            if method == "PATCH":
                resp = requests.patch(url, headers=headers, json=payload, timeout=30)
            else:
                resp = requests.post(url, headers=headers, json=payload, timeout=30)
            latency = time.time() - t0

            if resp.status_code in (200, 202, 204):
                return True, latency, was_429
            elif resp.status_code == 429:
                was_429 = True
                ra = resp.headers.get("Retry-After")
                wait = int(ra) if ra else base_wait * (2 ** retry_count)
                print(f"    429 - waiting {wait}s")
                time.sleep(wait)
                retry_count += 1
            else:
                print(f"    HTTP {resp.status_code}: {resp.text[:100]}")
                return False, latency, was_429

        except Exception as e:
            latency = time.time() - t0
            if retry_count < max_retries:
                wait = base_wait * (2 ** retry_count)
                time.sleep(wait)
                retry_count += 1
            else:
                return False, latency, was_429

    return False, 0, was_429


def phase2_mutations(created_events):
    """Phase 2: Apply randomized mutations to subsets of created events."""
    print()
    print("=" * 64)
    print("PHASE 2: RANDOMIZED MUTATIONS")
    print("=" * 64)

    print("Waiting 30 seconds for initial notifications to flow...")
    time.sleep(30)

    event_ids = list(created_events.keys())
    total = len(event_ids)

    # Fixed mutation counts for 5 meetings: 1 rename, 1 cancel, 1 reschedule, 1 description (1 untouched)
    rename_n = 1
    cancel_n = 1
    resched_n = 1
    desc_n = 1
    mutated_n = rename_n + cancel_n + resched_n + desc_n

    sampled = random.sample(event_ids, min(mutated_n, total))
    idx = 0
    rename_ids = sampled[idx:idx + rename_n]; idx += rename_n
    cancel_ids = sampled[idx:idx + cancel_n]; idx += cancel_n
    resched_ids = sampled[idx:idx + resched_n]; idx += resched_n
    desc_ids = sampled[idx:idx + desc_n]

    untouched_n = total - len(sampled)

    print(f"Planned: {len(sampled)} mutations out of {total} events ({len(sampled)*100//total}%)")
    print(f"  Title renames:       {rename_n} ({rename_n*100//total}%)")
    print(f"  Cancellations:       {cancel_n} ({cancel_n*100//total}%)")
    print(f"  Reschedules:         {resched_n} ({resched_n*100//total}%)")
    print(f"  Description updates: {desc_n} ({desc_n*100//total}%)")
    print(f"  Untouched:           {untouched_n} ({untouched_n*100//total}%)")
    print()

    # build interleaved mutation list
    mutations = []
    for eid in rename_ids:
        mutations.append(("rename", eid))
    for eid in cancel_ids:
        mutations.append(("cancel", eid))
    for eid in resched_ids:
        mutations.append(("reschedule", eid))
    for eid in desc_ids:
        mutations.append(("description", eid))
    random.shuffle(mutations)

    type_stats = {
        "rename": {"success": 0, "failed": 0, "latencies": []},
        "cancel": {"success": 0, "failed": 0, "latencies": []},
        "reschedule": {"success": 0, "failed": 0, "latencies": []},
        "description": {"success": 0, "failed": 0, "latencies": []},
    }
    total_429 = 0
    phase_start = time.time()

    for i, (mtype, eid) in enumerate(mutations, 1):
        info = created_events[eid]
        rep = info["rep"]
        headers = get_graph_headers()
        base_url = f"https://graph.microsoft.com/v1.0/users/{rep}/events/{eid}"

        if mtype == "rename":
            prefix = random.choice(TITLE_PREFIXES)
            new_subj = info["subject"].replace("Sales Call:", f"{prefix} Sales Call:")
            ok, lat, w429 = make_mutation_request("PATCH", base_url, headers, {"subject": new_subj})

        elif mtype == "cancel":
            comment = random.choice(CANCEL_COMMENTS)
            ok, lat, w429 = make_mutation_request("POST", f"{base_url}/cancel", headers, {"comment": comment})

        elif mtype == "reschedule":
            shift_hours = random.randint(1, 4)
            orig_start = datetime.fromisoformat(info["slot_start"])
            new_start = orig_start + timedelta(hours=shift_hours)
            new_end = new_start + timedelta(minutes=15)
            payload = {
                "start": {"dateTime": new_start.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "Eastern Standard Time"},
                "end": {"dateTime": new_end.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": "Eastern Standard Time"},
            }
            ok, lat, w429 = make_mutation_request("PATCH", base_url, headers, payload)

        elif mtype == "description":
            notes = random.choice(FOLLOW_UP_NOTES)
            ok, lat, w429 = make_mutation_request("PATCH", base_url, headers,
                                                   {"body": {"contentType": "HTML", "content": notes}})

        if w429:
            total_429 += 1
        if ok:
            type_stats[mtype]["success"] += 1
        else:
            type_stats[mtype]["failed"] += 1
        type_stats[mtype]["latencies"].append(lat)

        if i % 20 == 0:
            print(f"  [{i}/{len(mutations)}] mutations applied...")

        time.sleep(PACING_DELAY)

    phase_dur = time.time() - phase_start

    print()
    print(f"Phase 2 complete in {fmt_duration(phase_dur)}")
    for mtype, st in type_stats.items():
        cnt = st["success"] + st["failed"]
        avg = ms(statistics.mean(st["latencies"])) if st["latencies"] else 0
        print(f"  {mtype:15s}: {cnt:3d} total | {st['success']} ok | {st['failed']} fail | avg {avg}ms")
    print(f"  Rate limited (429): {total_429}")

    return type_stats, total_429, phase_dur, untouched_n


# ── Phase 3: Wait for Pipeline ─────────────────────────────────────────────

def phase3_wait():
    """Phase 3: Wait 180s with heartbeat."""
    print()
    print("=" * 64)
    print("PHASE 3: PIPELINE WAIT")
    print("=" * 64)
    print("Waiting for pipeline to process (3 minutes)...")

    total_wait = 180
    elapsed = 0
    while elapsed < total_wait:
        time.sleep(30)
        elapsed += 30
        print(f"  ... {elapsed}s / {total_wait}s")

    print("Wait complete.")
    return total_wait


# ── Phase 4: Verify Pipeline ──────────────────────────────────────────────

def phase4_verify(test_start_epoch):
    """Phase 4: Check DynamoDB, S3, CloudWatch."""
    print()
    print("=" * 64)
    print("PHASE 4: PIPELINE VERIFICATION")
    print("=" * 64)
    phase_start = time.time()

    results = {}

    # a) DynamoDB total count
    print("\n[4a] DynamoDB total record count...")
    data = run_aws_command(f"aws dynamodb scan --table-name {DYNAMODB_TABLE} --select COUNT")
    dynamo_total = data.get("Count", 0) if data else 0
    print(f"  DynamoDB total records: {dynamo_total}")
    results["dynamo_total"] = dynamo_total

    # b) S3 event count
    print("\n[4b] S3 archived events...")
    try:
        r = subprocess.run(
            f"aws s3 ls s3://{S3_BUCKET}/{S3_PREFIX} --recursive",
            shell=True, capture_output=True, text=True, timeout=60,
        )
        lines = [l for l in r.stdout.strip().split("\n") if l.strip()] if r.returncode == 0 else []
        s3_count = len(lines)
        print(f"  S3 archived events: {s3_count}")
        results["s3_count"] = s3_count
    except Exception as e:
        print(f"  S3 error: {e}")
        results["s3_count"] = 0

    # c) Lambda CloudWatch logs
    print("\n[4c] Lambda CloudWatch logs (forwarded notifications)...")
    start_ms = str(int(test_start_epoch * 1000))
    data = run_aws_command(
        f'aws logs filter-log-events --log-group-name "{LAMBDA_LOG_GROUP}" '
        f'--start-time {start_ms} --filter-pattern "forwardedCount" --max-items 50'
    )
    forwarded_count = 0
    lambda_invocations = 0
    if data and "events" in data:
        lambda_invocations = len(data["events"])
        for ev in data["events"]:
            msg = ev.get("message", "")
            # try to extract forwardedCount value
            if "forwardedCount" in msg:
                try:
                    # look for forwardedCount: N or "forwardedCount":N patterns
                    for token in msg.split():
                        if token.isdigit():
                            forwarded_count += int(token)
                            break
                except Exception:
                    pass
    print(f"  Lambda invocations (with forwardedCount): {lambda_invocations}")
    print(f"  Estimated forwarded notifications: {forwarded_count}")
    results["lambda_invocations"] = lambda_invocations
    results["forwarded_count"] = forwarded_count

    # d) DynamoDB records with changeType
    print("\n[4d] DynamoDB records with changeType field...")
    data = run_aws_command(
        f"aws dynamodb scan --table-name {DYNAMODB_TABLE} "
        f"--filter-expression \"attribute_exists(changeType)\" --select COUNT"
    )
    changetype_count = data.get("Count", 0) if data else 0
    print(f"  Records with changeType: {changetype_count}")
    results["changetype_count"] = changetype_count

    phase_dur = time.time() - phase_start
    results["phase_dur"] = phase_dur
    print(f"\nPhase 4 complete in {fmt_duration(phase_dur)}")
    return results


# ── Phase 5: Final Report ─────────────────────────────────────────────────

def phase5_report(test_id, test_start, test_end, total_events,
                  p1_stats, p1_latencies, p1_dur, rep_counts,
                  p2_type_stats, p2_429, p2_dur, p2_untouched,
                  p3_wait,
                  p4_results):
    """Phase 5: Print comprehensive results."""
    print()
    print("=" * 64)
    print("SALES BLITZ FULL RETEST - COMPREHENSIVE RESULTS")
    print("=" * 64)
    print(f"Test ID: {test_id}")
    print(f"Target Day: April 6, 2026")
    print(f"Started: {test_start}")
    print(f"Finished: {test_end}")
    total_dur = (datetime.fromisoformat(test_end) - datetime.fromisoformat(test_start)).total_seconds()
    print(f"Total Duration: {fmt_duration(total_dur)}")

    # Phase 1
    print(f"\n--- PHASE 1: EVENT CREATION ---")
    print(f"Total: {total_events} | Success: {p1_stats['success']} | Failed: {p1_stats['failed']} | Retried: {p1_stats['retried']}")
    for rep in REPS:
        print(f"  {rep.split('@')[0]}: {rep_counts[rep]} created")
    if p1_latencies:
        print(f"Latency (ms): avg={ms(statistics.mean(p1_latencies))} "
              f"min={ms(min(p1_latencies))} max={ms(max(p1_latencies))} "
              f"p50={ms(percentile(p1_latencies, 50))} p95={ms(percentile(p1_latencies, 95))}")
        print(f"Rate: {p1_stats['success'] / p1_dur:.2f} events/sec")
    print(f"Duration: {fmt_duration(p1_dur)}")

    # Phase 2
    print(f"\n--- PHASE 2: MUTATIONS ---")
    total_mutated = sum(s["success"] + s["failed"] for s in p2_type_stats.values())
    pct = total_mutated * 100 // total_events if total_events else 0
    print(f"Total mutations: {total_mutated}/{total_events} events ({pct}%)")
    for mtype in ["rename", "cancel", "reschedule", "description"]:
        st = p2_type_stats[mtype]
        cnt = st["success"] + st["failed"]
        target_pct = {"rename": 15, "cancel": 8, "reschedule": 12, "description": 10}[mtype]
        avg = ms(statistics.mean(st["latencies"])) if st["latencies"] else 0
        label = {"rename": "Title renames", "cancel": "Cancellations",
                 "reschedule": "Reschedules", "description": "Description changes"}[mtype]
        print(f"  {label:22s}: {cnt:3d} ({target_pct}%) | {st['success']} success | avg {avg}ms")
    print(f"  {'Untouched':22s}: {p2_untouched} (55%)")
    print(f"Rate limited (429): {p2_429}")
    print(f"Duration: {fmt_duration(p2_dur)}")

    # Phase 3
    print(f"\n--- PHASE 3: PIPELINE WAIT ---")
    print(f"Wait time: {p3_wait} seconds")

    # Phase 4
    print(f"\n--- PHASE 4: PIPELINE VERIFICATION ---")
    print(f"DynamoDB total records: {p4_results['dynamo_total']} (includes prior test data)")
    print(f"  New records (with changeType): {p4_results['changetype_count']}")
    print(f"S3 archived events: {p4_results['s3_count']}")
    print(f"Lambda invocations (since test start): {p4_results['lambda_invocations']}")
    print(f"Lambda forwarded notifications: {p4_results['forwarded_count']}")
    print(f"Estimated pipeline latency: ~60-120s (EventBridge 1min polling)")

    if p4_results["changetype_count"] == 0:
        print("\nNOTE: 0 records with changeType detected. The admin app may still be deploying.")
        print("  Suggestion: re-run Phase 4 after admin app deployment completes, or trigger")
        print("  deploy-admin-app workflow and wait ~10 minutes.")

    # Timing summary
    print(f"\n--- TIMING SUMMARY ---")
    print(f"End-to-end test duration: {fmt_duration(total_dur)}")
    if p1_latencies:
        print(f"Graph API create latency (p95): {ms(percentile(p1_latencies, 95))}ms")
    all_mut_lat = []
    for st in p2_type_stats.values():
        all_mut_lat.extend(st["latencies"])
    if all_mut_lat:
        print(f"Graph API mutation latency (p95): {ms(percentile(all_mut_lat, 95))}ms")
    print("=" * 64)


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    test_start_time = datetime.now()
    test_start_epoch = time.time()
    test_id = f"retest-{test_start_time.strftime('%Y-%m-%d-%H%M%S')}"

    print("=" * 64)
    print("SALES BLITZ FULL RETEST")
    print(f"Test ID: {test_id}")
    print(f"Started: {test_start_time.isoformat()}")
    print("=" * 64)
    print()

    # Phase 1
    created_events, p1_latencies, p1_stats, p1_dur, rep_counts = phase1_create_events()
    total_events = p1_stats["success"] + p1_stats["failed"]

    # Phase 2
    p2_type_stats, p2_429, p2_dur, p2_untouched = phase2_mutations(created_events)

    # Phase 3
    p3_wait = phase3_wait()

    # Phase 4
    p4_results = phase4_verify(test_start_epoch)

    # Phase 5
    test_end_time = datetime.now()
    phase5_report(
        test_id, test_start_time.isoformat(), test_end_time.isoformat(),
        total_events,
        p1_stats, p1_latencies, p1_dur, rep_counts,
        p2_type_stats, p2_429, p2_dur, p2_untouched,
        p3_wait,
        p4_results,
    )

    return 0 if p1_stats["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
