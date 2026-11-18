"""Developmental proportions, source anatomy and exported mesh compatibility."""
import unittest
from model_assets import GLB, SOURCE
import numpy as np
from catalog import BY_ID, DOGS, ROOT, STARTING_IDS, TYPES, starting_dog
from dog_shape import deform


class PuppyTests(unittest.TestCase):
    def test_all_breeds_have_two_developmental_models(self):
        self.assertEqual(len(DOGS), len(TYPES) * 7)
        self.assertEqual(len(STARTING_IDS), len(TYPES) * 3)
        for t in TYPES:
            adult = starting_dog(t['id'])
            for stage in ('puppy', 'juvenile'):
                d = starting_dog(t['id'], stage)
                self.assertEqual(d['age_stage'], stage)
                self.assertNotEqual(d['asset'], adult['asset'])
                self.assertLess(d['height'], adult['height'])
                self.assertEqual(d['profile']['color'], adult['profile']['color'])

    def test_age_changes_shape_ratios_at_any_display_scale(self):
        # Left/right skull, shoulders/pelvis, muzzle/eye, one paw's edges.
        source = np.array([[-.12,1.15,.60],[.12,1.15,.60], [0,1.,.22],[0,.96,-.48],
                           [0,1.052,.917],[0,1.165,.747],[.105,.03,.537],[.195,.03,.537]])
        def ratios(profile):
            q = deform(source, profile)
            body = np.linalg.norm(q[2] - q[3])
            head = np.linalg.norm(q[0] - q[1])
            return np.array([head / body, (q[4,2] - q[5,2]) / head,
                             np.linalg.norm(q[6] - q[7]) / body])
        for t in TYPES:
            adult, young, puppy = [ratios(starting_dog(t['id'], age)['profile'])
                                   for age in ('adult','juvenile','puppy')]
            self.assertGreater(puppy[0], adult[0] * 1.4, t['id'])
            self.assertLess(puppy[1], adult[1] * .75, t['id'])
            self.assertGreater(puppy[2], adult[2] * 1.35, t['id'])
            self.assertTrue(adult[0] < young[0] < puppy[0], t['id'])
            self.assertTrue(adult[1] > young[1] > puppy[1], t['id'])

    def test_face_depth_stays_ordered_for_all_puppy_families(self):
        for d in DOGS:
            if d.get('age_stage') not in ('puppy','juvenile'):
                continue
            for height in (.98, 1.10, 1.22):
                p = np.c_[np.zeros(300), np.full(300,height), np.linspace(.52,1.,300)]
                q = deform(p, d['profile'])
                self.assertTrue(np.all(np.diff(q[:,2]) > 0), d['id'])

    def test_adult_deformation_matches_current_exported_meshes(self):
        source = GLB(ROOT / 'Textures/GLB/Labrador_AllAnimations.glb')
        for breed in ('labrador','beagle','hmong_bobtail','pug','chihuahua'):
            d = starting_dog(breed)
            old = GLB(ROOT / d['asset'])
            for sm,dm in zip(source.doc['meshes'],old.doc['meshes']):
                for sp,dp in zip(sm['primitives'],dm['primitives']):
                    p = source.read(sp['attributes']['POSITION'])
                    # The center strip excludes the independently mapped ears.
                    mask = abs(p[:,0]) < .06
                    exported = old.read(dp['attributes']['POSITION'])
                    np.testing.assert_allclose(deform(p[mask],d['profile']),exported[mask],atol=3e-6)


if __name__ == '__main__':
    unittest.main()
