"""Extend the shared skin with four toes per paw and terminal rig joints.
Runs in Blender Python. Terminal joints are attachment/end-effector markers;
toe roots receive real skin weights and modest procedural locomotion curves.
"""
import math
import numpy as np
from mathutils import Matrix,Vector,Quaternion

def refine(doc,binary,read,append,old_world,new_world,warp,source_doc,source_binary):
    skin=doc['skins'][0];names={n.get('name'):i for i,n in enumerate(doc['nodes'])}
    toes=[]
    def add(name,parent,source_point):
        point=Vector(warp([source_point])[0]);world=new_world[parent].copy();world.translation=point
        local=new_world[parent].inverted()@world
        node=len(doc['nodes']);doc['nodes'].append(dict(name=name,translation=list(local.translation),children=[]))
        doc['nodes'][parent].setdefault('children',[]).append(node)
        new_world[node]=world;skin['joints'].append(node)
        return node
    for paw in ('frontpaw.L','frontpaw.R','hindpaw.L','hindpaw.R'):
        parent=names[paw];center=np.array(old_world[parent].translation)
        # Small forward-offset knuckles; preserve paw width for every variant.
        for digit,offset in enumerate((-.045,-.015,.015,.045),1):
            point=center+np.array([offset,-.007,.032])
            node=add(f'{paw}.toe{digit}',parent,point)
            tip=add(f'{paw}.toe{digit}.tip',node,point+np.array([0,-.008,.035]))
            toes.append((node,parent,point,paw))
    tail=names['tail08'];add('tail.tip',tail,np.array(old_world[tail].translation)+np.array([0,-.02,-.045]))
    # Source positions are required because the breed mesh has already been warped.
    def source_read(index):
        a=source_doc['accessors'][index];v=source_doc['bufferViews'][a['bufferView']]
        return np.ndarray((a['count'],3),dtype='<f4',buffer=source_binary,
            offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',12),4)).copy()
    def joint_accessor(array):
        array=np.asarray(array,dtype='<u2');binary.extend(b'\0'*(-len(binary)%4))
        vi=len(doc['bufferViews']);doc['bufferViews'].append(dict(buffer=0,byteOffset=len(binary),byteLength=array.nbytes));binary.extend(array.tobytes())
        ai=len(doc['accessors']);doc['accessors'].append(dict(bufferView=vi,componentType=5123,count=len(array),type='VEC4'));return ai
    slot={node:i for i,node in enumerate(skin['joints'])}
    for mi,mesh in enumerate(doc['meshes']):
        for pi,primitive in enumerate(mesh['primitives']):
            if primitive.get('material')!=0:continue
            attrs=primitive['attributes'];points=source_read(source_doc['meshes'][mi]['primitives'][pi]['attributes']['POSITION'])
            ids=read(attrs['JOINTS_0']);weights=read(attrs['WEIGHTS_0'])
            for row,p in enumerate(points):
                if p[1]>.105:continue
                distances=[np.linalg.norm((p-point)*np.array([1,1,1.1])) for node,parent,point,paw in toes]
                nearest=int(np.argmin(distances));distance=distances[nearest]
                if distance>.065:continue
                node,parent,point,paw=toes[nearest]
                influence=.35*max(0,1-distance/.065)
                smallest=int(np.argmin(weights[row]));old=float(weights[row,smallest])
                # Redistribute without losing normalization or exceeding four influences.
                weights[row]*=(1-influence)/(max(1e-8,1-old));weights[row,smallest]=influence
                ids[row,smallest]=slot[node]
            attrs['JOINTS_0']=joint_accessor(ids);attrs['WEIGHTS_0']=append(weights,'VEC4')
    skin['inverseBindMatrices']=append(np.array([np.array(new_world[j].inverted()).T.reshape(16) for j in skin['joints']]),'MAT4')
    for animation in doc['animations']:
        gait=animation['name']
        if gait not in ('Walk','Trot','Gallop'):continue
        base_sampler=animation['samplers'][0];times=read(base_sampler['input'])[:,0]
        duration=max(float(times[-1]-times[0]),.01)
        for node,parent,point,paw in toes:
            phase=(0 if paw.endswith('.L') else math.pi)+(math.pi if paw.startswith('hind') else 0)
            axis=new_world[parent].to_3x3().inverted()@Vector((1,0,0));axis.normalize()
            curves=[]
            for t in times:
                angle=.10*math.sin(2*math.pi*float(t-times[0])/duration+phase)
                q=Quaternion(axis,angle);curves.append([q.x,q.y,q.z,q.w])
            si=len(animation['samplers']);animation['samplers'].append(dict(input=base_sampler['input'],output=append(curves,'VEC4'),interpolation='LINEAR'))
            animation['channels'].append(dict(sampler=si,target=dict(node=node,path='rotation')))
    doc.setdefault('extras',{})['rig']={'version':2,'joints':len(skin['joints']),'deforming_toe_roots':16,'terminal_joints':17,
        'note':'Shared skin with toe flexion. No muscle simulation or ground-contact IK.'}
