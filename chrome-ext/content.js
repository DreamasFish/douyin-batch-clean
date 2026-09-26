// dy-clean chrome content script v1.4
(function () {
  "use strict";
  if (window.__dyCleanTM) {
    console.log("[dy-clean] already loaded v1.4");
    return;
  }
  window.__dyCleanTM = true;
  console.log("[dy-clean] chrome-ext v1.6.2 loaded", location.href);

  function t(el) {
    return ((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim();
  }
  function vis(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    var s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0";
  }
  function find(text, exact) {
    if (exact === undefined) exact = true;
    var ns = Array.from(document.querySelectorAll("button,div,span,a,li,[role=button],[role=tab]"));
    var ms = ns.filter(function (el) {
      var x = t(el);
      return (exact ? x === text : x.indexOf(text) >= 0) && vis(el);
    });
    // prefer leaf / clickable
    ms.sort(function (a, b) {
      return (a.innerText || "").length - (b.innerText || "").length;
    });
    return ms[0] || null;
  }
  function findAll(text) {
    var ns = Array.from(document.querySelectorAll("button,div,span,a,li,[role=button],[role=tab]"));
    return ns.filter(function (el) {
      return t(el) === text && vis(el);
    });
  }
  function findTab(name) {
    var tabs = Array.from(document.querySelectorAll('[role="tab"], .semi-tabs-tab'));
    for (var i = 0; i < tabs.length; i++) {
      var el = tabs[i];
      var x = t(el);
      if (vis(el) && (x === name || x.indexOf(name) === 0)) return el;
    }
    var all = Array.from(document.querySelectorAll("div,span,a"));
    for (var j = 0; j < all.length; j++) {
      var e2 = all[j];
      var y = t(e2);
      if (vis(e2) && y && y.length <= name.length + 6 && y.indexOf(name) === 0) return e2;
    }
    return null;
  }
  function fireClick(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    } catch (e) {}
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2;
    var y = r.top + r.height / 2;
    var opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
    if (typeof el.click === "function") {
      try {
        el.click();
      } catch (e) {}
    }
    return true;
  }
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  async function waitFor(fn, timeoutMs, stepMs) {
    timeoutMs = timeoutMs || 8000;
    stepMs = stepMs || 200;
    var end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try {
        var v = fn();
        if (v) return v;
      } catch (e) {}
      await sleep(stepMs);
    }
    return null;
  }

  function selCount() {
    var labs = Array.from(document.querySelectorAll("span,div"));
    for (var i = 0; i < labs.length; i++) {
      var el = labs[i];
      if (el.children.length !== 0) continue;
      var x = t(el);
      if (/已选\s*\d+/.test(x)) {
        var m = x.match(/(\d+)/);
        return m ? +m[1] : null;
      }
    }
    return null;
  }

  function listCardCount() {
    return Array.from(
      document.querySelectorAll('a[href*="/video/"], a[href*="/note/"], a[href*="/shipin/"]')
    ).filter(vis).length;
  }

  /** 明确空态文案（不是「还在加载」） */
  function hasDefiniteEmptyText() {
    var b = t(document.body);
    return /该账号还未发布过作品哦|暂无内容|暂无喜欢的视频|暂无收藏的视频|暂无收藏的音乐|登录后即可观看/.test(
      b
    );
  }

  /** 是否仍在加载（骨架/加载中提示） */
  function looksLoading() {
    if (find("加载中", false) || find("加载失败", false)) return true;
    if (document.querySelector('[class*="skeleton"],[class*="Skeleton"],[class*="loading"],[class*="Loading"]')) {
      return true;
    }
    return false;
  }

  function empty() {
    if (hasDefiniteEmptyText()) return true;
    // 有卡片就不空；无卡片且无空态文案时不确定 → 由 waitForListReady 判定
    return listCardCount() === 0 && hasDefiniteEmptyText();
  }

  /**
   * 等列表就绪：出卡片，或出现明确空态。
   * 喜欢页加载慢，避免未加载完就当空跳过。
   */
  async function waitForListReady(timeoutMs) {
    timeoutMs = timeoutMs || 15000;
    var end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      var cards = listCardCount();
      if (cards > 0) {
        // 再等一会让整页卡片渲染完
        await sleep(400);
        return { ready: true, empty: false, cards: listCardCount() };
      }
      if (hasDefiniteEmptyText()) {
        return { ready: true, empty: true, cards: 0 };
      }
      await sleep(300);
    }
    // 超时：再观察一轮，仍无卡片且无空态则视为未就绪（不要当空）
    await sleep(500);
    if (listCardCount() > 0) return { ready: true, empty: false, cards: listCardCount() };
    if (hasDefiniteEmptyText()) return { ready: true, empty: true, cards: 0 };
    return { ready: false, empty: false, cards: listCardCount(), loading: looksLoading() };
  }

  function diagnose(label, sink) {
    var body = t(document.body);
    var batchHits = findAll("批量管理").length;
    var exitHits = findAll("退出管理").length;
    var saHits = findAll("全选").length + findAll("取消全选").length;
    var actions = ["取消喜欢", "取消收藏", "删除", "取消点赞", "批量删除"].filter(function (n) {
      return !!find(n);
    });
    var tabNames = Array.from(document.querySelectorAll('[role="tab"]'))
      .map(function (el) {
        return t(el);
      })
      .filter(Boolean)
      .slice(0, 14);
    var info = {
      label: label,
      url: location.href,
      cards: listCardCount(),
      batchHits: batchHits,
      exitHits: exitHits,
      selectAllHits: saHits,
      selected: selCount(),
      actions: actions,
      tabs: tabNames,
      emptyHint: /暂无|还未发布|登录后即可/.test(body),
    };
    console.log("[dy-clean] diag", label, info);
    if (typeof sink === "function") sink(JSON.stringify(info));
    return info;
  }

  function ensurePanel() {
    if (document.getElementById("__dyCleanTM")) return;
    if (!document.body) return;

    var host = document.createElement("div");
    host.id = "__dyCleanTM";
    host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647";
    var sh = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    sh.innerHTML =
      "<style>.c{width:320px;background:rgba(18,20,26,.97);color:#e8eaf0;border:1px solid #2c3140;border-radius:12px;padding:12px;font:12px/1.5 -apple-system,BlinkMacSystemFont,PingFang SC,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45)}h3{margin:0 0 8px;font-size:13px;color:#fe2c55}label{display:flex;gap:8px;align-items:center;margin:6px 0}button.r{width:100%;margin-top:8px;border:0;border-radius:8px;padding:10px;background:#fe2c55;color:#fff;font-weight:700;cursor:pointer}button.s{width:100%;margin-top:6px;border:1px solid #2c3140;border-radius:8px;padding:8px;background:transparent;color:#e8eaf0;cursor:pointer}.log{margin-top:8px;max-height:180px;overflow:auto;color:#8b93a7;white-space:pre-wrap;font-size:11px}</style>" +
      '<div class="c"><h3>dy-clean v1.6.2</h3>' +
      '<label><input type="checkbox" id="live"> live 真删（不勾只统计）</label>' +
      '<label><input type="checkbox" id="likes" checked> 喜欢</label>' +
      '<label><input type="checkbox" id="favs" checked> 收藏</label>' +
      '<label><input type="checkbox" id="works"> 作品（删除）</label>' +
      '<button class="r" id="go">开始清理</button>' +
      '<button class="s" id="diag">诊断当前页面</button>' +
      '<div class="log" id="log"></div></div>';
    document.body.appendChild(host);

    function log(m, type) {
      console.log("[dy-clean]", m);
      var box = sh.getElementById("log");
      var d = document.createElement("div");
      d.textContent = "[" + new Date().toLocaleTimeString() + "] " + m;
      if (type === "ok") d.style.color = "#3dd68c";
      if (type === "warn") d.style.color = "#f5a524";
      if (type === "error") d.style.color = "#ff5c7a";
      box.appendChild(d);
      box.scrollTop = box.scrollHeight;
    }

    async function enterBatch() {
      if (find("退出管理")) {
        log("已在批量管理");
        return true;
      }
      // empty list: no batch needed（仅明确空态才跳过）
      if (hasDefiniteEmptyText() && listCardCount() === 0) {
        log("列表为空，无需批量管理");
        return "empty";
      }

      var btns = await waitFor(function () {
        return findAll("批量管理");
      }, 6000);
      if (!btns || !btns.length) {
        // try non-exact
        var loose = find("批量管理", false);
        if (loose) {
          log("用模糊匹配点「批量管理」");
          fireClick(loose);
          await sleep(800);
        } else {
          log("找不到「批量管理」", "error");
          diagnose("no-batch-btn", log);
          return false;
        }
      } else {
        // click the outermost clickable-ish among hits (often a wrapper)
        var target = btns[btns.length - 1];
        // prefer element with class containing btn/button or role=button
        for (var i = 0; i < btns.length; i++) {
          var c = (btns[i].className || "") + " " + (btns[i].getAttribute("role") || "");
          if (/btn|button|clickable/i.test(c)) {
            target = btns[i];
            break;
          }
        }
        log("点击批量管理 (" + btns.length + " 个匹配)");
        fireClick(target);
        await sleep(1000);
        // retry once if needed
        if (!find("退出管理") && !find("全选") && !find("取消全选")) {
          log("再点一次批量管理");
          fireClick(target);
          await sleep(1000);
        }
      }

      var ok = await waitFor(function () {
        return find("退出管理") || find("全选") || find("取消全选") || find("已选");
      }, 5000);
      if (!ok) {
        log("进入批量管理失败", "error");
        diagnose("batch-fail", log);
        return false;
      }
      log("已进入批量管理", "ok");
      return true;
    }

    async function selectAll() {
      var lab = await waitFor(function () {
        return find("全选") || find("取消全选");
      }, 4000);
      if (!lab) {
        log("找不到全选控件", "warn");
        return selCount();
      }
      var wrap = lab.closest("span.semi-checkbox") || lab.closest("label") || lab.closest("span,div");
      var input = wrap && wrap.querySelector("input[type=checkbox]");
      var checked = input ? input.checked : /取消全选/.test(t(lab));
      if (!checked) {
        fireClick(wrap || lab);
        await sleep(600);
        // if still not, click input parent again
        if (input && !input.checked) {
          fireClick(input.closest("span.semi-checkbox") || wrap || lab);
          await sleep(400);
        }
      }
      return selCount();
    }

    function actionNames(kind) {
      if (kind === "likes") return ["取消喜欢", "取消点赞"];
      if (kind === "favs") return ["取消收藏"];
      return ["删除", "删除作品", "批量删除"];
    }

    async function act(kind) {
      var names = actionNames(kind);
      for (var i = 0; i < names.length; i++) {
        var b = await waitFor(
          (function (name) {
            return function () {
              return find(name);
            };
          })(names[i]),
          2500
        );
        if (b) {
          log("点击: " + names[i]);
          fireClick(b);
          await sleep(700);
          return true;
        }
      }
      log("未找到操作按钮", "error");
      diagnose("no-action-" + kind, log);
      return false;
    }

    /** 点「取消/删除」后立刻确认；按钮还在就再点一次（取消收藏偶发失败） */
    async function actAndConfirm(kind) {
      if (!(await act(kind))) return false;
      await sleep(500);
      var confirmed = await doConfirm();
      // 部分场景：确认后操作未生效，按钮仍在 → 再走一遍
      for (let retry = 0; retry < 3; retry++) {
        await sleep(800);
        var stillDialog = !!find("确认取消") || !!find("确认删除");
        var actionLeft = actionNames(kind).some(function (n) {
          return !!find(n);
        });
        if (stillDialog) {
          log("弹窗仍在，重试确认");
          await doConfirm();
          continue;
        }
        if (actionLeft && selCount() != null && selCount() > 0) {
          log("取消可能未生效，重试点击操作");
          if (await act(kind)) {
            await sleep(500);
            await doConfirm();
            continue;
          }
        }
        break;
      }
      return confirmed || true;
    }

    async function doConfirm() {
      var names = ["确认取消", "确认删除", "确认"];
      var clicked = false;
      for (var k = 0; k < 15; k++) {
        for (var i = 0; i < names.length; i++) {
          var cs = findAll(names[i]);
          cs.sort(function (a, b) {
            return (a.innerText || "").length - (b.innerText || "").length;
          });
          for (var j = 0; j < cs.length; j++) {
            fireClick(cs[j]);
            log("确认: " + t(cs[j]));
            clicked = true;
            await sleep(400);
            // 双保险：若弹窗还在再点一次
            if (find(names[i])) {
              fireClick(cs[j]);
              log("确认补点一次");
            }
            return true;
          }
        }
        await sleep(250);
      }
      if (!clicked) log("未识别确认弹窗", "warn");
      return clicked;
    }

    async function runKind(kind, live) {
      var tabName = kind === "likes" ? "喜欢" : kind === "favs" ? "收藏" : "作品";
      log("打开「" + tabName + "」");
      if (location.pathname.indexOf("/user/self") < 0) {
        location.href = "https://www.douyin.com/user/self";
        await sleep(3500);
      }
      await waitFor(function () {
        return find("批量管理") || find("作品") || find("喜欢") || find("收藏");
      }, 8000);

      var tab = await waitFor(function () {
        return findTab(tabName);
      }, 5000);
      if (tab) {
        fireClick(tab);
        // 喜欢页加载偏慢，多等一会再判定
        log("等待「" + tabName + "」列表加载…");
        await sleep(kind === "likes" ? 2500 : 1800);
      } else {
        log("未找到页签「" + tabName + "」", "warn");
      }

      var ready = await waitForListReady(kind === "likes" ? 20000 : 12000);
      log(
        "列表状态: " +
          JSON.stringify({ ready: ready.ready, empty: ready.empty, cards: ready.cards })
      );
      if (ready.ready && ready.empty) {
        log(kind + " 已空", "ok");
        return { empty: true, selected: 0 };
      }
      if (!ready.ready) {
        // 未就绪：不要当空跳过，多等一次
        log("列表未就绪（可能加载慢），再等 3s 重试", "warn");
        await sleep(3000);
        ready = await waitForListReady(8000);
        if (ready.ready && ready.empty) {
          log(kind + " 已空", "ok");
          return { empty: true, selected: 0 };
        }
        if (!ready.ready && ready.cards === 0) {
          log(kind + " 仍无卡片且无空态，本条跳过本轮，下轮再试", "warn");
          return { error: "list-not-ready" };
        }
      }

      var entered = await enterBatch();
      if (entered === "empty") {
        log(kind + " 已空", "ok");
        return { empty: true, selected: 0 };
      }
      if (!entered) return { error: "no-batch-ui" };

      await sleep(400);
      var n = await selectAll();
      log(kind + " 已选: " + (n == null ? "?" : n));
      diagnose("after-select-" + kind, log);

      if (n === 0) {
        if (hasDefiniteEmptyText() || listCardCount() === 0) {
          log(kind + " 已空/未选中", "warn");
          return { empty: true, selected: 0 };
        }
        log(kind + " 未选中但列表仍在，重试全选", "warn");
        n = await selectAll();
        if (n === 0) return { error: "select-failed" };
      }
      if (!live) {
        log("[safe] 未删除，约 " + (n == null ? "?" : n) + " 条", "warn");
        return { dryRun: true, selected: n };
      }
      // 收藏/喜欢取消偶发失败：actAndConfirm 内含重试
      if (!(await actAndConfirm(kind))) return { error: "no-action" };
      await sleep(1800);
      return { ok: true, selected: n };
    }

    async function runKindUntilDone(kind, live) {
      // 不限最大轮次，直到清空；连续多轮无进展则停止防卡死
      let processed = 0;
      let round = 0;
      let lastSelected = null;
      let noProgress = 0;
      for (;;) {
        round += 1;
        log(kind + " 第 " + round + " 轮");
        const r = await runKind(kind, live);
        if (r && r.dryRun) return r;
        if (r && r.empty) {
          log(kind + " 已空", "ok");
          return { empty: true, processed: processed, rounds: round };
        }
        if (r && r.error) {
          // 连续失败才停
          noProgress += 1;
          if (noProgress >= 5) {
            log(kind + " 连续失败，停止", "error");
            return { error: r.error, processed: processed, rounds: round };
          }
          await sleep(1000);
          continue;
        }
        if (r && r.ok) {
          processed += r.selected || 0;
          await sleep(800);
          if (empty()) {
            log(kind + " 已清空，共约 " + processed + " 条", "ok");
            return { empty: true, processed: processed, rounds: round };
          }
          // 无进展检测
          const now = selCount();
          if (lastSelected != null && now != null && now >= lastSelected) {
            noProgress += 1;
            if (noProgress >= 5) {
              log(kind + " 连续多轮无进展，停止（可能有权限/风控限制）", "warn");
              return { stopped: "no-progress", processed: processed, rounds: round, selected: now };
            }
          } else {
            noProgress = 0;
          }
          lastSelected = now;
          log(kind + " 仍有剩余（已选约 " + (now == null ? "?" : now) + "），继续下一轮");
          continue;
        }
        if (empty()) return { empty: true, processed: processed, rounds: round };
        noProgress += 1;
        if (noProgress >= 5) {
          log(kind + " 状态异常，停止", "warn");
          return { stopped: "unknown", processed: processed, rounds: round };
        }
      }
    }

    sh.getElementById("diag").addEventListener("click", function () {
      diagnose("manual", log);
      log("诊断已写入上方", "ok");
    });

    sh.getElementById("go").addEventListener("click", async function () {
      var live = sh.getElementById("live").checked;
      var targets = [];
      if (sh.getElementById("likes").checked) targets.push("likes");
      if (sh.getElementById("favs").checked) targets.push("favs");
      if (sh.getElementById("works").checked) targets.push("works");
      if (!targets.length) {
        log("请勾选目标", "warn");
        return;
      }
      if (live) {
        var a = prompt("不可逆清理。目标:" + targets.join(",") + "。输入确认清理继续");
        if ((a || "").trim() !== "确认清理") {
          log("已取消", "warn");
          return;
        }
      }
      log("开始 " + (live ? "LIVE" : "SAFE") + ": " + targets.join(","));
      diagnose("start", log);
      for (var i = 0; i < targets.length; i++) {
        log("==== " + targets[i] + " ====");
        await runKindUntilDone(targets[i], live);
        await sleep(1000);
      }
      log("==== 完成 ====", "ok");
    });

    log("面板已就绪 v1.6.2（喜欢页慢加载会等待）。请先点「诊断当前页面」");
  }

  function whenReady() {
    if (document.body) ensurePanel();
    else document.addEventListener("DOMContentLoaded", ensurePanel, { once: true });
    setInterval(function () {
      if (document.body && !document.getElementById("__dyCleanTM")) ensurePanel();
    }, 2000);
  }
  whenReady();
})();
