'use strict';
const Colony = window.APH.Colony;

test('#173 bills: addBill / activeBill', () => {
  if (typeof Colony.addBill !== 'function') throw new Error('缺失 addBill');
  const b = { id: 'bl_kitchen', bills: [] };
  const bill = Colony.addBill(b, 'it_roasted_meat', 4);
  if (!bill || bill.recipe !== 'it_roasted_meat' || bill.target !== 4 || bill.done !== 0)
    throw new Error('工单结构不对: ' + JSON.stringify(bill));
  const act = Colony.activeBill(b);
  if (act !== bill) throw new Error('应返回未做完的工单');
});

test('#173 bills: 空工单不生产', () => {
  const kitchen = { id: 'bl_kitchen', recipe: 'it_roasted_meat', cookProgress: 0, bills: [] };
  const stock = { food: 10, wood: 5 };
  const tech = { te_stonecutting: 1 };
  const r = Colony.cookingTick(kitchen, 4, 1, stock, tech, 20);
  if (r.done) throw new Error('空工单不应产出');
  if (r.why !== '无工单') throw new Error('应报无工单, 实际: ' + r.why);
  if (stock.food !== 10) throw new Error('不应扣材料');
});

test('#173 bills: 工单 1 件只产 1 件', () => {
  const kitchen = { id: 'bl_kitchen', cookProgress: 0, bills: [] };
  Colony.addBill(kitchen, 'it_roasted_meat', 1);
  const stock = { food: 10, wood: 5 };
  const tech = { te_stonecutting: 1 };
  const r1 = Colony.cookingTick(kitchen, 4, 1, stock, tech, 20);
  if (!r1.done || r1.producedItemId !== 'it_roasted_meat') throw new Error('第一件应产出: ' + JSON.stringify(r1));
  if (kitchen.bills[0].done !== 1) throw new Error('done 应为 1, 实际: ' + kitchen.bills[0].done);
  const foodAfter = stock.food;
  const r2 = Colony.cookingTick(kitchen, 4, 1, stock, tech, 20);
  if (r2.done) throw new Error('做满后不应再产');
  if (stock.food !== foodAfter) throw new Error('做满后不应再扣粮');
});

test('#173 bills: 无 bills 字段仍可无限产（旧测试兼容）', () => {
  const kitchen = { id: 'bl_kitchen', recipe: 'it_roasted_meat', cookProgress: 0 };
  const stock = { food: 10, wood: 5 };
  const r = Colony.cookingTick(kitchen, 4, 1, stock, { te_stonecutting: 1 }, 20);
  if (!r.done) throw new Error('无 bills 字段应保持旧行为');
});
