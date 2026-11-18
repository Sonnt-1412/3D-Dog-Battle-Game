"""Motion time-step invariance and ear geometry."""
import unittest
import numpy as np
from motion_math import damp_heading,integrate_speed,response
from ear_shapes import shape_ears
from catalog import BY_ID


class MotionTests(unittest.TestCase):
    def test_acceleration_and_distance_are_frame_rate_independent(self):
        totals=[]
        for fps in (30,60,144):
            speed=distance=0.
            for i in range(fps*3):
                target=4. if i<fps*2 else 0.
                speed,step=integrate_speed(speed,target,12.,1/fps)
                distance+=step
            totals.append((speed,distance))
        np.testing.assert_allclose(totals,np.repeat([totals[0]],3,axis=0),atol=1e-10)

    def test_turns_cross_the_angle_wrap_without_spinning(self):
        for fps in (30,60,144):
            heading=179.;velocity=0.
            for _ in range(fps):
                previous=heading
                heading,velocity=damp_heading(heading,-179.,velocity,1/fps)
                self.assertLessEqual(abs(heading-previous),240/fps+1e-6)
            self.assertLess(abs((heading+179+180)%360-180),.05)
            self.assertLess(abs(heading-179.),3.)

    def test_camera_damping_has_equal_response_at_different_frame_rates(self):
        final=[]
        for fps in (30,60,144):
            pos=0.
            for _ in range(fps):pos+=(1-pos)*response(9.,1/fps)
            final.append(pos)
        np.testing.assert_allclose(final,final[0],atol=1e-12)


class EarQualityTests(unittest.TestCase):
    def test_upright_correction_preserves_tips_and_unweighted_skin(self):
        cfg=BY_ID['corgi_puppy']['profile']
        corrected=dict(cfg,ear_rigidity=1.)
        p=np.array([[.17,1.08,.64],[-.17,1.08,.64]])
        for weights in (np.zeros(2),np.ones(2)):
            np.testing.assert_allclose(shape_ears(p,cfg,'base',weights),
                                       shape_ears(p,corrected,'base',weights))
        old=shape_ears(p,cfg,'base',np.full(2,.6))
        new=shape_ears(p,corrected,'base',np.full(2,.6))
        self.assertTrue((new[:,1]>old[:,1]+.01).all())


if __name__=='__main__':unittest.main()
