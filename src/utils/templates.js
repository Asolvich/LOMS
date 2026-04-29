// Шаблоны задач

export const TEMPLATES = {
  transport: {
    name: 'Транспортная задача (2×2)',
    direction: 'min',
    nodes: [
      { id: 'v1', type: 'variable', name: 'x11', var_type: 'cont', lb: 0, ub: null, obj_coeff: 2, x: 80,  y: 80  },
      { id: 'v2', type: 'variable', name: 'x12', var_type: 'cont', lb: 0, ub: null, obj_coeff: 3, x: 80,  y: 170 },
      { id: 'v3', type: 'variable', name: 'x21', var_type: 'cont', lb: 0, ub: null, obj_coeff: 4, x: 80,  y: 260 },
      { id: 'v4', type: 'variable', name: 'x22', var_type: 'cont', lb: 0, ub: null, obj_coeff: 1, x: 80,  y: 350 },
      { id: 'c1', type: 'constraint', name: 'supply_1', sense: 'eq', rhs: 30, x: 340, y: 80  },
      { id: 'c2', type: 'constraint', name: 'supply_2', sense: 'eq', rhs: 40, x: 340, y: 170 },
      { id: 'c3', type: 'constraint', name: 'demand_1', sense: 'eq', rhs: 25, x: 340, y: 260 },
      { id: 'c4', type: 'constraint', name: 'demand_2', sense: 'eq', rhs: 45, x: 340, y: 350 },
      { id: 'obj1', type: 'objective', x: 550, y: 215 },
    ],
    edges: [
      { id: 'e1', source: 'v1', target: 'c1', coeff: 1 }, { id: 'e2', source: 'v2', target: 'c1', coeff: 1 },
      { id: 'e3', source: 'v3', target: 'c2', coeff: 1 }, { id: 'e4', source: 'v4', target: 'c2', coeff: 1 },
      { id: 'e5', source: 'v1', target: 'c3', coeff: 1 }, { id: 'e6', source: 'v3', target: 'c3', coeff: 1 },
      { id: 'e7', source: 'v2', target: 'c4', coeff: 1 }, { id: 'e8', source: 'v4', target: 'c4', coeff: 1 },
    ],
  },

  assignment: {
    name: 'Задача о назначениях (3×3)',
    direction: 'min',
    nodes: [
      { id: 'x11', type: 'variable', name: 'x11', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 9, x: 50, y: 60  },
      { id: 'x12', type: 'variable', name: 'x12', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 2, x: 50, y: 140 },
      { id: 'x13', type: 'variable', name: 'x13', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 7, x: 50, y: 220 },
      { id: 'x21', type: 'variable', name: 'x21', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 3, x: 50, y: 300 },
      { id: 'x22', type: 'variable', name: 'x22', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 6, x: 50, y: 380 },
      { id: 'x23', type: 'variable', name: 'x23', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 4, x: 50, y: 460 },
      { id: 'x31', type: 'variable', name: 'x31', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 5, x: 50, y: 540 },
      { id: 'x32', type: 'variable', name: 'x32', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 8, x: 50, y: 620 },
      { id: 'x33', type: 'variable', name: 'x33', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 1, x: 50, y: 700 },
      { id: 'r1', type: 'constraint', name: 'worker_1', sense: 'eq', rhs: 1, x: 320, y: 100 },
      { id: 'r2', type: 'constraint', name: 'worker_2', sense: 'eq', rhs: 1, x: 320, y: 380 },
      { id: 'r3', type: 'constraint', name: 'worker_3', sense: 'eq', rhs: 1, x: 320, y: 620 },
      { id: 'j1', type: 'constraint', name: 'job_1', sense: 'eq', rhs: 1, x: 560, y: 60  },
      { id: 'j2', type: 'constraint', name: 'job_2', sense: 'eq', rhs: 1, x: 560, y: 380 },
      { id: 'j3', type: 'constraint', name: 'job_3', sense: 'eq', rhs: 1, x: 560, y: 700 },
      { id: 'obj1', type: 'objective', x: 760, y: 380 },
    ],
    edges: [
      { id: 'e1', source: 'x11', target: 'r1', coeff: 1 }, { id: 'e2', source: 'x12', target: 'r1', coeff: 1 }, { id: 'e3', source: 'x13', target: 'r1', coeff: 1 },
      { id: 'e4', source: 'x21', target: 'r2', coeff: 1 }, { id: 'e5', source: 'x22', target: 'r2', coeff: 1 }, { id: 'e6', source: 'x23', target: 'r2', coeff: 1 },
      { id: 'e7', source: 'x31', target: 'r3', coeff: 1 }, { id: 'e8', source: 'x32', target: 'r3', coeff: 1 }, { id: 'e9', source: 'x33', target: 'r3', coeff: 1 },
      { id: 'e10', source: 'x11', target: 'j1', coeff: 1 }, { id: 'e11', source: 'x21', target: 'j1', coeff: 1 }, { id: 'e12', source: 'x31', target: 'j1', coeff: 1 },
      { id: 'e13', source: 'x12', target: 'j2', coeff: 1 }, { id: 'e14', source: 'x22', target: 'j2', coeff: 1 }, { id: 'e15', source: 'x32', target: 'j2', coeff: 1 },
      { id: 'e16', source: 'x13', target: 'j3', coeff: 1 }, { id: 'e17', source: 'x23', target: 'j3', coeff: 1 }, { id: 'e18', source: 'x33', target: 'j3', coeff: 1 },
    ],
  },

  knapsack: {
    name: 'Задача о рюкзаке (5 предметов)',
    direction: 'max',
    nodes: [
      { id: 'i1', type: 'variable', name: 'item1', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 10, x: 80, y: 70  },
      { id: 'i2', type: 'variable', name: 'item2', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 6,  x: 80, y: 160 },
      { id: 'i3', type: 'variable', name: 'item3', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 12, x: 80, y: 250 },
      { id: 'i4', type: 'variable', name: 'item4', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 8,  x: 80, y: 340 },
      { id: 'i5', type: 'variable', name: 'item5', var_type: 'binary', lb: 0, ub: 1, obj_coeff: 5,  x: 80, y: 430 },
      { id: 'cap', type: 'constraint', name: 'capacity', sense: 'leq', rhs: 15, x: 360, y: 250 },
      { id: 'obj1', type: 'objective', x: 560, y: 250 },
    ],
    edges: [
      { id: 'e1', source: 'i1', target: 'cap', coeff: 7 },
      { id: 'e2', source: 'i2', target: 'cap', coeff: 4 },
      { id: 'e3', source: 'i3', target: 'cap', coeff: 9 },
      { id: 'e4', source: 'i4', target: 'cap', coeff: 6 },
      { id: 'e5', source: 'i5', target: 'cap', coeff: 3 },
    ],
  },

  production: {
    name: 'Планирование производства',
    direction: 'max',
    nodes: [
      { id: 'p1', type: 'variable', name: 'product_A', var_type: 'cont', lb: 0, ub: null, obj_coeff: 25, x: 80, y: 160 },
      { id: 'p2', type: 'variable', name: 'product_B', var_type: 'cont', lb: 0, ub: null, obj_coeff: 30, x: 80, y: 280 },
      { id: 'c1', type: 'constraint', name: 'resource_labor',    sense: 'leq', rhs: 240, x: 360, y: 80  },
      { id: 'c2', type: 'constraint', name: 'resource_material', sense: 'leq', rhs: 270, x: 360, y: 220 },
      { id: 'c3', type: 'constraint', name: 'machine_hours',     sense: 'leq', rhs: 420, x: 360, y: 360 },
      { id: 'obj1', type: 'objective', x: 580, y: 220 },
    ],
    edges: [
      { id: 'e1', source: 'p1', target: 'c1', coeff: 2 }, { id: 'e2', source: 'p2', target: 'c1', coeff: 4 },
      { id: 'e3', source: 'p1', target: 'c2', coeff: 3 }, { id: 'e4', source: 'p2', target: 'c2', coeff: 3 },
      { id: 'e5', source: 'p1', target: 'c3', coeff: 4 }, { id: 'e6', source: 'p2', target: 'c3', coeff: 6 },
    ],
  },
};

export const TEMPLATE_LIST = [
  { key: 'transport',  icon: '🚛', title: 'Транспортная задача',     subtitle: 'LP · Минимизация затрат 2×2' },
  { key: 'assignment', icon: '👷', title: 'Задача о назначениях',    subtitle: 'MIP · Binary · 3×3' },
  { key: 'knapsack',   icon: '🎒', title: 'Задача о рюкзаке',        subtitle: 'MIP · Binary · 5 предметов' },
  { key: 'production', icon: '🏭', title: 'Планирование производства', subtitle: 'LP · 2 продукта · 3 ресурса' },
];
