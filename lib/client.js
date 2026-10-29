/* BiliFish settings panel. Uses DSH's native settings.section extension slot.
 * All display data comes from the official Harness authenticated local API.
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
      .bf .interests{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px}
      .bf .bar{height:7px;border-radius:5px;background:var(--dsw-alias-border-l2);margin-top:5px;overflow:hidden}
      .bf .fill{height:100%;background:var(--dsw-alias-label-primary);opacity:.6}
      .bf select,.bf input{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px;color:inherit;background:transparent;max-width:130px}
      .bf .boxnote{padding:10px 0;font-size:12px;opacity:.75;line-height:1.5}
    `;
    function Screen(){
      const [data,setData]=useState(null);
      const [error,setError]=useState('');
      const [busy,setBusy]=useState(false);
      const [csrfToken,setCsrfToken]=useState('');
      const [routine,setRoutine]=useState({timeZone:'Asia/Shanghai',wakeHour:9,sleepHour:23});
      async function reload(){
        try {
          const r=await fetch(API+'/state',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
          const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'读取失败 '+r.status);
          setCsrfToken(typeof j.csrfToken==='string'?j.csrfToken:'');
          setData(j.data);setError('');
        } catch(e){setError('读取状态失败：'+e.message);}
      }
      useEffect(()=>{reload();},[]);
      useEffect(()=>{if(data?.life?.routine)setRoutine({...data.life.routine});},[data?.life?.routine?.timeZone,data?.life?.routine?.wakeHour,data?.life?.routine?.sleepHour]);
      async function act(action,fields={}){
        if(busy)return;
        if(!csrfToken){setError('缺少控制令牌，请点击刷新状态后再试');return;}
        setBusy(true);
        try {
          const r=await fetch(API+'/control',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','x-bili-fish-csrf':csrfToken},body:JSON.stringify({action,...fields})});
          const j=await r.json();
          if(!r.ok||!j.ok){
            if(r.status===403){await reload();throw Error((j.error||'控制请求遭拒')+'；已刷新令牌，请重新点击。');}
            throw Error(j.error||'操作失败');
          }
          await reload();
        } catch(e){setError('操作失败：'+e.message);}finally{setBusy(false);}
      }
      const card=(title,val)=>h('div',{className:'card',key:title},h('div',{className:'number'},val),h('div',{className:'muted'},title));
      const section=(title,items,render)=>h('section',{key:title},h('h3',null,title),...(items?.length?items.map(render):[h('div',{className:'muted',key:'empty'},'还没有记录')]));
      const automation=data?.automation||{};
      const life=data?.life||{};
      const fmtDate=s=>{if(!s)return '无';try{return new Date(s).toLocaleString('zh-CN',{timeZone:life.routine?.timeZone||'Asia/Shanghai',hour12:false});}catch{return s;}};
      return h('div',{className:'bf'},
        h('style',null,CSS),
        h('h2',null,'🐟 BiliFish · 小鱼控制台'),
        h('div',{className:'muted'},'所有养成数据留在本地。这里不会读取 B站 Cookie、登录账号或自动发布内容。'),
        h('div',{className:'actions'},h('button',{onClick:reload,disabled:busy},'刷新状态'),h('span',{className:'badge'},'V0.3.0')),
        error&&h('div',{className:'error'},error),
        data&&!csrfToken&&h('div',{className:'warn'},'此页面当前仅可查看；控制令牌尚不可用，请刷新状态。'),
        !data?h('div',{className:'muted'},'正在载入本地状态…'):
        h(React.Fragment,null,
          h('div',{className:'cards'},card('活跃记忆',data.counters.memories),card('归档记忆',data.memoryV3?.archiveCount??0),card('观察记录',data.counters.observations),card('日记',data.counters.diary),card('草稿',data.counters.drafts)),
          h('section',{className:'card'},
            h('h3',null,'自动浏览'),
            h('p',{className:'muted'},'当前：'+(automation.enabled?'运行中':automation.pausedByRisk?'风控暂停':'已关闭')+'；下一轮：'+(automation.nextRunAt||'未安排')),
            h('p',{className:'muted'},'失败次数：'+(automation.failures||0)+'；最近错误：'+(automation.lastError||'无')),
            h('div',{className:'actions'},
              h('button',{disabled:busy||!csrfToken||!automation.enabled,onClick:()=>act('pause')},'立即停止'),
              h('button',{disabled:busy||!csrfToken||!!automation.enabled,onClick:()=>act('resume')},'开启自动浏览'),
              h('span',{className:'warn'},'首次运行将在完整间隔后进行；只读公开数据'))),
          h('section',{className:'card'},
            h('h3',null,'🐠 自主生活 · 当前状态'),
            h('div',{className:'boxnote'},'状态：'+(life.awake?'清醒探索':'正在休息')+' · 心情：'+(life.mood||'好奇')+' · 活力：'+(life.energy??75)+'/100 · 成长轮次：'+(life.rounds||0)),
            h('div',{className:'muted'},'自动养成使用公开视频标题/简介的关键词规则，不调用后台大模型，不代表真正观看或理解完整视频。'),
            h('h3',{style:{marginTop:'12px'}},'兴趣倾向'),
            h('div',{className:'interests'},...(life.interests?.length?life.interests.slice(0,12).map(x=>h('div',{key:x.topic},
              h('div',{className:'muted'},x.topic+' · '+x.score+'/100'),h('div',{className:'bar'},h('div',{className:'fill',style:{width:Math.min(100,x.score)+'%'}})))):[h('div',{className:'muted',key:'no-interest'},'还没有探索积累，兴趣将从公开元数据逐步形成')]))
          ),
          h('section',{className:'card'},h('h3',null,'日常作息'),
            h('div',{className:'actions',style:{marginTop:'10px'}},
              h('label',null,'时区 ',h('select',{value:routine.timeZone,onChange:e=>setRoutine({...routine,timeZone:e.target.value})},
                ...['Asia/Shanghai','Asia/Tokyo','UTC'].map(t=>h('option',{key:t,value:t},t)))),
              h('label',null,'起床 ',h('input',{type:'number',min:0,max:23,value:routine.wakeHour,onChange:e=>setRoutine({...routine,wakeHour:Number(e.target.value)})})),
              h('label',null,'休息 ',h('input',{type:'number',min:0,max:23,value:routine.sleepHour,onChange:e=>setRoutine({...routine,sleepHour:Number(e.target.value)})})),
              h('button',{disabled:busy||!csrfToken||routine.wakeHour===routine.sleepHour,onClick:()=>act('set-routine',routine)},'保存作息')),
            h('div',{className:'boxnote'},'只有明确开启自动浏览后才会触发定时任务；休息时段不发送网络请求，顺延检查。')
          ),
          section('兴趣成长轨迹',life.interestHistory?.slice().reverse().slice(0,12), (x,i)=>h('div',{className:'item',key:x.at+':'+i},
            h('div',{className:'muted'},fmtDate(x.at)),
            h('div',{className:'detail'},(x.top||[]).map(v=>v.topic+' '+v.score).join(' · ')))),
          section('最近探索经历',life.recentExperiences?.slice().reverse(),(x,i)=>h('div',{className:'item',key:x.at+':'+i},
            h('b',null,x.title||'未命名'),h('div',{className:'muted'},fmtDate(x.at)+' · '+(x.topics||[]).join('、')),
            h('div',{className:'detail'},'来源：B站公开元数据 · '+(x.bvid||'')))),
          h('section',{className:'card'},h('h3',null,'🧠 BrainMem V2 · 分层记忆'),
            h('div',{className:'boxnote'},'本地索引检索、智能遗忘与手动归档。遗忘仅影响回忆细节，不删除原始证据。记忆整合需人工核实。'),
            h('div',{className:'cards'},...Object.entries(data.memoryV3?.layers||{}).map(([key,n])=>card(({episodic:'情景',semantic:'语义',autobiographical:'自传',preference:'偏好'})[key]||key,n))),
            h('div',{className:'muted'},'强度阶段：清晰 '+(data.memoryV3?.stages?.details||0)+' · 概况 '+(data.memoryV3?.stages?.overview||0)+' · 模糊痕迹 '+(data.memoryV3?.stages?.trace||0)+'；归档 '+(data.memoryV3?.archiveCount||0)+' 条。'),
            h('div',{className:'boxnote'},'搜索、低 Token 摘要、归档与恢复通过聊天工具操作；归档前需明确确认和自动备份。')
          ),
          section('近期记忆',data.memories,x=>h('div',{className:'item',key:x.id},h('b',null,x.title),h('div',{className:'detail'},x.content),h('div',{className:'muted'},'标签：'+(x.tags||'无')+' · 类型：'+(x.kind||'未分类')+' · 层级：'+(x.layer||'情景')+' · 痕迹强度：'+(x.brainStrength??'—')+' · 回忆：'+(x.recallCount||0)),
             x.source?.bvid && h('div',{className:'muted'},'来源 BV：'+x.source.bvid+' · '+(x.source.level||'未说明')))),
          section('最近日记',data.diary,x=>h('div',{className:'item',key:x.at},h('b',null,x.mood||'无心情'),h('span',{className:'muted'},' · '+fmtDate(x.at)),h('div',{className:'detail'},x.text))),
          section('本地草稿（未发布）',data.drafts,x=>h('div',{className:'item',key:x.id},h('b',null,x.kind+' · '+(x.targetBvid||'无目标')),h('div',{className:'detail'},x.text))),
          section('自动浏览 / 操作日志',data.activity.slice().reverse(),(x,i)=>h('div',{className:'item',key:x.at+':'+i},h('span',{className:'badge'},x.type),h('span',{className:'muted'},' '+fmtDate(x.at)),h('div',{className:'detail'},x.message+(x.detail?'\n'+x.detail:'')))),
          h('section',{className:'card'},h('h3',null,'测试数据清理（仅有明确标记的 V0.1 测试记录）'),h('div',{className:'muted'},'每次删除前由后端自动生成完整状态备份；不会删除正式记录。'),
            ...(data.tests.length?data.tests.map(x=>h('div',{className:'item',key:x.kind+x.id},h('div',{className:'detail'},x.kind+' · '+x.label),h('button',{disabled:busy||!csrfToken,onClick:()=>{if(window.confirm('将备份状态后删除此条测试记录，确认？'))act('delete-test',{kind:x.kind,id:x.id,confirmation:'DELETE_TEST_DATA'});}},'备份并删除'))):[h('div',{className:'muted',key:'none'},'无可清理的测试记录')]))
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
