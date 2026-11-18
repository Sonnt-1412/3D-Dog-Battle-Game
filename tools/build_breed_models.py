"""Build breed-inspired meshes and matching bind skeletons from the supplied dog.
Run with Blender's Python (numpy and mathutils). Original source is untouched.
These are procedural breed approximations.
"""
from pathlib import Path
import argparse
import os
import copy
import json
import struct
import math
import hashlib
import numpy as np
from mathutils import Matrix, Quaternion, Vector
import bpy

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'Textures/GLB/Labrador_AllAnimations.glb'
raw = SOURCE.read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
original = json.loads(raw[20:20+length])
original_binary = raw[28+length:]
import sys
sys.path.insert(0,str(ROOT))
from catalog import DOGS, ear_cache_path
from ear_shapes import EAR_STYLES
from dog_shape import GEOMETRY_VERSION, MUZZLE_PROFILES, appearance_profile, deform, smooth_mesh_normals
from dog_fur import FUR_VERSION,build_fur,is_shaggy_coat
from dog_groom import detailed_groom
from dog_frames import ANATOMY_VERSION,authored_ears,bind_source_point
from anatomical_ears import make_ears
BREEDS={dog['id']:dog['profile'] for dog in DOGS}

def smooth(a,b,x):
    t=np.clip((x-a)/(b-a),0,1)
    return t*t*(3-2*t)

parser=argparse.ArgumentParser()
parser.add_argument("--breeds", nargs="+", choices=tuple(BREEDS), default=list(BREEDS))
parser.add_argument('--missing-only',action='store_true')
parser.add_argument('--appearance-only',action='store_true',help='Rebuild tapered-muzzle or groomed-coat families')
parser.add_argument('--shaggy-only',action='store_true',help='Rebuild long coats with layered fibres')
parser.add_argument('--ear-style',choices=tuple(EAR_STYLES),default='base')
parser.add_argument('--age-stage',nargs='+',choices=('adult','puppy','juvenile'),help='Build selected developmental stages')
args=parser.parse_args(__import__("sys").argv[__import__("sys").argv.index("--")+1:] if "--" in __import__("sys").argv else [])

neutral_coat_encoded=None
neutral_coat_pixels=None
fur_atlas_encoded=None
for breed,cfg in BREEDS.items():
    if breed not in args.breeds: continue
    family=cfg.get('base_breed',breed)
    if args.shaggy_only and not is_shaggy_coat(cfg):continue
    if is_shaggy_coat(cfg):cfg.setdefault('groom_quality',2)
    if args.appearance_only and family not in MUZZLE_PROFILES and appearance_profile(cfg)['fur_length']<=.004:continue
    dog_record=next(d for d in DOGS if d['id']==breed)
    if args.age_stage and dog_record.get('age_stage','adult') not in args.age_stage:continue
    output_path=ROOT/'assets'/f'{breed}_detailed.glb' if args.ear_style=='base' else ear_cache_path(dog_record,args.ear_style)
    if args.missing_only and output_path.exists():continue
    doc=copy.deepcopy(original); binary=bytearray(original_binary)
    def read(index):
        a=doc['accessors'][index]; v=doc['bufferViews'][a['bufferView']]
        count={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        dtype={5126:'<f4',5123:'<u2',5121:'u1',5125:'<u4'}[a['componentType']]
        size=np.dtype(dtype).itemsize
        return np.ndarray((a['count'],count),dtype=dtype,buffer=binary,
            offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',size*count),size)).copy()
    def append(array,kind):
        array=np.asarray(array,dtype='<f4'); binary.extend(b'\0'*(-len(binary)%4)); offset=len(binary)
        binary.extend(array.tobytes()); vi=len(doc['bufferViews']);doc['bufferViews'].append(dict(buffer=0,byteOffset=offset,byteLength=array.nbytes))
        ai=len(doc['accessors']);doc['accessors'].append(dict(bufferView=vi,componentType=5126,count=len(array),type=kind))
        if kind=='VEC3':doc['accessors'][ai].update(min=array.min(0).tolist(),max=array.max(0).tolist())
        return ai
    def append_integer(array,kind,dtype,component):
        array=np.asarray(array,dtype=dtype);binary.extend(b'\0'*(-len(binary)%4))
        vi=len(doc['bufferViews'])
        doc['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=array.nbytes))
        binary.extend(array.tobytes());ai=len(doc['accessors'])
        doc['accessors'].append(dict(bufferView=vi,componentType=component,count=len(array),type=kind))
        return ai
    def warp(points, ear_weight=None):
        return deform(points,cfg,ear_weight,args.ear_style)
    if family in ('pug','chihuahua'):
        # Regression: face depth must increase toward the nose at every height.
        for height in (.88, .98, 1.10, 1.22):
            samples=np.c_[np.zeros(300),np.full(300,height),np.linspace(.52,1.0,300)]
            assert np.all(np.diff(warp(samples)[:,2])>0), 'Folded facial depth'
        # Keep the cranium three dimensional: only the nose may shorten.
        skull_axis=np.array([[0,1.10,.48],[0,1.10,.76]])
        source_depth=skull_axis[1,2]-skull_axis[0,2]
        depth=np.diff(warp(skull_axis)[:,2])[0]
        assert depth > source_depth*cfg['length']*.80, 'Flattened skull'
        # Ear transformation must retain distinct vertex positions beyond the tip.
        ear_samples=np.array([[.16,y,.64] for y in (.94,.97,1.00,1.03,1.06)])
        mapped=warp(ear_samples,np.ones(5))
        assert np.all(np.linalg.norm(np.diff(mapped,axis=0),axis=1)>1e-4), 'Collapsed ear tip'
    parents={child:i for i,n in enumerate(doc['nodes']) for child in n.get('children',[])}
    def local(i):
        n=doc['nodes'][i];q=n.get('rotation',[0,0,0,1])
        return Matrix.LocRotScale(n.get('translation',[0,0,0]),Quaternion((q[3],*q[:3])),n.get('scale',[1,1,1]))
    old_world={}
    def world(i):
        if i not in old_world:old_world[i]=world(parents[i])@local(i) if i in parents else local(i)
        return old_world[i]
    for i in range(len(doc['nodes'])):world(i)
    joints=set(j for skin in doc['skins'] for j in skin['joints'])
    new_world={i:m.copy() for i,m in old_world.items()}
    for i in joints:
        ew=[1.0] if doc['nodes'][i].get('name','').startswith('ear') else None
        raw_point=bind_source_point(doc['nodes'][i].get('name',''),old_world[i].translation,cfg,args.ear_style)
        new_world[i].translation=Vector(warp([raw_point],ew)[0])
    deltas={}
    for i in joints:
        new_local=new_world[parents[i]].inverted()@new_world[i] if i in parents else new_world[i]
        old=Vector(doc['nodes'][i].get('translation',[0,0,0]));new=new_local.translation
        deltas[i]=np.array(new)-np.array(old);doc['nodes'][i]['translation']=list(new)
    for skin in doc['skins']:
        matrices=np.array([np.array(new_world[j].inverted()).T.reshape(16) for j in skin['joints']])
        skin['inverseBindMatrices']=append(matrices,'MAT4')
    translation_maps={}
    for animation in doc['animations']:
        for channel in animation['channels']:
            target=channel['target'];i=target['node']
            pointed=appearance_profile(cfg)['muzzle_taper']>0
            if target['path']=='rotation' and (family in ('pug','chihuahua') or cfg.get('puppy_amount',0) or pointed):
                name=doc['nodes'][i].get('name','')
                influence=(.42 if family=='pug' else .75) if name=='jaw' else .45 if name.startswith('ear') else 1.0
                if family not in ('pug','chihuahua'):influence=.72 if name=='jaw' and pointed else 1.0
                puppy=cfg.get('puppy_amount',0)
                if name=='jaw':influence*=1-.40*puppy
                elif name.startswith('ear'):influence*=1-.25*puppy
                if influence < 1:
                    sampler=animation['samplers'][channel['sampler']]
                    values=read(sampler['output'])
                    rest=doc['nodes'][i].get('rotation',[0,0,0,1])
                    rest=Quaternion((rest[3],*rest[:3]))
                    adjusted=[]
                    for q in values:
                        result_q=rest.slerp(Quaternion((float(q[3]),*map(float,q[:3]))),influence)
                        adjusted.append([result_q.x,result_q.y,result_q.z,result_q.w])
                    sampler['output']=append(adjusted,'VEC4')
            if target['path']=='translation' and i in deltas:
                sampler=animation['samplers'][channel['sampler']]
                values=read(sampler['output'])
                if cfg.get('anatomy_frame'):
                    if i not in translation_maps:
                        point=np.asarray(bind_source_point(doc['nodes'][i].get('name',''),old_world[i].translation,cfg,args.ear_style));eps=1e-4
                        ew=np.ones(3) if doc['nodes'][i].get('name','').startswith('ear') else None
                        jac=((warp(point+np.eye(3)*eps,ew)-warp(point-np.eye(3)*eps,ew))/(2*eps)).T
                        parent=parents.get(i)
                        old_basis=np.asarray(old_world[parent])[:3,:3] if parent is not None else np.eye(3)
                        new_basis=np.asarray(new_world[parent])[:3,:3] if parent is not None else np.eye(3)
                        translation_maps[i]=np.linalg.inv(new_basis)@jac@old_basis
                    mapped=translation_maps[i]
                    original_rest=np.asarray(original['nodes'][i].get('translation',[0,0,0]))
                    new_rest=np.asarray(doc['nodes'][i].get('translation',[0,0,0]))
                    values=new_rest+(values-original_rest)@mapped.T
                else:values+=deltas[i]
                sampler['output']=append(values,'VEC3')
            if target['path']=='rotation' and cfg.get('relaxed_expression',False):
                name=doc['nodes'][i].get('name','')
                if name=='jaw' and animation.get('name') in ('Idle','Walk','Trot','Gallop'):
                    sampler=animation['samplers'][channel['sampler']]
                    close=Quaternion((1,0,0),math.radians(10.))
                    adjusted=[]
                    for q in read(sampler['output']):
                        value=Quaternion((float(q[3]),*map(float,q[:3])))*close
                        value.normalize();adjusted.append([value.x,value.y,value.z,value.w])
                    sampler['output']=append(adjusted,'VEC4')
    fur_sources=[]
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            attrs=primitive['attributes']; p=read(attrs['POSITION'])
            skin=doc['skins'][0]
            ear_slots=[j for j,node in enumerate(skin['joints']) if doc['nodes'][node].get('name','').startswith('ear')]
            ids=read(attrs['JOINTS_0']);weights=read(attrs['WEIGHTS_0'])
            ear_sum=np.sum(np.where(np.isin(ids,ear_slots),weights,0),axis=1)
            ear_weight=smooth(.05,.85,ear_sum)
            if primitive.get('material')==0 and authored_ears(cfg,args.ear_style):
                triangles=read(primitive['indices']).astype(int).reshape(-1,3)
                distal=(ear_weight[triangles].max(1)>.12)&(p[triangles,1].mean(1)<1.155)
                triangles=triangles[~distal]
                primitive['indices']=append_integer(triangles.reshape(-1),'SCALAR','<u4',5125)
            if primitive.get('material')==0:
                fur_sources.append((mesh,primitive,p,ear_weight,read(primitive['indices'])))
            result=warp(p,ear_weight)
            attrs['POSITION']=append(result,'VEC3')
            # Use the final surface, including gradients in ear skin weights.
            normal=smooth_mesh_normals(p,result,read(primitive['indices']))
            zero=np.linalg.norm(normal,axis=1)<.5
            if zero.any():normal[zero]=read(attrs['NORMAL'])[zero]
            normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-15)
            attrs['NORMAL']=append(normal,'VEC3')
            if primitive.get('material')!=0 or cfg.get('pattern')=='original':continue
            x,y,z=p.T
            colors=np.tile(cfg.get('color',[.4,.2,.05]),(len(p),1))
            pattern=cfg.get('pattern','solid')
            cream=np.array([.78,.75,.66]); dark=np.array([.025,.024,.022]); tan=np.array([.38,.16,.035])
            bib=smooth(.30,.48,z)*(1-smooth(.65,.90,y))*(1-smooth(.1,.22,np.abs(x)))
            socks=1-smooth(.13,.24,y)
            blaze=(1-smooth(.02,.05,np.abs(x)))*smooth(.70,.80,z)*smooth(.94,1.04,y)
            if pattern in ('bib','blaze','tricolor','husky'):
                mask=np.maximum(bib,socks*(.9 if pattern!='bib' else .45))
                if pattern in ('blaze','tricolor'):mask=np.maximum(mask,blaze)
                if pattern=='husky':mask=np.maximum(mask,smooth(.58,.82,z)*(1-smooth(1.06,1.18,y)))
                colors=colors*(1-mask[:,None])+cream*mask[:,None]
            if pattern in ('mask','saddle'):
                mask=smooth(.70,.86,z)*smooth(.90,1.06,y)
                colors=colors*(1-mask[:,None])+np.array([.055,.043,.030])*mask[:,None]
            if pattern in ('saddle','tricolor'):
                mask=smooth(.70,.90,y)*(1-smooth(.15,.45,z))
                colors=colors*(1-mask[:,None])+dark*mask[:,None]
            if pattern=='tan':
                mask=np.maximum((1-smooth(.17,.30,y)),smooth(.71,.86,z)*(1-smooth(1.04,1.14,y)))
                colors=colors*(1-mask[:,None])+tan*mask[:,None]
            if pattern=='sable':colors*= (1-.45*smooth(.80,1.13,y))[:,None]
            if pattern=='brindle':
                band=smooth(.45,.80,np.sin(z*65+x*12+np.sin(y*24)))
                colors=colors*(1-band[:,None]*.65)
            if pattern=='pied':
                patches=smooth(-.1,.3,np.sin(z*13+x*8)*np.cos(y*9))
                colors=colors*(1-patches[:,None])+cream*patches[:,None]
            if pattern=='spots':
                spots=smooth(.68,.84,np.sin(x*83+z*21)*np.cos(y*71-z*13))
                colors=colors*(1-spots[:,None])+dark*spots[:,None]
            if cfg.get('ridge'):
                ridge=(1-smooth(.012,.035,np.abs(x)))*smooth(.87,1.01,y)*(1-smooth(.1,.35,z))
                colors*=1-ridge[:,None]*.32
            attrs['COLOR_0']=append(np.c_[colors,np.ones(len(p))],'VEC4')
    # Neutralize the golden coat tint while retaining the original texture detail,
    # dark eyes, pads, nose, and UVs. All source textures remain untouched.
    if cfg.get('pattern')!='original':
        image_index=doc['textures'][doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
        im=doc['images'][image_index];view=doc['bufferViews'][im['bufferView']]
        if neutral_coat_encoded is None:
            temp=ROOT/'assets'/ f'_coat_source_{os.getpid()}.png';temp.write_bytes(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])
            image=bpy.data.images.load(str(temp),check_existing=False)
            pixels=np.array(image.pixels[:],dtype=np.float32).reshape(-1,4)
            lum=pixels[:,:3].max(1)
            # The neutral source texture is identical for every body profile.
            neutral=np.clip(lum**.85*.85,0,1);pixels[:,:3]=neutral[:,None]
            neutral_coat_pixels=pixels.reshape(image.size[1],image.size[0],4).copy()
            image.pixels.foreach_set(pixels.ravel());image.filepath_raw=str(ROOT/'assets'/f'_coat_neutral_{os.getpid()}.png');image.file_format='PNG';image.save()
            neutral_coat_encoded=Path(image.filepath_raw).read_bytes();bpy.data.images.remove(image)
        encoded=neutral_coat_encoded;binary.extend(b'\0'*(-len(binary)%4));vi=len(doc['bufferViews']);doc['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=len(encoded)));binary.extend(encoded)
        im['bufferView']=vi;im['mimeType']='image/png'
    doc['materials'][0]['name']=f'{breed.title()} detailed coat';doc['materials'][0]['pbrMetallicRoughness']['roughnessFactor']=.9
    if detailed_groom(cfg):doc['materials'][0]['pbrMetallicRoughness']['roughnessFactor']=.76
    from rig_refinement import refine
    refine(doc,binary,read,append,old_world,new_world,warp,original,original_binary)
    fur_count=0
    for mesh,primitive,source_points,ear_weight,faces in fur_sources:
        attrs=primitive['attributes']
        colors=read(attrs['COLOR_0']) if 'COLOR_0' in attrs else np.ones((len(source_points),4))
        fur=build_fur(source_points,read(attrs['POSITION']),read(attrs['NORMAL']),
                      read(attrs['TEXCOORD_0']),colors,read(attrs['JOINTS_0']),
                      read(attrs['WEIGHTS_0']),faces,cfg,ear_weight)
        if fur is None:continue
        material=copy.deepcopy(doc['materials'][primitive['material']])
        material.update(name=f"{breed} strand fur",doubleSided=True,alphaMode='OPAQUE')
        material.pop('alphaCutoff',None)
        material.pop('emissiveFactor',None)
        material['pbrMetallicRoughness']['roughnessFactor']=1.
        if detailed_groom(cfg):material['pbrMetallicRoughness']['roughnessFactor']=.64
        if 'alpha_atlas' in fur:
            if neutral_coat_pixels is not None:
                # Match the retained skin texture's linear albedo at each root.
                # Without this, white atlas cards become brighter flakes over
                # the darker textured coat. Blender's image rows are bottom-up.
                uv0=fur['root_texture_uv'];texture=neutral_coat_pixels
                tx=np.clip((uv0[:,0]*texture.shape[1]).astype(int),0,texture.shape[1]-1)
                ty=np.clip(((1-uv0[:,1])*texture.shape[0]).astype(int),0,texture.shape[0]-1)
                fur['colors'][:,:3]*=texture[ty,tx,:3]
            material.update(name=f'{breed} groom cards',alphaMode='MASK',alphaCutoff=.30)
            if fur_atlas_encoded is None:
                pixels=fur['alpha_atlas'];height,width=pixels.shape[:2]
                image=bpy.data.images.new('rooted fibre atlas',width=width,height=height,alpha=True)
                image.pixels.foreach_set(pixels[::-1].copy().ravel())
                image.filepath_raw=str(ROOT/'assets'/f'_fur_atlas_{os.getpid()}.png')
                image.file_format='PNG';image.save()
                fur_atlas_encoded=Path(image.filepath_raw).read_bytes();bpy.data.images.remove(image)
            binary.extend(b'\0'*(-len(binary)%4));vi=len(doc['bufferViews'])
            doc['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=len(fur_atlas_encoded)))
            binary.extend(fur_atlas_encoded)
            image_index=len(doc['images']);doc['images'].append(dict(bufferView=vi,mimeType='image/png'))
            texture_index=len(doc['textures']);doc['textures'].append(dict(source=image_index,sampler=0))
            material['pbrMetallicRoughness']['baseColorTexture']=dict(index=texture_index)
        material_index=len(doc['materials']);doc['materials'].append(material)
        fur_attrs={name:append(fur[key],kind) for name,key,kind in (
            ('POSITION','positions','VEC3'),('NORMAL','normals','VEC3'),
            ('TEXCOORD_0','uv','VEC2'),('COLOR_0','colors','VEC4'),('WEIGHTS_0','weights','VEC4'))}
        fur_attrs['JOINTS_0']=append_integer(fur['joints'],'VEC4','<u2',5123)
        if 'tangents' in fur:fur_attrs['TANGENT']=append(fur['tangents'],'VEC4')
        mesh['primitives'].append(dict(attributes=fur_attrs,
            indices=append_integer(fur['indices'],'SCALAR','<u4',5125),material=material_index,
            extras=dict(fur_layer=True,fur_source_positions=append(fur['source'],'VEC3'),
                        strand_count=fur['strand_count'],tuft_count=fur['tuft_count'],vertices_per_element=fur['element_vertices'],
                        fur_method=fur['method'],fur_version=FUR_VERSION,length=fur['length'])))
        fur_count+=fur['tuft_count']
    if authored_ears(cfg,args.ear_style):
        slots={doc['nodes'][node].get('name'):i for i,node in enumerate(doc['skins'][0]['joints'])}
        ears=make_ears(cfg,warp,slots)
        material_index=len(doc['materials'])
        doc['materials'].append(dict(name=f'{breed} anatomical ears',doubleSided=True,
            pbrMetallicRoughness=dict(baseColorFactor=[1,1,1,1],metallicFactor=0,roughnessFactor=.82)))
        attributes={name:append(ears[key],kind) for name,key,kind in (
            ('POSITION','positions','VEC3'),('NORMAL','normals','VEC3'),('COLOR_0','colors','VEC4'),
            ('TEXCOORD_0','uv','VEC2'),('WEIGHTS_0','weights','VEC4'))}
        attributes['JOINTS_0']=append_integer(ears['joints'],'VEC4','<u2',5123)
        doc['meshes'][0]['primitives'].append(dict(attributes=attributes,material=material_index,
            indices=append_integer(ears['indices'],'SCALAR','<u4',5125),extras=dict(authored_anatomical_ears=True)))
    doc['asset']['extras']={'breed':breed,'ear_style':args.ear_style,'age_stage':dog_record.get('age_stage','adult'),
        'geometry_version':GEOMETRY_VERSION,
        'groomed_fur_tufts':fur_count,'fur_version':FUR_VERSION,
        'fur_method':('layered_anatomical_cards' if detailed_groom(cfg) else
                      'gravity_groomed_strands') if is_shaggy_coat(cfg) else 'individual_tapered_tubes',
        'muzzle':appearance_profile(cfg),
        'puppy_amount':cfg.get('puppy_amount',0),'method':'Procedural developmental mesh and bind-skeleton adaptation of supplied Labrador; approximate anatomy'}
    if cfg.get('anatomy_frame'):
        doc['asset']['extras'].update(anatomy_frame=cfg['anatomy_frame'],anatomy_version=ANATOMY_VERSION,
            rest_joint_signature=hashlib.sha256(np.round(np.array([new_world[j].translation for j in doc['skins'][0]['joints']]),6).tobytes()).hexdigest()[:20],
            method='Regional anatomical cage with frame-specific rest joint positions; compatible animation hierarchy')
    binary.extend(b'\0'*(-len(binary)%4));doc['buffers'][0]['byteLength']=len(binary)
    js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*(-len(js)%4)
    path=output_path
    path.parent.mkdir(parents=True,exist_ok=True)
    payload=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binary))+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(binary),b'BIN\0')+binary
    temporary=path.with_name(path.name+f'.{os.getpid()}.tmp')
    temporary.write_bytes(payload);temporary.replace(path)
    print('Built',path,flush=True)
for name in (f'_coat_source_{os.getpid()}.png',f'_coat_neutral_{os.getpid()}.png',f'_fur_atlas_{os.getpid()}.png'):
    (ROOT/'assets'/name).unlink(missing_ok=True)
