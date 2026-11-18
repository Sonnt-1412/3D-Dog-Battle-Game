"""Check real ear geometry, fixed body/coat and cached skin/animation integrity."""
import json,struct,math
from catalog import DOGS,ROOT,ear_cache_path
from ear_shapes import EAR_STYLES
from panda3d.core import NodePath,loadPrcFileData
loadPrcFileData('','window-type none\naudio-library-name null')
from direct.showbase.ShowBase import ShowBase
from direct.actor.Actor import Actor
import gltf

def load(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);return d,b[28+n:]
def attr(d,b,key):
 a=d['accessors'][d['meshes'][0]['primitives'][0]['attributes'][key]];v=d['bufferViews'][a['bufferView']]
 count=3 if key=='POSITION' else 4;fmt='<'+str(count)+'f'
 return [struct.unpack_from(fmt,b,v.get('byteOffset',0)+a.get('byteOffset',0)+i*v.get('byteStride',count*4)) for i in range(a['count'])]
dog=next(d for d in DOGS if d['id']=='phu_quoc')
source,sb=load(ROOT/'Textures/GLB/Labrador_AllAnimations.glb');sp=attr(source,sb,'POSITION')
body=[i for i,p in enumerate(sp) if p[1]<.90 or p[2]<.35]
ear=[i for i,p in enumerate(sp) if p[1]>1.03 and abs(p[0])>.12 and .52<p[2]<.71]
base,bb=load(ROOT/dog['asset']);bp=attr(base,bb,'POSITION');bc=attr(base,bb,'COLOR_0')
base_app=ShowBase();heights={}
for style in EAR_STYLES:
 if style=='base':continue
 path=ear_cache_path(dog,style);doc,b=load(path);p=attr(doc,b,'POSITION')
 assert len(p)==len(bp)
 assert all(p[i]==bp[i] for i in body),(style,'Body changed while changing ears')
 assert attr(doc,b,'COLOR_0')==bc,(style,'Coat changed')
 assert sum(p[i]!=bp[i] for i in ear)>100,(style,'Ear mesh did not change')
 assert len(doc['skins'][0]['joints'])==80
 heights[style]=max(p[i][1] for i in ear)
 actor=Actor(NodePath(gltf.load_model(str(path))))
 for clip in ('Idle','Walk','Gallop'):
  actor.pose(clip,actor.getNumFrames(clip)//2);actor.update();lo,hi=actor.getTightBounds()
  assert all(math.isfinite(v) for v in (*lo,*hi)) and (hi-lo).length()<6
 actor.cleanup();actor.removeNode()
 print('EAR PASS',style,flush=True)
assert heights['upright']>heights['floppy']+.10,heights
base_app.destroy();print('PASS: six distinct ear meshes, fixed body/coat, 80 joints and animated poses')
