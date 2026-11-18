"""Add reproducible puppy and juvenile mesh profiles for every catalog type.

This updates catalog metadata; build_breed_models.py exports the actual meshes.
Adult records and asset paths are preserved. No exact age in months is inferred.
"""
import copy
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AGE_STAGES = {'adult': 'Chó lớn', 'puppy': 'Chó con', 'juvenile': 'Chó nhỡ'}


def age_record(adult, stage):
    puppy = stage == 'puppy'
    dog = copy.deepcopy(adult)
    dog.update(id=f"{adult['type_id']}_{stage}",
               name=f"{adult['type_name']} • {AGE_STAGES[stage]}",
               asset=f"assets/{adult['type_id']}_{stage}_detailed.glb",
               variant_id=stage, variant_label=AGE_STAGES[stage],
               age_stage=stage, appearance_status='developmental_shape_prototype',
               height=round(adult['height'] * (.46 if puppy else .72), 5),
               notes='Developmental mesh proportions: cranium, muzzle, neck, abdomen and individual paws; shared rig. Visual prototype, not an exact age or breed standard.')
    p = dog['profile']
    p.update(puppy_amount=1. if puppy else .45,
             length=max(.65, p['length'] * (.83 if puppy else .93)),
             leg=max(.25, p['leg'] * (.63 if puppy else .83)),
             width=min(1.65, p['width'] * (1.08 if puppy else 1.03)),
             head=min(1.75, p['head'] * (1.24 if puppy else 1.10)),
             muzzle=max(.25, p['muzzle'] * (.65 if puppy else .84)))
    return dog


def main():
    path = ROOT / 'dog_catalog.json'
    catalog = json.loads(path.read_text())
    adults = [d for d in catalog['dogs'] if d['variant_id'] not in ('puppy', 'juvenile')]
    records = []
    for t in catalog['types']:
        group = [d for d in adults if d['type_id'] == t['id']]
        for d in group:
            d['age_stage'] = 'adult'
        records.extend(group)
        base = next(d for d in group if d['variant_id'] == 'normal')
        records.extend(age_record(base, stage) for stage in ('puppy', 'juvenile'))
    geometry=catalog.get('geometry_version',0)
    stage=('regional_anatomical_frames_and_layered_fibre_coats' if catalog.get('anatomy_version',0)>=1 else
           'tapered_muzzles_and_layered_fibre_coats' if geometry>=6 and catalog.get('fur_version',0)>=5 else
           'tapered_muzzles_and_sculpted_fur_locks' if geometry>=6 and catalog.get('fur_version',0)>=3 else
           'tapered_muzzles_and_larger_rooted_tufts' if geometry>=6 and catalog.get('fur_version',0)>=2 else
           'tapered_muzzles_and_individual_rooted_strands' if geometry>=6 else
           'tapered_muzzles_and_soft_masked_groomed_coats' if geometry>=5 else
           'tapered_muzzles_and_skinned_groomed_coats' if geometry>=4 else
           'volume_preserving_head_body_and_developmental_shapes' if geometry>=3 else
           'body_shapes_developmental_ages_and_independent_ears')
    catalog.update(version=max(5,catalog.get('version',5)), stage=stage,
                   age_stages=AGE_STAGES, dogs=records)
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print(f"Catalog: {len(catalog['types'])} groups, {len(records)} models; 2 developmental stages per group")


if __name__ == '__main__':
    main()
