"""Run from the operator's monitor; prints status only and exits nonzero on failure."""
import argparse
import json
import urllib.request
parser=argparse.ArgumentParser();parser.add_argument('origin');args=parser.parse_args()
try:
    with urllib.request.urlopen(args.origin.rstrip('/')+'/api/health',timeout=10) as response:
        ready=response.status==200 and json.load(response).get('status')=='ready'
except Exception: ready=False
print('ready' if ready else 'unavailable')
raise SystemExit(0 if ready else 1)
