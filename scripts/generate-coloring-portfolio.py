"""Generate the 360-work official primitive-only colouring collection.

Read-only: --list / --check. Mutation: --write ONE absolute declared path.
Wrap every --write in the repository's beforeEditFile/afterEditFile hooks.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import uuid
from coloring.geometry import Kit, build
from coloring.recipes import recipes
from coloring.masterpieces import themes as painting_themes, compose as painting_compose

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'content/drawing-studio/portfolio'
DATE='2026-09-07T00:00:00.000Z'
ALLOWED={'free-rectangle','free-ellipse','free-triangle'}


def bounds(es):
    boxes=[]
    for e in es:
        a=math.radians(e['rotation']);w=e['width'];h=e['height']
        rw=abs(w*math.cos(a))+abs(h*math.sin(a));rh=abs(w*math.sin(a))+abs(h*math.cos(a))
        x=e['x']+w/2;y=e['y']+h/2
        boxes.append((x-rw/2,y-rh/2,x+rw/2,y+rh/2))
    return min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes)


def place(k,name,x,y,w,h):
    source=build(name);x0,y0,x1,y1=bounds(source)
    # Preserve the object's proportions inside its authored placement box.
    scale=min(w/(x1-x0),h/(y1-y0))
    ox=x+(w-(x1-x0)*scale)/2;oy=y+h-(y1-y0)*scale
    for e in source:
        k.items.append(dict(e,x=ox+(e['x']-x0)*scale,y=oy+(e['y']-y0)*scale,
                           width=e['width']*scale,height=e['height']*scale))


def compose(stage,objects):
    k=Kit();r,o,t=k.r,k.o,k.t
    if stage in ('radial','constellation','orbit'):
        if stage=='orbit':
            # Eight independently colourable orbital planets; diagram, not scale.
            o(95,125,810,540);o(185,195,630,400);place(k,'sun',390,290,220,220)
            for i in range(8):
                a=i*math.tau/8;size=35+(i%3)*13
                o(500+350*math.cos(a)-size/2,400+230*math.sin(a)-size/2,size)
        elif stage=='constellation':
            pts=[(160,480),(305,225),(480,320),(625,170),(800,400),(640,615),(400,560)]
            for a,b in zip(pts,pts[1:]):k.bar(*a,*b,7)
            for x,y in pts:o(x-24,y-24,48)
            place(k,'compass',70,65,105,105)
        else:
            o(160,65,680,680);place(k,objects[0],375,300,250,230)
            for i in range(8):
                a=i*math.tau/8
                place(k,objects[1+i%3],500+245*math.cos(a)-78,405+245*math.sin(a)-78,156,156)
        return k.items
    if stage in ('mosaic','quilt','quarters'):
        r(75,55,850,690)
        cols=2 if stage=='quarters' else 3
        rows=2 if stage=='quarters' else 3
        cw=810/cols;ch=650/rows
        for j in range(rows):
            for i in range(cols):
                x=95+i*cw;y=75+j*ch;r(x,y,cw,ch)
                place(k,objects[(j*cols+i)%len(objects)],x+20,y+20,cw-40,ch-40)
        return k.items
    if stage in ('cycle','sequence','pair','diagram','display'):
        if stage=='display':
            r(60,70,880,650)
            for x in [490]:r(x,85,12,620)
            r(75,388,850,12)
            for name,(x,y) in zip(objects,[(105,105),(550,105),(105,420),(550,420)]):place(k,name,x,y,335,255)
        elif stage=='diagram':
            # Large subject with flanking detail objects; no embedded text or faces.
            r(65,70,870,660)
            for name,(x,y,w,h) in zip(objects,[(330,150,340,510),(100,280,205,250),(695,280,205,250)]):place(k,name,x,y,w,h)
        elif stage=='cycle':
            slots=[(380,65,230,230),(680,310,230,230),(380,540,230,230),(80,310,230,230)]
            for x,y,a in [(640,219,40),(650,577,135),(255,592,220),(260,214,315)]:r(x,y,80,9,a)
            for name,box in zip(objects,slots):place(k,name,*box)
        else:
            r(45,590,910,95)
            n=2 if stage=='pair' else len(objects)
            for i,name in enumerate(objects[:n]):place(k,name,65+i*880/n,180,840/n,405)
            if stage=='pair':
                for i,name in enumerate(objects[2:]):place(k,name,300+i*220,580,155,135)
        return k.items
    # Common surfaces connect the objects; foreground objects sit on these planes.
    if stage in ('bench','workshop','picnic','market'):
        for x in [120,820]:r(x,585,36,161)
        r(60,573,880,29)
        if stage=='market':
            r(91,185,18,390);r(891,185,18,390);t(58,60,886,150)
        slots=[(320,170,370,403),(78,330,220,243),(715,330,207,243),(364,645,270,87)]
        if stage=='workshop':slots=[(210,170,540,403),(55,350,140,223),(765,265,180,308),(379,640,230,93)]
        if stage=='picnic':o(45,575,910,150)
    elif stage in ('room','window','laundry','stage'):
        r(40,610,920,145)
        if stage=='window':
            r(90,80,820,548);r(105,95,790,515);r(87,612,826,22)
            slots=[(350,150,300,460),(125,390,195,220),(680,350,195,260),(412,654,180,80)]
        elif stage=='laundry':
            r(78,205,14,445);r(908,205,14,445);r(91,222,817,8)
            slots=[(345,228,285,310),(75,425,225,200),(674,416,220,220),(660,234,135,150)]
        else:
            slots=[(280,170,440,440),(63,357,193,253),(746,337,195,273),(397,665,220,77)]
            if stage=='stage':r(40,65,920,60);r(40,65,75,545);r(885,65,75,545)
    elif stage in ('water','pond','river','island','delta'):
        if stage=='water':
            o(42,571,916,182)
            slots=[(330,167,350,400),(75,416,220,285),(716,375,220,320),(390,613,220,106)]
        else:
            o(40,515,920,240)
            if stage in ('river','delta'):
                r(452,504,70,241)
                if stage=='delta':r(350,607,210,30,-28);r(505,615,210,30,28)
            slots=[(291,123,430,463),(58,410,218,257),(739,390,198,272),(372,635,246,92)]
    elif stage in ('underground','terraces','desert'):
        if stage=='underground':
            r(42,114,916,633);r(43,115,914,49)
            slots=[(340,236,330,430),(80,370,220,276),(710,350,220,296),(373,174,234,106)]
        else:
            r(40,590,920,163)
            if stage=='terraces':
                for x,y,w in [(180,484,640),(110,535,780)]:r(x,y,w,55)
            slots=[(285,130,430,460),(61,340,195,250),(746,330,187,260),(376,643,245,88)]
    elif stage=='crossing':
        for x in [151,458,763]:r(x,598,61,148)
        r(40,571,920,37);r(42,752,916,7)
        # Long moving subject above a real supported bridge, mountains behind it.
        place(k,objects[1],290,80,370,350)
        place(k,objects[3],780,120,145,230)
        slots=[(255,334,495,237),(64,331,175,240),(754,640,160,110)]
        objects=[objects[0],objects[0],objects[2]]
    elif stage=='road':
        r(40,605,920,150)
        for x in range(75,895,125):r(x,677,69,13)
        slots=[(275,170,445,433),(75,344,177,261),(744,318,196,287),(392,708,216,47)]
    elif stage=='sky':
        o(42,555,916,198)
        slots=[(165,140,350,486),(562,236,355,361),(100,625,180,85),(400,636,227,94)]
    else:
        # Garden / field / forest / city / orchard / night share a ground plane.
        r(40,570,920,185)
        slots=[(303,133,400,437),(68,352,210,218),(734,328,197,242),(380,639,240,95)]
        if stage=='garden':
            for x in [73,733]:r(x,569,194,26)
        if stage=='forest':
            place(k,'pine',40,150,135,420);place(k,'pine',822,150,134,420)
        if stage=='orchard':
            place(k,'apple-tree',49,144,174,359);place(k,'apple-tree',792,163,158,340)
        if stage=='city':r(55,731,890,19)
    for index,(name,box) in enumerate(zip(objects,slots)):
        if index > 0 and name in ('sun','moon','cloud','rain-cloud','snow-cloud','snowflake','wind'):
            # Celestial/weather objects belong above the scene, never on a desk.
            box=((775,45,155,120),(65,40,155,125),(432,40,155,125))[index-1]
        if stage=='road' and name=='person':box=(780,432,140,190)
        place(k,name,*box)
    return k.items


def svg(elements):
    parts=[]
    tags={'free-rectangle':'<rect width="100" height="100"',
          'free-ellipse':'<ellipse cx="50" cy="50" rx="50" ry="50"',
          'free-triangle':'<polygon points="50,0 100,100 0,100"'}
    for e in elements:
        w=e['width'];h=e['height']
        parts.append(f'<g transform="translate({e["x"]} {e["y"]}) rotate({e["rotation"]} {w/2} {h/2}) scale({w/100} {h/100})">'+tags[e['shape']]+' fill="white" stroke="black" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></g>')
    return ''.join(parts)


def generate():
    themes=json.loads((ROOT/'content/drawing-studio/prefabricated-portfolio/v1/themes.json').read_text())['themes']
    spec=importlib.util.spec_from_file_location('approved_demos',ROOT/'scripts/generate-coloring-geometric-demos.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    approved={91:module.garden(),226:module.train(),250:module.moon()}
    records=[];categories=[];chunks={};signatures=set()
    all_themes=themes+painting_themes()
    all_recipes=recipes()+[('masterpiece',[t['key']]) for t in painting_themes()]
    for i,(theme,(stage,objects)) in enumerate(zip(all_themes,all_recipes),1):
        pid=f'pc-{i:03}';ci=(i-1)//15+1;category=f'category-{ci:02}'
        if (i-1)%15==0:categories.append(dict(id=category,label=theme['category'],count=15))
        es=approved[i].doc['elements'] if i in approved else painting_compose(objects[0]) if stage=='masterpiece' else compose(stage,objects)
        x0,y0,x1,y1=bounds(es)
        # Preserve relationships and rotations while keeping every scene in-frame.
        sc=min(1,920/(x1-x0),720/(y1-y0));dx=500-(x0+x1)*sc/2;dy=400-(y0+y1)*sc/2
        elements=[]
        for j,e in enumerate(es):
            elements.append(dict(id=f'{pid}-{j:03}',type='shape',shape=e['shape'],
                x=round(e['x']*sc+dx,4),y=round(e['y']*sc+dy,4),
                width=round(e['width']*sc,4),height=round(e['height']*sc,4),rotation=round(e['rotation'],4),
                stroke='#000000',strokeWidth=3,fill='#ffffff',layer=0,createdOrder=j))
        assert 2<=len(elements)<=1000
        assert all(e['shape'] in ALLOWED and e['width']>=1 and e['height']>=1 for e in elements)
        assert bounds(elements)[0]>=30 and bounds(elements)[1]>=30
        assert bounds(elements)[2]<=970 and bounds(elements)[3]<=770
        canonical=[{k:v for k,v in e.items() if k not in ('id','createdOrder')} for e in elements]
        signature=hashlib.sha256(json.dumps(canonical,sort_keys=True).encode()).hexdigest()
        if signature in signatures:raise ValueError(f'Duplicate scene at {pid}: {theme["title"]}')
        signatures.add(signature)
        doc=dict(schemaVersion=3,id=str(uuid.uuid5(uuid.NAMESPACE_URL,'mumu-official-portfolio/'+pid)),
                 title=theme['title'],author='',createdAt=DATE,updatedAt=DATE,
                 viewport=dict(x=20,y=20,zoom=.7),elements=elements,presets=[])
        if stage=='masterpiece':doc['portfolioReferenceId']=pid
        record=dict(id=pid,categoryId=category,title=theme['title'],subjects=theme['subjects'],
                    elementCount=len(elements),complexity='轻松' if len(elements)<=45 else '细致' if len(elements)<=85 else '丰富',
                    bounds=dict(x=0,y=0,width=1000,height=800))
        records.append(record);chunks.setdefault(category,[]).append(dict(id=pid,document=doc))
    assert len(records)==360 and len({r['title'] for r in records})==360
    data={str(OUT/'catalog.v1.json'):json.dumps(dict(schemaVersion=1,style='primitive-diy',categories=categories,works=records),ensure_ascii=False,separators=(',',':'))+'\n'}
    for category,works in chunks.items():
        data[str(OUT/f'{category}.v1.json')]=json.dumps(dict(schemaVersion=1,categoryId=category,works=works),ensure_ascii=False,separators=(',',':'))+'\n'
        # Review sheets are not runtime dependencies. All works can be audited.
        parts=['<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000" viewBox="0 0 2000 2000"><rect width="2000" height="2000" fill="white"/>']
        for j,w in enumerate(works):
            x=28+(j%4)*495;y=35+(j//4)*486
            parts.append(f'<text x="{x+15}" y="{y+32}" font-family="PingFang SC,sans-serif" font-size="20">{w["id"]} {w["document"]["title"]}</text>')
            parts.append(f'<svg x="{x}" y="{y+50}" width="470" height="376" viewBox="0 0 1000 800">{svg(w["document"]["elements"])}</svg>')
        parts.append('</svg>')
        data[str(OUT/'review'/f'{category}.svg')]=''.join(parts)
    return data,records


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--list',action='store_true');p.add_argument('--write');p.add_argument('--check',action='store_true')
    args=p.parse_args();data,records=generate()
    if args.list:print(json.dumps(list(data),ensure_ascii=False))
    elif args.check:print(json.dumps(dict(works=len(records),minElements=min(r['elementCount'] for r in records),maxElements=max(r['elementCount'] for r in records),totalElements=sum(r['elementCount'] for r in records))))
    elif args.write:
        path=str(Path(args.write).resolve())
        if path not in data:raise SystemExit('Not a declared output')
        Path(path).parent.mkdir(parents=True,exist_ok=True);Path(path).write_text(data[path],encoding='utf-8')
        print(path)
    else:p.error('Use --list, --check or --write')
