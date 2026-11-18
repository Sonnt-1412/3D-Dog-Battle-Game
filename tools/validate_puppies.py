"""Validate every exported developmental mesh, bind rig and animation poses."""
import numpy as np
from panda3d.core import NodePath, loadPrcFileData
loadPrcFileData('', 'window-type none\naudio-library-name null')
from direct.showbase.ShowBase import ShowBase
from direct.actor.Actor import Actor
import gltf
from catalog import DOGS, ROOT, TYPES
from model_assets import GLB

puppies = [d for d in DOGS if d.get('age_stage') in ('puppy','juvenile')]
assert len(puppies) == len(TYPES) * 2
assert all((ROOT / d['asset']).is_file() for d in DOGS), 'Catalog has missing exports'
app = ShowBase()
for d in puppies:
    path = ROOT / d['asset']
    g = GLB(path)
    assert g.doc['asset']['extras']['age_stage'] == d['age_stage']
    assert len(g.doc['skins'][0]['joints']) == 80
    skin = g.doc['skins'][0]
    inverse = g.read(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
    for i,joint in enumerate(skin['joints']):
        np.testing.assert_allclose(g.world[joint] @ inverse[i], np.eye(4), atol=1e-5)
    for mesh in g.doc['meshes']:
        for primitive in mesh['primitives']:
            attrs = primitive['attributes']
            assert np.isfinite(g.read(attrs['POSITION'])).all(), d['id']
            normal = g.read(attrs['NORMAL'])
            assert np.isfinite(normal).all(), d['id']
            np.testing.assert_allclose(np.linalg.norm(normal,axis=1),1,atol=1e-4)
            weights = g.read(attrs['WEIGHTS_0'])
            np.testing.assert_allclose(weights.sum(1),1,atol=1e-4)
    actor = Actor(NodePath(gltf.load_model(str(path))))
    assert len(actor.getJoints()) == 80
    for clip in ('Idle','Walk','Trot','Gallop','Sit','Sit_Idle','Lie_Idle'):
        assert clip in actor.getAnimNames(), (d['id'],clip)
        for fraction in (0,.25,.5,.75):
            actor.pose(clip,int((actor.getNumFrames(clip)-1)*fraction))
            actor.update()
            low,high = actor.getTightBounds()
            assert np.isfinite([*low,*high]).all(), (d['id'],clip)
            assert .2 < (high-low).length() < 6, (d['id'],clip,low,high)
    actor.cleanup()
    actor.removeNode()
    print('PASS', d['id'], 'mesh, bind matrices, normalized normals/weights, 7 sampled clips', flush=True)
app.destroy()
print(f'PASS: {len(puppies)} developmental exports across {len(TYPES)} groups', flush=True)
