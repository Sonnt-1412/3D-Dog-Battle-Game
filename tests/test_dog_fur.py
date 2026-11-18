"""Fur export contracts: safe attachment, excluded features and coat identity."""
import unittest
from model_assets import GLB, SOURCE
import numpy as np
from catalog import BY_ID,DOGS,ROOT
from dog_fur import build_fur,fur_coverage,is_shaggy_coat,soften_fur_rendering
from dog_shape import deform,smooth,smooth_mesh_normals


class FurTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source=GLB(ROOT/'Textures/GLB/Labrador_AllAnimations.glb')
        primitive=source.doc['meshes'][0]['primitives'][0]
        a=primitive['attributes']
        cls.p=source.read(a['POSITION']);cls.uv=source.read(a['TEXCOORD_0'])
        cls.ids=source.read(a['JOINTS_0']);cls.weights=source.read(a['WEIGHTS_0'])
        cls.faces=source.read(primitive['indices'])
        slots=[i for i,node in enumerate(source.doc['skins'][0]['joints'])
               if source.doc['nodes'][node].get('name','').startswith('ear')]
        cls.ears=smooth(.05,.85,np.where(np.isin(cls.ids,slots),cls.weights,0).sum(1))

    def build(self,breed,**overrides):
        cfg=dict(BY_ID[breed]['profile'],**overrides);positions=deform(self.p,cfg,self.ears)
        normals=smooth_mesh_normals(self.p,positions,self.faces)
        colors=np.tile([.2,.1,.05,1.],(len(self.p),1))
        return build_fur(self.p,positions,normals,self.uv,colors,self.ids,
                         self.weights,self.faces,cfg,self.ears)

    def test_short_coats_do_not_add_geometry(self):
        self.assertIsNone(self.build('phu_quoc'))

    def test_strands_render_opaque_without_coverage_dithering(self):
        from panda3d.core import (AlphaTestAttrib,Geom,GeomNode,GeomVertexData,
            GeomVertexFormat,Material,MaterialAttrib,NodePath,TransparencyAttrib)
        root=NodePath('test strand root')
        node=GeomNode('hair')
        node.addGeom(Geom(GeomVertexData('hair',GeomVertexFormat.getV3(),Geom.UHStatic)))
        state=node.getGeomState(0).setAttrib(MaterialAttrib.make(Material('test strand fur')))
        state=state.setAttrib(TransparencyAttrib.make(TransparencyAttrib.M_multisample))
        node.setGeomState(0,state);root.attachNewNode(node)
        soften_fur_rendering(root)
        state=node.getGeomState(0)
        self.assertEqual(state.getAttrib(TransparencyAttrib).getMode(),TransparencyAttrib.M_none)
        self.assertEqual(state.getAttrib(AlphaTestAttrib).getMode(),AlphaTestAttrib.M_always)

    def test_fur_elements_grow_from_the_skin_without_a_floating_layer(self):
        fur=self.build('bac_ha')
        surface=deform(self.p,BY_ID['bac_ha']['profile'],self.ears)
        roots=np.einsum('ni,nij->nj',fur['root_barycentric'],surface[fur['root_faces']])
        size=fur['element_vertices'];root_sides=3
        strands=fur['positions'].reshape(-1,size,3)
        # The root row/ring stays on the interpolated body surface; cutout
        # clusters start at the skin rather than at an offset coat shell.
        error=np.linalg.norm(strands[:,:root_sides].mean(1)-roots,axis=1)
        self.assertTrue((error<fur['radii']).all())
        self.assertLess(fur['radii'].max(),.017)
        self.assertTrue((np.linalg.norm(strands[:,-1]-roots,axis=1)>1e-5).all())
        np.testing.assert_array_equal(fur['colors'][:,3],1.)
        # Every point of a coat element samples the original root's coat, rather
        # than an alpha pattern that can make the outline look like a halo.
        tex=fur.get('root_texture_uv',fur['uv']).reshape(-1,size,2)
        np.testing.assert_array_equal(tex,np.repeat(tex[:,:1],size,axis=1))

    def test_long_coat_keeps_valid_skin_and_excludes_face_and_pads(self):
        fur=self.build('bac_ha')
        self.assertGreater(fur['tuft_count'],1500)
        count=len(fur['positions'])
        for name in ('normals','uv','colors','joints','weights','source'):
            self.assertEqual(len(fur[name]),count,name)
            self.assertTrue(np.isfinite(fur[name]).all(),name)
        self.assertLess(fur['indices'].max(),count)
        self.assertGreaterEqual(fur['indices'].min(),0)
        np.testing.assert_allclose(fur['weights'].sum(1),1.,atol=1e-6)
        np.testing.assert_allclose(np.linalg.norm(fur['normals'],axis=1),1.,atol=1e-6)
        self.assertLess(fur['joints'].max(),47)
        self.assertTrue((fur['source'][:,1]>.13).all())
        self.assertGreater(fur_coverage(fur['source']).min(),0)
        np.testing.assert_array_equal(fur_coverage(np.array([[0,1.052,.917],[.092,1.165,.747]])),0.)
        # Every small tuft uses one coherent skin blend rather than tearing
        # between different bone assignments at its root and tip.
        size=fur['element_vertices']
        skin=fur['weights'].reshape(-1,size,4)
        np.testing.assert_allclose(skin,np.repeat(skin[:,:1],size,axis=1))

    def test_body_and_age_changes_preserve_fur_root_and_color_identity(self):
        normal=self.build('bac_ha')
        for breed in ('bac_ha_thin','bac_ha_puppy'):
            other=self.build(breed)
            np.testing.assert_array_equal(normal['source'],other['source'])
            np.testing.assert_array_equal(normal['colors'],other['colors'])
            self.assertGreater(np.max(abs(normal['positions']-other['positions'])),.01)


    def test_dense_slender_gravity_strands_are_limited_to_shaggy_coats(self):
        for breed in ('bac_ha','chow_chow','pomeranian','samoyed'):
            self.assertTrue(is_shaggy_coat(BY_ID[breed]['profile']),breed)
        for breed in ('phu_quoc','labrador','hmong_bobtail','husky'):
            self.assertFalse(is_shaggy_coat(BY_ID[breed]['profile']),breed)
        shaggy=self.build('bac_ha',groom_quality=1);fine=self.build('hmong_bobtail')
        self.assertEqual(shaggy['method'],'gravity_groomed_strands')
        self.assertEqual(shaggy['element_vertices'],10)
        self.assertGreater(shaggy['strand_count'],10000)
        self.assertEqual(fine['strand_count'],fine['tuft_count'])
        self.assertLessEqual(shaggy['radii'].max(),.001)
        self.assertLess(fine['radii'].max(),.001)

    def test_long_hairs_hang_down_and_leave_facial_features_clear(self):
        fur=self.build('samoyed',groom_quality=1)
        strands=fur['positions'].reshape(-1,fur['element_vertices'],3)
        source=fur['source'].reshape(-1,fur['element_vertices'],3)[:,0]
        dx=strands[:,-1]-fur['roots']
        flank=(abs(source[:,0])>.16)&(source[:,1]>.5)&(source[:,1]<.9)&(source[:,2]<.25)
        self.assertGreater(flank.sum(),100)
        self.assertGreater((dx[flank,1]<0).mean(),.95)
        face=(source[:,2]>.74)&(source[:,1]>1.1)
        self.assertGreater(face.sum(),0)
        self.assertLess(np.linalg.norm(dx[face],axis=1).max(),.012)
        eyes=np.array([[.092,1.165,.747],[-.092,1.165,.747],
                       [.092,1.195,.747]])
        np.testing.assert_array_equal(fur_coverage(eyes,shaggy=True),0.)

    def test_detailed_groom_builds_long_ruff_with_short_face_and_valid_tangents(self):
        fur=self.build('samoyed',groom_quality=2,fur_length=.09)
        size=fur['element_vertices'];strands=fur['positions'].reshape(-1,size,3)
        source=fur['source'].reshape(-1,size,3)[:,0]
        length=np.linalg.norm(strands[:,-1]-fur['roots'],axis=1)
        chest=(source[:,2]>.34)&(source[:,2]<.51)&(source[:,1]>.55)&(source[:,1]<.88)
        face=(source[:,2]>.74)&(source[:,1]>1.1)
        self.assertGreater(chest.sum(),100)
        self.assertGreater(np.median(length[chest]),.05)
        self.assertLess(length[face].max(),.015)
        self.assertEqual(fur['method'],'layered_anatomical_cards')
        self.assertGreater(fur['strand_count'],20000)
        np.testing.assert_allclose(np.linalg.norm(fur['tangents'][:,:3],axis=1),1,atol=1e-6)
        np.testing.assert_allclose((fur['tangents'][:,:3]*fur['normals']).sum(1),0,atol=1e-6)
        self.assertTrue(np.isfinite(fur['positions']).all())
        self.assertLess(fur['radii'].max(),.008)
        alpha=fur['alpha_atlas'][:,:,3]
        self.assertTrue((alpha<.01).any())
        self.assertTrue((alpha>.8).any())
        np.testing.assert_allclose(fur['weights'].sum(1),1,atol=1e-6)
        skin=fur['weights'].reshape(-1,size,4)
        np.testing.assert_allclose(skin,np.repeat(skin[:,:1],size,axis=1))
        uv=fur['root_texture_uv'].reshape(-1,size,2)
        np.testing.assert_array_equal(uv,np.repeat(uv[:,:1],size,axis=1))


    def test_all_catalog_long_coats_select_layered_groom_by_default(self):
        for dog in DOGS:
            expected=2 if is_shaggy_coat(dog['profile']) else 1
            self.assertEqual(dog['profile'].get('groom_quality',1),expected,dog['id'])
        for breed in ('bac_ha','chow_chow_puppy','samoyed'):
            self.assertEqual(self.build(breed)['method'],'layered_anatomical_cards')


if __name__=='__main__':unittest.main()
