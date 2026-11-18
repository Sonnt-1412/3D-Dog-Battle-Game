"""Run the real procedural action on every Actor without a graphics window."""
import argparse
import numpy as np
from panda3d.core import NodePath,Vec3,loadPrcFileData
loadPrcFileData('','window-type none\naudio-library-name null')
from direct.showbase.ShowBase import ShowBase
from direct.actor.Actor import Actor
import gltf
from catalog import DOGS,ROOT
from dog_actions import PeeAction
from model_assets import GLB
from dog_shape import GEOMETRY_VERSION

parser=argparse.ArgumentParser()
parser.add_argument('--shard',type=int,default=0)
parser.add_argument('--shards',type=int,default=1)
args=parser.parse_args()
assert 0<=args.shard<args.shards
selected=[d for i,d in enumerate(DOGS) if i%args.shards==args.shard]

app=ShowBase(windowType='none')


class Game:
    def __init__(self):
        self.render=app.render
        self.dog=self.render.attachNewNode('test dog')
        self.keys=dict(up=False,down=False,left=False,right=False,run=False)


game=Game()
action=PeeAction(game)
for dog in selected:
    path=ROOT/dog['asset']
    geometry=GLB(path)
    assert geometry.doc['asset']['extras']['geometry_version']==GEOMETRY_VERSION,dog['id']
    assert len(geometry.doc['skins'][0]['joints'])==80
    for mesh in geometry.doc['meshes']:
        for part in mesh['primitives']:
            attrs=part['attributes']
            assert np.isfinite(geometry.read(attrs['POSITION'])).all()
            normal=geometry.read(attrs['NORMAL'])
            np.testing.assert_allclose(np.linalg.norm(normal,axis=1),1,atol=1e-4)
    game.model=Actor(NodePath(gltf.load_model(str(path))))
    game.model.reparentTo(game.dog)
    game.model.enableBlend()
    low,high=game.model.getTightBounds()
    game.dog_height=dog['height']
    game.model.setScale(dog['height']/(high.z-low.z))
    game.model.setH(180)
    for clip in ('Idle','Walk','Trot','Gallop','Sit','Lie_Idle'):
        game.model.pose(clip,game.model.getNumFrames(clip)//2)
        game.model.setControlEffect(clip,1)
        game.model.update()
        low,high=game.model.getTightBounds()
        assert np.isfinite([*low,*high]).all() and .2<(high-low).length()<6,(dog['id'],clip)
        game.model.setControlEffect(clip,0)
    game.model.pose('Idle',0)
    game.model.setControlEffect('Idle',1)
    game.model.update()
    paw=game.model.exposeJoint(None,'modelRoot','hindpaw.L')
    rest=Vec3(paw.getPos(game.render))
    action.start()
    action.update(1.5)
    raised=paw.getPos(game.render)
    assert raised.z>rest.z+dog['height']*.035,(dog['id'],'leg failed to lift')
    assert action.active and action.stream is not None and action.puddle is not None
    assert np.isfinite([*raised]).all()
    before=action.elapsed
    action.update(0)
    assert action.elapsed==before
    action.update(3.2)
    assert not action.active and action.control is None and action.stream is None
    game.model.pose('Idle',0)
    game.model.update()
    np.testing.assert_allclose(list(paw.getPos(game.render)),list(rest),atol=1e-5)
    action.clear()
    assert action.puddle is None
    game.model.cleanup()
    game.model.removeNode()
    print('ACTION PASS',dog['id'],flush=True)
app.destroy()
print(f'PASS: shard {args.shard+1}/{args.shards}, {len(selected)} dogs; current geometry, normals, 80 joints, 6 clips, pee pose, effects and cleanup',flush=True)
