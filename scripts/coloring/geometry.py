"""Editable black/white primitive construction kit, in a 100 × 100 local box.

Every returned item is a real shape, including connectors and internal panels.
No raster, sticker, stroke, custom paths or flattened compound objects.
"""
import math


class Kit:
    def __init__(self): self.items = []
    def add(self, shape, x, y, w, h=None, a=0):
        self.items.append(dict(shape='free-'+shape, x=x, y=y, width=w,
                               height=h if h is not None else w, rotation=a))
    def r(self, x,y,w,h,a=0): self.add('rectangle',x,y,w,h,a)
    def o(self, x,y,w,h=None,a=0): self.add('ellipse',x,y,w,h,a)
    def t(self, x,y,w,h,a=0): self.add('triangle',x,y,w,h,a)
    def bar(self,x1,y1,x2,y2,width=5):
        length=math.hypot(x2-x1,y2-y1)
        self.r((x1+x2-length)/2,(y1+y2-width)/2,length,width,
               math.degrees(math.atan2(y2-y1,x2-x1)))
    def put(self,name,x,y,w,h=None):
        h=w if h is None else h
        for e in build(name):
            self.items.append(dict(e,x=x+e['x']*w/100,y=y+e['y']*h/100,
                                   width=e['width']*w/100,height=e['height']*h/100))


def build(name):
    k=Kit(); r,o,t,b=k.r,k.o,k.t,k.bar
    # Small generic assemblies used by several scenes.
    if name=='snowman':
        o(15,47,70,49);o(25,19,50,43);r(20,15,60,8);r(32,2,36,15);r(24,49,53,9)
    elif name=='fence':
        r(3,37,94,8);r(3,71,94,8)
        for x in [9,35,61,84]:r(x,23,9,71);t(x,13,9,10)
    elif name=='pump':r(34,13,14,70);r(18,6,46,8);r(18,81,47,11);b(49,60,78,76,4);r(76,76,5,15)
    elif name=='spool':r(20,21,60,58);o(10,11,80,22);o(10,69,80,22);r(26,40,48,6);r(26,57,48,6)
    elif name=='arrow':r(9,43,56,17);t(53,21,38,61,90)
    elif name=='saturn':
        o(3,34,94,32,-24);o(24,23,52);o(3,40,94,18,-24)
    elif name=='comet':
        t(34,0,24,82,42);t(50,8,18,72,42);o(7,57,35)
    elif name=='earth-cut':o(6,6,88);o(19,19,62);o(33,33,34)
    # Plant and terrain forms.
    elif name in ('pine','winter-tree','tree','apple-tree','bamboo','palm','sapling'):
        r(45,40,10,57)
        if name=='pine':
            for x,y,w,h in [(5,42,90,37),(15,22,70,39),(26,2,48,40)]:t(x,y,w,h)
        elif name=='winter-tree':
            for x,y in [(16,25),(84,25),(22,54),(78,54)]:b(50,66,x,y,7)
        elif name=='bamboo':
            for x in [25,48,70]:
                r(x,12,7,85)
                for y in [27,51,75]:r(x-2,y,11,4);o(x-19,y-14,24,9,25);o(x+5,y-19,22,9,-30)
        elif name=='palm':
            for a in [-55,-25,25,55]:o(17,14,67,20,a)
            o(34,32,17);o(53,32,17)
        elif name=='sapling':o(18,39,31,17,25);o(51,23,33,17,-25)
        else:
            o(9,7,82,68)
            if name=='apple-tree':
                for x,y in [(27,29),(55,19),(55,45)]:o(x,y,13)
    elif name in ('leaf','fern','root','branch','vine'):
        b(50,90,50,12,5)
        for y in ([20,39,58,77] if name=='fern' else [28,62]):
            o(13,y,36,15,25);o(51,y-10,36,15,-25)
        if name=='root':
            for x in [15,32,68,85]:b(50,65,x,95,4)
        if name=='vine':
            for y in [20,50,80]:o(32,y-10,30,28)
    elif name in ('flower','sunflower','tulip','lotus'):
        r(47,38,6,60);o(16,68,33,15,25);o(52,79,32,15,-25)
        if name=='tulip':o(26,10,48,44);t(23,6,24,32,180);t(53,6,24,32,180)
        else:
            for a in range(0,360,60):
                rad=math.radians(a);o(50+22*math.cos(rad)-13,31+22*math.sin(rad)-16,26,32,a)
            o(36,17,28)
    elif name in ('mushroom','stump','seed','sprout','acorn','pinecone'):
        if name=='mushroom':r(40,47,20,48);o(10,7,80,54);o(29,24,15);o(58,18,16)
        elif name=='stump':r(17,31,66,59);o(17,11,66,37);o(28,18,44,23);o(41,24,19,11)
        elif name=='seed':o(25,15,50,71,22);o(40,28,19,44,22)
        elif name=='sprout':k.put('sapling',8,2,84);o(32,77,36,19)
        elif name=='acorn':o(25,30,50,63);o(17,23,66,25);r(47,9,8,17)
        else:
            o(28,4,44,90)
            for y in [17,37,57]:o(25,y,27,22,20);o(48,y+8,27,22,-20)
    elif name in ('mountain','volcano','dune','rock','iceberg','cave','glacier','cliff'):
        if name in ('mountain','iceberg','volcano','glacier'):
            t(3,4,94,90)
            if name=='volcano':o(36,18,28,12);o(43,2,12,9)
            else:t(34,4,32,31)
            if name=='glacier':r(31,55,28,39);t(58,55,30,39)
        elif name=='dune':o(2,33,96,60);o(29,49,67,44)
        elif name=='cave':o(3,10,94,85);o(26,42,48,53)
        elif name=='cliff':r(10,9,37,86);r(56,28,33,67);t(45,61,12,34)
        else:o(8,33,83,60);t(13,25,64,68);t(43,38,42,56)
    elif name in ('cloud','rain-cloud','snow-cloud','sun','moon','snowflake','wind','rainbow'):
        if name=='sun':
            for a in range(0,360,45):
                q=math.radians(a);r(48+40*math.cos(q)-3,48+40*math.sin(q)-7,6,14,a-90)
            o(23,23,50)
        elif name=='moon':o(13,8,74);o(28,26,19);o(55,47,15)
        elif name=='snowflake':
            for a in [0,60,120]:r(7,47,86,6,a)
            o(38,38,24)
        elif name=='wind':
            for y,w in [(20,72),(45,90),(70,59)]:o(5,y,w,12)
        elif name=='rainbow':
            for i in range(4):o(5+i*10,10+i*10,90-i*20,80-i*20)
            r(4,55,92,37)
        else:
            for x,y,w,h in [(7,30,49,31),(29,12,44,46),(55,27,39,34)]:o(x,y,w,h)
            if name!='cloud':
                for x in [21,46,71]:
                    if name=='rain-cloud':o(x,71,9,21,15)
                    else:k.put('snowflake',x-3,70,21)
    # Animals: species-level body proportions; no faces or expressions.
    elif name in ('butterfly','bee','ladybug','dragonfly','ant','caterpillar','mantis','cicada','grasshopper','firefly','stick-insect','beetle'):
        if name=='butterfly':
            for x,a in [(10,-25),(54,25)]:o(x,14,36,42,a);o(x+3,51,31,33,-a)
            b(46,23,37,7,3);b(54,23,63,7,3);o(44,24,12,63);o(42,16,16)
        elif name in ('dragonfly','cicada'):
            for y in [27,48]:o(4,y,44,16,-20);o(52,y,44,16,20)
            o(44,25,12,69);o(39,9,22)
        elif name=='caterpillar':
            for x,y in [(7,57),(24,49),(42,40),(60,32),(76,20)]:o(x,y,23,29)
        elif name=='stick-insect':
            for y in [31,51,70]:b(49,y,17,y-15,4);b(51,y,83,y-15,4)
            r(45,12,10,82);o(42,6,16)
        elif name in ('mantis','grasshopper'):
            b(30,57,15,90,5);b(70,57,85,90,5);b(32,62,14,42,6);b(68,62,86,42,6)
            b(38,48,20,22,4);b(62,48,80,22,4)
            o(38,28,24,60);t(34,9,32,28,180)
        elif name=='ant':
            for y in [37,51,65]:b(40,y,17,y+18,4);b(60,y,83,y+18,4)
            o(30,60,40,32);o(39,39,22,29);o(31,12,38,31)
        else:
            for y in [43,58,72]:b(29,y,13,y+11,4);b(71,y,87,y+11,4)
            if name=='bee':o(10,15,37,37,-25);o(53,15,37,37,25)
            o(23,29,54,62);o(34,7,32,29)
            if name=='bee':
                for y in [45,64]:r(25,y,50,10)
            elif name=='firefly':o(31,68,38,23)
            else:
                r(48,32,4,53)
                if name=='ladybug':
                    for x,y in [(32,43),(57,43),(32,64),(57,64)]:o(x,y,10)
    elif name in ('cat','dog','rabbit','fox','squirrel','deer','sheep','pig','duck','chicken','turtle','hedgehog','penguin','elephant','giraffe','bear','dragon','horse'):
        if name in ('duck','chicken','penguin'):
            for x in [31,59]:o(x,86,20,9)
            o(24,35,54,54);o(32,7,39,38);t(64,25,24,14,90)
            o(38,49,29,27)
            if name=='chicken':o(40,1,12,14);o(49,0,12,14)
        elif name=='turtle':
            for x in [13,65]:o(x,64,22,18)
            o(72,32,24,26);o(6,20,72,54);o(24,30,37,32)
        else:
            for x in [26,61]:r(x,60,12,32)
            if name=='giraffe':r(63,20,13,50);o(57,5,34,22);o(12,40,65,34)
            elif name=='elephant':o(5,24,73,53);o(56,15,36,43);r(79,43,13,43);o(53,26,24,30)
            elif name=='hedgehog':
                for x in [10,28,46,64]:t(x,10,23,42)
                o(10,32,72,43);t(65,42,29,25,90)
            else:
                if name in ('cat','fox'):t(2,30,32,38,-50)
                if name=='squirrel':o(1,6,31,69)
                if name=='dog':o(4,30,19,47,-30)
                if name=='dragon':t(10,10,47,52);t(51,10,43,52)
                o(18,36,61,42);o(57,15,35,36)
                if name=='rabbit':o(62,0,10,27,-15);o(78,0,10,27,15)
                elif name in ('cat','fox','dog','horse'):t(56,7,16,22);t(76,7,16,22)
                else:o(57,7,15);o(79,7,15)
                if name=='deer':b(65,18,56,2,4);b(82,18,91,2,4)
                if name=='sheep':
                    for x in [22,39,56]:o(x,32,21,26)
                if name=='pig':o(77,35,17,13)
    elif name in ('fish','whale','jellyfish','seahorse','crab','shell','coral','seaweed','starfish'):
        if name in ('fish','whale'):
            t(70,24,26,54,90);o(5,25,73,51);o(34,54,26,13,30)
        elif name=='jellyfish':
            for x in [27,42,57,72]:o(x,41,8,53)
            o(13,5,74,49)
        elif name=='seahorse':o(41,39,20,48);o(34,7,38,31);r(63,17,22,12);o(24,69,34,25);o(29,74,21,13)
        elif name=='crab':
            for y in [51,65]:b(26,y,6,y+17,5);b(74,y,94,y+17,5)
            b(30,51,17,25,5);b(70,51,83,25,5);o(5,7,22,30);o(73,7,22,30);o(23,37,54,43)
        elif name=='shell':
            for a in [-50,-25,0,25,50]:o(34,9,30,78,a)
            o(31,72,38,20)
        elif name=='starfish':
            for a in range(0,360,72):
                angle=math.radians(a)
                t(37+22*math.sin(angle),26-22*math.cos(angle),26,48,a)
            o(33,33,34)
        else:
            r(46,31,8,65)
            for y in [25,50,71]:
                if name=='coral':b(50,y+15,19,y,7);b(50,y+15,80,y-10,7)
                else:o(13,y,37,14,25);o(50,y-12,37,14,-25)
    # Architecture, furniture, staging, and transport.
    elif name in ('house','cabin','school','shop','hospital','post-office','library','fire-station','castle','treehouse','windmill','lighthouse','tent','igloo','greenhouse','gazebo'):
        if name=='tent':t(3,7,94,88);t(28,41,44,54);r(4,92,92,6)
        elif name=='igloo':o(5,17,90,78);r(6,64,88,31);o(35,55,30,40)
        elif name=='lighthouse':r(31,30,38,65);r(24,23,52,13);r(30,8,40,18);t(25,0,50,12);r(45,71,12,24)
        elif name=='castle':
            for x in [6,70]:r(x,23,24,72);t(x-3,1,30,24)
            r(28,45,44,50);o(41,64,18,31)
            for x in [34,49,64]:r(x,34,9,13)
        elif name=='gazebo':r(14,39,8,55);r(78,39,8,55);t(4,5,92,37);r(5,91,90,7)
        else:
            r(16,36,68,59);t(6,3,88,38)
            if name in ('school','shop','hospital','post-office','library','fire-station'):r(18,38,64,14)
            r(42,63,18,32)
            for x in [24,65]:r(x,54,12,16)
            if name=='cabin':
                for y in [77,87]:r(17,y,24,4);r(61,y,22,4)
            if name=='treehouse':r(42,93,17,7);r(68,73,7,27)
            if name=='greenhouse':r(20,43,60,8);r(32,43,5,47);r(64,43,5,47)
            if name=='windmill':
                for a in [0,90]:r(17,26,66,10,a)
                o(41,22,18)
            if name=='hospital':r(42,39,16,13);r(46,35,8,21)
    elif name in ('table','desk','bench','bed','sofa','shelf','cabinet','drawers','rack','frame','window','door','board','tray','box','basket','planter'):
        if name in ('table','desk','bench'):
            r(11,47,9,49);r(80,47,9,49);r(3,40,94,12)
            if name=='bench':r(11,12,78,22);r(17,29,6,18);r(77,29,6,18)
        elif name in ('bed','sofa'):
            r(8,72,10,24);r(82,72,10,24);r(5,23,90,57);r(8,56,84,23)
            if name=='bed':r(13,31,30,18);r(48,28,40,45)
            else:r(16,33,29,20);r(52,33,29,20)
        elif name in ('shelf','cabinet','drawers','rack'):
            r(7,4,86,91)
            for y in [34,64]:r(11,y,78,5)
            if name=='drawers':
                for y in [10,40,70]:r(16,y,68,20);o(44,y+5,10)
        elif name in ('frame','window','board','door'):
            r(5,5,90,90);r(13,13,74,74)
            if name=='window':r(47,13,6,74);r(13,47,74,6)
            if name=='door':o(73,48,9)
        elif name=='basket':o(18,4,64,63);o(26,12,48,47);r(10,41,80,52);r(9,38,82,10)
        elif name=='planter':r(17,27,66,67);r(10,21,80,14)
        elif name=='tray':o(3,18,94,67);o(12,27,76,49)
        else:r(8,21,84,72);r(5,17,90,14)
    elif name in ('car','bus','firetruck','train','tractor','rover','truck','carriage'):
        r(7,45,85,36);r(24,20,46,28)
        for x in [17,64]:o(x,70,22);o(x+6,76,10)
        if name=='bus':
            r(8,20,84,50)
            for x in [17,41,65]:r(x,29,17,23)
        elif name=='train':r(9,13,35,61);r(4,9,45,9);r(18,23,17,23);r(72,25,12,22);r(67,19,22,9)
        elif name=='firetruck':r(13,23,74,11);r(72,34,12,14)
        elif name=='truck':r(4,20,55,50);r(68,30,19,19)
        elif name=='tractor':o(12,60,34);r(76,30,7,22)
        elif name=='rover':r(67,4,5,19);o(61,1,17)
        else:r(32,28,14,15);r(51,28,13,15)
    elif name in ('rocket','airplane','helicopter','balloon','sailboat','submarine','spaceship','satellite','space-station'):
        if name=='rocket':t(17,54,30,37);t(53,54,30,37);r(34,28,32,62);t(34,1,32,27);o(40,41,20);r(35,78,30,8)
        elif name=='balloon':o(13,3,74,65);o(35,3,30,65);b(26,61,38,82,3);b(74,61,62,82,3);r(35,81,30,16)
        elif name=='sailboat':r(8,67,84,20);t(6,9,40,55);t(51,20,38,44);r(47,4,5,66)
        elif name=='submarine':o(7,35,84,43);r(45,19,6,19);r(45,15,19,6);t(74,43,23,25,90);o(22,44,21);o(53,44,21)
        elif name=='satellite':r(37,33,26,36);r(3,39,33,24);r(64,39,33,24);r(13,39,4,24);r(79,39,4,24);b(50,34,72,14,4);o(64,6,20)
        elif name=='space-station':r(10,43,80,18);o(28,22,44,60);r(1,31,27,44);r(72,31,27,44)
        elif name=='spaceship':o(31,16,38,45);o(5,46,90,30);o(25,53,14);o(61,53,14)
        elif name=='helicopter':o(12,34,64,42);r(70,44,25,10);r(44,19,6,17);r(11,14,71,5);r(16,83,64,5);r(24,70,5,15);r(65,70,5,15);o(20,41,23)
        else:t(9,24,82,53);o(43,3,14,90);t(27,68,46,21)
    elif name in ('bicycle','scooter','wheelbarrow','cart','excavator','crane','bridge','waterwheel','gear','windmill-blades'):
        if name in ('bicycle','scooter','cart','wheelbarrow'):
            for x in [9,69]:o(x,66,24);o(x+6,72,12)
            b(20,70,75,70,5)
            if name=='bicycle':b(22,73,40,39,4);b(40,39,62,73,4);b(40,39,73,39,4);b(73,39,62,73,4);b(73,28,82,77,4);r(33,31,19,5)
            elif name=='scooter':r(77,16,5,53);r(60,13,23,6)
            else:r(13,29,62,37);b(76,33,92,18,5)
        elif name=='excavator':r(6,72,64,17);r(16,35,33,36);r(20,42,17,19);b(48,41,77,17,9);b(77,17,88,59,8);r(76,58,21,16)
        elif name=='crane':r(42,23,12,73);r(11,13,80,9);b(15,12,46,1,5);b(46,1,90,12,5);r(77,22,4,43);o(70,60,17)
        elif name=='bridge':r(9,44,14,51);r(77,44,14,51);r(3,32,94,16);r(12,23,4,9);r(84,23,4,9);r(4,18,92,5)
        elif name=='windmill-blades':
            for a in [0,90]:r(5,42,90,16,a)
            o(39,39,22)
        else:
            if name=='gear':
                for a in range(0,360,45):r(43,3,14,94,a)
            o(10,10,80);o(23,23,54)
            if name=='waterwheel':
                for a in [0,45,90,135]:r(16,47,68,6,a)
            o(41,41,18)
    # Tools, science and art props.
    elif name in ('telescope','magnifier','microscope','magnet','scale','pulley','ramp','mirror','flashlight','compass','thermometer','windsock'):
        if name=='telescope':b(50,55,23,94,5);b(50,55,77,94,5);r(22,21,68,23,-25);r(46,42,8,23)
        elif name=='magnifier':r(43,60,14,36,-25);o(16,4,65);o(25,13,47)
        elif name=='microscope':r(12,84,76,10);r(63,40,12,45);r(29,15,19,43,-25);r(25,60,44,8);o(61,42,15)
        elif name=='magnet':r(17,17,20,65);r(63,17,20,65);r(17,67,66,20);r(17,17,20,16);r(63,17,20,16)
        elif name=='scale':r(46,21,8,70);r(26,87,48,8);r(7,20,86,6);b(18,26,5,61,3);b(18,26,33,61,3);b(82,26,67,61,3);b(82,26,95,61,3);o(2,58,34,13);o(64,58,34,13)
        elif name=='pulley':r(7,7,86,9);o(34,16,32);o(44,26,12);r(32,33,4,40);r(64,33,4,30);r(15,71,37,24);o(58,60,17)
        elif name=='ramp':t(8,19,84,75);o(56,25,20)
        elif name=='mirror':r(14,7,72,71);r(22,15,56,55);r(44,78,12,13);r(29,88,42,8)
        elif name=='flashlight':r(27,32,46,55);t(20,8,60,26,180);r(41,46,18,11)
        elif name=='compass':o(5,5,90);o(14,14,72);t(38,20,24,60,30);o(43,43,14)
        elif name=='thermometer':r(43,8,14,63);o(31,63,38);r(48,27,4,43)
        else:r(19,16,6,80);r(25,19,67,22);r(44,19,8,22);r(69,19,8,22)
    elif name in ('beaker','flask','bottle','test-tubes','funnel','dropper','water-drop','crystal','atom','water-molecule','co2','molecule','particles','ice','bubble-jar'):
        if name in ('beaker','bottle','bubble-jar'):
            r(20,20,60,73);r(15,15,70,8)
            if name!='beaker':r(34,2,32,14)
            if name=='bubble-jar':
                for x,y,z in [(32,63,16),(55,45,13),(37,28,10)]:o(x,y,z)
            else:r(23,62,54,28)
        elif name=='flask':t(15,23,70,70);r(41,6,18,30);r(36,3,28,7)
        elif name=='test-tubes':
            for x in [14,41,68]:r(x,12,18,73);o(x,74,18,16)
            r(5,47,90,9);r(5,85,90,9)
        elif name=='funnel':t(8,9,84,59,180);r(43,55,14,36)
        elif name=='dropper':r(43,26,14,57,24);o(40,2,25,36,24)
        elif name=='water-drop':t(18,5,64,62);o(18,43,64,51)
        elif name=='ice':r(18,18,64,64);r(27,27,46,46)
        elif name=='crystal':t(23,2,54,29);r(23,31,54,40);t(23,71,54,27,180);r(42,31,16,40)
        elif name in ('water-molecule','co2','molecule'):
            if name=='water-molecule':b(50,34,22,72,7);b(50,34,78,72,7);o(31,15,38);o(7,58,29);o(64,58,29)
            elif name=='co2':
                for y in [42,54]:r(20,y,61,4)
                for x in [3,36,69]:o(x,33,28)
            else:
                for x,y in [(18,18),(70,20),(22,74),(76,75)]:b(50,50,x,y,6);o(x-10,y-10,20)
                o(32,32,36)
        elif name=='particles':
            r(5,5,90,90)
            for x,y in [(14,17),(44,13),(72,23),(22,52),(61,58),(39,77)]:o(x,y,13)
        else:
            for a in [-55,0,55]:o(8,31,84,38,a)
            o(36,36,28)
    elif name in ('book','pencil','brush','palette','easel','scissors','ruler','envelope','paper','scroll','map','backpack','gift','clock','key','flag','sign','lantern','bucket','watering-can','shovel','rake','broom','glove','boot','umbrella','hat','helmet','towel','soap','toothbrush','cup','plate','bowl','spoon','pan','pot','kettle','rolling-pin'):
        if name=='book':r(7,17,42,70);r(51,17,42,70);r(14,27,28,5);r(58,27,28,5)
        elif name in ('paper','map','scroll'):r(10,7,80,87);r(22,25,50,7);r(22,48,36,7);r(22,71,54,7)
        elif name in ('pencil','brush','toothbrush'):r(40,28,20,65);t(40,5,20,23);r(40,81,20,12)
        elif name=='palette':o(8,13,84,70);o(64,30,16);o(24,30,19);o(41,56,18)
        elif name=='easel':b(34,20,15,96,6);b(66,20,85,96,6);r(10,9,80,64);r(7,73,86,7)
        elif name=='scissors':o(9,62,32);o(59,62,32);b(27,63,73,9,8);b(73,63,27,9,8);o(43,49,14)
        elif name=='ruler':r(9,28,82,37);[r(x,29,3,12) for x in [20,36,52,68,84]]
        elif name=='envelope':r(5,20,90,62);t(5,20,90,42,180)
        elif name in ('backpack','gift'):r(17,20,66,72);r(30,8,40,14);r(28,54,44,28)
        elif name=='clock':o(5,5,90);o(13,13,74);b(50,50,50,25,4);b(50,50,69,60,4);o(45,45,10)
        elif name=='key':o(11,8,39);o(21,18,19);r(26,43,10,48);r(36,67,21,8);r(36,82,17,8)
        elif name in ('flag','sign'):r(18,13,6,82);r(24,13,66,32)
        elif name=='lantern':o(29,2,42,38);r(18,30,64,57);r(13,24,74,10);r(13,87,74,9);r(44,37,12,42)
        elif name in ('bucket','cup','watering-can','kettle'):
            o(53,26,40,46);o(63,36,20,26);r(17,28,54,61)
            if name=='watering-can':b(17,62,2,35,12);o(0,23,17,20)
            if name=='kettle':t(5,44,23,38,-20);r(14,24,60,8);o(34,12,18)
        elif name in ('shovel','rake','broom'):
            r(46,12,8,63)
            if name=='shovel':o(29,64,42,31)
            elif name=='rake':r(15,69,70,7);[r(x,76,5,16) for x in [17,32,47,62,77]]
            else:t(19,61,62,34)
        elif name=='glove':o(25,30,48,60);[o(x,7,10,45) for x in [25,38,51,64]];o(69,39,16,39,35)
        elif name=='boot':r(28,7,36,66);o(26,61,66,31);r(23,88,71,7)
        elif name=='umbrella':r(48,28,5,60);o(32,75,21,20);o(6,10,88,48)
        elif name in ('hat','helmet'):o(19,9,62,62);o(5,60,90,20)
        elif name=='towel':r(17,9,66,83);r(20,22,60,10);r(20,70,60,10)
        elif name=='soap':o(9,28,82,48);o(26,38,48,25)
        elif name in ('plate','bowl'):o(5,25,90,59);o(16,34,68,39)
        elif name=='spoon':r(46,39,8,57);o(28,3,44,48)
        elif name=='pan':o(5,15,71);r(72,45,26,12)
        elif name=='pot':r(20,26,60,63);r(5,39,16,10);r(80,39,15,10);r(16,20,68,8);o(40,9,20)
        else:r(20,32,60,34);r(4,43,16,12);r(80,43,16,12)
    elif name in ('drum','piano','violin','harp','bell','music-box','loom','vase','sculpture','puppet','dancer','person','astronaut','skeleton','heart-organ','lungs','stomach','intestine','hand','foot','tooth','ear','nose','eye'):
        if name=='drum':r(14,25,72,59);o(14,12,72,26);o(14,72,72,18);b(22,10,67,31,4)
        elif name=='piano':r(7,16,86,58);r(7,61,86,22);r(13,82,8,14);r(79,82,8,14);[r(x,62,12,20) for x in [9,24,39,54,69,84]]
        elif name=='violin':o(23,39,54,52);o(28,27,44,41);r(45,5,10,57);r(35,69,30,5)
        elif name=='harp':t(9,6,82,87);t(27,24,43,53);[r(x,40,3,41) for x in [35,46,57]]
        elif name=='bell':o(40,6,20,18);t(13,20,74,59);o(10,72,80,19);o(42,86,16)
        elif name=='music-box':r(10,57,80,36);o(13,45,74,25);k.put('dancer',31,0,40,57)
        elif name=='loom':r(5,9,90,85);r(13,17,74,69);[r(x,19,4,65) for x in [22,37,52,67]];[r(15,y,70,7) for y in [37,57,77]]
        elif name=='vase':o(20,26,60,67);r(35,5,30,30);r(29,3,42,9);r(27,86,46,8)
        elif name=='sculpture':r(8,82,84,13);o(22,36,57,46);t(33,2,36,45)
        elif name in ('person','dancer','puppet','astronaut','skeleton'):
            for x in [35,57]:r(x,66,10,30)
            if name=='dancer':b(29,39,6,15,9);b(71,39,94,15,9);t(29,45,42,33)
            else:b(32,39,15,63,9);b(68,39,85,63,9);r(31,33,38,37)
            o(33,3,34,30)
            if name=='astronaut':o(38,9,24,18);r(39,42,22,17)
            if name=='skeleton':
                for y in [42,51,60]:o(34,y,32,8)
            if name=='puppet':r(10,0,80,4);r(18,4,3,28);r(78,4,3,28)
        elif name=='heart-organ':o(23,18,58,70,20);r(40,4,12,24,-15);r(59,6,12,24,15)
        elif name=='lungs':r(46,4,8,40);b(50,36,30,55,6);b(50,36,70,55,6);o(12,34,35,57);o(53,34,35,57)
        elif name=='stomach':r(35,7,10,35);o(30,30,53,55,25);o(43,42,28,26)
        elif name=='intestine':
            for y in [13,33,53,73]:o(16,y,68,19)
        elif name=='hand':k.put('glove',0,0,100)
        elif name=='foot':o(26,31,46,60,10);[o(x,y,11,18) for x,y in [(21,24),(33,11),(46,5),(59,8),(72,18)]]
        elif name=='tooth':o(18,8,64,53);t(18,42,29,52,180);t(53,42,29,52,180)
        elif name=='ear':o(19,5,62,85);o(34,21,34,48);o(35,50,19,30)
        elif name=='nose':t(25,12,50,69);o(20,64,29,19);o(51,64,29,19)
        else:o(8,29,84,44);o(31,29,38,44);o(43,41,14,20)
    elif name in ('apple','pear','strawberry','grapes','watermelon','lemon','pineapple','banana','pumpkin','carrot','tomato','corn','wheat','cabbage','bread','sandwich','dumpling','noodles','egg','cheese'):
        if name in ('apple','pear','pumpkin','tomato'):
            r(46,5,8,21);o(52,9,26,12,-25);o(12,27,76,66)
            if name=='pumpkin':o(32,27,36,66)
            if name=='pear':o(29,10,42,51)
        elif name=='strawberry':t(12,28,76,65,180);o(12,20,76,35);[o(x,y,6,9) for x,y in [(30,38),(60,38),(46,61)]]
        elif name=='grapes':
            for x,y in [(26,19),(53,19),(13,44),(40,44),(67,44),(27,69),(54,69)]:o(x,y,23)
        elif name in ('watermelon','lemon'):o(8,17,84,68);o(18,27,64,48);r(49,28,4,46)
        elif name=='pineapple':t(20,0,60,35);o(19,25,62,70);r(23,48,54,6);r(23,69,54,6)
        elif name=='banana':o(13,29,79,42,-35);o(22,19,57,30,-35)
        elif name=='carrot':t(30,24,40,71,180);o(30,3,14,33,-25);o(50,0,14,35,25)
        elif name=='corn':o(25,9,50,83);[r(31,y,38,5) for y in [28,43,58,73]]
        elif name=='wheat':r(47,8,6,90);[o(x,y,25,12,a) for x,y,a in [(23,20,30),(52,30,-30),(23,45,30),(52,55,-30),(23,70,30)]]
        elif name=='cabbage':o(8,14,84,76);o(18,25,42,54,25);o(41,25,42,54,-25)
        elif name=='bread':o(5,25,90,60);[o(x,38,9,28,25) for x in [25,45,65]]
        elif name=='sandwich':
            for y in [62,48,32]:t(9,y-20,82,46)
        elif name=='dumpling':o(6,23,88,56);o(17,27,66,33);[r(x,30,4,22,20) for x in [25,43,61]]
        elif name=='noodles':k.put('bowl',0,40,100,57);[o(x,9,8,58) for x in [23,41,59,77]]
        elif name=='egg':o(21,3,58,91);o(37,43,27)
        else:t(8,10,84,78,90);o(37,35,15);o(58,57,18)
    elif name in ('kite','ball','blocks','puzzle','top','hoop','slide','swing','sandcastle','paperboat','paperplane','skate','maze','robot','washing-machine','fountain','recycle-bin','mailbox','fossil','strata','dna','chess','net','hammock','sleeping-bag','ladder'):
        if name=='kite':t(20,3,60,45);t(20,48,60,35,180);r(48,80,4,17)
        elif name=='ball':o(5,5,90);o(31,5,38,90)
        elif name=='blocks':r(5,62,30,30);r(36,62,30,30);r(67,62,30,30);r(20,31,30,30);r(51,31,30,30);t(31,3,40,27)
        elif name=='puzzle':r(8,8,84,84);r(8,47,84,6);r(47,8,6,84);o(38,23,24);o(23,40,24)
        elif name=='top':t(15,48,70,44,180);o(15,29,70,38);r(44,6,12,30)
        elif name=='hoop':o(6,6,88);o(14,14,72)
        elif name=='slide':r(17,34,7,63);r(41,34,7,63);[r(19,y,24,5) for y in [43,61,79]];b(48,32,88,90,12);r(15,23,34,10)
        elif name=='swing':b(48,4,8,95,6);b(52,4,92,95,6);r(13,10,74,6);r(35,15,4,55);r(62,15,4,55);r(29,70,43,9)
        elif name=='sandcastle':k.put('castle',0,0,100)
        elif name in ('paperboat','paperplane'):
            t(5,16,90,60,90 if name=='paperplane' else 0);t(24,24,55,50,180)
        elif name=='skate':k.put('boot',0,0,88);[o(x,86,13) for x in [29,49,69]]
        elif name=='maze':r(4,4,92,92);r(4,28,63,7);r(60,29,7,38);r(29,61,38,7);o(16,10,14)
        elif name=='robot':
            for x in [31,57]:r(x,73,12,24)
            r(25,43,50,34);r(11,43,12,30);r(77,43,12,30);r(29,12,42,29);r(38,20,24,13);r(47,3,6,9);o(41,51,18)
        elif name=='washing-machine':r(14,5,72,90);r(18,11,64,15);o(23,32,54);o(32,41,36)
        elif name=='fountain':r(45,23,10,63);o(24,28,52,15);o(7,66,86,20);o(2,80,96,17)
        elif name in ('recycle-bin','mailbox'):r(23,28,54,65);r(18,22,64,11);r(34,40,32,9);r(46,10,8,12)
        elif name=='fossil':o(4,8,92,84);[o(x,38,14,20) for x in [20,34,48,62]];t(72,35,19,26,90)
        elif name=='strata':
            for y in [12,34,56,78]:r(4,y,92,20)
        elif name=='dna':
            for y in [9,29,49,69]:r(24,y+8,52,5,(-1)**(y//20)*20);o(16,y,18);o(67,y,18)
        elif name in ('chess','net'):r(5,5,90,90);[r(x,5,3,90) for x in [27,49,71]];[r(5,y,90,3) for y in [27,49,71]]
        elif name=='hammock':b(8,10,25,72,4);b(92,10,75,72,4);o(18,53,64,30)
        elif name=='sleeping-bag':o(24,6,52,30);r(24,26,52,68);r(26,61,48,7)
        else:r(18,5,8,90);r(74,5,8,90);[r(25,y,50,6) for y in [20,40,60,80]]
    else: raise ValueError('Unimplemented primitive object: '+name)
    assert k.items,name
    return k.items
