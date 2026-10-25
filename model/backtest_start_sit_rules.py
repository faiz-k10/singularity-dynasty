# Which start/sit rule picks the player who actually scores more? Pairwise backtest on 2026 weeks 1-6 AS PUBLISHED (redraft_rankings:
# median / floor / ceiling, before each week's games) against what players scored (player_game_log, including the zero-point games of players
# who were on the field with no stat line; a ranked player with no game row scored 0). Every same-week, same-position pair with both medians
# >= 3 and neither listed OUT. A rule picks the pair member it scores higher; accuracy = share that actually scored more (ties in points
# excluded). Close calls (median gap <= 1, 2, 4) are the ones that matter. Pairs share players, so the true standard error is larger than the
# naive one printed. Smash / Tough Spot leans (defense_leans, tier 1 only, published through the last completed week, so no leakage) are tested
# as median + k x the quoted points effect.
# Result (Oct 24 2026): median is the best single input; floor ~ median; ceiling alone 48.1% and a 30/40/30 blend 50.2% vs median 54.4% in
# gap <= 2 pairs; the full Smash / Tough effect lifts close pairs with a flagged player from 57.2% to 65.5%; widest-range quartile beats its
# ceiling 4.5% vs 16.1% for the narrowest. -> web/lib/lineupOptimizer.js decides by median + the lean effect, nothing else.
#
# Data (run from web/ with .env.local loaded; files go in this script's folder):
#   for off in 0 1000 2000 3000; do curl -s "$URL/rest/v1/redraft_rankings?season=eq.2026&select=week,player_name,position,team,opponent,projection,floor,ceiling,notes&order=week,rank&limit=1000&offset=$off" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" > rr_$off.json; done
#   for off in 0 1000 2000 3000 4000; do curl -s "$URL/rest/v1/player_game_log?season=eq.2026&select=week,player_name,position,fantasy_points_ppr&order=week&limit=1000&offset=$off" ... > gl_$off.json; done
#   for off in 0 1000; do curl -s "$URL/rest/v1/defense_leans?select=season,week,defense,position,call,score,effect&limit=1000&offset=$off" ... > dl_$off.json; done
# Run: python3 backtest_start_sit_rules.py
import json,glob,random,math,collections,itertools
rr=[r for f in glob.glob('rr_*.json') for r in json.load(open(f))]
gl=[r for f in glob.glob('gl_*.json') for r in json.load(open(f))]
dl=[r for f in glob.glob('dl_*.json') for r in json.load(open(f))]
act={(r['player_name'],r['week']):r['fantasy_points_ppr'] for r in gl}
lean={}
for r in dl:
    if r['score']>=3.0: lean[(r['week'],r['defense'],r['position'])]=r['effect']
rows=[]
for r in rr:
    w=r['week']
    if w>6 or r['position'] not in('QB','RB','WR','TE'): continue
    if not r['projection'] or r['projection']<=0: continue
    if r['opponent'] in (None,'NA'): continue
    if r['floor'] is None or r['ceiling'] is None: continue
    if r['notes'] and 'OUT' in str(r['notes']).upper(): continue
    a=act.get((r['player_name'],w),0.0)
    # lean for week w: leans published as of week w exist for 4,5,6 (calculated through last completed week)
    le=lean.get((w,r['opponent'],r['position']))
    rows.append(dict(w=w,pos=r['position'],name=r['player_name'],m=r['projection'],f=r['floor'],c=r['ceiling'],a=a,lean=le))
print('rows',len(rows), 'with lean',sum(1 for r in rows if r['lean'] is not None))
byk=collections.defaultdict(list)
for r in rows:
    if r['m']>=3: byk[(r['w'],r['pos'])].append(r)
pairs=[]
for k,v in byk.items():
    for a,b in itertools.combinations(v,2): pairs.append((a,b))
print('pairs',len(pairs))
rules={
 'median': lambda p:p['m'],
 'floor': lambda p:p['f'],
 'ceiling': lambda p:p['c'],
 'swanson 30/40/30': lambda p:.3*p['f']+.4*p['m']+.3*p['c'],
 'median+0.25*(ceil-med)': lambda p:p['m']+.25*(p['c']-p['m']),
 'median+0.1*(ceil-med)': lambda p:p['m']+.1*(p['c']-p['m']),
 'median-0.25*(med-floor)': lambda p:p['m']-.25*(p['m']-p['f']),
 'mean of floor+ceiling': lambda p:(p['f']+p['c'])/2,
}
def ev(rule,sel):
    n=w=0; marg=0
    for a,b in sel:
        sa,sb=rule(a),rule(b)
        if sa==sb or a['a']==b['a']: continue
        pick,oth=(a,b) if sa>sb else (b,a)
        n+=1; w+= pick['a']>oth['a']; marg+=pick['a']-oth['a']
    return n,(w/n if n else float('nan')),(marg/n if n else float('nan'))
bins=[('gap<=1',lambda a,b:abs(a['m']-b['m'])<=1),('gap<=2',lambda a,b:abs(a['m']-b['m'])<=2),('gap<=4',lambda a,b:abs(a['m']-b['m'])<=4),('all',lambda a,b:True)]
for nm,cond in bins:
    sel=[(a,b) for a,b in pairs if cond(a,b)]
    print('\n==',nm,'pairs',len(sel))
    for rn,rule in rules.items():
        n,acc,marg=ev(rule,sel)
        print(f'  {rn:26s} n={n:6d} picks-higher-scorer={100*acc:5.2f}%  avg margin={marg:+.3f}')
# by position for the close-gap bin
print('\n== gap<=2 by position')
for pos in ['QB','RB','WR','TE']:
    sel=[(a,b) for a,b in pairs if a['pos']==pos and abs(a['m']-b['m'])<=2]
    out=[]
    for rn in ['median','floor','ceiling','swanson 30/40/30']:
        n,acc,marg=ev(rules[rn],sel); out.append(f'{rn}:{100*acc:.1f}%')
    print(' ',pos,len(sel),'  '.join(out))
# bootstrap difference median vs swanson on gap<=2
random.seed(1)
sel=[(a,b) for a,b in pairs if abs(a['m']-b['m'])<=2]
def outcome(rule,a,b):
    sa,sb=rule(a),rule(b)
    if sa==sb or a['a']==b['a']: return None
    pick,oth=(a,b) if sa>sb else (b,a)
    return 1 if pick['a']>oth['a'] else 0
for rn in ['floor','ceiling','swanson 30/40/30']:
    d=[]
    for a,b in sel:
        o1=outcome(rules['median'],a,b); o2=outcome(rules[rn],a,b)
        if o1 is None or o2 is None: continue
        d.append(o2-o1)
    n=len(d); mu=sum(d)/n; sd=math.sqrt(sum((x-mu)**2 for x in d)/(n-1)); se=sd/math.sqrt(n)
    print(f'{rn} minus median on gap<=2: {100*mu:+.2f} pts accuracy, se {100*se:.2f} (n={n}; pairs share players so true se is larger)')
# lean test
print('\n== Smash/Tough nudge (weeks 4-6, flagged players only)')
lr=[r for r in rows if r['lean'] is not None]
print('flagged player-weeks',len(lr))
import statistics
for call,sign in (('smash',1),('tough',-1)):
    s=[r for r in lr if (r['lean']>0)==(sign>0)]
    if s: print(call,len(s),'avg actual - median =',round(statistics.mean(r['a']-r['m'] for r in s),2),' avg effect',round(statistics.mean(r['lean'] for r in s),2))
unf=[r for r in rows if r['lean'] is None and r['w']>=4]
print('unflagged weeks4-6',len(unf),'avg actual - median =',round(statistics.mean(r['a']-r['m'] for r in unf),2))

print('\n================ lean as a start/sit adjustment ================')
def adj(k): return lambda p: p['m'] + k*(p['lean'] or 0)
sel=[(a,b) for a,b in pairs if (a['lean'] is not None or b['lean'] is not None) and abs(a['m']-b['m'])<=4]
print('close pairs (gap<=4) with at least one flagged player:',len(sel))
for k in (0,0.5,1.0,1.5):
    n,acc,marg=ev(adj(k),sel); print(f'  median + {k}*lean effect: n={n} picks-higher-scorer={100*acc:.2f}% margin={marg:+.3f}')
sel2=[(a,b) for a,b in pairs if (a['lean'] is not None or b['lean'] is not None)]
for k in (0,0.5,1.0):
    n,acc,marg=ev(adj(k),sel2); print(f'  (all gaps, n={n}) k={k}: {100*acc:.2f}%')

print('\n================ are the floor-ceiling ranges informative about spread? ================')
import statistics as st
rs=[r for r in rows if r['m']>=3]
rs.sort(key=lambda r:(r['c']-r['f']))
q=len(rs)//4
for i in range(4):
    g=rs[i*q:(i+1)*q if i<3 else len(rs)]
    sd=st.pstdev([r['a']-r['m'] for r in g]); up=sum(r['a']>r['c'] for r in g)/len(g); dn=sum(r['a']<r['f'] for r in g)/len(g)
    print(f' spread quartile {i+1}: avg range {st.mean(r["c"]-r["f"] for r in g):5.1f}  realized sd of (actual-median) {sd:5.2f}  beat ceiling {100*up:4.1f}%  below floor {100*dn:4.1f}%  n={len(g)}')
print('\nrows whose ceiling is > 3x median:')
big=[r for r in rows if r['m']>=2 and r['c']>3*r['m']]
print(len(big),'beat ceiling',round(100*sum(r['a']>r['c'] for r in big)/len(big),1),'% ; avg actual',round(st.mean(r['a'] for r in big),2),'avg median',round(st.mean(r['m'] for r in big),2))
