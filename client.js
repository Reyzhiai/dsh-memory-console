/**
 * memory-console —— 记忆管理台，Client 半。
 *
 * 侧栏一个图标（id: memory），点开主区域整页：分组列表 + Markdown 阅读 / 源码编辑、
 * 全文搜索、INDEX、健康检查、回收站。数据全部走 Host 的 /api/memory.rpc。
 *
 * 这个文件是浏览器模块工厂：CSS 注入放在工厂内（物化时执行一次），
 * 所有注册都挂在 apply 的 effect 上；组件只用 React.createElement，不引第三方库。
 */
window.__ModuleLoader__.load({
  id: 'dsh-memory-console',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'memory.console';
    const ROUTE = 'api/memory.rpc';
    const PANEL_ID = 'memory';
    const POLL_MS = 5000;

    /* ------------------------------------------------------------------ 样式 */

    const css = `
.mc-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background-color:var(--dsw-alias-bg-base);background-image:radial-gradient(1100px 340px at 8% -12%,color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent),transparent 70%);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.55}
.mc-header{display:flex;align-items:center;gap:14px;padding:18px 24px 12px;flex:none}
.mc-logo{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none;background:linear-gradient(135deg,var(--dsw-alias-brand-primary),color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,#7c3aed));box-shadow:0 8px 20px color-mix(in srgb,var(--dsw-alias-brand-primary) 28%,transparent)}
.mc-headtext{display:flex;flex-direction:column;gap:1px;min-width:0}
.mc-title{margin:0;font-size:18px;font-weight:650;letter-spacing:.01em}
.mc-subtitle{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-header-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
.mc-search{position:relative;display:flex;align-items:center}
.mc-search-icon{position:absolute;left:10px;color:var(--dsw-alias-label-secondary);display:flex;pointer-events:none}
.mc-search input{width:240px;height:32px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;border-radius:10px;padding:0 30px 0 32px;font:inherit;font-size:12.5px;outline:none;transition:border-color .15s,box-shadow .15s}
.mc-search input:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent)}
.mc-search-clear{position:absolute;right:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;display:flex;padding:3px;border-radius:6px}
.mc-search-clear:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.mc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,transform .06s}
.mc-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.mc-btn:active:not(:disabled){transform:translateY(1px)}
.mc-btn:disabled{opacity:.45;cursor:default}
.mc-btn-icon{width:32px;padding:0}
.mc-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff}
.mc-btn-primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);filter:brightness(1.07)}
.mc-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 38%,var(--dsw-alias-border-l1))}
.mc-btn-danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}
.mc-btn-ghost{border-color:transparent;background:transparent}
.mc-btn-ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.mc-tabs{display:inline-flex;gap:2px;padding:3px;margin:0 24px 12px;align-self:flex-start;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:11px;flex:none}
.mc-tab{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;border-radius:8px;padding:5px 12px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s,color .15s}
.mc-tab:hover{color:var(--dsw-alias-label-primary)}
.mc-tab[data-active="true"]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 3px rgba(0,0,0,.10)}
.mc-tab-badge{font-size:10.5px;line-height:16px;padding:0 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.mc-tab[data-active="true"] .mc-tab-badge{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary)}
.mc-content{flex:1;min-height:0;display:flex;gap:14px;padding:0 24px 20px}
.mc-card{display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;overflow:hidden}
.mc-list{width:330px;min-width:250px;max-width:44%;flex:none}
.mc-list-head{padding:10px 12px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);display:flex;align-items:center;gap:8px;flex:none}
.mc-list-title{font-size:11px;letter-spacing:.06em;color:var(--dsw-alias-label-secondary);text-transform:uppercase}
.mc-list-count{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-secondary)}
.mc-scroll{flex:1;min-height:0;overflow:auto;padding:6px 6px 18px}
.mc-group{margin-top:4px}
.mc-group-head{display:flex;align-items:center;gap:7px;padding:8px 10px 4px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.mc-dot{width:7px;height:7px;border-radius:50%;flex:none}
.mc-dot-root{background:#5b8def}
.mc-dot-project{background:#2fa36b}
.mc-dot-decision{background:#a855f7}
.mc-dot-other{background:#94a3b8}
.mc-group-count{margin-left:auto;font-size:10.5px;opacity:.75}
.mc-row{position:relative;display:flex;gap:10px;width:100%;padding:9px 12px 9px 14px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;transition:background .12s}
.mc-row:hover{background:var(--dsw-alias-bg-layer-2)}
.mc-row[data-active="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.mc-row[data-active="true"]::before{content:"";position:absolute;left:4px;top:11px;bottom:11px;width:3px;border-radius:3px;background:var(--dsw-alias-brand-primary)}
.mc-row-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.mc-row-title{font-size:13px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-row-summary{font-size:12px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mc-row-summary-warn{color:var(--dsw-alias-state-warn-primary)}
.mc-row-meta{display:flex;gap:7px;flex-wrap:wrap;font-size:10.5px;color:var(--dsw-alias-label-secondary);opacity:.9;margin-top:1px}
.mc-meta-sep{opacity:.45}
.mc-detail{flex:1;min-width:0}
.mc-detail-head{display:flex;align-items:flex-start;gap:12px;padding:16px 20px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.mc-detail-titles{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.mc-detail-title{margin:0;font-size:16px;font-weight:650;line-height:1.35;word-break:break-word}
.mc-path{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.mc-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.mc-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;line-height:19px;padding:0 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);white-space:nowrap}
.mc-chip-warn{color:var(--dsw-alias-state-warn-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 35%,var(--dsw-alias-border-l1))}
.mc-chip-ok{color:var(--dsw-alias-state-success-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 30%,var(--dsw-alias-border-l1))}
.mc-chip-error{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,var(--dsw-alias-border-l1))}
.mc-toolbar{display:flex;align-items:center;gap:8px;flex:none;padding-top:2px}
.mc-toolbar-note{margin-left:auto;font-size:11px;color:var(--dsw-alias-state-warn-primary);display:flex;align-items:center;gap:5px}
.mc-md{flex:1;min-height:0;overflow:auto;padding:16px 22px 64px;font-size:13.5px;line-height:1.75}
.mc-md>*:first-child{margin-top:0}
.mc-md-h{margin:20px 0 8px;line-height:1.35;font-weight:650}
.mc-md-h1{font-size:20px}
.mc-md-h2{font-size:17px}
.mc-md-h3{font-size:15px}
.mc-md-h4,.mc-md-h5,.mc-md-h6{font-size:13.5px;color:var(--dsw-alias-label-secondary)}
.mc-md-p{margin:8px 0}
.mc-md-ul,.mc-md-ol{margin:8px 0;padding-left:22px}
.mc-md-ul li,.mc-md-ol li{margin:3px 0}
.mc-md-quote{margin:12px 0;padding:6px 14px;border-left:3px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);border-radius:0 10px 10px 0;color:var(--dsw-alias-label-secondary)}
.mc-md-quote p{margin:2px 0}
.mc-md-code{margin:12px 0;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);overflow:auto;font-size:12px;line-height:1.6}
.mc-md-code code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.mc-md-inline{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;padding:1px 5px;border-radius:5px;background:var(--dsw-alias-bg-layer-2)}
.mc-md-hr{border:0;border-top:1px solid var(--dsw-alias-border-l1);margin:18px 0}
.mc-md-table{border-collapse:collapse;margin:12px 0;font-size:12.5px}
.mc-md-table th,.mc-md-table td{border:1px solid var(--dsw-alias-border-l1);padding:5px 10px;text-align:left}
.mc-md-table th{background:var(--dsw-alias-bg-layer-2);font-weight:600}
.mc-editor{flex:1;min-height:0;width:100%;box-sizing:border-box;resize:none;border:0;outline:none;background:transparent;color:inherit;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.8px;line-height:1.72;padding:16px 22px 40px;tab-size:2}
.mc-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:48px 24px;text-align:center;color:var(--dsw-alias-label-secondary)}
.mc-empty-icon{width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}
.mc-empty-title{font-size:13.5px;color:var(--dsw-alias-label-primary);font-weight:550}
.mc-empty-sub{font-size:12px;max-width:330px;line-height:1.65}
.mc-alert{margin:12px 20px;padding:10px 12px;border-radius:10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 30%,var(--dsw-alias-border-l1));background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.mc-hint{padding:14px 20px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.mc-index{flex:1;min-height:0;display:flex;flex-direction:column;padding:0 24px 20px}
.mc-index-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 2px 10px;flex:none}
.mc-index-note{font-size:11px;color:var(--dsw-alias-label-secondary);margin-left:2px}
.mc-index-body{flex:1;min-height:0;overflow:auto;margin:0;padding:16px 20px 40px;white-space:pre-wrap;word-break:break-word;font-size:12.5px;line-height:1.7;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.mc-health{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:2px 24px 30px}
.mc-health-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;padding:14px 16px}
.mc-health-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.mc-health-title{font-size:13px;font-weight:600}
.mc-health-desc{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-bottom:8px}
.mc-health-list{display:flex;flex-direction:column;gap:2px}
.mc-health-row{display:flex;align-items:center;gap:8px;padding:7px 9px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;font-size:12.5px}
.mc-health-row:hover{background:var(--dsw-alias-bg-layer-2)}
.mc-health-row .mc-path{margin-left:auto;font-size:11px}
.mc-health-group{margin-bottom:8px}
.mc-health-actions{margin-left:auto;display:flex;gap:6px;flex-shrink:0;align-items:center}
.mc-btn-sm{height:24px;padding:0 9px;font-size:11px;border-radius:7px}
.mc-btn-sm:disabled{opacity:.5;cursor:default}
.mc-health-link{flex:1;min-width:0;background:none;border:none;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-health-link:hover{color:var(--dsw-alias-state-business-primary,currentColor);text-decoration:underline;text-underline-offset:2px}
.mc-health-note{font-size:11px;color:var(--dsw-alias-label-secondary);flex-shrink:0}
.mc-health-sub{padding-left:16px;font-size:11.5px;opacity:.85}
.mc-ok{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dsw-alias-state-success-primary)}
.mc-required{flex:1;min-height:0;display:flex;gap:14px;padding:2px 24px 30px;overflow:hidden}
.mc-req-list{width:380px;min-width:290px;max-width:44%;flex:none;display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;overflow:hidden}
.mc-req-scroll{flex:1;min-height:0;overflow:auto;padding:6px 8px 12px}
.mc-req-item{display:flex;align-items:flex-start;gap:9px;padding:9px 10px;border-radius:10px}
.mc-req-item:hover{background:var(--dsw-alias-bg-layer-2)}
.mc-req-item[data-off="true"] .mc-req-main,.mc-req-item[data-off="true"] .mc-req-order{opacity:.45}
.mc-req-order{flex:none;width:22px;height:22px;border-radius:7px;background:var(--dsw-alias-bg-layer-2);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:650;color:var(--dsw-alias-label-secondary);margin-top:1px}
.mc-req-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.mc-req-name{font-size:12.5px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-req-path{font-size:10.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-req-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary);flex:none;margin-top:2px}
.mc-req-tools{display:flex;gap:1px;flex:none;align-items:center}
.mc-req-preview{flex:1;min-width:0;display:flex;flex-direction:column;gap:12px;min-height:0}
.mc-req-card{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;overflow:hidden}
.mc-req-card[data-grow="true"]{flex:1.5}
.mc-req-head{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none;background:var(--dsw-alias-bg-layer-2)}
.mc-req-head-title{font-size:12.5px;font-weight:600}
.mc-req-head-note{font-size:11px;color:var(--dsw-alias-label-secondary);margin-left:auto;font-variant-numeric:tabular-nums}
.mc-req-orderlist{flex:1;min-height:0;overflow:auto;padding:8px 10px 12px}
.mc-req-orderrow{display:flex;align-items:center;gap:8px;padding:5px 8px;border-radius:8px;font-size:11.5px}
.mc-req-orderrow[data-mine="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.mc-req-ordernum{flex:none;width:20px;text-align:right;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Consolas,monospace;font-size:10.5px}
.mc-req-ordername{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Consolas,monospace}
.mc-req-pre{margin:0;padding:12px 14px 18px;font-family:ui-monospace,Consolas,monospace;font-size:11.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word;overflow:auto;flex:1;min-height:0;color:var(--dsw-alias-label-primary)}
.mc-req-warn{color:var(--dsw-alias-state-warn-primary)}
.mc-req-empty{padding:16px 14px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.mc-trash{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:2px 24px 30px}
.mc-trash-head{display:flex;align-items:center;gap:10px;padding:0 2px 6px}
.mc-trash-row{display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px}
.mc-trash-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.mc-trash-name{font-size:13px;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-results{flex:1;min-height:0;display:flex;flex-direction:column;padding:0 24px 20px}
.mc-result{margin-bottom:14px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;overflow:hidden}
.mc-result-head{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.mc-result-title{font-size:12.5px;font-weight:600}
.mc-result-rel{font-size:11px;color:var(--dsw-alias-label-secondary);margin-left:auto;font-family:ui-monospace,Consolas,monospace}
.mc-result-hit{display:flex;gap:10px;padding:6px 14px;font-size:12px;line-height:1.6;cursor:pointer;border:0;background:transparent;color:inherit;text-align:left;width:100%;font-family:ui-monospace,Consolas,monospace}
.mc-result-hit:hover{background:var(--dsw-alias-bg-layer-2)}
.mc-lineno{flex:none;width:34px;text-align:right;color:var(--dsw-alias-label-secondary);opacity:.7;user-select:none}
.mc-hit-text{white-space:pre-wrap;word-break:break-word}
.mc-mark{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 32%,transparent);color:inherit;border-radius:3px;padding:0 1px}
.mc-backdrop{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(12,17,26,.44);backdrop-filter:blur(3px)}
.mc-modal{width:min(760px,100%);max-height:min(82vh,780px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l2);border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.30);overflow:hidden}
.mc-modal-head{display:flex;align-items:center;gap:10px;padding:16px 20px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.mc-modal-title{margin:0;font-size:15px;font-weight:650}
.mc-modal-close{margin-left:auto}
.mc-modal-body{flex:1;min-height:0;overflow:auto;padding:16px 20px}
.mc-modal-foot{display:flex;gap:8px;justify-content:flex-end;padding:12px 20px 16px;border-top:1px solid var(--dsw-alias-border-l1);flex:none}
.mc-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.mc-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.mc-required-mark{color:var(--dsw-alias-state-error-primary);margin-left:2px}
.mc-textinput,.mc-textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:inherit;border-radius:10px;padding:8px 11px;font:inherit;font-size:12.5px;outline:none;transition:border-color .15s,box-shadow .15s}
.mc-textinput:focus,.mc-textarea:focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,transparent)}
.mc-textarea{min-height:150px;resize:vertical;font-family:ui-monospace,Consolas,monospace;font-size:12.4px;line-height:1.65}
.mc-seg{display:inline-flex;padding:3px;gap:2px;background:var(--dsw-alias-bg-layer-2);border-radius:10px;align-self:flex-start}
.mc-seg button{border:0;background:transparent;border-radius:8px;padding:4px 11px;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.mc-seg button[data-active="true"]{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.10)}
.mc-preview{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,Consolas,monospace}
.mc-diff{font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.62;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden}
.mc-diff-row{display:flex;gap:0;min-height:20px}
.mc-diff-gutter{flex:none;width:74px;display:flex;gap:0;color:var(--dsw-alias-label-secondary);opacity:.7;user-select:none;background:var(--dsw-alias-bg-layer-2)}
.mc-diff-gutter span{flex:1;text-align:right;padding-right:8px}
.mc-diff-sign{flex:none;width:18px;text-align:center;user-select:none;opacity:.8}
.mc-diff-text{flex:1;white-space:pre-wrap;word-break:break-word;padding-right:10px}
.mc-diff-add{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent)}
.mc-diff-add .mc-diff-sign{color:var(--dsw-alias-state-success-primary)}
.mc-diff-del{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent)}
.mc-diff-del .mc-diff-sign{color:var(--dsw-alias-state-error-primary)}
.mc-diff-same{background:transparent}
.mc-diff-empty{padding:16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}
.mc-toasts{position:fixed;right:26px;bottom:24px;z-index:1400;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.mc-toast{display:flex;gap:8px;align-items:flex-start;max-width:380px;padding:10px 13px;border-radius:11px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l2);box-shadow:0 12px 34px rgba(0,0,0,.24);font-size:12.5px;animation:mc-in .18s ease-out}
.mc-toast-main{display:flex;flex-direction:column;gap:1px}
.mc-toast-detail{font-size:11.5px;color:var(--dsw-alias-label-secondary);word-break:break-all}
.mc-toast-ok svg{color:var(--dsw-alias-state-success-primary)}
.mc-toast-error svg{color:var(--dsw-alias-state-error-primary)}
@keyframes mc-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.mc-spin{animation:mc-spin 1s linear infinite}
@keyframes mc-spin{to{transform:rotate(360deg)}}
`;

    const tagId = 'memory-console/client.css';
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'memory-console';
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    /* ------------------------------------------------------------------ 字典 */

    const zh = {
      panel: '记忆管理',
      title: '记忆管理',
      subtitle: '{count} 条记忆 · 更新于 {time}',
      subtitleLoading: '正在读取记忆…',
      new: '新建',
      refresh: '刷新',
      retry: '重试',
      cancel: '取消',
      save: '保存',
      saving: '保存中…',
      edit: '编辑',
      delete: '删除',
      restore: '恢复',
      confirm: '确认',
      close: '关闭',
      searchPlaceholder: '搜索全部记忆…',
      searchClear: '清空搜索',
      tabList: '记忆',
      tabIndex: 'INDEX',
      tabHealth: '健康',
      tabTrash: '回收站',
      groupRoot: '根目录',
      groupProject: 'project',
      groupDecision: 'decision',
      groupOther: '其它',
      listCount: '{count} 条',
      chars: '{count} 字',
      lines: '{count} 行',
      size: '{size}',
      missingSummary: '缺摘要',
      modified: '修改于 {time}',
      emptyList: '没有匹配的记忆',
      emptyListSub: '换个关键词，或者点右上角新建一条。',
      emptyDetail: '选一条记忆看看',
      emptyDetailSub: '左边点一条；也可以按「编辑」改内容，改完会先给你看 diff 再写入。',
      loadingList: '正在读取记忆…',
      loadingDoc: '正在打开…',
      loadingIndex: '正在读取 INDEX.md…',
      errorTitle: '出错了',
      errorLoad: '读取失败：{message}',
      editDirty: '未保存的改动',
      saveNoChange: '内容没有变化',
      saved: '已保存',
      savedBackup: '备份：{path}',
      savedIndexFailed: '已写入，但索引重建失败：{message}',
      diffTitle: '保存前确认改动',
      diffSummary: '+{add} 行 / −{del} 行',
      diffNone: '没有需要展示的差异。',
      diffConfirm: '确认写入',
      createTitle: '新建记忆',
      createGroup: '分组',
      createTopic: '话题',
      createTopicPlaceholder: '例如：A股持仓',
      createSummary: '摘要（索引第 2 行）',
      createSummaryPlaceholder: '一句话，会进 INDEX.md',
      createText: '正文（可选，Markdown）',
      createTextPlaceholder: '- 写入要点，可多条',
      createPreview: '将创建：{path}',
      createSubmit: '创建',
      createNeedTopic: '话题不能为空',
      createNeedSummary: '摘要不能为空',
      created: '已新建',
      deleteTitle: '删除这条记忆？',
      deleteBody: '会移动到 memory\\.trash，不会真删；之后可以在「回收站」里恢复。',
      deleteConfirm: '移到回收站',
      deleted: '已移到回收站，索引已重建',
      trashTitle: '回收站',
      trashDesc: '删除只会移动到这里，随时可以恢复。',
      trashEmpty: '回收站是空的',
      trashRestoreDone: '已恢复',
      trashDeletedAt: '删除于 {time}',
      trashEmptyAction: '清空回收站',
      trashEmptyActionCount: '清空回收站（{count}）',
      trashEmptyTitle: '清空回收站？',
      trashEmptyBody: '会永久删除回收站里的 {count} 条文件，删掉就找不回来了。确认之前先看清楚。',
      trashEmptyConfirm: '永久删除',
      trashEmptied: '回收站已清空',
      trashEmptiedDetail: '永久删除 {count} 条',
      indexTitle: 'INDEX.md',
      indexGenerated: '生成于 {time}',
      indexCount: '{count} 条',
      indexHint: '由你的索引脚本或内置生成器生成，这里只读。',
      rebuild: '重建索引',
      rebuilding: '重建中…',
      indexRebuilt: '索引已重建',
      healthTitle: '健康检查',
      healthMissing: '缺摘要的文件',
      healthMissingDesc: '第 2 行必须有「> 摘要：一句话」，否则索引里只剩标题。',
      healthStale: '超过 {days} 天没动',
      healthStaleDesc: '很久没更新的记忆，看看要不要归档或补一笔。',
      healthIndex: '索引与文件不一致',
      healthIndexDesc: 'INDEX.md 没覆盖到的文件，或索引里有但磁盘上已不存在的条目。',
      healthDuplicates: '重复与相似',
      healthIndexMissing: '索引里缺它',
      healthIndexGone: '文件已不在',
      healthDuplicatesDesc: '同一话题开了多份、或标题摘要撞车的条目。「合并」会留内容最长的那份，其余并入正文并备份、进回收站；「忽略」就不再提醒。',
      healthDuplicatesNone: '没发现重复。',
      duplicatesMerge: '合并',
      duplicatesIgnore: '忽略',
      duplicatesMergeHint: '主文件：{name}（留内容最长的），其余内容并进去，原件进备份和回收站',
      merging: '合并中…',
      mergeOk: '已合并到 {name}',
      mergeOkDetail: '并入了 {count} 条；原件已备份，也在回收站，能恢复。',
      dismissOk: '这条不再提醒',
      healthFileCount: '{count} 份',
      healthOk: '没有发现问题',
      healthOkDesc: '摘要齐全、文件新鲜、索引一致。',
      healthIndexConsistent: 'INDEX 与文件一致',
      healthDays: '{days} 天前',
      searchResults: '{count} 处命中 · {files} 个文件',
      searchNoResult: '没有搜到',
      searchNoResultSub: '换个词试试，搜索会看标题、摘要和全文。',
      file: '文件',
      bin: '操作失败：{message}',
      reloaded: '已刷新',
      unsavedLeave: '有未保存的改动，确定离开吗？',
      group: '分组',
      tabRequired: '必读清单',
      requiredAdd: '添加文件',
      requiredAddTitle: '加入必读清单',
      requiredPath: '文件路径',
      requiredPathPlaceholder: '例如 C:\\Users\\you\\.dsh\\memory\\PERSONA.md',
      requiredPathHint: '绝对路径。加进来之后，下一次请求就会拼进我的提示词。AGENTS.md 宿主本来就会读，重复加入会白花 token。',
      requiredNote: '显示名（可选）',
      requiredNotePlaceholder: '例如「人格锚」',
      requiredPosition: '插入到第几位',
      requiredPositionValue: '第 {pos} 位',
      requiredEnabled: '立即启用',
      requiredSubmit: '加入',
      requiredTotal: '总注入约 {chars} 字',
      requiredBudget: '建议控制在 3000 字以内，超出的部分每轮都要多付 token。',
      requiredPreview: '拼接预览',
      requiredPreviewEmpty: '清单里还没有启用的文件。',
      requiredPromptOrder: '真实提示词顺序',
      requiredPromptOrderNote: '宿主拼装结果，共 {count} 段',
      requiredAnchor: '本插件',
      requiredOff: '已停用',
      requiredMissing: '文件不存在',
      requiredTooLarge: '超过 200 KB',
      requiredSaved: '必读清单已保存',
      requiredSavedDetail: '下一轮对话生效，不用重启',
      requiredMoveUp: '上移',
      requiredMoveDown: '下移',
      requiredRemove: '移出清单',
      requiredEnable: '启用 / 停用',
      requiredEmptyList: '清单是空的',
      requiredEmptyListDesc: '点「添加文件」，把想让我每轮都读的文件放进来。',
      requiredListCount: '{count} 个文件',
      requiredSuggest: '常用候选',
    };

    const en = {
      panel: 'Memory',
      title: 'Memory',
      subtitle: '{count} entries · updated {time}',
      subtitleLoading: 'Loading memory…',
      new: 'New',
      refresh: 'Refresh',
      retry: 'Retry',
      cancel: 'Cancel',
      save: 'Save',
      saving: 'Saving…',
      edit: 'Edit',
      delete: 'Delete',
      restore: 'Restore',
      confirm: 'Confirm',
      close: 'Close',
      searchPlaceholder: 'Search all memory…',
      searchClear: 'Clear search',
      tabList: 'Memory',
      tabIndex: 'INDEX',
      tabHealth: 'Health',
      tabTrash: 'Trash',
      groupRoot: 'Root',
      groupProject: 'project',
      groupDecision: 'decision',
      groupOther: 'Other',
      listCount: '{count} entries',
      chars: '{count} chars',
      lines: '{count} lines',
      size: '{size}',
      missingSummary: 'No summary',
      modified: 'modified {time}',
      emptyList: 'No matching memory',
      emptyListSub: 'Try another keyword, or create one with the button above.',
      emptyDetail: 'Pick a memory',
      emptyDetailSub: 'Pick one on the left. Edit shows a diff before writing.',
      loadingList: 'Loading memory…',
      loadingDoc: 'Opening…',
      loadingIndex: 'Reading INDEX.md…',
      errorTitle: 'Something went wrong',
      errorLoad: 'Could not load: {message}',
      editDirty: 'Unsaved changes',
      saveNoChange: 'Nothing changed',
      saved: 'Saved',
      savedBackup: 'Backup: {path}',
      savedIndexFailed: 'Written, but index rebuild failed: {message}',
      diffTitle: 'Review changes',
      diffSummary: '+{add} / −{del} lines',
      diffNone: 'No differences to show.',
      diffConfirm: 'Write',
      createTitle: 'New memory',
      createGroup: 'Group',
      createTopic: 'Topic',
      createTopicPlaceholder: 'e.g. A-share holdings',
      createSummary: 'Summary (line 2)',
      createSummaryPlaceholder: 'One sentence, goes into INDEX.md',
      createText: 'Body (optional, Markdown)',
      createTextPlaceholder: '- key points, one per line',
      createPreview: 'Will create: {path}',
      createSubmit: 'Create',
      createNeedTopic: 'Topic is required',
      createNeedSummary: 'Summary is required',
      created: 'Created',
      deleteTitle: 'Delete this memory?',
      deleteBody: 'It moves to memory\\.trash, never deleted; restore it from Trash.',
      deleteConfirm: 'Move to trash',
      deleted: 'Moved to trash, index rebuilt',
      trashTitle: 'Trash',
      trashDesc: 'Deleting only moves files here; restore any time.',
      trashEmpty: 'Trash is empty',
      trashRestoreDone: 'Restored',
      trashDeletedAt: 'deleted {time}',
      trashEmptyAction: 'Empty trash',
      trashEmptyActionCount: 'Empty trash ({count})',
      trashEmptyTitle: 'Empty the trash?',
      trashEmptyBody: 'This permanently deletes {count} files from the trash. There is no undo.',
      trashEmptyConfirm: 'Delete permanently',
      trashEmptied: 'Trash emptied',
      trashEmptiedDetail: '{count} files deleted permanently',
      indexTitle: 'INDEX.md',
      indexGenerated: 'generated {time}',
      indexCount: '{count} entries',
      indexHint: 'Generated by your index script or the built-in generator; read-only here.',
      rebuild: 'Rebuild index',
      rebuilding: 'Rebuilding…',
      indexRebuilt: 'Index rebuilt',
      healthTitle: 'Health',
      healthMissing: 'Missing summary',
      healthMissingDesc: 'Line 2 needs "> 摘要：one sentence" or the index loses it.',
      healthStale: 'Untouched for {days} days',
      healthStaleDesc: 'Old memory worth archiving or updating.',
      healthIndex: 'Index does not match files',
      healthIndexDesc: 'Files missing from INDEX.md, or entries whose file is gone.',
      healthDuplicates: 'Duplicates & look-alikes',
      healthIndexMissing: 'Not in INDEX',
      healthIndexGone: 'File is gone',
      healthDuplicatesDesc: 'The same topic split across files, or titles/summaries that overlap. Merge keeps the longest file, appends the rest, and backs up + trashes the originals; Dismiss stops the reminder.',
      healthDuplicatesNone: 'No duplicates found.',
      duplicatesMerge: 'Merge',
      duplicatesIgnore: 'Dismiss',
      duplicatesMergeHint: 'Main file: {name} (the longest one); the rest is appended, originals go to backup and trash',
      merging: 'Merging…',
      mergeOk: 'Merged into {name}',
      mergeOkDetail: 'Absorbed {count} file(s); originals are backed up and in the trash.',
      dismissOk: "Won't remind again",
      healthFileCount: '{count} files',
      healthOk: 'All good',
      healthOkDesc: 'Summaries present, files fresh, index consistent.',
      healthIndexConsistent: 'INDEX matches files',
      healthDays: '{days} days ago',
      searchResults: '{count} hits · {files} files',
      searchNoResult: 'Nothing found',
      searchNoResultSub: 'Try another word; search covers titles, summaries and full text.',
      file: 'file',
      bin: 'Failed: {message}',
      reloaded: 'Refreshed',
      unsavedLeave: 'You have unsaved changes. Leave anyway?',
      group: 'Group',
      tabRequired: 'Required files',
      requiredAdd: 'Add file',
      requiredAddTitle: 'Add to required files',
      requiredPath: 'File path',
      requiredPathPlaceholder: 'e.g. /home/you/.dsh/memory/PERSONA.md',
      requiredPathHint: 'Absolute path. Once added, it is spliced into my prompt on the next request. AGENTS.md is already read by the host — adding it again wastes tokens.',
      requiredNote: 'Display name (optional)',
      requiredNotePlaceholder: 'e.g. "Persona anchor"',
      requiredPosition: 'Insert at position',
      requiredPositionValue: 'Position {pos}',
      requiredEnabled: 'Enable now',
      requiredSubmit: 'Add',
      requiredTotal: 'Injects about {chars} chars',
      requiredBudget: 'Keep it under 3000 chars; anything over costs extra tokens every turn.',
      requiredPreview: 'Assembled preview',
      requiredPreviewEmpty: 'No enabled files in the list yet.',
      requiredPromptOrder: 'Real prompt order',
      requiredPromptOrderNote: 'Host assembly, {count} sections',
      requiredAnchor: 'this plugin',
      requiredOff: 'disabled',
      requiredMissing: 'File not found',
      requiredTooLarge: 'Over 200 KB',
      requiredSaved: 'Required files saved',
      requiredSavedDetail: 'Takes effect next turn, no restart',
      requiredMoveUp: 'Move up',
      requiredMoveDown: 'Move down',
      requiredRemove: 'Remove from list',
      requiredEnable: 'Enable / disable',
      requiredEmptyList: 'The list is empty',
      requiredEmptyListDesc: 'Click "Add file" to put in files you want me to read every turn.',
      requiredListCount: '{count} files',
      requiredSuggest: 'Suggestions',
    };

    /* ------------------------------------------------------------------ 小工具 */

    function formatBytes(size) {
      if (typeof size !== 'number' || !Number.isFinite(size)) return '';
      if (size < 1024) return size + ' B';
      if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
      return (size / 1024 / 1024).toFixed(1) + ' MB';
    }

    function fill(template, params) {
      if (typeof template !== 'string') return '';
      let out = template;
      if (params && typeof params === 'object') {
        for (const key of Object.keys(params)) {
          out = out.split('{' + key + '}').join(String(params[key]));
        }
      }
      return out;
    }

    function makeT(props) {
      if (typeof props.t === 'function') return props.t;
      return (key, params) => fill(typeof zh[key] === 'string' ? zh[key] : key, params);
    }

    function cx(...values) {
      return values.filter(Boolean).join(' ');
    }

    function groupKeyOf(rel) {
      const slash = rel.indexOf('/');
      return slash === -1 ? '' : rel.slice(0, slash);
    }

    function groupDotClass(group) {
      if (group === '') return 'mc-dot mc-dot-root';
      if (group === 'project') return 'mc-dot mc-dot-project';
      if (group === 'decision') return 'mc-dot mc-dot-decision';
      return 'mc-dot mc-dot-other';
    }

    function monthStamp() {
      const now = new Date();
      return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    function sanitizeTopic(value) {
      return String(value ?? '').replace(/[\\/:*?"<>|]/g, '').replace(/[\r\n\t]/g, ' ').trim();
    }

    function nowLabel() {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      return `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    }

    /* ------------------------------------------------------------------ 图标 */

    const ICONS = {
      search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.2-4.2',
      plus: 'M12 5v14M5 12h14',
      refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4',
      edit: 'M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4',
      save: 'M5 4h11l3 3v13H5V4Zm3 0v6h8V4M8 20v-6h8v6',
      trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
      restore: 'M4 10a8 8 0 1 1 2.34 5.66M4 4v6h6',
      close: 'M6 6l12 12M18 6 6 18',
      check: 'M5 13l4 4L19 7',
      warning: 'M12 3 2.5 20h19L12 3Zm0 6v6m0 3.2v.1',
      book: 'M6.5 3h13a.5.5 0 0 1 .5.5v16a.5.5 0 0 1-.5.5h-13A2.5 2.5 0 0 1 4 17.5v-12A2.5 2.5 0 0 1 6.5 3ZM4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 7h8M8 10.5h5',
      file: 'M6 3h8l4 4v14H6V3Zm8 0v4h4',
      folder: 'M3 6h7l2 2h9v11H3V6Z',
      clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4v5l3 2',
      info: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4v.1M12 11v5',
      list: 'M8 6h12M8 12h12M8 18h12M4 6v.1M4 12v.1M4 18v.1',
      bookmark: 'M6 3.5h12v17l-6-4.2-6 4.2v-17Z',
      up: 'M12 19V5M6 11l6-6 6 6',
      down: 'M12 5v14M6 13l6 6 6-6',
    };

    function Icon({ name, size = 15, className }) {
      const path = ICONS[name];
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
          className,
        },
        h('path', { d: path }),
      );
    }

    /* ------------------------------------------------------------------ Markdown */

    function inline(text) {
      const nodes = [];
      const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
      let last = 0;
      let match;
      let key = 0;
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const token = match[0];
        if (token.startsWith('**')) nodes.push(h('strong', { key: 'b' + key++ }, token.slice(2, -2)));
        else nodes.push(h('code', { key: 'c' + key++, className: 'mc-md-inline' }, token.slice(1, -1)));
        last = match.index + token.length;
      }
      if (last < text.length) nodes.push(text.slice(last));
      return nodes;
    }

    function isBlockStart(line) {
      return /^(#{1,6}\s|```|>|\s*[-*]\s|\s*\d+[.)]\s|\s*\|)/.test(line);
    }

    function renderMarkdown(text, skipTitle) {
      const lines = String(text ?? '').split(/\r?\n/);
      const blocks = [];
      let index = 0;
      let key = 0;
      while (index < lines.length) {
        const line = lines[index];
        if (line.trim() === '') {
          index += 1;
          continue;
        }
        if (/^```/.test(line)) {
          const buffer = [];
          index += 1;
          while (index < lines.length && !/^```/.test(lines[index])) {
            buffer.push(lines[index]);
            index += 1;
          }
          if (index < lines.length) index += 1;
          blocks.push(h('pre', { key: 'code' + key++, className: 'mc-md-code' }, h('code', null, buffer.join('\n'))));
          continue;
        }
        const heading = /^(#{1,6})\s+(.+)$/.exec(line);
        if (heading) {
          const level = heading[1].length;
          const headingText = heading[2].replace(/\*\*/g, '').trim();
          if (blocks.length === 0 && level === 1 && typeof skipTitle === 'string' && skipTitle !== '' && headingText === skipTitle.trim()) {
            index += 1;
            continue;
          }
          blocks.push(
            h(
              'h' + Math.min(level + 1, 6),
              { key: 'h' + key++, className: 'mc-md-h mc-md-h' + level },
              inline(heading[2]),
            ),
          );
          index += 1;
          continue;
        }
        if (/^\s*[-*]\s+/.test(line)) {
          const items = [];
          while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
            items.push(inline(lines[index].replace(/^\s*[-*]\s+/, '')));
            index += 1;
          }
          blocks.push(h('ul', { key: 'ul' + key++, className: 'mc-md-ul' }, items.map((item, itemIndex) => h('li', { key: itemIndex }, item))));
          continue;
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
          const items = [];
          while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
            items.push(inline(lines[index].replace(/^\s*\d+[.)]\s+/, '')));
            index += 1;
          }
          blocks.push(h('ol', { key: 'ol' + key++, className: 'mc-md-ol' }, items.map((item, itemIndex) => h('li', { key: itemIndex }, item))));
          continue;
        }
        if (/^>/.test(line)) {
          const buffer = [];
          while (index < lines.length && /^>/.test(lines[index])) {
            buffer.push(lines[index].replace(/^>\s?/, ''));
            index += 1;
          }
          blocks.push(
            h(
              'blockquote',
              { key: 'q' + key++, className: 'mc-md-quote' },
              buffer.map((row, rowIndex) => h('p', { key: rowIndex }, inline(row))),
            ),
          );
          continue;
        }
        if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
          blocks.push(h('hr', { key: 'hr' + key++, className: 'mc-md-hr' }));
          index += 1;
          continue;
        }
        if (/^\s*\|/.test(line)) {
          const rows = [];
          while (index < lines.length && /^\s*\|/.test(lines[index])) {
            rows.push(lines[index]);
            index += 1;
          }
          const cells = (row) =>
            row
              .trim()
              .replace(/^\|/, '')
              .replace(/\|$/, '')
              .split('|')
              .map((cell) => cell.trim());
          const header = cells(rows[0] ?? '');
          const body = rows.slice(1).filter((row) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(row)).map(cells);
          blocks.push(
            h(
              'table',
              { key: 't' + key++, className: 'mc-md-table' },
              h('thead', null, h('tr', null, header.map((cell, cellIndex) => h('th', { key: cellIndex }, inline(cell))))),
              h('tbody', null, body.map((row, rowIndex) => h('tr', { key: rowIndex }, row.map((cell, cellIndex) => h('td', { key: cellIndex }, inline(cell)))))),
            ),
          );
          continue;
        }
        const buffer = [line];
        index += 1;
        while (index < lines.length && lines[index].trim() !== '' && !isBlockStart(lines[index])) {
          buffer.push(lines[index]);
          index += 1;
        }
        blocks.push(h('p', { key: 'p' + key++, className: 'mc-md-p' }, inline(buffer.join(' '))));
      }
      return blocks;
    }

    /* ------------------------------------------------------------------ diff */

    function diffLines(before, after) {
      const left = String(before ?? '').split(/\r?\n/);
      const right = String(after ?? '').split(/\r?\n/);
      const n = left.length;
      const m = right.length;
      if (n * m > 500000) {
        const out = [];
        for (let i = 0; i < n; i += 1) out.push({ type: 'del', text: left[i] });
        for (let j = 0; j < m; j += 1) out.push({ type: 'add', text: right[j] });
        return out;
      }
      const dp = new Array(n + 1);
      for (let i = 0; i <= n; i += 1) dp[i] = new Uint32Array(m + 1);
      for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
          dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
      const out = [];
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (left[i] === right[j]) {
          out.push({ type: 'same', text: left[i] });
          i += 1;
          j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
          out.push({ type: 'del', text: left[i] });
          i += 1;
        } else {
          out.push({ type: 'add', text: right[j] });
          j += 1;
        }
      }
      while (i < n) {
        out.push({ type: 'del', text: left[i] });
        i += 1;
      }
      while (j < m) {
        out.push({ type: 'add', text: right[j] });
        j += 1;
      }
      return out;
    }

    /* ------------------------------------------------------------------ 基础组件 */

    function Button({ children, icon, variant, onClick, disabled, title, type, className }) {
      return h(
        'button',
        {
          type: type ?? 'button',
          className: cx('mc-btn', variant ? 'mc-btn-' + variant : '', icon && !children ? 'mc-btn-icon' : '', className),
          onClick,
          disabled,
          title,
          'aria-label': title,
        },
        icon ? h(Icon, { name: icon }) : null,
        children ?? null,
      );
    }

    function Chip({ children, tone }) {
      return h('span', { className: cx('mc-chip', tone ? 'mc-chip-' + tone : '') }, children);
    }

    function Modal({ title, onClose, children, footer, wide }) {
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
      }, [onClose]);
      return h(
        'div',
        {
          className: 'mc-backdrop',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose();
          },
        },
        h(
          'div',
          { className: 'mc-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? { width: 'min(920px, 100%)' } : undefined },
          h(
            'div',
            { className: 'mc-modal-head' },
            h('h3', { className: 'mc-modal-title' }, title),
            h(Button, { icon: 'close', variant: 'ghost', title: 'close', onClick: onClose, className: 'mc-modal-close' }),
          ),
          h('div', { className: 'mc-modal-body' }, children),
          footer ? h('div', { className: 'mc-modal-foot' }, footer) : null,
        ),
      );
    }

    function Empty({ icon, title, sub }) {
      return h(
        'div',
        { className: 'mc-empty' },
        h('div', { className: 'mc-empty-icon' }, h(Icon, { name: icon ?? 'book', size: 24 })),
        h('div', { className: 'mc-empty-title' }, title),
        sub ? h('div', { className: 'mc-empty-sub' }, sub) : null,
      );
    }

    function ErrorBlock({ t, message, onRetry }) {
      return h(
        'div',
        { className: 'mc-alert', role: 'alert' },
        h(Icon, { name: 'warning' }),
        h('span', null, t('errorLoad', { message })),
        onRetry ? h(Button, { icon: 'refresh', onClick: onRetry }, t('retry')) : null,
      );
    }

    /* ------------------------------------------------------------------ 列表 */

    function MemoryRow({ entry, active, onSelect, t }) {
      const missing = entry.summary === '';
      return h(
        'button',
        {
          type: 'button',
          className: 'mc-row',
          'data-active': active ? 'true' : 'false',
          title: entry.rel,
          onClick: () => onSelect(entry.rel),
        },
        h(
          'span',
          { className: 'mc-row-main' },
          h('span', { className: 'mc-row-title' }, entry.title),
          h(
            'span',
            { className: missing ? 'mc-row-summary mc-row-summary-warn' : 'mc-row-summary' },
            missing ? t('missingSummary') : entry.summary,
          ),
          h(
            'span',
            { className: 'mc-row-meta' },
            h('span', null, entry.modified),
            h('span', { className: 'mc-meta-sep' }, '·'),
            h('span', null, t('chars', { count: entry.chars })),
          ),
        ),
      );
    }

    function groupLabel(group, t) {
      if (group === '') return t('groupRoot');
      if (group === 'project') return t('groupProject');
      if (group === 'decision') return t('groupDecision');
      return group;
    }

    function ListPane({ list, groups, selected, onSelect, t }) {
      if (list.error !== null) return h(ErrorBlock, { t, message: list.error, onRetry: list.retry });
      if (list.loading && list.groups.length === 0) return h('div', { className: 'mc-hint' }, t('loadingList'));
      if (groups.length === 0) {
        return h(Empty, { icon: 'search', title: t('emptyList'), sub: t('emptyListSub') });
      }
      return h(
        'div',
        { className: 'mc-scroll' },
        groups.map((group) =>
          h(
            'div',
            { className: 'mc-group', key: group.key === '' ? 'root' : group.key },
            h(
              'div',
              { className: 'mc-group-head' },
              h('span', { className: groupDotClass(group.key) }),
              h('span', null, groupLabel(group.key, t)),
              h('span', { className: 'mc-group-count' }, String(group.entries.length)),
            ),
            group.entries.map((entry) =>
              h(MemoryRow, { key: entry.rel, entry, active: entry.rel === selected, onSelect, t }),
            ),
          ),
        ),
      );
    }

    /* ------------------------------------------------------------------ 详情 */

    function DetailPane({ doc, selected, editing, draft, onDraft, onEdit, onCancel, onSave, onDelete, saving, t }) {
      if (selected === '') {
        return h(Empty, { icon: 'book', title: t('emptyDetail'), sub: t('emptyDetailSub') });
      }
      if (doc.error !== null) return h(ErrorBlock, { t, message: doc.error, onRetry: doc.retry });
      if (doc.meta === null && doc.loading) return h('div', { className: 'mc-hint' }, t('loadingDoc'));
      const meta = doc.meta ?? {};
      const dirty = editing && draft !== doc.text;
      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'mc-detail-head' },
          h(
            'div',
            { className: 'mc-detail-titles' },
            h('h2', { className: 'mc-detail-title' }, meta.title || selected),
            h('span', { className: 'mc-path' }, selected),
            h(
              'div',
              { className: 'mc-chips' },
              h(Chip, null, meta.modified),
              h(Chip, null, t('chars', { count: meta.chars ?? 0 })),
              h(Chip, null, t('lines', { count: meta.lines ?? 0 })),
              typeof meta.bytes === 'number' ? h(Chip, null, formatBytes(meta.bytes)) : null,
              meta.hasSummary === false ? h(Chip, { tone: 'warn' }, t('missingSummary')) : null,
              editing && dirty ? h(Chip, { tone: 'warn' }, t('editDirty')) : null,
            ),
          ),
          h(
            'div',
            { className: 'mc-toolbar' },
            editing
              ? [
                  h(Button, { key: 'save', icon: 'save', variant: 'primary', onClick: onSave, disabled: saving }, saving ? t('saving') : t('save')),
                  h(Button, { key: 'cancel', icon: 'close', onClick: onCancel, disabled: saving }, t('cancel')),
                ]
              : [
                  h(Button, { key: 'edit', icon: 'edit', onClick: onEdit }, t('edit')),
                  h(Button, { key: 'del', icon: 'trash', variant: 'danger', onClick: onDelete }, t('delete')),
                ],
          ),
        ),
        editing
          ? h('textarea', {
              className: 'mc-editor',
              value: draft,
              spellCheck: false,
              onChange: (event) => onDraft(event.target.value),
            })
          : h('article', { className: 'mc-md' }, renderMarkdown(doc.text, meta.title)),
      );
    }

    /* ------------------------------------------------------------------ 索引 / 健康 / 回收站 */

    function IndexPane({ index, onRebuild, rebuilding, t }) {
      return h(
        'div',
        { className: 'mc-index' },
        h(
          'div',
          { className: 'mc-index-head' },
          h(Chip, null, 'INDEX.md'),
          index.modified !== '' ? h(Chip, null, t('indexGenerated', { time: index.modified })) : null,
          typeof index.count === 'number' ? h(Chip, null, t('indexCount', { count: index.count })) : null,
          h('span', { className: 'mc-index-note' }, t('indexHint')),
          h('span', { style: { flex: 1 } }),
          h(Button, { icon: 'refresh', onClick: onRebuild, disabled: rebuilding }, rebuilding ? t('rebuilding') : t('rebuild')),
        ),
        index.error !== null
          ? h(ErrorBlock, { t, message: index.error, onRetry: onRebuild })
          : index.loading && index.text === ''
            ? h('div', { className: 'mc-hint' }, t('loadingIndex'))
            : h('pre', { className: 'mc-index-body mc-card' }, index.text),
      );
    }

    function HealthPane({ health, onOpen, onRefresh, onMerge, onDismiss, busyKey, t }) {
      if (health.error !== null) return h(ErrorBlock, { t, message: health.error, onRetry: onRefresh });
      if (health.data === null) return h('div', { className: 'mc-hint' }, t('loadingList'));
      const data = health.data;
      const duplicates = data.duplicates ?? { sameTopic: [], similar: [] };
      const duplicateCount = duplicates.sameTopic.length + duplicates.similar.length;
      const issues = data.missingSummary.length + data.stale.length + (data.index.consistent ? 0 : 1);
      return h(
        'div',
        { className: 'mc-health' },
        issues === 0
          ? h(
              'div',
              { className: 'mc-health-card' },
              h('div', { className: 'mc-ok' }, h(Icon, { name: 'check', size: 16 }), t('healthOk')),
              h('div', { className: 'mc-health-desc', style: { marginTop: 6 } }, t('healthOkDesc')),
            )
          : null,
        h(
          'div',
          { className: 'mc-health-card' },
          h(
            'div',
            { className: 'mc-health-head' },
            h(Icon, { name: 'file', size: 15 }),
            h('span', { className: 'mc-health-title' }, t('healthMissing')),
            h(Chip, { tone: data.missingSummary.length > 0 ? 'warn' : 'ok' }, String(data.missingSummary.length)),
          ),
          h('div', { className: 'mc-health-desc' }, t('healthMissingDesc')),
          data.missingSummary.length === 0
            ? null
            : h(
                'div',
                { className: 'mc-health-list' },
                data.missingSummary.map((row) =>
                  h(
                    'button',
                    { type: 'button', className: 'mc-health-row', key: row.rel, onClick: () => onOpen(row.rel) },
                    h('span', null, row.title),
                    h('span', { className: 'mc-path' }, row.rel),
                  ),
                ),
              ),
        ),
        h(
          'div',
          { className: 'mc-health-card' },
          h(
            'div',
            { className: 'mc-health-head' },
            h(Icon, { name: 'clock', size: 15 }),
            h('span', { className: 'mc-health-title' }, t('healthStale', { days: data.staleDays })),
            h(Chip, { tone: data.stale.length > 0 ? 'warn' : 'ok' }, String(data.stale.length)),
          ),
          h('div', { className: 'mc-health-desc' }, t('healthStaleDesc')),
          data.stale.length === 0
            ? null
            : h(
                'div',
                { className: 'mc-health-list' },
                data.stale.map((row) =>
                  h(
                    'button',
                    { type: 'button', className: 'mc-health-row', key: row.rel, onClick: () => onOpen(row.rel) },
                    h('span', null, row.title),
                    h(Chip, null, t('healthDays', { days: row.days })),
                    h('span', { className: 'mc-path' }, row.rel),
                  ),
                ),
              ),
        ),
        h(
          'div',
          { className: 'mc-health-card' },
          h(
            'div',
            { className: 'mc-health-head' },
            h(Icon, { name: 'list', size: 15 }),
            h('span', { className: 'mc-health-title' }, t('healthIndex')),
            h(Chip, { tone: data.index.consistent ? 'ok' : 'warn' }, data.index.consistent ? t('healthIndexConsistent') : t('healthIndex')),
          ),
          h('div', { className: 'mc-health-desc' }, t('healthIndexDesc')),
          data.index.consistent
            ? null
            : h(
                'div',
                { className: 'mc-health-list' },
                data.index.missingInIndex.map((rel) =>
                  h(
                    'button',
                    { type: 'button', className: 'mc-health-row', key: 'missing-index-' + rel, onClick: () => onOpen(rel) },
                    h(Chip, { tone: 'warn' }, t('healthIndexMissing')),
                    h('span', { className: 'mc-path' }, rel),
                  ),
                ),
                data.index.missingFiles.map((rel) =>
                  h(
                    'div',
                    { className: 'mc-health-row', key: 'missing-file-' + rel },
                    h(Chip, { tone: 'error' }, t('healthIndexGone')),
                    h('span', { className: 'mc-path' }, rel),
                  ),
                ),
              ),
        ),
        h(
          'div',
          { className: 'mc-health-card' },
          h(
            'div',
            { className: 'mc-health-head' },
            h(Icon, { name: 'search', size: 15 }),
            h('span', { className: 'mc-health-title' }, t('healthDuplicates')),
            h(Chip, { tone: duplicateCount > 0 ? 'warn' : 'ok' }, String(duplicateCount)),
          ),
          h('div', { className: 'mc-health-desc' }, t('healthDuplicatesDesc')),
          duplicateCount === 0
            ? h('div', { className: 'mc-health-desc' }, t('healthDuplicatesNone'))
            : h(
                'div',
                { className: 'mc-health-list' },
                duplicates.sameTopic.map((cluster) =>
                  h(
                    'div',
                    { className: 'mc-health-group', key: 'cluster-' + cluster.base },
                    h(
                      'div',
                      { className: 'mc-health-row' },
                      h(Icon, { name: 'folder', size: 13 }),
                      h('span', null, cluster.base),
                      h(Chip, null, t('healthFileCount', { count: cluster.files.length })),
                      h(
                        'span',
                        { className: 'mc-health-actions' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'mc-btn mc-btn-sm',
                            disabled: busyKey === cluster.key,
                            title: t('duplicatesMergeHint', {
                              name: cluster.files.reduce((best, file) => (file.chars > best.chars ? file : best), cluster.files[0]).rel,
                            }),
                            onClick: () => onMerge(cluster.key, cluster.files.map((file) => file.rel)),
                          },
                          busyKey === cluster.key ? t('merging') : t('duplicatesMerge'),
                        ),
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'mc-btn mc-btn-sm',
                            disabled: busyKey === cluster.key,
                            onClick: () => onDismiss(cluster.key),
                          },
                          t('duplicatesIgnore'),
                        ),
                      ),
                    ),
                    cluster.files.map((file) =>
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'mc-health-row mc-health-sub',
                          key: 'cluster-file-' + file.rel,
                          onClick: () => onOpen(file.rel),
                        },
                        h('span', { className: 'mc-path' }, file.rel),
                        h('span', { className: 'mc-health-note' }, file.modified),
                      ),
                    ),
                  ),
                ),
                duplicates.similar.map((pair) =>
                  h(
                    'div',
                    { className: 'mc-health-row', key: 'pair-' + pair.a.rel + '-' + pair.b.rel },
                    h(
                      'button',
                      { type: 'button', className: 'mc-health-link', onClick: () => onOpen(pair.b.rel) },
                      pair.a.title + ' ↔ ' + pair.b.title,
                    ),
                    h(Chip, null, pair.score.toFixed(2)),
                    h(
                      'span',
                      { className: 'mc-health-actions' },
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'mc-btn mc-btn-sm',
                          disabled: busyKey === pair.key,
                          title: t('duplicatesMergeHint', {
                            name: pair.a.chars >= pair.b.chars ? pair.a.rel : pair.b.rel,
                          }),
                          onClick: () => onMerge(pair.key, [pair.a.rel, pair.b.rel]),
                        },
                        busyKey === pair.key ? t('merging') : t('duplicatesMerge'),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'mc-btn mc-btn-sm',
                          disabled: busyKey === pair.key,
                          onClick: () => onDismiss(pair.key),
                        },
                        t('duplicatesIgnore'),
                      ),
                    ),
                  ),
                ),
              ),
        ),
      );
    }

    function TrashPane({ trash, onRestore, onEmpty, restoring, emptying, t }) {
      if (trash.error !== null) return h(ErrorBlock, { t, message: trash.error });
      if (trash.loading && trash.entries.length === 0) return h('div', { className: 'mc-hint' }, t('loadingList'));
      if (trash.entries.length === 0) return h(Empty, { icon: 'trash', title: t('trashEmpty'), sub: t('trashDesc') });
      return h(
        'div',
        { className: 'mc-trash' },
        h(
          'div',
          { className: 'mc-trash-head' },
          h('span', { className: 'mc-health-desc', style: { padding: 0, margin: 0 } }, t('trashDesc')),
          h('span', { style: { flex: 1 } }),
          h(
            Button,
            { icon: 'trash', variant: 'danger', onClick: onEmpty, disabled: emptying },
            emptying ? t('saving') : t('trashEmptyActionCount', { count: trash.entries.length }),
          ),
        ),
        trash.entries.map((entry) =>
          h(
            'div',
            { className: 'mc-trash-row', key: entry.id },
            h(
              'div',
              { className: 'mc-trash-main' },
              h('span', { className: 'mc-trash-name' }, entry.name),
              h(
                'span',
                { className: 'mc-row-meta' },
                h('span', { className: 'mc-path' }, entry.rel),
                h('span', { className: 'mc-meta-sep' }, '·'),
                h('span', null, t('trashDeletedAt', { time: entry.modified })),
                h('span', { className: 'mc-meta-sep' }, '·'),
                h('span', null, formatBytes(entry.bytes)),
              ),
            ),
            h(
              Button,
              { icon: 'restore', onClick: () => onRestore(entry), disabled: restoring === entry.id },
              t('restore'),
            ),
          ),
        ),
      );
    }

    /* ------------------------------------------------------------------ 搜索 */

    function SearchPane({ search, query, onOpen, t }) {
      if (search.loading && search.data === null) return h('div', { className: 'mc-hint' }, t('loadingList'));
      if (search.error !== null) return h(ErrorBlock, { t, message: search.error });
      const data = search.data;
      if (data === null) return null;
      if (data.files.length === 0) {
        return h(Empty, { icon: 'search', title: t('searchNoResult'), sub: t('searchNoResultSub') });
      }
      return h(
        'div',
        { className: 'mc-results' },
        h('div', { className: 'mc-hint', style: { padding: '0 2px 10px', flex: 'none' } },
          t('searchResults', { count: data.total, files: data.files.length })),
        h(
          'div',
          { className: 'mc-scroll', style: { padding: 0 } },
          data.files.map((file) =>
            h(
              'div',
              { className: 'mc-result', key: file.rel },
              h(
                'div',
                { className: 'mc-result-head' },
                h('span', { className: 'mc-result-title' }, file.title || file.rel),
                h('span', { className: 'mc-result-rel' }, file.rel),
              ),
              file.matches.slice(0, 12).map((hit) =>
                h(
                  'button',
                  { type: 'button', className: 'mc-result-hit', key: hit.line, onClick: () => onOpen(file.rel) },
                  h('span', { className: 'mc-lineno' }, String(hit.line)),
                  h('span', { className: 'mc-hit-text' }, highlight(hit.text, query)),
                ),
              ),
              file.matches.length > 12
                ? h('div', { className: 'mc-hint', style: { padding: '4px 14px 10px' } }, '…')
                : null,
            ),
          ),
        ),
      );
    }

    function highlight(text, query) {
      const needle = String(query ?? '').trim();
      if (needle === '') return text;
      const lower = text.toLowerCase();
      const lowerNeedle = needle.toLowerCase();
      const parts = [];
      let cursor = 0;
      let key = 0;
      let at = lower.indexOf(lowerNeedle);
      while (at !== -1) {
        if (at > cursor) parts.push(text.slice(cursor, at));
        parts.push(h('mark', { key: 'm' + key++, className: 'mc-mark' }, text.slice(at, at + needle.length)));
        cursor = at + needle.length;
        at = lower.indexOf(lowerNeedle, cursor);
      }
      if (cursor < text.length) parts.push(text.slice(cursor));
      return parts;
    }

    /* ------------------------------------------------------------------ 新建 / diff / 删除 */

    function CreateDialog({ t, onCreate, onClose, creating, currentMonth }) {
      const [group, setGroup] = React.useState('project');
      const [topic, setTopic] = React.useState('');
      const [summary, setSummary] = React.useState('');
      const [text, setText] = React.useState('');
      const cleanTopic = sanitizeTopic(topic);
      const previewPath = `${group === '' ? '' : group + '/'}${cleanTopic || '…'}_${currentMonth}.md`;
      const canSubmit = cleanTopic !== '' && summary.trim() !== '' && !creating;
      const submit = () => {
        if (!canSubmit) return;
        onCreate({ group, topic: cleanTopic, summary: summary.trim(), text });
      };
      return h(
        Modal,
        {
          title: t('createTitle'),
          onClose,
          footer: [
            h(Button, { key: 'cancel', onClick: onClose, disabled: creating }, t('cancel')),
            h(Button, { key: 'submit', icon: 'plus', variant: 'primary', onClick: submit, disabled: !canSubmit }, creating ? t('saving') : t('createSubmit')),
          ],
        },
        h(
          'div',
          { className: 'mc-field' },
          h('span', { className: 'mc-label' }, t('createGroup')),
          h(
            'div',
            { className: 'mc-seg' },
            [
              ['project', t('groupProject')],
              ['', t('groupRoot')],
              ['decision', t('groupDecision')],
            ].map(([value, label]) =>
              h(
                'button',
                {
                  key: value === '' ? 'root' : value,
                  type: 'button',
                  'data-active': group === value ? 'true' : 'false',
                  onClick: () => setGroup(value),
                },
                label,
              ),
            ),
          ),
        ),
        h(
          'div',
          { className: 'mc-field' },
          h('span', { className: 'mc-label' }, t('createTopic'), h('span', { className: 'mc-required-mark' }, '*')),
          h('input', {
            className: 'mc-textinput',
            value: topic,
            placeholder: t('createTopicPlaceholder'),
            onChange: (event) => setTopic(event.target.value),
            autoFocus: true,
          }),
        ),
        h(
          'div',
          { className: 'mc-field' },
          h('span', { className: 'mc-label' }, t('createSummary'), h('span', { className: 'mc-required-mark' }, '*')),
          h('input', {
            className: 'mc-textinput',
            value: summary,
            placeholder: t('createSummaryPlaceholder'),
            onChange: (event) => setSummary(event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'mc-field' },
          h('span', { className: 'mc-label' }, t('createText')),
          h('textarea', {
            className: 'mc-textarea',
            value: text,
            placeholder: t('createTextPlaceholder'),
            onChange: (event) => setText(event.target.value),
          }),
        ),
        h('div', { className: 'mc-preview' }, t('createPreview', { path: previewPath })),
      );
    }

    function DiffDialog({ t, before, after, onCancel, onConfirm, saving }) {
      const rows = React.useMemo(() => diffLines(before, after), [before, after]);
      const firstChange = React.useRef(null);
      const added = rows.filter((row) => row.type === 'add').length;
      const removed = rows.filter((row) => row.type === 'del').length;
      React.useEffect(() => {
        const node = firstChange.current;
        if (node !== null && typeof node.scrollIntoView === 'function') {
          node.scrollIntoView({ block: 'center' });
        }
      }, [rows]);
      let oldLine = 0;
      let newLine = 0;
      let marked = false;
      return h(
        Modal,
        {
          title: t('diffTitle'),
          onClose: onCancel,
          wide: true,
          footer: [
            h('span', { key: 'summary', className: 'mc-hint', style: { padding: 0, marginRight: 'auto' } }, t('diffSummary', { add: added, del: removed })),
            h(Button, { key: 'cancel', onClick: onCancel, disabled: saving }, t('cancel')),
            h(Button, { key: 'ok', icon: 'save', variant: 'primary', onClick: onConfirm, disabled: saving || (added === 0 && removed === 0) }, saving ? t('saving') : t('diffConfirm')),
          ],
        },
        added === 0 && removed === 0
          ? h('div', { className: 'mc-diff-empty' }, t('diffNone'))
          : h(
              'div',
              { className: 'mc-diff' },
              rows.map((row, index) => {
                const isFirstChange = !marked && row.type !== 'same';
                if (isFirstChange) marked = true;
                if (row.type === 'same') {
                  oldLine += 1;
                  newLine += 1;
                  return h(
                    'div',
                    { className: 'mc-diff-row mc-diff-same', key: index },
                    h('span', { className: 'mc-diff-gutter' }, h('span', null, String(oldLine)), h('span', null, String(newLine))),
                    h('span', { className: 'mc-diff-sign' }, ' '),
                    h('span', { className: 'mc-diff-text' }, row.text),
                  );
                }
                if (row.type === 'del') {
                  oldLine += 1;
                  return h(
                    'div',
                    { className: 'mc-diff-row mc-diff-del', key: index, ref: isFirstChange ? firstChange : undefined },
                    h('span', { className: 'mc-diff-gutter' }, h('span', null, String(oldLine)), h('span', null, '')),
                    h('span', { className: 'mc-diff-sign' }, '−'),
                    h('span', { className: 'mc-diff-text' }, row.text),
                  );
                }
                newLine += 1;
                return h(
                  'div',
                  { className: 'mc-diff-row mc-diff-add', key: index, ref: isFirstChange ? firstChange : undefined },
                  h('span', { className: 'mc-diff-gutter' }, h('span', null, ''), h('span', null, String(newLine))),
                  h('span', { className: 'mc-diff-sign' }, '+'),
                  h('span', { className: 'mc-diff-text' }, row.text),
                );
              }),
            ),
      );
    }

    function DeleteDialog({ t, entry, onCancel, onConfirm, deleting }) {
      return h(
        Modal,
        {
          title: t('deleteTitle'),
          onClose: onCancel,
          footer: [
            h(Button, { key: 'cancel', onClick: onCancel, disabled: deleting }, t('cancel')),
            h(Button, { key: 'ok', icon: 'trash', variant: 'danger', onClick: onConfirm, disabled: deleting }, deleting ? t('saving') : t('deleteConfirm')),
          ],
        },
        h('div', { className: 'mc-delete-body' },
          h('div', { className: 'mc-detail-title', style: { fontSize: 14, marginBottom: 4 } }, entry.title),
          h('div', { className: 'mc-path', style: { marginBottom: 10 } }, entry.rel),
          h('div', { className: 'mc-health-desc', style: { marginBottom: 0 } }, t('deleteBody'))),
      );
    }

    function EmptyTrashDialog({ t, count, onCancel, onConfirm, emptying }) {
      return h(
        Modal,
        {
          title: t('trashEmptyTitle'),
          onClose: onCancel,
          footer: [
            h(Button, { key: 'cancel', onClick: onCancel, disabled: emptying }, t('cancel')),
            h(Button, { key: 'ok', icon: 'trash', variant: 'danger', onClick: onConfirm, disabled: emptying }, emptying ? t('saving') : t('trashEmptyConfirm')),
          ],
        },
        h(
          'div',
          { className: 'mc-delete-body' },
          h('div', { className: 'mc-health-desc', style: { marginBottom: 10, fontSize: 12.5 } }, t('trashEmptyBody', { count })),
          h('div', { className: 'mc-chip mc-chip-error' }, t('trashEmptyActionCount', { count })),
        ),
      );
    }

    /* ------------------------------------------------------------------ 主页面 */

    function RequiredPane({ req, sections, busy, onAdd, onMove, onToggle, onRemove, t }) {
      const data = req.data;
      const entries = data !== null && Array.isArray(data.entries) ? data.entries : [];
      const total = data !== null && typeof data.totalChars === 'number' ? data.totalChars : 0;
      const preview = data !== null && typeof data.preview === 'string' ? data.preview : '';
      const sectionList = Array.isArray(sections?.sections) ? sections.sections : [];
      const anchorName = sections?.anchorName ?? '';

      if (req.error) {
        return h(
          'div',
          { className: 'mc-required' },
          h('div', { className: 'mc-card', style: { padding: 16 } }, h(ErrorBlock, { t, message: req.error })),
        );
      }

      return h(
        'div',
        { className: 'mc-required' },
        h(
          'div',
          { className: 'mc-req-list' },
          h(
            'div',
            { className: 'mc-list-head' },
            h('span', { className: 'mc-list-title' }, t('tabRequired')),
            h('span', { className: 'mc-list-count' }, t('requiredListCount', { count: entries.length })),
            h(Button, { icon: 'plus', variant: 'ghost', className: 'mc-btn-sm', onClick: onAdd, title: t('requiredAdd') }),
          ),
          h(
            'div',
            { className: 'mc-req-scroll' },
            req.loading && data === null
              ? h('div', { className: 'mc-hint' }, t('loadingList'))
              : entries.length === 0
                ? h(
                    'div',
                    { className: 'mc-req-empty' },
                    h('div', { style: { fontWeight: 600, marginBottom: 4 } }, t('requiredEmptyList')),
                    h('div', null, t('requiredEmptyListDesc')),
                  )
                : entries.map((entry, index) =>
                    h(
                      'div',
                      { key: entry.path, className: 'mc-req-item', 'data-off': entry.enabled ? 'false' : 'true' },
                      h('span', { className: 'mc-req-order' }, String(index + 1)),
                      h(
                        'div',
                        { className: 'mc-req-main' },
                        h('span', { className: 'mc-req-name' }, entry.note || entry.name),
                        h('span', { className: 'mc-req-path' }, entry.path),
                        entry.error
                          ? h('span', { className: 'mc-req-meta mc-req-warn' }, entry.error)
                          : entry.enabled
                            ? null
                            : h('span', { className: 'mc-req-meta' }, t('requiredOff')),
                      ),
                      h('span', { className: 'mc-req-meta' }, entry.exists ? t('chars', { count: entry.chars }) : ''),
                      h(
                        'div',
                        { className: 'mc-req-tools' },
                        h(Button, {
                          icon: 'up',
                          variant: 'ghost',
                          className: 'mc-btn-sm',
                          title: t('requiredMoveUp'),
                          disabled: busy || index === 0,
                          onClick: () => onMove(index, index - 1),
                        }),
                        h(Button, {
                          icon: 'down',
                          variant: 'ghost',
                          className: 'mc-btn-sm',
                          title: t('requiredMoveDown'),
                          disabled: busy || index === entries.length - 1,
                          onClick: () => onMove(index, index + 1),
                        }),
                        h(Button, {
                          icon: 'check',
                          variant: 'ghost',
                          className: 'mc-btn-sm',
                          title: t('requiredEnable'),
                          disabled: busy,
                          onClick: () => onToggle(index),
                        }),
                        h(Button, {
                          icon: 'trash',
                          variant: 'ghost',
                          className: 'mc-btn-sm',
                          title: t('requiredRemove'),
                          disabled: busy,
                          onClick: () => onRemove(index),
                        }),
                      ),
                    ),
                  ),
          ),
        ),
        h(
          'div',
          { className: 'mc-req-preview' },
          h(
            'div',
            { className: 'mc-req-card' },
            h(
              'div',
              { className: 'mc-req-head' },
              h('span', { className: 'mc-req-head-title' }, t('requiredPromptOrder')),
              h('span', { className: 'mc-req-head-note' }, t('requiredPromptOrderNote', { count: sectionList.length })),
            ),
            h(
              'div',
              { className: 'mc-req-orderlist' },
              sectionList.length === 0
                ? h('div', { className: 'mc-req-empty' }, t('requiredPreviewEmpty'))
                : sectionList.map((section, index) =>
                    h(
                      'div',
                      { key: section.name + index, className: 'mc-req-orderrow', 'data-mine': section.name === anchorName ? 'true' : 'false' },
                      h('span', { className: 'mc-req-ordernum' }, String(index + 1)),
                      h('span', { className: 'mc-req-ordername' }, section.name),
                      section.name === anchorName ? h(Chip, { tone: 'ok' }, t('requiredAnchor')) : null,
                      h('span', { className: 'mc-req-meta' }, t('chars', { count: section.chars })),
                    ),
                  ),
            ),
          ),
          h(
            'div',
            { className: 'mc-req-card', 'data-grow': 'true' },
            h(
              'div',
              { className: 'mc-req-head' },
              h('span', { className: 'mc-req-head-title' }, t('requiredPreview')),
              h('span', { className: cx('mc-req-head-note', total > 3000 ? 'mc-req-warn' : null), title: t('requiredBudget') }, t('requiredTotal', { chars: total })),
            ),
            preview === ''
              ? h('div', { className: 'mc-req-empty' }, t('requiredPreviewEmpty'))
              : h('pre', { className: 'mc-req-pre' }, preview),
          ),
        ),
      );
    }

    function AddRequiredDialog({ t, count, suggestions, onClose, onSubmit, adding }) {
      const [filePath, setFilePath] = React.useState('');
      const [note, setNote] = React.useState('');
      const [position, setPosition] = React.useState(count + 1);
      const [enabled, setEnabled] = React.useState(true);
      const canSubmit = filePath.trim() !== '' && !adding;
      const submit = () => {
        if (!canSubmit) return;
        onSubmit({ path: filePath.trim(), note: note.trim(), position, enabled });
      };
      return h(
        Modal,
        {
          title: t('requiredAddTitle'),
          onClose,
          footer: [
            h(Button, { key: 'cancel', onClick: onClose, disabled: adding }, t('cancel')),
            h(Button, { key: 'submit', icon: 'plus', variant: 'primary', onClick: submit, disabled: !canSubmit }, adding ? t('saving') : t('requiredSubmit')),
          ],
        },
        h(
          'div',
          { className: 'mc-field' },
          h('span', { className: 'mc-label' }, t('requiredPath'), h('span', { className: 'mc-required-mark' }, '*')),
          h('input', {
            className: 'mc-textinput',
            value: filePath,
            placeholder: t('requiredPathPlaceholder'),
            onChange: (event) => setFilePath(event.target.value),
            list: 'mc-req-suggestions',
            autoFocus: true,
          }),
          h('datalist', { id: 'mc-req-suggestions' }, suggestions.map((item) => h('option', { key: item, value: item }))),
          h('span', { className: 'mc-hint', style: { padding: 0 } }, t('requiredPathHint')),
        ),
        h(
          'div',
          { className: 'mc-field' },
          h('span', { className: 'mc-label' }, t('requiredNote')),
          h('input', {
            className: 'mc-textinput',
            value: note,
            placeholder: t('requiredNotePlaceholder'),
            onChange: (event) => setNote(event.target.value),
          }),
        ),
        h(
          'div',
          { className: 'mc-field' },
          h('span', { className: 'mc-label' }, t('requiredPosition')),
          h(
            'select',
            {
              className: 'mc-textinput',
              value: String(position),
              onChange: (event) => setPosition(Number(event.target.value)),
            },
            Array.from({ length: count + 1 }, (_, index) => index + 1).map((pos) =>
              h('option', { key: pos, value: String(pos) }, t('requiredPositionValue', { pos })),
            ),
          ),
        ),
        h(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } },
          h('input', { type: 'checkbox', checked: enabled, onChange: (event) => setEnabled(event.target.checked) }),
          t('requiredEnabled'),
        ),
      );
    }

    function MemoryPanel(props) {
      const t = makeT(props);
      const call = props.call;

      const [nonce, setNonce] = React.useState(0);
      const [tab, setTab] = React.useState('list');
      const [query, setQuery] = React.useState('');
      const [list, setList] = React.useState({ loading: true, groups: [], total: 0, error: null, updated: '' });
      const [selected, setSelected] = React.useState('');
      const [doc, setDoc] = React.useState({ loading: false, text: '', meta: null, error: null });
      const [editing, setEditing] = React.useState(false);
      const [draft, setDraft] = React.useState('');
      const [saving, setSaving] = React.useState(false);
      const [index, setIndex] = React.useState({ loading: false, text: '', modified: '', count: undefined, error: null });
      const [rebuilding, setRebuilding] = React.useState(false);
      const [health, setHealth] = React.useState({ loading: false, data: null, error: null });
      const [trash, setTrash] = React.useState({ loading: false, entries: [], error: null });
      const [restoring, setRestoring] = React.useState('');
      const [emptyOpen, setEmptyOpen] = React.useState(false);
      const [emptying, setEmptying] = React.useState(false);
      const [search, setSearch] = React.useState({ loading: false, data: null, error: null });
      const [createOpen, setCreateOpen] = React.useState(false);
      const [creating, setCreating] = React.useState(false);
      const [confirmDelete, setConfirmDelete] = React.useState(null);
      const [deleting, setDeleting] = React.useState(false);
      const [diff, setDiff] = React.useState(null);
      const [toasts, setToasts] = React.useState([]);
      const [req, setReq] = React.useState({ loading: false, data: null, error: null });
      const [reqSections, setReqSections] = React.useState({ sections: [], anchorName: '' });
      const [addOpen, setAddOpen] = React.useState(false);
      const [reqBusy, setReqBusy] = React.useState(false);

      const pushToast = React.useCallback((kind, title, detail) => {
        const id = Date.now() + Math.random();
        setToasts((previous) => [...previous, { id, kind, title, detail }]);
        setTimeout(() => {
          setToasts((previous) => previous.filter((toast) => toast.id !== id));
        }, 4200);
      }, []);

      const bump = React.useCallback(() => setNonce((value) => value + 1), []);

      const loadList = React.useCallback(
        async (silent) => {
          if (typeof call !== 'function') return;
          if (!silent) setList((previous) => ({ ...previous, loading: true, error: null }));
          try {
            const value = await call('list');
            setList({
              loading: false,
              groups: Array.isArray(value?.groups) ? value.groups : [],
              total: typeof value?.total === 'number' ? value.total : 0,
              error: null,
              updated: nowLabel(),
            });
          } catch (error) {
            if (silent) return;
            setList((previous) => ({
              ...previous,
              loading: false,
              error: error?.message ?? String(error),
            }));
          }
        },
        [call],
      );

      React.useEffect(() => {
        loadList(false);
      }, [loadList, nonce]);

      React.useEffect(() => {
        const timer = setInterval(() => {
          if (document.visibilityState === 'hidden') return;
          loadList(true);
        }, POLL_MS);
        const onVisible = () => {
          if (document.visibilityState === 'visible') loadList(true);
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
          clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisible);
          window.removeEventListener('focus', onVisible);
        };
      }, [loadList]);

      const selectedEntry = React.useMemo(() => {
        for (const group of list.groups) {
          for (const entry of group.entries) {
            if (entry.rel === selected) return entry;
          }
        }
        return null;
      }, [list.groups, selected]);
      const selectedModified = selectedEntry === null ? '' : selectedEntry.modified;

      const loadDoc = React.useCallback(async () => {
        if (selected === '') return;
        const rel = selected;
        setDoc((previous) => ({ ...previous, loading: true, error: null }));
        try {
          const value = await call('read', { path: rel });
          setDoc({ loading: false, text: value.text ?? '', meta: value, error: null });
        } catch (error) {
          setDoc({ loading: false, text: '', meta: null, error: error?.message ?? String(error) });
        }
      }, [call, selected]);

      React.useEffect(() => {
        if (selected === '') return;
        if (editing) return;
        loadDoc();
      }, [loadDoc, selectedModified, editing]);

      React.useEffect(() => {
        if (selected === '') {
          setDoc({ loading: false, text: '', meta: null, error: null });
          setEditing(false);
          setDraft('');
        }
      }, [selected]);

      React.useEffect(() => {
        if (tab !== 'index') return;
        let alive = true;
        setIndex((previous) => ({ ...previous, loading: true, error: null }));
        call('index')
          .then((value) => {
            if (!alive) return;
            setIndex({
              loading: false,
              text: value?.text ?? '',
              modified: value?.modified ?? '',
              count: value?.count,
              error: null,
            });
          })
          .catch((error) => {
            if (!alive) return;
            setIndex({ loading: false, text: '', modified: '', count: undefined, error: error?.message ?? String(error) });
          });
        return () => {
          alive = false;
        };
      }, [call, tab, nonce]);

      const loadHealth = React.useCallback(async () => {
        setHealth((previous) => ({ ...previous, loading: true, error: null }));
        try {
          const value = await call('health');
          setHealth({ loading: false, data: value, error: null });
        } catch (error) {
          setHealth({ loading: false, data: null, error: error?.message ?? String(error) });
        }
      }, [call]);

      React.useEffect(() => {
        if (tab !== 'health') return;
        loadHealth();
      }, [tab, nonce, loadHealth]);

      // 顶部健康徽标要一开始就准：进页面先静默拉一次，之后随 nonce 刷新。
      React.useEffect(() => {
        if (typeof call !== 'function') return undefined;
        let alive = true;
        call('health')
          .then((value) => {
            if (!alive) return;
            setHealth((previous) => (previous.data === null ? { loading: false, data: value, error: null } : previous));
          })
          .catch(() => {});
        return () => {
          alive = false;
        };
      }, [call, nonce]);

      const loadTrash = React.useCallback(async () => {
        setTrash((previous) => ({ ...previous, loading: true, error: null }));
        try {
          const value = await call('trash');
          setTrash({ loading: false, entries: Array.isArray(value?.entries) ? value.entries : [], error: null });
        } catch (error) {
          setTrash({ loading: false, entries: [], error: error?.message ?? String(error) });
        }
      }, [call]);

      React.useEffect(() => {
        if (tab !== 'trash') return;
        loadTrash();
      }, [tab, nonce, loadTrash]);

      const [busyDupKey, setBusyDupKey] = React.useState(null);

      const mergeDuplicates = React.useCallback(
        async (key, paths) => {
          if (busyDupKey !== null) return;
          setBusyDupKey(key);
          try {
            const value = await call('merge', { paths });
            pushToast('ok', t('mergeOk', { name: value.rel }), t('mergeOkDetail', { count: value.merged.length }));
            bump();
            loadHealth();
            loadList(true);
            loadTrash();
          } catch (error) {
            pushToast('error', t('bin', { message: error?.message ?? String(error) }));
          } finally {
            setBusyDupKey(null);
          }
        },
        [busyDupKey, call, pushToast, bump, loadHealth, loadList, loadTrash, t],
      );

      const dismissDuplicates = React.useCallback(
        async (key) => {
          if (busyDupKey !== null) return;
          setBusyDupKey(key);
          try {
            await call('dismiss', { keys: [key] });
            pushToast('ok', t('dismissOk'));
            loadHealth();
          } catch (error) {
            pushToast('error', t('bin', { message: error?.message ?? String(error) }));
          } finally {
            setBusyDupKey(null);
          }
        },
        [busyDupKey, call, pushToast, loadHealth, t],
      );

      const loadRequired = React.useCallback(async () => {
        setReq((previous) => ({ ...previous, loading: true, error: null }));
        try {
          const value = await call('requiredList');
          setReq({ loading: false, data: value, error: null });
        } catch (error) {
          setReq({ loading: false, data: null, error: error?.message ?? String(error) });
        }
      }, [call]);

      const loadSections = React.useCallback(async () => {
        try {
          const value = await call('promptSections');
          setReqSections({
            sections: Array.isArray(value?.sections) ? value.sections : [],
            anchorName: typeof value?.anchorName === 'string' ? value.anchorName : '',
          });
        } catch {
          /* 顺序只是展示，失败不打扰 */
        }
      }, [call]);

      React.useEffect(() => {
        if (tab !== 'required') return;
        loadRequired();
        loadSections();
      }, [tab, nonce, loadRequired, loadSections]);

      const submitRequired = React.useCallback(
        async (files, onDone) => {
          setReqBusy(true);
          try {
            const value = await call('requiredSave', { files });
            setReq({ loading: false, data: value, error: null });
            pushToast('ok', t('requiredSaved'), t('requiredSavedDetail'));
            if (typeof onDone === 'function') onDone();
          } catch (error) {
            pushToast('error', t('bin', { message: error?.message ?? String(error) }));
          } finally {
            setReqBusy(false);
          }
        },
        [call, pushToast, t],
      );

      const requiredFiles = React.useMemo(() => {
        const entries = req.data !== null && Array.isArray(req.data.entries) ? req.data.entries : [];
        return entries.map((entry) => ({ path: entry.path, enabled: entry.enabled, note: entry.note }));
      }, [req.data]);

      const moveRequired = (from, to) => {
        if (reqBusy) return;
        const entries = req.data?.entries ?? [];
        if (to < 0 || to >= entries.length || from === to) return;
        const files = requiredFiles.slice();
        const [moved] = files.splice(from, 1);
        files.splice(to, 0, moved);
        submitRequired(files);
      };

      const toggleRequired = (index) => {
        if (reqBusy) return;
        const files = requiredFiles.slice();
        if (!files[index]) return;
        files[index] = { ...files[index], enabled: !files[index].enabled };
        submitRequired(files);
      };

      const removeRequired = (index) => {
        if (reqBusy) return;
        const files = requiredFiles.slice();
        files.splice(index, 1);
        submitRequired(files);
      };

      const addRequired = (payload) => {
        const files = requiredFiles.slice();
        const position = Math.min(Math.max(payload.position - 1, 0), files.length);
        files.splice(position, 0, { path: payload.path, enabled: payload.enabled, note: payload.note });
        submitRequired(files, () => setAddOpen(false));
      };

      const reqSuggestions = React.useMemo(() => {
        const root = String(list.root || '').replace(/[\\/]+$/, '');
        const out = [];
        if (!root) return out;
        const separator = root.includes('\\') ? '\\' : '/';
        for (const group of list.groups) {
          for (const entry of group.entries) {
            out.push(root + separator + entry.rel.split('/').join(separator));
          }
        }
        return out;
      }, [list.groups, list.root]);

      React.useEffect(() => {
        const needle = String(query ?? '').trim();
        if (needle === '') {
          setSearch({ loading: false, data: null, error: null });
          return undefined;
        }
        let alive = true;
        setSearch((previous) => ({ ...previous, loading: true, error: null }));
        const timer = setTimeout(() => {
          call('search', { q: needle })
            .then((value) => {
              if (!alive) return;
              setSearch({ loading: false, data: value, error: null });
            })
            .catch((error) => {
              if (!alive) return;
              setSearch({ loading: false, data: null, error: error?.message ?? String(error) });
            });
        }, 260);
        return () => {
          alive = false;
          clearTimeout(timer);
        };
      }, [call, query, nonce]);

      const openFile = (rel) => {
        if (editing && draft !== doc.text) {
          if (!window.confirm(t('unsavedLeave'))) return;
        }
        setEditing(false);
        setSelected(rel);
        setQuery('');
        setTab('list');
      };

      const beginEdit = () => {
        setDraft(doc.text);
        setEditing(true);
      };

      const cancelEdit = () => {
        setEditing(false);
        setDraft('');
      };

      const requestSave = () => {
        if (draft === doc.text) {
          pushToast('ok', t('saveNoChange'));
          setEditing(false);
          return;
        }
        setDiff({ before: doc.text, after: draft });
      };

      const confirmSave = async () => {
        if (diff === null) return;
        setSaving(true);
        try {
          const value = await call('save', { path: selected, text: diff.after });
          setEditing(false);
          setDraft('');
          setDiff(null);
          if (value.changed === false) {
            pushToast('ok', t('saveNoChange'));
          } else if (value.index && value.index.ok === false) {
            pushToast('error', t('saved'), t('savedIndexFailed', { message: value.index.message ?? '' }));
          } else {
            pushToast('ok', t('saved'), t('savedBackup', { path: value.backup ?? '' }));
          }
          bump();
          await loadDoc();
        } catch (error) {
          pushToast('error', t('bin', { message: error?.message ?? String(error) }));
        } finally {
          setSaving(false);
        }
      };

      const confirmCreate = async (payload) => {
        setCreating(true);
        try {
          const value = await call('create', payload);
          setCreateOpen(false);
          pushToast('ok', t('created'), value?.rel ?? '');
          bump();
          await loadList(true);
          if (value?.rel) {
            setSelected(value.rel);
            setTab('list');
          }
        } catch (error) {
          pushToast('error', t('bin', { message: error?.message ?? String(error) }));
        } finally {
          setCreating(false);
        }
      };

      const confirmRemove = async () => {
        if (confirmDelete === null) return;
        setDeleting(true);
        try {
          await call('remove', { path: confirmDelete.rel });
          setConfirmDelete(null);
          setSelected('');
          pushToast('ok', t('deleted'));
          bump();
          await loadList(true);
        } catch (error) {
          pushToast('error', t('bin', { message: error?.message ?? String(error) }));
        } finally {
          setDeleting(false);
        }
      };

      const restoreEntry = async (entry) => {
        setRestoring(entry.id);
        try {
          const value = await call('restore', { id: entry.id });
          pushToast('ok', t('trashRestoreDone'), value?.rel ?? '');
          bump();
          await loadTrash();
          await loadList(true);
        } catch (error) {
          pushToast('error', t('bin', { message: error?.message ?? String(error) }));
        } finally {
          setRestoring('');
        }
      };

      const confirmEmptyTrash = async () => {
        setEmptying(true);
        try {
          const value = await call('trashEmpty');
          setEmptyOpen(false);
          pushToast('ok', t('trashEmptied'), t('trashEmptiedDetail', { count: value?.entries ?? 0 }));
          bump();
          await loadTrash();
        } catch (error) {
          pushToast('error', t('bin', { message: error?.message ?? String(error) }));
        } finally {
          setEmptying(false);
        }
      };

      const rebuildIndex = async () => {
        setRebuilding(true);
        try {
          await call('rebuildIndex');
          pushToast('ok', t('indexRebuilt'));
          bump();
        } catch (error) {
          pushToast('error', t('bin', { message: error?.message ?? String(error) }));
        } finally {
          setRebuilding(false);
        }
      };

      const groups = React.useMemo(() => list.groups, [list.groups]);
      const showSearch = query.trim() !== '';
      const counts = React.useMemo(
        () => ({
          missing: health.data === null ? 0 : health.data.missingSummary.length,
          stale: health.data === null ? 0 : health.data.stale.length,
          index: health.data === null ? 0 : health.data.index.consistent ? 0 : 1,
        }),
        [health.data],
      );

      return h(
        'section',
        { className: 'mc-root', 'aria-label': t('title') },
        h(
          'header',
          { className: 'mc-header' },
          h('div', { className: 'mc-logo' }, h(Icon, { name: 'book', size: 22 })),
          h(
            'div',
            { className: 'mc-headtext' },
            h('h1', { className: 'mc-title' }, t('title')),
            h('span', { className: 'mc-subtitle' }, list.loading && list.groups.length === 0
              ? t('subtitleLoading')
              : t('subtitle', { count: list.total, time: list.updated || '—' })),
          ),
          h(
            'div',
            { className: 'mc-header-actions' },
            h(
              'div',
              { className: 'mc-search' },
              h('span', { className: 'mc-search-icon' }, h(Icon, { name: 'search', size: 14 })),
              h('input', {
                value: query,
                placeholder: t('searchPlaceholder'),
                'aria-label': t('searchPlaceholder'),
                onChange: (event) => setQuery(event.target.value),
              }),
              query !== ''
                ? h(
                    'button',
                    { type: 'button', className: 'mc-search-clear', title: t('searchClear'), onClick: () => setQuery('') },
                    h(Icon, { name: 'close', size: 13 }),
                  )
                : null,
            ),
            h(Button, { icon: 'refresh', variant: 'ghost', onClick: () => { bump(); pushToast('ok', t('reloaded')); }, title: t('refresh') }),
            h(Button, { icon: 'plus', variant: 'primary', onClick: () => setCreateOpen(true) }, t('new')),
          ),
        ),
        h(
          'nav',
          { className: 'mc-tabs', role: 'tablist' },
          [
            ['list', 'list', t('tabList')],
            ['index', 'file', t('tabIndex')],
            ['health', 'warning', t('tabHealth')],
            ['required', 'bookmark', t('tabRequired')],
            ['trash', 'trash', t('tabTrash')],
          ].map(([value, icon, label]) =>
            h(
              'button',
              {
                key: value,
                type: 'button',
                role: 'tab',
                className: 'mc-tab',
                'data-active': tab === value ? 'true' : 'false',
                'aria-selected': tab === value ? 'true' : 'false',
                onClick: () => setTab(value),
              },
              h(Icon, { name: icon, size: 14 }),
              h('span', null, label),
              value === 'health' && counts.missing + counts.stale + counts.index > 0
                ? h('span', { className: 'mc-tab-badge' }, String(counts.missing + counts.stale + counts.index))
                : null,
            ),
          ),
        ),
        showSearch
          ? h(SearchPane, { search, query, onOpen: openFile, t })
          : tab === 'list'
            ? h(
                'div',
                { className: 'mc-content' },
                h('div', { className: 'mc-card mc-list' },
                  h('div', { className: 'mc-list-head' },
                    h('span', { className: 'mc-list-title' }, t('tabList')),
                    h('span', { className: 'mc-list-count' }, t('listCount', { count: list.total }))),
                  h(ListPane, {
                    list: { ...list, retry: () => loadList(false) },
                    groups,
                    selected,
                    onSelect: (rel) => {
                      if (editing && draft !== doc.text && !window.confirm(t('unsavedLeave'))) return;
                      setEditing(false);
                      setSelected(rel);
                    },
                    t,
                  }),
                ),
                h('div', { className: 'mc-card mc-detail' },
                  h(DetailPane, {
                    doc: { ...doc, retry: loadDoc },
                    selected,
                    editing,
                    draft,
                    onDraft: setDraft,
                    onEdit: beginEdit,
                    onCancel: cancelEdit,
                    onSave: requestSave,
                    onDelete: () => {
                      if (selectedEntry !== null) setConfirmDelete(selectedEntry);
                    },
                    saving,
                    t,
                  }),
                ),
              )
            : tab === 'index'
              ? h(IndexPane, { index, rebuilding, onRebuild: rebuildIndex, t })
              : tab === 'health'
                ? h(HealthPane, {
                    health,
                    onOpen: openFile,
                    onRefresh: loadHealth,
                    onMerge: mergeDuplicates,
                    onDismiss: dismissDuplicates,
                    busyKey: busyDupKey,
                    t,
                  })
                : tab === 'required'
                  ? h(RequiredPane, {
                      req,
                      sections: reqSections,
                      busy: reqBusy,
                      onAdd: () => setAddOpen(true),
                      onMove: moveRequired,
                      onToggle: toggleRequired,
                      onRemove: removeRequired,
                      t,
                    })
                  : h(TrashPane, { trash, onRestore: restoreEntry, onEmpty: () => setEmptyOpen(true), restoring, emptying, t }),
        createOpen ? h(CreateDialog, { t, onCreate: confirmCreate, onClose: () => setCreateOpen(false), creating, currentMonth: monthStamp() }) : null,
        diff !== null ? h(DiffDialog, { t, before: diff.before, after: diff.after, onCancel: () => setDiff(null), onConfirm: confirmSave, saving }) : null,
        confirmDelete !== null
          ? h(DeleteDialog, { t, entry: confirmDelete, onCancel: () => setConfirmDelete(null), onConfirm: confirmRemove, deleting })
          : null,
        emptyOpen
          ? h(EmptyTrashDialog, { t, count: trash.entries.length, onCancel: () => setEmptyOpen(false), onConfirm: confirmEmptyTrash, emptying })
          : null,
        addOpen
          ? h(AddRequiredDialog, {
              t,
              count: req.data !== null && Array.isArray(req.data.entries) ? req.data.entries.length : 0,
              suggestions: reqSuggestions,
              onClose: () => setAddOpen(false),
              onSubmit: addRequired,
              adding: reqBusy,
            })
          : null,
        h(
          'div',
          { className: 'mc-toasts' },
          toasts.map((toast) =>
            h(
              'div',
              { className: cx('mc-toast', toast.kind === 'error' ? 'mc-toast-error' : 'mc-toast-ok'), key: toast.id },
              h(Icon, { name: toast.kind === 'error' ? 'warning' : 'check', size: 15 }),
              h(
                'div',
                { className: 'mc-toast-main' },
                h('span', null, toast.title),
                toast.detail ? h('span', { className: 'mc-toast-detail' }, toast.detail) : null,
              ),
            ),
          ),
        ),
      );
    }

    /* ------------------------------------------------------------------ 侧栏图标 */

    function MemoryIcon({ size }) {
      const edge = typeof size === 'number' && size > 0 ? size : 18;
      return h(
        'svg',
        {
          width: edge,
          height: edge,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block' },
        },
        h('path', { d: 'M6.5 3h13a.5.5 0 0 1 .5.5v16a.5.5 0 0 1-.5.5h-13A2.5 2.5 0 0 1 4 17.5v-12A2.5 2.5 0 0 1 6.5 3Z' }),
        h('path', { d: 'M4 17.5A2.5 2.5 0 0 1 6.5 15H20' }),
        h('path', { d: 'M8 7h8' }),
        h('path', { d: 'M8 10.5h5' }),
      );
    }

    /* ------------------------------------------------------------------ 插件 */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'memory-console: dictionaries');
        const t = ctx.locale.bind(NS);

        const call = async (op, payload) => {
          let response;
          try {
            response = await fetch(ROUTE, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ op, payload: payload ?? {} }),
            });
          } catch (error) {
            throw new Error(error?.message ?? String(error));
          }
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const result = await response.json();
          if (!result || result.ok !== true) {
            throw new Error(result?.error?.message ?? 'request failed');
          }
          return result.value;
        };

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
              inject: () => ({ call }),
            },
            MemoryPanel,
          ),
        );

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 6,
              locale: NS,
              label: () => t('panel'),
            },
            MemoryIcon,
          ),
        );
      },
    };
  },
});
