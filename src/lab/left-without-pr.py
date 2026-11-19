"""Recalculate src/lab/left-without-pr.json: a yearly estimate of temporary
residents who left Canada without permanent residence.

  estimate = StatCan non-permanent resident outflows
             - IRCC new permanent residents who held a study permit, an
               International Mobility Program work permit or a Temporary
               Foreign Worker Program work permit

It is not part of the daily build; the JSON is a snapshot. To refresh it:

  1. Download https://www150.statcan.gc.ca/n1/tbl/csv/17100040-eng.zip
  2. Into one folder, as IS.csv, IMP.csv and TFWP.csv, download
       https://www.ircc.canada.ca/opendata-donneesouvertes/data/ODP-TR_transition-IS_PT_immcat.csv
       https://www.ircc.canada.ca/opendata-donneesouvertes/data/ODP-TR_transition-IMP_PT_immcat.csv
       https://www.ircc.canada.ca/opendata-donneesouvertes/data/ODP-TR_transition-TFWP_PT_immcat.csv
     (the PGWP file is part of IMP and is not added)
  3. python -I src/lab/left-without-pr.py <statcan zip> <ircc folder> src/lab/left-without-pr.json <YYYY-MM-DD>

Known gaps, all of which make the estimate too high: outflows also hold
asylum claimants who became permanent residents and people who lost status
without leaving, and IRCC hides counts under five. Outflows are modelled and
revised. The downloads are parsed only, never executed.
"""
import collections
import csv
import io
import json
import os
import sys
import zipfile

statcan_zip, ircc_dir, out, retrieved = sys.argv[1:5]
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

# --- StatCan: quarterly outflows for Canada, keyed by year -> {first month of quarter: value}
z = zipfile.ZipFile(statcan_zip)
rows = csv.DictReader(io.TextIOWrapper(z.open('17100040.csv'), encoding='utf-8-sig'))
outflow = collections.defaultdict(dict)
for r in rows:
    if r['GEO'] == 'Canada' and r['Components of population growth'] == 'Non-permanent residents, outflows' and r['VALUE']:
        y, m = r['REF_DATE'].split('-')
        outflow[int(y)][int(m)] = int(float(r['VALUE']))

# --- IRCC: monthly new permanent residents by prior permit, keyed by (year, month number)
became = collections.defaultdict(int)
for name in ('IS.csv', 'IMP.csv', 'TFWP.csv'):  # PGWP is part of IMP
    raw = open(os.path.join(ircc_dir, name), 'rb').read()
    for enc in ('utf-8-sig', 'utf-16', 'cp1252'):
        try:
            text = raw.decode(enc)
            break
        except UnicodeError:
            continue
    delim = '\t' if text.count('\t') > text.count(',') else ','
    for r in csv.DictReader(io.StringIO(text), delimiter=delim):
        v = (r['TOTAL'] or '').replace(',', '').strip()
        if v.isdigit():  # "--" marks a suppressed small cell
            became[(int(r['EN_YEAR']), MONTHS.index(r['EN_MONTH']) + 1)] += int(v)

years = []
for y in sorted(outflow):
    quarters = sorted(outflow[y])
    if y < 2022:  # 2021 has only its second half
        continue
    months = [m + k for m in quarters for k in range(3)]
    out_n = sum(outflow[y].values())
    pr_n = sum(became[(y, m)] for m in months)
    years.append({
        'year': y,
        'months': len(months),
        'outflows': out_n,
        'becamePr': pr_n,
        'estimate': out_n - pr_n,
    })

doc = {
    'retrieved': retrieved,
    'what': 'Temporary residents who left without permanent residence, estimated per calendar year.',
    'method': 'StatCan non-permanent resident outflows minus IRCC new permanent residents who had '
              'held a study permit, an International Mobility Program work permit or a Temporary '
              'Foreign Worker Program work permit. A static snapshot, worked out by left-without-pr.py '
              'beside this file; probably too high (see that script).',
    'sources': {
        'outflows': 'Statistics Canada, Table 17-10-0040-01, "Non-permanent residents, outflows", Canada '
                    '(https://www150.statcan.gc.ca/n1/tbl/csv/17100040-eng.zip)',
        'becamePr': 'IRCC, Transition from Temporary Resident to Permanent Resident Status - Monthly IRCC Updates '
                    '(https://open.canada.ca/data/en/dataset/1b026aab-edb3-4d5d-8231-270a09ed4e82)',
    },
    'years': years,
}
with io.open(out, 'w', encoding='utf-8', newline='\n') as f:
    f.write(json.dumps(doc, indent=2) + '\n')
for row in years:
    print(row)
