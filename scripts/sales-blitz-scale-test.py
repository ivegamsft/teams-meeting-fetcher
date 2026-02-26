"""
Sales Blitz Scale Test - Create 320 appointments for 2 sales reps
Tests Event Hub → Lambda → S3/DynamoDB pipeline at scale
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'graph'))

from datetime import datetime, timedelta
import time
import random
import requests
from auth_helper import get_graph_headers

# Test data pools
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
    "ModernDesign", "ClassicConstruction", "FutureEnergy", "GreenEnvironmental"
]

FIRST_NAMES = [
    "James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda",
    "William", "Elizabeth", "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica",
    "Thomas", "Sarah", "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
    "Matthew", "Betty", "Anthony", "Margaret", "Mark", "Sandra"
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas",
    "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White",
    "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson"
]

LEAD_SOURCES = [
    "Website", "LinkedIn", "Referral", "Conference", "Cold Outreach", "Webinar"
]

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
    "Urgent need - go-live target in 60 days"
]


def generate_fake_leads(count):
    """Generate realistic fake sales leads"""
    leads = []
    used_emails = set()
    
    for i in range(count):
        while True:
            first = random.choice(FIRST_NAMES)
            last = random.choice(LAST_NAMES)
            company = random.choice(COMPANY_NAMES)
            # Create fake domain from company name
            domain = company.lower().replace(" ", "").replace("'", "").replace("&", "and")
            email = f"{first.lower()}.{last.lower()}@{domain}.com"
            
            # Ensure unique email
            if email not in used_emails:
                used_emails.add(email)
                break
        
        # Generate phone number
        phone = f"(555) {random.randint(100, 999)}-{random.randint(1000, 9999)}"
        
        lead = {
            "first_name": first,
            "last_name": last,
            "company": company,
            "email": email,
            "phone": phone,
            "source": random.choice(LEAD_SOURCES),
            "notes": random.choice(NOTES_TEMPLATES)
        }
        leads.append(lead)
    
    return leads


def create_appointment(rep_email, lead, start_dt, end_dt, index, total, stats):
    """Create a single appointment via Graph API with retry logic"""
    
    headers = get_graph_headers()
    url = f"https://graph.microsoft.com/v1.0/users/{rep_email}/events"
    
    body_html = f"""<h3>Lead Details</h3>
<ul>
<li><b>Contact:</b> {lead['first_name']} {lead['last_name']}</li>
<li><b>Company:</b> {lead['company']}</li>
<li><b>Email:</b> {lead['email']}</li>
<li><b>Phone:</b> {lead['phone']}</li>
<li><b>Source:</b> {lead['source']}</li>
<li><b>Notes:</b> {lead['notes']}</li>
</ul>
<h3>Agenda</h3>
<ol>
<li>Introduction &amp; company overview</li>
<li>Needs assessment</li>
<li>Product fit discussion</li>
<li>Next steps</li>
</ol>"""
    
    payload = {
        "subject": f"Sales Call: {lead['company']} - {lead['first_name']} {lead['last_name']}",
        "body": {
            "contentType": "HTML",
            "content": body_html
        },
        "start": {
            "dateTime": start_dt.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "Eastern Standard Time"
        },
        "end": {
            "dateTime": end_dt.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "Eastern Standard Time"
        },
        "location": {
            "displayName": "Microsoft Teams Meeting"
        },
        "isOnlineMeeting": True,
        "onlineMeetingProvider": "teamsForBusiness"
    }
    
    max_retries = 5
    retry_count = 0
    base_wait = 1.0
    
    while retry_count <= max_retries:
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            
            if response.status_code == 201:
                stats['created'] += 1
                if retry_count > 0:
                    stats['retried_success'] += 1
                
                # Print progress every 10 events
                if index % 10 == 0:
                    day_name = start_dt.strftime("%a")
                    time_str = start_dt.strftime("%I:%M %p")
                    rep_name = rep_email.split('@')[0]
                    print(f"[{index}/{total}] {rep_name} - {day_name} {time_str}: {payload['subject']} ✅")
                    rate = stats['created'] / (time.time() - stats['start_time']) if stats['created'] > 0 else 0
                    print(f"[{index}/{total}] Progress: {stats['created']} created, {stats['retried_success']} retried, {stats['failed']} failed | Rate: {rate:.1f}/sec")
                
                return True
                
            elif response.status_code == 429:
                # Rate limited
                stats['rate_limited'] += 1
                retry_after = response.headers.get('Retry-After', None)
                
                if retry_after:
                    wait_time = int(retry_after)
                else:
                    wait_time = base_wait * (2 ** retry_count)
                
                print(f"[{index}/{total}] 🔶 429 Rate Limited - waiting {wait_time}s (retry {retry_count+1}/{max_retries})")
                time.sleep(wait_time)
                retry_count += 1
                
            else:
                print(f"[{index}/{total}] ❌ HTTP {response.status_code}: {response.text[:100]}")
                stats['failed'] += 1
                return False
                
        except Exception as e:
            print(f"[{index}/{total}] ❌ Exception: {str(e)[:100]}")
            if retry_count < max_retries:
                wait_time = base_wait * (2 ** retry_count)
                print(f"[{index}/{total}] 🔄 Retrying in {wait_time}s...")
                time.sleep(wait_time)
                retry_count += 1
            else:
                stats['failed'] += 1
                return False
    
    # Max retries exceeded
    print(f"[{index}/{total}] ❌ Max retries exceeded")
    stats['failed'] += 1
    return False


def get_daily_slots():
    """Build the daily slot schedule with breaks.

    Returns list of (hour, minute) tuples for each 15-min appointment start.
    Schedule:
      9:00 - 10:30  Morning block     (6 slots)
      10:30 - 10:45 Morning break
      10:45 - 12:00 Late morning       (5 slots)
      12:00 - 1:00  Lunch
      1:00 - 3:00   Early afternoon    (8 slots)
      3:00 - 3:15   Afternoon break
      3:15 - 5:00   Late afternoon     (7 slots)
    Total: 26 slots per day per rep
    """
    slots = []
    blocks = [
        (9, 0, 10, 30),    # Morning: 9:00 - 10:30
        (10, 45, 12, 0),   # Late morning: 10:45 - 12:00
        (13, 0, 15, 0),    # Early afternoon: 1:00 - 3:00
        (15, 15, 17, 0),   # Late afternoon: 3:15 - 5:00
    ]
    for start_h, start_m, end_h, end_m in blocks:
        t = start_h * 60 + start_m
        end = end_h * 60 + end_m
        while t < end:
            slots.append((t // 60, t % 60))
            t += 15
    return slots


def main():
    """Execute the sales blitz scale test"""
    print("=" * 70)
    print("SALES BLITZ SCALE TEST")
    print("=" * 70)
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Configuration
    reps = [
        "trustingboar@ibuyspy.net",
        "boldoriole@ibuyspy.net"
    ]
    
    # Week: March 2-6, 2026
    base_date = datetime(2026, 3, 2)  # Monday, March 2, 2026
    daily_slots = get_daily_slots()
    slots_per_day = len(daily_slots)  # 26
    total_slots = 5 * slots_per_day * len(reps)  # 260
    
    print(f"Schedule: {slots_per_day} slots/day/rep (with lunch + breaks)")
    print(f"  Morning:   9:00 - 10:30  (6 slots)")
    print(f"  Break:     10:30 - 10:45")
    print(f"  Late AM:   10:45 - 12:00 (5 slots)")
    print(f"  Lunch:     12:00 - 1:00")
    print(f"  Afternoon: 1:00 - 3:00   (8 slots)")
    print(f"  Break:     3:00 - 3:15")
    print(f"  Late PM:   3:15 - 5:00   (7 slots)")
    print(f"  Total:     {total_slots} appointments for {len(reps)} reps\n")
    
    # Generate leads
    print(f"Generating {total_slots} fake leads...")
    leads = generate_fake_leads(total_slots)
    print(f"✅ Generated {len(leads)} leads\n")
    
    # Statistics
    stats = {
        'created': 0,
        'failed': 0,
        'retried_success': 0,
        'rate_limited': 0,
        'start_time': time.time(),
        'rep_stats': {rep: {'created': 0, 'failed': 0} for rep in reps}
    }
    
    print("Creating appointments...\n")
    
    # Create appointments: iterate day → slot → rep
    lead_idx = 0
    
    for day in range(5):  # Mon-Fri
        day_date = base_date + timedelta(days=day)
        day_name = day_date.strftime("%A %b %d")
        print(f"\n--- {day_name} ---")
        
        for hour, minute in daily_slots:
            for rep in reps:
                slot_start = day_date.replace(hour=hour, minute=minute)
                slot_end = slot_start + timedelta(minutes=15)
                
                lead = leads[lead_idx]
                lead_idx += 1
                
                success = create_appointment(
                    rep, lead, slot_start, slot_end,
                    lead_idx, total_slots, stats
                )
                
                if success:
                    stats['rep_stats'][rep]['created'] += 1
                else:
                    stats['rep_stats'][rep]['failed'] += 1
                
                # Pacing delay between requests
                time.sleep(0.1)
    
    # Final summary
    duration = time.time() - stats['start_time']
    avg_rate = stats['created'] / duration if duration > 0 else 0
    
    print("\n" + "=" * 70)
    print("SALES BLITZ SCALE TEST - RESULTS")
    print("=" * 70)
    print(f"Total appointments:  {total_slots}")
    print(f"Created:             {stats['created']}")
    print(f"Failed:              {stats['failed']}")
    print(f"Retried (success):   {stats['retried_success']}")
    print(f"Rate limited (429):  {stats['rate_limited']}")
    print()
    
    for rep in reps:
        rep_name = rep.split('@')[0]
        print(f"{rep_name}: {stats['rep_stats'][rep]['created']} created, {stats['rep_stats'][rep]['failed']} failed")
    
    print()
    minutes = int(duration // 60)
    seconds = int(duration % 60)
    print(f"Duration: {minutes}m {seconds}s")
    print(f"Average rate: {avg_rate:.2f} events/sec")
    print("=" * 70)
    
    return 0 if stats['failed'] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
