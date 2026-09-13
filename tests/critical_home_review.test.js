'use strict';

const fs = require('fs');
const path = require('path');

test('critical home: reload 后新掉落 ID 不得撞上 runtime 已恢复的掉落', () => {
  const priorState = APH.state;
  const priorCombat = APH.Combat;
  try {
    /* 重载 combat.js 模拟刷新页面：模块内 pid 会从初始值重新开始。 */
    new Function(fs.readFileSync(path.join(__dirname, '..', 'src', 'combat.js'), 'utf8'))();
    const T = APH.CFG.entType;
    const restored = {
      id: 'dp_1', type: T.DROPPED, itemId: 'it_food', n: 1,
      x: 0, y: 0, bobA: 0, stock: true
    };
    APH.state = {
      scene: 'home', entities: [restored], parts: [], carry: {},
      meta: { res: {} }, colony: { rulesVersion: 1, buildings: [] }
    };

    const spawned = APH.Combat.spawnDrop(1000, 1000, 'it_mineral', 1, {
      merge: false, jitter: 0, stock: true
    });
    if (!spawned || spawned.id === restored.id)
      throw new Error('刷新后复用了已恢复掉落 ID: ' + (spawned && spawned.id));
    const ids = APH.state.entities.map(function(e){ return e.id; });
    if (new Set(ids).size !== ids.length)
      throw new Error('掉落实体 ID 必须在当前世界唯一: ' + JSON.stringify(ids));
  } finally {
    APH.state = priorState;
    APH.Combat = priorCombat;
  }
});

test('critical home: 重复旧 ID 不能让物流把另一种物资转换成预约货物', () => {
  const T = APH.CFG.entType;
  const food = { id:'dp_collision', type:T.DROPPED, itemId:'it_food', n:1, x:0, y:0 };
  const mineral = { id:'dp_collision', type:T.DROPPED, itemId:'it_mineral', n:1, x:900, y:900 };
  const colony = {
    rulesVersion:1,
    logistics:{v:1,nextTask:1,nextReservation:1,tasks:[],reservations:[]}
  };
  const task = APH.Logistics.ensureTask(colony, {
    kind:'generic', targetId:'collision_target', x:50, y:0, need:{food:1}
  });
  const reserved = APH.Logistics.reserveForTask(
    colony, {}, [food, mineral], task, 'carrier', {from:{x:0,y:0}}
  );
  if (!reserved.ok) throw new Error('测试前置预约失败: ' + JSON.stringify(reserved));

  const picked = APH.Logistics.pickup(
    colony, {}, [food, mineral], reserved.reservation.id, 'carrier', {x:0,y:0}
  );
  if (!picked.ok) throw new Error('测试前置取料失败: ' + JSON.stringify(picked));
  if (picked.cargo.itemId !== 'it_food' || food.n !== 0 || !food.dead)
    throw new Error('预约粮食没有从对应粮堆取得: ' + JSON.stringify({picked:picked,food:food}));
  if (mineral.n !== 1 || mineral.dead)
    throw new Error('同 ID 的远处矿物被错误扣除或转换: ' + JSON.stringify(mineral));
});
