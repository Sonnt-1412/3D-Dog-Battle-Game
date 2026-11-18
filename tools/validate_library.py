"""Validate all catalog IDs, profiles, meshes, skeletons and animation poses."""
import argparse
import math
import json
import struct
import hashlib
from pathlib import Path
from catalog import DOGS,ROOT,TYPES
from panda3d.core import NodePath,loadPrcFileData
loadPrcFileData('','window-type none\naudio-library-name null')
from direct.showbase.ShowBase import ShowBase
from direct.actor.Actor import Actor
import gltf
assert len(DOGS)==len(TYPES)*7 and len({d['id'] for d in DOGS})==len(DOGS)
assert len(TYPES)>=30
parser=argparse.ArgumentParser();parser.add_argument('--types',nargs='+')
args=parser.parse_args()
if args.types:
 TYPES=[t for t in TYPES if t['id'] in args.types]
 DOGS=[d for d in DOGS if d['type_id'] in args.types]
for t in TYPES:
 variants=[d for d in DOGS if d['type_id']==t['id']]
 assert len(variants)==7
 assert {d['variant_id'] for d in variants}=={'normal','fat','thin','short','tall','puppy','juvenile'}
 assert len({(tuple(d['profile']['color']),d['profile']['pattern']) for d in variants})==1, 'Coat changed within breed'
 adults=[d for d in variants if d.get('age_stage','adult')=='adult']
 assert len({(d['profile']['body_condition'],d['profile']['leg']) for d in adults})==5
 assert {d['age_stage'] for d in variants}=={'adult','puppy','juvenile'}
def attribute(path,semantic):
 raw=path.read_bytes();length=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+length])
 attrs=doc['meshes'][0]['primitives'][0]['attributes']
 if semantic not in attrs:return None
 accessor=doc['accessors'][attrs[semantic]];view=doc['bufferViews'][accessor['bufferView']]
 n=3 if semantic=='POSITION' else 4
 offset=28+length+view.get('byteOffset',0)+accessor.get('byteOffset',0)
 return [struct.unpack_from('<'+str(n)+'f',raw,offset+i*view.get('byteStride',n*4)) for i in range(accessor['count'])]
source=attribute(ROOT/'Textures/GLB/Labrador_AllAnimations.glb','POSITION')
body_indices=[i for i,(x,y,z) in enumerate(source) if .60<y<.86 and -.30<z<.10]
for t in TYPES:
 variants={d['variant_id']:d for d in DOGS if d['type_id']==t['id']}
 widths={};heights={};coats=[]
 for key,d in variants.items():
  points=attribute(ROOT/d['asset'],'POSITION')
  widths[key]=max(points[i][0] for i in body_indices)-min(points[i][0] for i in body_indices)
  heights[key]=max(v[1] for v in points)-min(v[1] for v in points)
  coats.append(attribute(ROOT/d['asset'],'COLOR_0'))
 assert widths['fat']>widths['normal']*1.15,(t['id'],widths)
 assert widths['thin']<widths['normal']*.90,(t['id'],widths)
 assert heights['tall']>heights['normal'] and heights['short']<heights['normal'],(t['id'],heights)
 assert all(c==coats[0] for c in coats), 'Mesh coat colors changed'
 print('BODY SHAPE PASS',t['id'],flush=True)
base=ShowBase()
for d in DOGS:
 path=ROOT/d['asset'];assert path.exists(),path
 a=Actor(NodePath(gltf.load_model(str(path))))
 assert len(a.getJoints())==80,d['id']
 for clip in ('Idle','Walk','Trot','Gallop'):
  assert clip in a.getAnimNames(),(d['id'],clip)
  for t in (0,.5):
   a.pose(clip,int((a.getNumFrames(clip)-1)*t));a.update();lo,hi=a.getTightBounds()
   assert all(math.isfinite(v) for v in (*lo,*hi))
   assert .2 < (hi-lo).length() < 6,(d['id'],clip,lo,hi)
 print('PASS',d['id'],flush=True)
 a.cleanup();a.removeNode()
base.destroy()
print(f'PASS: {len(TYPES)} groups, 5 adult body shapes + puppy + juvenile each, identical within-group coats, {len(DOGS)} assets, 80 joints and 4 sampled locomotion clips each')
