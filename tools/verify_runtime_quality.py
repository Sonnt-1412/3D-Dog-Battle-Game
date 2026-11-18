"""Exercise the real GPU renderer, frame interpolation, locomotion and pause."""
from pathlib import Path
import json
import numpy as np
from panda3d.core import ClockObject,ShaderAttrib,loadPrcFileData

loadPrcFileData('','window-type offscreen\nwin-size 1280 800\naudio-library-name null')
from play_park import Park,ROOT
from catalog import DOGS
loadPrcFileData('','sync-video false')
app=Park()
clock=ClockObject.getGlobalClock()
clock.setMode(ClockObject.M_non_real_time);clock.setDt(1/60)
assert app.pipeline.enable_hardware_skinning
out=ROOT/'artifacts/runtime';out.mkdir(parents=True,exist_ok=True)
records=[]
for breed in ('phu_quoc','chow_chow','corgi_puppy'):
    print('CHECK',breed,flush=True)
    app.select_dog(next(i for i,d in enumerate(DOGS) if d['id']==breed))
    app.reset_dog()
    assert len(app.joints)==80
    assert all(b.getFrameBlendFlag() for b in app.model.getPartBundles())
    assert app.coat_detail_geoms>0
    origin=app.dog.getPos()
    previous=None;largest=0.
    for frame in range(180):
        app.keys['up']=frame<120;app.keys['run']=45<=frame<120
        app.keys['right']=65<=frame<105
        app.taskMgr.step()
        assert abs(sum(app.weights.values())-1.)<1e-5
        assert np.isfinite(list(app.dog.getPos())).all()
        foot=app.model.exposeJoint(None,'modelRoot','frontpaw.L').getPos(app.render)
        assert np.isfinite(list(foot)).all()
        if previous is not None:
            step=(foot-previous).length()/app.dog_height
            largest=max(largest,step)
        previous=foot
    assert (app.dog.getPos()-origin).length()>.1
    # Galloping foot speed includes body travel plus the return swing. Record
    # it rather than imposing a fixed displacement limit on every gait/size.
    app.keys['up']=True
    for _ in range(20):app.taskMgr.step()
    app.paused=True;app.taskMgr.step()
    position=app.dog.getPos();foot=app.model.exposeJoint(None,'modelRoot','frontpaw.L').getPos(app.render)
    camera=app.camera.getPos();app.yaw+=35
    for _ in range(20):app.taskMgr.step()
    assert (app.dog.getPos()-position).length()<1e-6
    now=app.model.exposeJoint(None,'modelRoot','frontpaw.L').getPos(app.render)
    assert (foot-now).length()<1e-5,(breed,'pause moved a joint')
    assert (camera-app.camera.getPos()).length()>.001
    app.win.saveScreenshot(str(out/f'{breed}.png'))
    app.paused=False;app.keys['up']=False;app.keys['right']=False;app.keys['run']=False
    for path in app.model.findAllMatches('**/+GeomNode'):
        node=path.node()
        for i in range(node.getNumGeoms()):
            attr=node.getGeomState(i).getAttrib(ShaderAttrib)
            if attr and attr.getShader():
                shader=attr.getShader()
                assert shader.isPrepared(app.win.getGsg().getPreparedObjects())
                assert not shader.getErrorFlag()
    records.append(dict(breed=breed,frame_interpolation=True,largest_foot_step_in_heights=largest,
                        normalized_weights=True,pause_and_camera=True,shader_compiles=True))
    print('PASS',breed,records[-1],flush=True)
assert not app.render.getShader().getErrorFlag()
(out/'checks.json').write_text(json.dumps(records,indent=2)+'\n')
app.destroy()
