// 角度は度(X, Y, Z)。脚は IK で解くので feet(足首目標)で指定する。
// feet: [x, z, 向き(度), 持ち上げ(m), つま先の傾き(度)] ナイトのルート空間
// root: 腰の位置オフセット [x, y, z]
export const POSES = {
  idle: {
    label: '待機',
    root: [0, -0.015, 0],
    joints: {
      spine: [2, 0, 0], chest: [3, 0, 0], head: [-4, 0, 0],
      shoulder_L: [10, -62, 16], elbow_L: [-24, 34, 0], shield: [15, 3, 0],
      shoulder_R: [-10, -46, 1], elbow_R: [-13, 29, 0], wrist_R: [47, 0, -10],
    },
    feet: { L: [0.15, 0.03, 12], R: [-0.15, -0.03, -14] },
  },
  guard: {
    label: '構え',
    root: [0, -0.1, -0.02],
    joints: {
      hips: [6, 28, 0], spine: [8, -12, 0], chest: [6, -12, 0], head: [-8, -6, 0],
      shoulder_L: [-44, -46, -15], elbow_L: [-84, -10, 0], shield: [100, -38, 0],
      shoulder_R: [-6, 4, 6], elbow_R: [-100, 6, 0], wrist_R: [17, 0, 0],
    },
    feet: { L: [0.14, 0.22, 20], R: [-0.17, -0.2, -45] },
  },
  charge: {
    label: '突進',
    root: [0, -0.16, 0.12],
    joints: {
      hips: [18, 12, 0], spine: [16, -6, 0], chest: [8, -6, 0], head: [-26, 0, 0],
      shoulder_L: [-50, -72, -15], elbow_L: [-113, -5, 0], shield: [100, -21, 0],
      shoulder_R: [-52, 22, 15], elbow_R: [-133, -81, 0], wrist_R: [68, -45, 0],
    },
    feet: { L: [0.15, 0.42, 10], R: [-0.14, -0.36, -15, 0.03, 35] },
  },
  block: {
    label: '防御',
    root: [0, -0.18, -0.04],
    joints: {
      hips: [10, 10, 0], spine: [14, -8, 0], chest: [6, -8, 0], head: [-10, 0, 0],
      shoulder_L: [-117, -84, -15], elbow_L: [-148, 87, 0], shield: [100, 56, 0],
      shoulder_R: [51, -18, 0], elbow_R: [-107, -15, 0], wrist_R: [-12, -15, 0],
    },
    feet: { L: [0.17, 0.18, 15], R: [-0.18, -0.16, -30] },
  },
  spinWind: {
    label: '溜め',
    hidden: true,
    root: [0, -0.14, 0],
    joints: {
      hips: [8, 38, 0], spine: [10, 22, 0], chest: [4, 20, 0], head: [-10, -30, 0],
      shoulder_L: [-54, -86, -15], elbow_L: [-93, 36, 0], shield: [74, -59, 0],
      shoulder_R: [-71, -90, -50], elbow_R: [-150, -33, 0], wrist_R: [-70, 52, 30],
    },
    feet: { L: [0.16, 0.12, 20], R: [-0.17, -0.12, -30] },
  },
  spinStrike: {
    label: '回転斬り',
    root: [0, -0.16, 0],
    joints: {
      hips: [8, -30, 0], spine: [10, -25, 0], chest: [4, -18, 0], head: [-10, 15, 0],
      shoulder_L: [30, -2, -11], elbow_L: [0, 34, 0], shield: [-56, -20, 0],
      shoulder_R: [-43, 88, -40], elbow_R: [-37, -71, 0], wrist_R: [70, -22, 10],
    },
    feet: { L: [0.16, 0.12, 20], R: [-0.17, -0.12, -30] },
  },
  visorUp: {
    label: '素顔',
    root: [0, -0.015, 0],
    joints: {
      spine: [0, 0, 0], chest: [0, 0, 0], head: [-6, 0, 0], visor: [-95, 0, 0],
      shoulder_L: [10, -62, 16], elbow_L: [-24, 34, 0], shield: [15, 3, 0],
      shoulder_R: [-108, 22, 15], elbow_R: [-83, -90, 0], wrist_R: [52, 13, 0],
    },
    feet: { L: [0.15, 0.03, 12], R: [-0.15, -0.03, -14] },
  },
};

export const ACTIONS = {
  spin: {
    label: '回転斬り',
    steps: [
      { pose: 'guard', dur: 0.35 },
      { pose: 'spinWind', dur: 0.35 },
      { pose: 'spinStrike', dur: 0.7, yawAdd: -360, trail: true },
      { pose: 'guard', dur: 0.5 },
    ],
  },
  charge: {
    label: '突進',
    steps: [
      { pose: 'guard', dur: 0.35 },
      { pose: 'charge', dur: 0.3, trail: true },
      { pose: 'charge', dur: 0.35 },
      { pose: 'guard', dur: 0.55 },
    ],
  },
};
