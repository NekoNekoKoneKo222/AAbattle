import * as THREE from 'three';

/**
 * Shared, original, Blockbench-inspired low-poly hero visuals.
 * Cuboids only: the same silhouette is used in battles and the character browser.
 */
type Skin = 'skin' | 'master_skin' | 'sun_skin' | null | undefined;
type BodyParts = { leftArm: THREE.Group; rightArm: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group };
const SKIN = 0xf5c9a9;
const DARK = 0x17263a;
const eyeColor = 0x192637;

function tint(color: number, skin: Skin): number {
  if (!skin) return color;
  const base = new THREE.Color(color);
  base.lerp(new THREE.Color(skin === 'sun_skin' ? 0xffdf35 : skin === 'master_skin' ? 0xffcf60 : 0xb187ff), skin === 'sun_skin' ? .67 : skin === 'master_skin' ? .49 : .38);
  return base.getHex();
}
function cube(parent: THREE.Object3D, size: [number, number, number], pos: [number, number, number], color: number, name = ''): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ color, roughness: .9, metalness: .02, flatShading: true }));
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}
function face(group: THREE.Group, color = eyeColor): void {
  for (const x of [-.15, .15]) cube(group, [.085, .12, .026], [x, 1.65, .355], color, 'pixel_eye');
}
function rightHandItem(parts: BodyParts, color: number, tip: number): void {
  cube(parts.rightArm, [.18, .24, .34], [0, -.43, .22], color, 'hand_weapon');
  cube(parts.rightArm, [.16, .14, .23], [0, -.43, .48], tip, 'weapon_tip');
}
function staff(parts: BodyParts, color: number, jewel: number): void {
  cube(parts.rightArm, [.10, 1.04, .11], [0, -.15, .33], color, 'staff');
  cube(parts.rightArm, [.28, .3, .27], [0, .4, .33], jewel, 'staff_gem');
}
function shell(group: THREE.Group, chest: number, sleeves: number, pants: number, head: number, size: number): BodyParts {
  const centerY = 1.06;
  cube(group, [.78 * size, .79, .42 * size], [0, centerY, 0], chest, 'body');
  cube(group, [.73, .7, .68], [0, 1.72, 0], head, 'head');
  const leftArm = new THREE.Group(); leftArm.position.set(-.50 * size, 1.39, 0); group.add(leftArm);
  const rightArm = new THREE.Group(); rightArm.position.set(.50 * size, 1.39, 0); group.add(rightArm);
  cube(leftArm, [.30 * size, .70, .4], [0, -.35, 0], sleeves, 'left_arm');
  cube(rightArm, [.30 * size, .70, .4], [0, -.35, 0], sleeves, 'right_arm');
  const leftLeg = new THREE.Group(); leftLeg.position.set(-.21, .68, 0); group.add(leftLeg);
  const rightLeg = new THREE.Group(); rightLeg.position.set(.21, .68, 0); group.add(rightLeg);
  cube(leftLeg, [.34, .65, .43], [0, -.33, 0], pants, 'left_leg');
  cube(rightLeg, [.34, .65, .43], [0, -.33, 0], pants, 'right_leg');
  return { leftArm, rightArm, leftLeg, rightLeg };
}

export function createVoxelHero(id: string, skin?: Skin): THREE.Group {
  const group = new THREE.Group();
  group.name = 'voxel_hero_' + id;
  const outfit = (c: number) => tint(c, skin);
  let p: BodyParts;
  switch (id) {
    case 'gald':
      p = shell(group, outfit(0xe47b36), outfit(0xe37b2c), 0x40495a, 0x40495a, 1.2);
      cube(group, [.79, .41, .7], [0, 2.01, -.015], outfit(0xf2a044), 'tank_helmet');
      cube(group, [.55, .18, .05], [0, 1.75, .36], 0x1a2237, 'robot_visor');
      for (const x of [-.15, .15]) cube(group, [.095, .15, .038], [x, 1.77, .4], 0xf8d64c, 'robot_eye');
      cube(group, [.63, .3, .05], [0, 1.03, .26], 0xf8d8aa, 'chest_core');
      cube(p.leftArm, [.4, .36, .49], [0, -.24, 0], outfit(0xffaa60), 'armor_pad');
      cube(p.rightArm, [.4, .36, .49], [0, -.24, 0], outfit(0xffaa60), 'armor_pad');
      cube(p.leftArm, [.18, .86, .55], [-.12, -.32, .36], 0x65748e, 'shield_back');
      cube(p.leftArm, [.13, .64, .58], [-.22, -.32, .39], outfit(0xf4a14a), 'shield_face');
      break;
    case 'jin':
      p = shell(group, outfit(0x336844), outfit(0x39734d), 0x25323d, SKIN, 1);
      cube(group, [.82, .26, .75], [0, 2.07, -.015], outfit(0x346a42), 'hood_top');
      cube(group, [.14, .56, .72], [-.39, 1.75, -.02], outfit(0x2a5c39), 'hood_side');
      cube(group, [.14, .56, .72], [.39, 1.75, -.02], outfit(0x2a5c39), 'hood_side');
      cube(group, [.69, .25, .10], [0, 1.51, .34], 0x243947, 'mask');
      face(group);
      rightHandItem(p, 0x46565c, 0xa4ff70);
      cube(p.leftArm, [.12, .12, .54], [0, -.42, .41], 0x91ff69, 'dagger');
      break;
    case 'mina':
      p = shell(group, outfit(0xf5f5fa), outfit(0xffffff), 0x444558, SKIN, 1);
      cube(group, [.8, .29, .76], [0, 2.1, -.015], 0xeb8fc0, 'pink_hair');
      cube(group, [.19, .65, .72], [-.37, 1.77, 0], 0xe78dbc, 'hair_side');
      cube(group, [.19, .65, .72], [.37, 1.77, 0], 0xe78dbc, 'hair_side');
      face(group);
      cube(group, [.37, .11, .035], [0, 1.06, .235], 0xf175aa, 'medic_cross_horizontal');
      cube(group, [.11, .37, .04], [0, 1.06, .24], 0xf175aa, 'medic_cross_vertical');
      staff(p, 0x8597a4, 0x9bf08b);
      break;
    case 'bom':
      p = shell(group, outfit(0xc44d39), outfit(0xbf4738), 0x776955, SKIN, 1);
      cube(group, [.78, .24, .76], [0, 2.1, -.01], 0xc16b39, 'helmet');
      cube(group, [.84, .18, .39], [0, 2.03, .28], 0x414959, 'goggle_band');
      for (const x of [-.19, .19]) cube(group, [.25, .18, .10], [x, 2.04, .40], 0xf6cf54, 'goggle');
      face(group);
      cube(group, [.36, .43, .28], [0, 1.10, -.33], 0x49546a, 'bomb_pack');
      cube(p.rightArm, [.32, .32, .32], [0, -.51, .3], 0xf5c44c, 'grenade');
      cube(p.rightArm, [.12, .14, .12], [0, -.29, .3], 0x3e4958, 'grenade_fuse');
      break;
    case 'chrono':
      p = shell(group, outfit(0x614493), outfit(0x6d4ca0), 0x414059, SKIN, 1);
      cube(group, [.78, .21, .72], [0, 2.08, 0], 0xcac5e2, 'silver_hair');
      cube(group, [.09, .8, .05], [-.26, 1.02, .25], 0xe0ac54, 'coat_trim');
      cube(group, [.09, .8, .05], [.26, 1.02, .25], 0xe0ac54, 'coat_trim');
      face(group);
      cube(p.rightArm, [.47, .50, .13], [0, -.32, .37], 0xf2c357, 'clock_frame');
      cube(p.rightArm, [.32, .35, .025], [0, -.32, .45], 0xffedba, 'clock_face');
      cube(p.rightArm, [.055, .23, .03], [0, -.32, .48], 0x4f4579, 'clock_hand');
      break;
    case 'noise':
      p = shell(group, outfit(0x333a59), outfit(0x313851), 0x2e3558, SKIN, 1);
      cube(group, [.82, .24, .77], [0, 2.11, 0], 0x35c4d7, 'cyan_hair');
      cube(group, [.88, .11, .78], [0, 1.99, 0], 0xd64ed8, 'headband');
      for (const x of [-.43, .43]) cube(group, [.16, .37, .37], [x, 1.78, 0], 0xdb59cd, 'headphone');
      face(group);
      cube(group, [.36, .32, .04], [0, 1.06, .24], 0x4fdef1, 'sound_logo');
      for (const arm of [p.leftArm, p.rightArm]) {
        cube(arm, [.51, .51, .36], [0, -.58, .20], 0x34344d, 'speaker');
        cube(arm, [.29, .29, .04], [0, -.58, .41], 0x45d6eb, 'speaker_grid');
      }
      break;
    case 'frost':
      p = shell(group, outfit(0x98bfe8), outfit(0xb8d8fc), 0x7786b0, SKIN, 1);
      cube(group, [.80, .25, .74], [0, 2.1, 0], 0xcbdfff, 'ice_hair');
      cube(group, [.17, .55, .70], [-.37, 1.79, 0], 0xc2ddff, 'ice_hair_side');
      cube(group, [.17, .55, .70], [.37, 1.79, 0], 0xc2ddff, 'ice_hair_side');
      face(group);
      cube(group, [.88, .18, .50], [0, 1.41, -.1], 0xe0f7ff, 'frost_scarf');
      staff(p, 0x8baccd, 0x6ddfff);
      cube(p.rightArm, [.20, .30, .20], [0, .66, .33], 0xc8f9ff, 'ice_spire');
      break;
    default: // Rei: the starter ranged hero.
      p = shell(group, outfit(0x277ad6), outfit(0x2265b3), 0x333b55, SKIN, 1);
      cube(group, [.79, .26, .72], [0, 2.1, -.01], 0x262c43, 'black_hair');
      cube(group, [.22, .28, .15], [-.27, 1.97, .28], 0x262c43, 'hair_fringe');
      face(group);
      cube(group, [.09, .55, .045], [-.16, 1.08, .235], 0xeaf7ff, 'hood_string');
      cube(group, [.09, .55, .045], [.16, 1.08, .235], 0xeaf7ff, 'hood_string');
      cube(group, [.58, .58, .26], [0, 1.12, -.28], outfit(0x2063a1), 'hood_back');
      rightHandItem(p, 0x41586e, 0x56eaff);
      break;
  }
  group.userData.voxelParts = p;
  return group;
}

/** Cheap animation, without skinning, suitable for mobile/iPad. */
export function poseVoxelHero(group: THREE.Group, time: number, speed: number, attacking: boolean, usingSkill: boolean): void {
  const p = group.userData.voxelParts as BodyParts | undefined;
  if (!p) return;
  const stride = Math.min(1, speed / 4) * .48;
  const phase = time * 10;
  p.leftLeg.rotation.x = Math.sin(phase) * stride;
  p.rightLeg.rotation.x = -Math.sin(phase) * stride;
  p.leftArm.rotation.x = -Math.sin(phase) * stride * .5 - (usingSkill ? .9 : 0);
  p.rightArm.rotation.x = Math.sin(phase) * stride * .5 - (attacking ? 1.03 : .10);
  p.rightArm.rotation.z = attacking ? -.12 : 0;
}

/** Prevent GPU resource leaks when a character changes skin or leaves the match. */
export function disposeVoxelHero(group: THREE.Group): void {
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    mats.forEach(material => material.dispose());
  });
}
