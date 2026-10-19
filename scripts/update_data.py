"""Refresh data/github.json: recent public repos, GyozaOS milestone progress and
the date the site was last pushed.

The page fetches this data live from GitHub in the visitor's browser (script.js);
this file is only the fallback for when that fails. Refresh it now and then with:
    python3 scripts/update_data.py
Uses only the standard library. Set GITHUB_TOKEN for a higher API rate limit.
If a request fails, the existing data file is left untouched.
"""
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

USER = os.environ.get('GITHUB_USER', 'Si7li')
OUT = Path(__file__).resolve().parent.parent / 'data' / 'github.json'
RECENT_COUNT = 6
# Repos that aren't projects: this site and the profile README
SKIP = {'Portfolio_Win98', USER}


def get(url, accept='application/vnd.github+json'):
    req = urllib.request.Request(url, headers={'Accept': accept, 'User-Agent': f'{USER}-portfolio'})
    token = os.environ.get('GITHUB_TOKEN')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8')


def fetch_repos():
    return json.loads(get(f'https://api.github.com/users/{USER}/repos?type=owner&sort=pushed&per_page=100'))


def site_pushed(repos):
    return next((r['pushed_at'][:10] for r in repos if r['name'] == 'Portfolio_Win98'), None)


def recent_repos(repos):
    picked = [r for r in repos if not r['fork'] and not r['archived'] and r['name'] not in SKIP]
    return [{
        'name': r['name'],
        'url': r['html_url'],
        'description': r['description'] or '',
        'language': r['language'] or '',
        'pushed': r['pushed_at'][:10],
    } for r in picked[:RECENT_COUNT]]


def gyozaos_progress():
    """Read the milestone table in GyozaOS's README.

    Rows look like "| 5–6 — Physical and virtual memory | done |"; a range counts as several milestones.
    """
    readme = get(f'https://api.github.com/repos/{USER}/GyozaOS/readme', accept='application/vnd.github.raw')
    row = re.compile(r'^\|\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*[—–-]+\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$')
    done = total = 0
    next_up = None
    for line in readme.splitlines():
        m = row.match(line)
        if not m:
            continue
        first, last, title, state = int(m[1]), int(m[2] or m[1]), m[3], m[4].strip().lower()
        count = last - first + 1
        total += count
        if state == 'done':
            done += count
        elif next_up is None:
            next_up = {'title': title, 'state': state}
    if not total:
        raise ValueError('milestone table not found in the GyozaOS README')
    return {'done': done, 'total': total, 'next': next_up}


def main():
    try:
        repos = fetch_repos()
        data = {
            'updated': site_pushed(repos),
            'repos': recent_repos(repos),
            'gyozaos': gyozaos_progress(),
        }
    except Exception as exc:  # keep the last good data rather than writing a broken file
        print(f'update failed, keeping existing data: {exc}', file=sys.stderr)
        return 1
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'wrote {OUT}: {len(data["repos"])} repos, GyozaOS {data["gyozaos"]["done"]}/{data["gyozaos"]["total"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
