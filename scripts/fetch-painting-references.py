"""Resolve public-domain reference photographs; write only one declared image per run."""
import argparse, hashlib, io, json, sys, urllib.parse, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from coloring.masterpieces import PAINTINGS
ROOT=Path(__file__).resolve().parents[1]
MANIFEST=ROOT/'content/drawing-studio/portfolio/references.v1.json'
FILES=json.loads(r'''{"Mona Lisa":"Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg","The Scream":"Edvard_Munch,_1893,_The_Scream,_oil,_tempera_and_pastel_on_cardboard,_91_x_73_cm,_National_Gallery_of_Norway.jpg","Las Meninas":"Las_Meninas,_by_Diego_Velázquez,_from_Prado_in_Google_Earth.jpg","Whistler's Mother":"Whistlers_Mother_high_res.jpg","Impression, Sunrise":"Monet_-_Impression,_Sunrise.jpg","Arnolfini Portrait":"The_Arnolfini_portrait_(1434).jpg","The Starry Night":"Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg","Lady with an Ermine":"Lady_with_an_Ermine_-_Leonardo_da_Vinci_(adjusted_levels).jpg","Starry Night Over the Rhône":"Vincent_van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg","The Ambassadors (Holbein)":"Hans_Holbein_the_Younger_-_The_Ambassadors_-_Google_Art_Project.jpg","The Blue Boy":"The_Blue_Boy.jpg","The Art of Painting":"Jan_Vermeer_-_The_Art_of_Painting_-_Google_Art_Project.jpg","The Milkmaid (Vermeer)":"Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.png","Girl with a Pearl Earring":"1665_Girl_with_a_Pearl_Earring.jpg","The Astronomer":"Johannes_Vermeer_-_The_Astronomer_-_1668.jpg","The Great Wave off Kanagawa":"Tsunami_by_hokusai_19th_century.jpg","Self-Portrait (Dürer, Munich)":"Dürer_Alte_Pinakothek.jpg","A Girl with a Watering Can":"Auguste_Renoir_-_A_Girl_with_a_Watering_Can_-_Google_Art_Project.jpg","The Fifer":"Manet,_Edouard_-_Young_Flautist,_or_The_Fifer,_1866_(2).jpg","Fine Wind, Clear Morning":"「富嶽三十六景_凱風快晴」-South_Wind,_Clear_Sky_(Gaifū_kaisei),_also_known_as_Red_Fuji,_from_the_series_Thirty-six_Views_of_Mount_Fuji_(Fugaku_sanjūrokkei)_MET_DP141062.jpg","Irises (painting)":"Irises-Vincent_van_Gogh.jpg","The Hay Wain":"John_Constable_-_The_Hay_Wain_(1821).jpg","Sunflowers (Van Gogh series)":"Vincent van Gogh - Sunflowers (1888, National Gallery London).jpg","Café Terrace at Night":"Van_Gogh_-_Terrace_of_a_Café_at_Night_(Place_du_Forum)_1888.jpg","Wheatfield with Crows":"Korenveld_met_kraaien_-_s0149V1962_-_Van_Gogh_Museum.jpg","Bedroom in Arles":"Vincent_van_Gogh_-_De_slaapkamer_-_Google_Art_Project.jpg","The Fighting Temeraire":"The_Fighting_Temeraire,_JMW_Turner,_National_Gallery.jpg","The Yellow House":"Vincent_van_Gogh_-_The_yellow_house_('The_street').jpg","Haystacks (Monet series)":"Claude_Monet_-_Stacks_of_Wheat_(End_of_Summer)_-_1985.1103_-_Art_Institute_of_Chicago.jpg","Rain, Steam and Speed – The Great Western Railway":"Turner_-_Rain,_Steam_and_Speed_-_National_Gallery_file.jpg","Rouen Cathedral (Monet series)":"RouenCathedral_Monet_1894.jpg","The Basket of Apples":"Paul_Cézanne_-_The_Basket_of_Apples_-_1926.252_-_Art_Institute_of_Chicago.jpg","Water Lilies (Monet series)":"Reflections_of_Clouds_on_the_Water-Lily_Pond.jpg","Langlois Bridge at Arles":"Vincent_Van_Gogh_0014.jpg","Mont Sainte-Victoire (Cézanne)":"Paul_Cézanne_-_Montagne_Saint-victoire_-_Google_Art_Project.jpg","Almond Blossoms":"Vincent_van_Gogh_-_Almond_blossom_-_Google_Art_Project.jpg","Water Lilies (1919)":"Water Lilies MET DP-1208-001.jpg","Woman with a Parasol – Madame Monet and Her Son":"Claude_Monet_-_Woman_with_a_Parasol_-_Madame_Monet_and_Her_Son_-_Google_Art_Project.jpg","The Last Supper (Leonardo)":"The_Last_Supper_-_Leonardo_Da_Vinci_-_High_Resolution_32x16.jpg","The Birth of Venus":"Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg","The Creation of Adam":"Michelangelo_-_Creation_of_Adam_(cropped).jpg","A Sunday Afternoon on the Island of La Grande Jatte":"A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg","Bal du moulin de la Galette":"Renoir,_Pierre-Auguste_-_Dance_at_Le_Moulin_de_la_Galette,_1876.jpg","Luncheon of the Boating Party":"Pierre-Auguste_Renoir_-_Luncheon_of_the_Boating_Party_-_Google_Art_Project.jpg","The Kiss (Klimt)":"The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg","The Gleaners":"Jean-François_Millet_-_Gleaners_-_Google_Art_Project_2.jpg","Tiger in a Tropical Storm":"Surprised-Rousseau.jpg","Young Hare":"Albrecht_Dürer_-_Hare,_1502_-_Google_Art_Project.jpg","Primavera (Botticelli)":"Botticelli-primavera.jpg","The Dream (Rousseau)":"Henri_Rousseau_-_Le_Rêve_-_Google_Art_Project.jpg","The Angelus (painting)":"JEAN-FRANÇOIS_MILLET_-_El_Ángelus_(Museo_de_Orsay,_1857-1859._Óleo_sobre_lienzo,_55.5_x_66_cm).jpg","The Goldfinch (painting)":"Fabritius-vink.jpg","The Circus (Seurat)":"Georges_Seurat,_1891,_Le_Cirque_(The_Circus),_oil_on_canvas,_185_x_152_cm,_Musée_d'Orsay.jpg","Composition with Red, Blue and Yellow":"Piet_Mondriaan,_1930_-_Mondrian_Composition_II_in_Red,_Blue,_and_Yellow.jpg","The Sower (Millet)":"Jean-François_Millet_-_The_Sower_-_Google_Art_Project.jpg","Goldfish (Matisse)":"Goldfish_Matisse.jpg","The Astronomer (Vermeer)":"Johannes_Vermeer_-_The_Astronomer_-_1668.jpg","The Dream (Rousseau painting)":"Henri_Rousseau_-_Le_Rêve_-_Google_Art_Project.jpg","Composition with Red Blue and Yellow":"Piet_Mondriaan,_1930_-_Mondrian_Composition_II_in_Red,_Blue,_and_Yellow.jpg","Poppies (Monet)":"Claude_Monet_-_Poppy_Field_-_Google_Art_Project.jpg","Curtain, Jug and Fruit Bowl":"Rideau,_Cruchon_et_Compotier,_par_Paul_Cézanne,_Yorck_Project.jpg","Apples and Oranges (Cézanne)":"Nature_morte_aux_pommes_et_aux_oranges,_par_Paul_Cézanne.jpg","The Water Lily Pond":"The Water-Lily Pond 1899 Claude Monet Metropolitan.jpg","The Trout (Courbet)":"Gustave Courbet - Truite - 2383 - Kunsthaus Zürich.jpg"}''')
UA='MumuColoringEducational/1.0 (local educational reference collection)'
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=45) as r:
        return r.read()
def metadata():
    names=[FILES[p[2]].replace('_',' ') for p in PAINTINGS]
    def batch(group):
        url='https://en.wikipedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',titles='|'.join('File:'+n for n in group),prop='imageinfo',iiprop='url|extmetadata',iiurlwidth=960,iiextmetadatafilter='LicenseShortName|LicenseUrl|Copyrighted'))
        pages=json.loads(fetch(url))['query']['pages']
        return {v['title'][5:]:v['imageinfo'][0] for v in pages.values()}
    infos={}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for result in pool.map(batch,[names[i:i+15] for i in range(0,60,15)]):infos.update(result)
    works=[]
    for i,(title,artist,page,key) in enumerate(PAINTINGS):
        info=infos[names[i]];meta=info['extmetadata']
        license=meta.get('LicenseShortName',{}).get('value','')
        if license not in ('Public domain','CC0'):raise ValueError((title,license))
        url=info['thumburl'].split('?')[0]
        works.append(dict(id=f'pc-{301+i}',title=title,artist=artist,
            image=f'/images/drawing-studio/masterpieces/pc-{301+i}.jpg',
            sourceUrl=info['descriptionurl'],downloadUrl=url,license=license,
            licenseUrl=meta.get('LicenseUrl',{}).get('value','https://creativecommons.org/publicdomain/mark/1.0/'),
            sourceFile=names[i]))
    return dict(schemaVersion=1,works=works)
def download(path):
    from PIL import Image
    target=Path(path).resolve()
    entries=json.loads(MANIFEST.read_text())['works']
    item=next((x for x in entries if ROOT/'apps/web/public'/x['image'].lstrip('/')==target),None)
    if not item:raise ValueError('Not a declared reference path')
    data=fetch(item['downloadUrl'])
    im=Image.open(io.BytesIO(data));im.load();im=im.convert('RGB')
    im.thumbnail((1200,1200))
    output=io.BytesIO();im.save(output,format='JPEG',quality=88,optimize=True)
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(output.getvalue())
    print(json.dumps(dict(id=item['id'],width=im.width,height=im.height,bytes=target.stat().st_size,sha256=hashlib.sha256(output.getvalue()).hexdigest())))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--metadata',action='store_true');p.add_argument('--download');a=p.parse_args()
    if a.metadata:print(json.dumps(metadata(),ensure_ascii=False))
    elif a.download:download(a.download)
    else:p.error('Use --metadata (stdout only) or --download ONE absolute image path')
