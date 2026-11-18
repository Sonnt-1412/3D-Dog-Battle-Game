"""Anatomical differences must exist in geometry and bone placement, not color."""
import unittest
from model_assets import GLB, SOURCE
from collections import Counter
import numpy as np
from catalog import BY_ID,ROOT
from dog_frames import FRAMES,stride_scale
from dog_shape import deform
from anatomical_ears import make_ears


class FrameTests(unittest.TestCase):
    def cfg(self,frame):
        return dict(width=1.,length=1.,leg=1.,head=1.,muzzle=1.,ears=0.,
                    color=[.4,.2,.1],pattern='solid',tail='natural',fur=0.,
                    base_breed='',body_condition=0.,anatomy_frame=frame)

    def test_small_head_and_apple_head_are_distinct_in_three_dimensions(self):
        p=np.array([[-.10,1.18,.64],[.10,1.18,.64],[0,1.10,.60],[0,1.26,.60],
                    [0,1.052,.917],[0,1.052,.78]])
        deer=deform(p,self.cfg('toy_deer'));apple=deform(p,self.cfg('toy_apple'))
        self.assertGreater(apple[1,0]-apple[0,0],(deer[1,0]-deer[0,0])*1.25)
        self.assertGreater(apple[3,1]-apple[2,1],(deer[3,1]-deer[2,1])*1.25)
        self.assertGreater(deer[4,2]-deer[5,2],(apple[4,2]-apple[5,2])*1.25)

    def test_sighthound_has_deep_chest_and_tucked_waist(self):
        p=np.array([[0,.55,.22],[0,.55,-.18]])
        ordinary=deform(p,self.cfg('retriever'));runner=deform(p,self.cfg('sighthound'))
        self.assertGreater(runner[1,1]-runner[0,1],ordinary[1,1]-ordinary[0,1]+.12)

    def test_long_low_frame_lengthens_torso_and_shortens_limb_segments(self):
        p=np.array([[0,.90,.2],[0,.90,-.50],[.15,.65,.4],[.15,.005,.537]])
        ordinary=deform(p,self.cfg('retriever'));low=deform(p,self.cfg('long_low'))
        self.assertGreater(low[0,2]-low[1,2],(ordinary[0,2]-ordinary[1,2])*1.4)
        self.assertLess(low[2,1]-low[3,1],(ordinary[2,1]-ordinary[3,1])*.70)
        self.assertLess(abs(low[3,1]),.01)

    def test_frames_have_different_rest_joint_positions(self):
        rig=GLB(SOURCE);joints=rig.doc['skins'][0]['joints']
        p=np.array([rig.world[i][:3,3] for i in joints])
        signatures={np.round(deform(p,self.cfg(name)),5).tobytes() for name in FRAMES}
        self.assertEqual(len(signatures),len(FRAMES))

    def test_authored_ears_are_closed_skinned_meshes_and_match_ear_tips(self):
        cfg=self.cfg('toy_deer')
        ear=make_ears(cfg,lambda p,w:deform(p,cfg,w),{'head':0,'ear.L':1,'ear.R':2})
        edges=Counter()
        for a,b,c in ear['indices'].reshape(-1,3):
            for u,v in ((a,b),(b,c),(c,a)):edges[tuple(sorted((int(u),int(v))))]+=1
        self.assertTrue(all(n==2 for n in edges.values()))
        np.testing.assert_allclose(ear['weights'].sum(1),1,atol=1e-7)
        np.testing.assert_allclose(np.linalg.norm(ear['normals'],axis=1),1,atol=1e-6)
        tips=ear['positions'][[72,145]]
        from dog_frames import ear_tip_source
        anchors=deform([ear_tip_source(cfg,side) for side in (1,-1)],cfg,np.zeros(2))
        np.testing.assert_allclose(tips,anchors,atol=1e-6)


    def test_gait_scale_tracks_anatomical_limb_lengths(self):
        self.assertLess(stride_scale(self.cfg('long_low')),.60)
        self.assertGreater(stride_scale(self.cfg('tall_giant')),1.25)
        self.assertEqual(stride_scale(self.cfg('retriever')),1.)

if __name__=='__main__':unittest.main()
