"""Regressions for folded geometry, compressed skulls and thin bodies."""
import unittest
from model_assets import GLB, SOURCE
import numpy as np
from catalog import BY_ID,DOGS,ROOT
from dog_shape import deform,smooth
from ear_shapes import EAR_STYLES


class AnatomyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source=GLB(ROOT/'Textures/GLB/Labrador_AllAnimations.glb')
        attrs=source.doc['meshes'][0]['primitives'][0]['attributes']
        cls.points=source.read(attrs['POSITION'])[::12]
        ids=source.read(attrs['JOINTS_0'])[::12]
        weights=source.read(attrs['WEIGHTS_0'])[::12]
        slots=[i for i,n in enumerate(source.doc['skins'][0]['joints'])
               if source.doc['nodes'][n].get('name','').startswith('ear')]
        cls.ears=smooth(.05,.85,np.where(np.isin(ids,slots),weights,0).sum(1))

    def determinant(self,profile,style='base'):
        eps=.0001
        jac=np.stack([(deform(self.points+np.eye(3)[axis]*eps,profile,self.ears,style)
                      -deform(self.points-np.eye(3)[axis]*eps,profile,self.ears,style))/(2*eps)
                      for axis in range(3)],axis=2)
        return np.linalg.det(jac)

    def test_catalog_maps_do_not_reverse_local_volume(self):
        for dog in DOGS:
            determinant=self.determinant(dog['profile'])
            self.assertTrue(np.all(determinant>0),(dog['id'],float(determinant.min())))

    def test_all_ear_styles_preserve_local_volume(self):
        for style in EAR_STYLES:
            determinant=self.determinant(BY_ID['phu_quoc']['profile'],style)
            self.assertTrue(np.all(determinant>0),(style,float(determinant.min())))

    def test_short_torso_does_not_flatten_the_skull(self):
        axis=np.array([[0,1.14,.48],[0,1.14,.75]])
        cfg=BY_ID['labrador']['profile']
        depths=[]
        for length in (.65,1.,1.4):
            q=deform(axis,dict(cfg,length=length))
            depths.append(q[1,2]-q[0,2])
        self.assertLess(max(depths)/min(depths),1.04)
        self.assertGreater(min(depths),.23)

    def test_tail_choices_keep_hind_limbs_in_place(self):
        points=np.array([[.20,.26,-.635],[-.20,.26,-.635],[.20,.005,-.514],[-.20,.005,-.514]])
        cfg=BY_ID['hmong_bobtail']['profile']
        expected=deform(points,dict(cfg,tail='natural'))
        for tail in ('bob','short','curl'):
            np.testing.assert_allclose(deform(points,dict(cfg,tail=tail)),expected,atol=1e-9)


    def test_vietnamese_muzzles_taper_without_squeezing_skulls(self):
        # Paired samples at the cheek and nose should form a wedge, while
        # cranium, eyes and body keep the original family's proportions.
        points=np.array([[-.09,1.04,.72],[.09,1.04,.72],
                         [-.09,1.04,.95],[.09,1.04,.95],
                         [-.10,1.20,.60],[.10,1.20,.60],
                         [-.18,.75,-.10],[.18,.75,-.10]])
        for breed in ('phu_quoc','song_ma','cho_ta','bac_ha'):
            cfg=BY_ID[breed]['profile']
            neutral=dict(cfg,muzzle_width=1.,muzzle_taper=0.,muzzle_height=1.,muzzle_extension=0.)
            q=deform(points,cfg);baseline=deform(points,neutral)
            nose=q[3,0]-q[2,0];cheek=q[1,0]-q[0,0]
            self.assertLess(nose,cheek*.85,breed)
            self.assertGreater(q[3,2],baseline[3,2],breed)
            np.testing.assert_allclose(q[4:],baseline[4:],atol=1e-9)


if __name__=='__main__':unittest.main()
