"""Repeatable offscreen frame timings and full-size material review images."""
import argparse
import json
from pathlib import Path
import time
import numpy as np
from panda3d.core import ClockObject,Vec3,loadPrcFileData

parser=argparse.ArgumentParser()
parser.add_argument('--tag',required=True)
parser.add_argument('--frames',type=int,default=150)
args=parser.parse_args()
loadPrcFileData('','window-type offscreen\naudio-library-name null\nwin-size 1280 800')
ROOT=Path(__file__).resolve().parent.parent
from play_park import Park
from catalog import DOGS
loadPrcFileData('','sync-video false\nwin-size 1280 800')
app=Park()
app.camLens.setFov(65)
clock=ClockObject.getGlobalClock()
clock.setMode(ClockObject.M_non_real_time);clock.setDt(1/60)
app.aspect2d.hide()
app.yaw=145.;app.pitch=15.
out=ROOT/'artifacts'/args.tag;out.mkdir(parents=True,exist_ok=True)
report=dict(scope='Offscreen 1280x800 full task/render steps, vsync disabled; not a live desktop FPS guarantee',
            renderer=app.win.getGsg().getDriverRenderer(),gl_version=app.win.getGsg().getDriverVersion(),
            gpu_skinning=app.pipeline.enable_hardware_skinning,msaa=app.pipeline.msaa_samples,models={})
def fixed_camera(task):
    target=app.dog.getPos()+Vec3(0,0,app.dog_height*.55)
    direction=Vec3(.70,.70,.27);direction.normalize()
    app.camera.setPos(target+direction*max(2.1,app.dog_height*4.16))
    app.camera.lookAt(target)
    app.sun_np.setPos(app.dog.getPos()+Vec3(3,4,6));app.sun_np.lookAt(target)
    return task.cont
app.pipeline.exposure=.15
for breed in ('phu_quoc','chow_chow','corgi_puppy'):
    app.select_dog(next(i for i,d in enumerate(DOGS) if d['id']==breed))
    app.reset_dog();app.yaw=145.;app.keys['up']=False;app.keys['run']=False
    app.camLens.setFov(65)
    app.taskMgr.add(fixed_camera,'benchmark camera',sort=40)
    for _ in range(30):app.taskMgr.step()
    timings=[]
    for frame in range(args.frames):
        app.keys['up']=frame>=args.frames//3
        app.keys['run']=frame>=args.frames*2//3
        start=time.perf_counter();app.taskMgr.step();timings.append((time.perf_counter()-start)*1000)
    app.keys['up']=False;app.keys['run']=False
    app.win.saveScreenshot(str(out/f'{breed}-body.png'))
    app.taskMgr.remove('benchmark camera')
    app.taskMgr.remove('move dog')
    app.dog.setPos(0,0,.03);app.dog.setH(0)
    app.model.stop()
    for clip in app.model.getAnimNames():app.model.setControlEffect(clip,1. if clip=='Idle' else 0.)
    app.model.pose('Idle',0);app.model.update()
    app.camLens.setFov(38)
    target=app.model.exposeJoint(None,'modelRoot','head').getPos(app.render)
    app.camera.setPos(target+Vec3(.8,1,.18)*app.dog_height*.9);app.camera.lookAt(target)
    app.sun_np.setPos(3,4,6);app.sun_np.lookAt(target)
    for _ in range(5):app.taskMgr.step()
    app.win.saveScreenshot(str(out/f'{breed}-head.png'))
    app.taskMgr.add(app.update,'move dog')
    stats=dict(mean_ms=float(np.mean(timings)),p50_ms=float(np.median(timings)),
               p95_ms=float(np.percentile(timings,95)),equivalent_fps=1000/float(np.mean(timings)))
    report['models'][breed]=stats
    print(breed,json.dumps(stats),flush=True)
(out/'benchmark.json').write_text(json.dumps(report,indent=2)+'\n')
print('Benchmark saved:',out/'benchmark.json',flush=True)
app.destroy()
