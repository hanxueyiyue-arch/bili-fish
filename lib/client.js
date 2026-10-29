/* BiliFish settings panel. Uses DSH's native settings.section extension slot.
 * All display data comes from our same-origin, authenticated local API.
 * No remote scripts, credentials, or Bilibili publishing requests. */
window.__ModuleLoader__.load({
  id: 'dsh-bili-fish',
  factory: require => {
    // Follow the tested DSH client-module export shape used by the reference plugin.
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    const React = require('react');
    const h = React.createElement;
    const {useEffect, useState} = React;
    const API = '/bili-fish/api';
    const CSS = `
      .bf{max-width:850px;display:flex;flex-direction:column;gap:15px;color:var(--dsw-alias-label-primary)}
      .bf h2{margin:0;font-size:18px}.bf h3{margin:0;font-size:14px}
      .bf .muted{opacity:.72;font-size:12px;line-height:1.5}
      .bf .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:9px}
      .bf .card{border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:13px;min-width:0}
      .bf .number{font-size:23px;font-weight:650}.bf .actions{display:flex;flex-wrap:wrap;gap:9px;align-items:center}
      .bf button{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;border-radius:7px;padding:6px 11px;cursor:pointer}
      .bf button:disabled{opacity:.45;cursor:not-allowed}.bf .warn{color:#d69c31}
      .bf .error{color:#d85858;white-space:pre-wrap}.bf .item{border-top:1px solid var(--dsw-alias-border-l2);padding:10px 0;overflow-wrap:anywhere}
      .bf .item:first-of-type{border:0}.bf .detail{font-size:12px;white-space:pre-wrap;opacity:.85;margin-top:4px}
      .bf .badge{font-size:11px;border:1px solid var(--dsw-alias-border-l2);border-radius:20px;padding:2px 8px}
    `;
    function Screen(){
      const [data,setData]=useState(null);
      const [error,setError]=useState('');
      const [busy,setBusy]=useState(false);
      async function reload(){
        try {
          const r=await fetch(API+'/state',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
          const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'读取失败 '+r.status);
          setData(j.data);setError('');
        } catch(e){setError('读取状态失败：'+e.message);}
      }
      useEffect(()=>{reload();},[]);
      async function act(action,fields={}){
        if(busy)return;
        setBusy(true);
        try {
          const r=await fetch(API+'/control',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action,...fields})});
          const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'操作失败');
          await reload();
        } catch(e){setError('操作失败：'+e.message);}finally{setBusy(false);}
      }
      const card=(title,val)=>h('div',{className:'card',key:title},h('div',{className:'number'},val),h('div',{className:'muted'},title));
      const section=(title,items,render)=>h('section',{key:title},h('h3',null,title),...(items?.length?items.map(render):[h('div',{className:'muted',key:'empty'},'还没有记录')]));
      const automation=data?.automation||{};
      return h('div',{className:'bf'},
        h('style',null,CSS),
        h('h2',null,'🐟 BiliFish · 小鱼控制台'),
        h('div',{className:'muted'},'所有养成数据留在本地。这里不会读取 B站 Cookie、登录账号或自动发布内容。'),
        h('div',{className:'actions'},h('button',{onClick:reload,disabled:busy},'刷新状态'),h('span',{className:'badge'},'V0.1.1')),
        error&&h('div',{className:'error'},error),
        !data?h('div',{className:'muted'},'正在载入本地状态…'):
        h(React.Fragment,null,
          h('div',{className:'cards'},card('长期记忆',data.counters.memories),card('观察记录',data.counters.observations),card('日记',data.counters.diary),card('草稿',data.counters.drafts)),
          h('section',{className:'card'},
            h('h3',null,'自动浏览'),
            h('p',{className:'muted'},'当前：'+(automation.enabled?'运行中':automation.pausedByRisk?'风控暂停':'已关闭')+'；下一轮：'+(automation.nextRunAt||'未安排')),
            h('p',{className:'muted'},'失败次数：'+(automation.failures||0)+'；最近错误：'+(automation.lastError||'无')),
            h('div',{className:'actions'},
              h('button',{disabled:busy||!automation.enabled,onClick:()=>act('pause')},'立即停止'),
              h('button',{disabled:busy||!!automation.enabled,onClick:()=>act('resume')},'开启自动浏览'),
              h('span',{className:'warn'},'首次运行将在完整间隔后进行；只读公开数据'))),
          section('近期记忆',data.memories,x=>h('div',{className:'item',key:x.id},h('b',null,x.title),h('div',{className:'detail'},x.content),h('div',{className:'muted'},'标签：'+(x.tags||'无')+' · 回忆：'+(x.recallCount||0)))),
          section('最近日记',data.diary,x=>h('div',{className:'item',key:x.at},h('b',null,x.mood||'无心情'),h('span',{className:'muted'},' · '+x.at),h('div',{className:'detail'},x.text))),
          section('本地草稿（未发布）',data.drafts,x=>h('div',{className:'item',key:x.id},h('b',null,x.kind+' · '+(x.targetBvid||'无目标')),h('div',{className:'detail'},x.text))),
          section('自动浏览 / 操作日志',data.activity.slice().reverse(),(x,i)=>h('div',{className:'item',key:x.at+':'+i},h('span',{className:'badge'},x.type),h('span',{className:'muted'},' '+x.at),h('div',{className:'detail'},x.message+(x.detail?'\n'+x.detail:'')))),
          h('section',{className:'card'},h('h3',null,'测试数据清理（仅有明确标记的 V0.1 测试记录）'),h('div',{className:'muted'},'每次删除前由后端自动生成完整状态备份；不会删除正式记录。'),
            ...(data.tests.length?data.tests.map(x=>h('div',{className:'item',key:x.kind+x.id},h('div',{className:'detail'},x.kind+' · '+x.label),h('button',{disabled:busy,onClick:()=>{if(window.confirm('将备份状态后删除此条测试记录，确认？'))act('delete-test',{kind:x.kind,id:x.id,confirmation:'DELETE_TEST_DATA'});}},'备份并删除'))):[h('div',{className:'muted',key:'none'},'无可清理的测试记录')]))
        )
      );
    }
    function apply(ctx) {
      ctx.effect(()=>ctx.slots.inject('settings.section',()=>ctx.slots.register(
        {name:'settings.section',id:'bili-fish',order:7,label:()=> 'BiliFish · 小鱼'},Screen
      ),'bili-fish panel'),'bili-fish panel');
    }
    exports.apply = apply;
    exports.inject = ['slots'];
    return module.exports;
  },
});
