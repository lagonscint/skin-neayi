function isCompatible(ua) { return !!((function() { 'use strict'; return !this && Function.prototype.bind && window.JSON; }()) && 'querySelector' in document && 'localStorage' in window && 'addEventListener' in window && !ua.match(/MSIE 10|NetFront|Opera Mini|S40OviBrowser|MeeGo|Android.+Glass|^Mozilla\/5\.0 .+ Gecko\/$|googleweblight|PLAYSTATION|PlayStation/)); }
if (!isCompatible(navigator.userAgent)) {
    document.documentElement.className = document.documentElement.className.replace(/(^|\s)client-js(\s|$)/, '$1client-nojs$2');
    while (window.NORLQ && NORLQ[0]) { NORLQ.shift()(); }
    NORLQ = { push: function(fn) { fn(); } };
    RLQ = { push: function() {} };
} else {
    if (window.performance && performance.mark) { performance.mark('mwStartup'); }(function() {
        'use strict';
        var mw, StringSet, log, hasOwn = Object.hasOwnProperty;

        function fnv132(str) {
            var hash = 0x811C9DC5,
                i = 0;
            for (; i < str.length; i++) {
                hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
                hash ^= str.charCodeAt(i);
            }
            hash = (hash >>> 0).toString(36).slice(0, 5);
            while (hash.length < 5) { hash = '0' + hash; }
            return hash;
        }

        function defineFallbacks() { StringSet = window.Set || function() { var set = Object.create(null); return { add: function(value) { set[value] = !0; }, has: function(value) { return value in set; } }; }; }

        function setGlobalMapValue(map, key, value) {
            map.values[key] = value;
            log.deprecate(window, key, value, map === mw.config && 'Use mw.config instead.');
        }

        function logError(topic, data) {
            var msg, e = data.exception,
                console = window.console;
            if (console && console.log) {
                msg = (e ? 'Exception' : 'Error') + ' in ' + data.source + (data.module ? ' in module ' + data.module : '') + (e ? ':' : '.');
                console.log(msg);
                if (e && console.warn) { console.warn(e); }
            }
        }

        function Map(global) { this.values = Object.create(null); if (global === true) { this.set = function(selection, value) { var s; if (arguments.length > 1) { if (typeof selection === 'string') { setGlobalMapValue(this, selection, value); return true; } } else if (typeof selection === 'object') { for (s in selection) { setGlobalMapValue(this, s, selection[s]); } return true; } return false; }; } }
        Map.prototype = {
            constructor: Map,
            get: function(selection, fallback) {
                var
                    results, i;
                fallback = arguments.length > 1 ? fallback : null;
                if (Array.isArray(selection)) { results = {}; for (i = 0; i < selection.length; i++) { if (typeof selection[i] === 'string') { results[selection[i]] = selection[i] in this.values ? this.values[selection[i]] : fallback; } } return results; }
                if (typeof selection === 'string') { return selection in this.values ? this.values[selection] : fallback; }
                if (selection === undefined) { results = {}; for (i in this.values) { results[i] = this.values[i]; } return results; }
                return fallback;
            },
            set: function(selection, value) { var s; if (arguments.length > 1) { if (typeof selection === 'string') { this.values[selection] = value; return true; } } else if (typeof selection === 'object') { for (s in selection) { this.values[s] = selection[s]; } return true; } return false; },
            exists: function(selection) { var i; if (Array.isArray(selection)) { for (i = 0; i < selection.length; i++) { if (typeof selection[i] !== 'string' || !(selection[i] in this.values)) { return false; } } return true; } return typeof selection === 'string' && selection in this.values; }
        };
        defineFallbacks();
        log =
            (function() {
                var log = function() {},
                    console = window.console;
                log.warn = console && console.warn ? Function.prototype.bind.call(console.warn, console) : function() {};
                log.error = console && console.error ? Function.prototype.bind.call(console.error, console) : function() {};
                log.deprecate = function(obj, key, val, msg, logName) {
                    var stacks;

                    function maybeLog() {
                        var name = logName || key,
                            trace = new Error().stack;
                        if (!stacks) { stacks = new StringSet(); }
                        if (!stacks.has(trace)) {
                            stacks.add(trace);
                            if (logName || obj === window) { mw.track('mw.deprecate', name); }
                            mw.log.warn('Use of "' + name + '" is deprecated.' + (msg ? ' ' + msg : ''));
                        }
                    }
                    try {
                        Object.defineProperty(obj, key, {
                            configurable: !0,
                            enumerable: !0,
                            get: function() { maybeLog(); return val; },
                            set: function(newVal) {
                                maybeLog();
                                val = newVal;
                            }
                        });
                    } catch (err) { obj[key] = val; }
                };
                return log;
            }());
        mw = {
            redefineFallbacksForTest: window.QUnit && defineFallbacks,
            now: function() {
                var perf = window.performance,
                    navStart = perf && perf.timing && perf.timing.navigationStart;
                mw.now = navStart && perf.now ? function() { return navStart + perf.now(); } :
                    Date.now;
                return mw.now();
            },
            trackQueue: [],
            track: function(topic, data) { mw.trackQueue.push({ topic: topic, timeStamp: mw.now(), data: data }); },
            trackError: function(topic, data) {
                mw.track(topic, data);
                logError(topic, data);
            },
            Map: Map,
            config: new Map(true),
            messages: new Map(),
            templates: new Map(),
            log: log,
            loader: (function() {
                var registry = Object.create(null),
                    sources = Object.create(null),
                    handlingPendingRequests = !1,
                    pendingRequests = [],
                    queue = [],
                    jobs = [],
                    willPropagate = !1,
                    errorModules = [],
                    baseModules = ["jquery", "mediawiki.base"],
                    marker = document.querySelector('meta[name="ResourceLoaderDynamicStyles"]'),
                    nextCssBuffer, rAF = window.requestAnimationFrame || setTimeout;

                function newStyleTag(text, nextNode) {
                    var el = document.createElement('style');
                    el.appendChild(document.createTextNode(text));
                    if (nextNode && nextNode.parentNode) { nextNode.parentNode.insertBefore(el, nextNode); } else { document.head.appendChild(el); }
                    return el;
                }

                function flushCssBuffer(cssBuffer) {
                    var i;
                    cssBuffer.active = !1;
                    newStyleTag(cssBuffer.cssText, marker);
                    for (i = 0; i <
                        cssBuffer.callbacks.length; i++) { cssBuffer.callbacks[i](); }
                }

                function addEmbeddedCSS(cssText, callback) {
                    if (!nextCssBuffer || nextCssBuffer.active === false || cssText.slice(0, '@import'.length) === '@import') { nextCssBuffer = { cssText: '', callbacks: [], active: null }; }
                    nextCssBuffer.cssText += '\n' + cssText;
                    nextCssBuffer.callbacks.push(callback);
                    if (nextCssBuffer.active === null) {
                        nextCssBuffer.active = !0;
                        rAF(flushCssBuffer.bind(null, nextCssBuffer));
                    }
                }

                function getCombinedVersion(modules) { var hashes = modules.reduce(function(result, module) { return result + registry[module].version; }, ''); return fnv132(hashes); }

                function allReady(modules) { var i = 0; for (; i < modules.length; i++) { if (mw.loader.getState(modules[i]) !== 'ready') { return false; } } return true; }

                function allWithImplicitReady(module) { return allReady(registry[module].dependencies) && (baseModules.indexOf(module) !== -1 || allReady(baseModules)); }

                function anyFailed(modules) {
                    var state, i = 0;
                    for (; i < modules.length; i++) {
                        state = mw.loader.getState(modules[i]);
                        if (state === 'error' || state ===
                            'missing') { return true; }
                    }
                    return false;
                }

                function doPropagation() {
                    var errorModule, baseModuleError, module, i, failed, job, didPropagate = !0;
                    do {
                        didPropagate = !1;
                        while (errorModules.length) {
                            errorModule = errorModules.shift();
                            baseModuleError = baseModules.indexOf(errorModule) !== -1;
                            for (module in registry) {
                                if (registry[module].state !== 'error' && registry[module].state !== 'missing') {
                                    if (baseModuleError && baseModules.indexOf(module) === -1) {
                                        registry[module].state = 'error';
                                        didPropagate = !0;
                                    } else if (registry[module].dependencies.indexOf(errorModule) !== -1) {
                                        registry[module].state = 'error';
                                        errorModules.push(module);
                                        didPropagate = !0;
                                    }
                                }
                            }
                        }
                        for (module in registry) {
                            if (registry[module].state === 'loaded' && allWithImplicitReady(module)) {
                                execute(module);
                                didPropagate = !0;
                            }
                        }
                        for (i = 0; i < jobs.length; i++) {
                            job = jobs[i];
                            failed = anyFailed(job.dependencies);
                            if (failed || allReady(job.dependencies)) {
                                jobs.splice(i, 1);
                                i -= 1;
                                try {
                                    if (failed && job.error) { job.error(new Error('Failed dependencies'), job.dependencies); } else if (!failed && job.ready) {
                                        job.
                                        ready();
                                    }
                                } catch (e) { mw.trackError('resourceloader.exception', { exception: e, source: 'load-callback' }); }
                                didPropagate = !0;
                            }
                        }
                    } while (didPropagate);
                    willPropagate = !1;
                }

                function requestPropagation() {
                    if (willPropagate) { return; }
                    willPropagate = !0;
                    mw.requestIdleCallback(doPropagation, { timeout: 1 });
                }

                function setAndPropagate(module, state) {
                    registry[module].state = state;
                    if (state === 'loaded' || state === 'ready' || state === 'error' || state === 'missing') {
                        if (state === 'ready') { mw.loader.store.add(module); } else if (state === 'error' || state === 'missing') { errorModules.push(module); }
                        requestPropagation();
                    }
                }

                function sortDependencies(module, resolved, unresolved) {
                    var i, skip, deps;
                    if (!(module in registry)) { throw new Error('Unknown module: ' + module); }
                    if (typeof registry[module].skip === 'string') {
                        skip = (new Function(registry[module].skip)());
                        registry[module].skip = !!skip;
                        if (skip) {
                            registry[module].dependencies = [];
                            setAndPropagate(module, 'ready');
                            return;
                        }
                    }
                    if (!unresolved) { unresolved = new StringSet(); }
                    deps = registry[module].dependencies;
                    unresolved.add(module);
                    for (i = 0; i < deps.length; i++) {
                        if (resolved.indexOf(deps[i]) === -1) {
                            if (unresolved.has(deps[i])) { throw new Error('Circular reference detected: ' + module + ' -> ' + deps[i]); }
                            sortDependencies(deps[i], resolved, unresolved);
                        }
                    }
                    resolved.push(module);
                }

                function resolve(modules) {
                    var resolved = baseModules.slice(),
                        i = 0;
                    for (; i < modules.length; i++) { sortDependencies(modules[i], resolved); }
                    return resolved;
                }

                function resolveStubbornly(modules) {
                    var saved, resolved = baseModules.slice(),
                        i = 0;
                    for (; i < modules.length; i++) {
                        saved = resolved.slice();
                        try { sortDependencies(modules[i], resolved); } catch (err) {
                            resolved = saved;
                            mw.log.warn('Skipped unresolvable module ' + modules[i]);
                            if (modules[i] in registry) { mw.trackError('resourceloader.exception', { exception: err, source: 'resolve' }); }
                        }
                    }
                    return resolved;
                }

                function resolveRelativePath(relativePath, basePath) {
                    var prefixes, prefix, baseDirParts, relParts = relativePath.match(/^((?:\.\.?\/)+)(.*)$/);
                    if (!relParts) { return null; }
                    baseDirParts = basePath.split('/');
                    baseDirParts.pop();
                    prefixes
                        = relParts[1].split('/');
                    prefixes.pop();
                    while ((prefix = prefixes.pop()) !== undefined) { if (prefix === '..') { baseDirParts.pop(); } }
                    return (baseDirParts.length ? baseDirParts.join('/') + '/' : '') + relParts[2];
                }

                function makeRequireFunction(moduleObj, basePath) {
                    return function require(moduleName) {
                        var fileName, fileContent, result, moduleParam, scriptFiles = moduleObj.script.files;
                        fileName = resolveRelativePath(moduleName, basePath);
                        if (fileName === null) { return mw.loader.require(moduleName); }
                        if (!hasOwn.call(scriptFiles, fileName)) { throw new Error('Cannot require undefined file ' + fileName); }
                        if (hasOwn.call(moduleObj.packageExports, fileName)) { return moduleObj.packageExports[fileName]; }
                        fileContent = scriptFiles[fileName];
                        if (typeof fileContent === 'function') {
                            moduleParam = { exports: {} };
                            fileContent(makeRequireFunction(moduleObj, fileName), moduleParam);
                            result = moduleParam.exports;
                        } else { result = fileContent; }
                        moduleObj.packageExports[fileName] = result;
                        return result;
                    };
                }

                function addScript(src, callback) {
                    var script = document.createElement(
                        'script');
                    script.src = src;
                    script.onload = script.onerror = function() {
                        if (script.parentNode) { script.parentNode.removeChild(script); }
                        if (callback) {
                            callback();
                            callback = null;
                        }
                    };
                    document.head.appendChild(script);
                }

                function queueModuleScript(src, moduleName, callback) {
                    pendingRequests.push(function() {
                        if (moduleName !== 'jquery') {
                            window.require = mw.loader.require;
                            window.module = registry[moduleName].module;
                        }
                        addScript(src, function() {
                            delete window.module;
                            callback();
                            if (pendingRequests[0]) { pendingRequests.shift()(); } else { handlingPendingRequests = !1; }
                        });
                    });
                    if (!handlingPendingRequests && pendingRequests[0]) {
                        handlingPendingRequests = !0;
                        pendingRequests.shift()();
                    }
                }

                function addLink(url, media, nextNode) {
                    var el = document.createElement('link');
                    el.rel = 'stylesheet';
                    if (media && media !== 'all') { el.media = media; }
                    el.href = url;
                    if (nextNode && nextNode.parentNode) { nextNode.parentNode.insertBefore(el, nextNode); } else { document.head.appendChild(el); }
                }

                function domEval(code) {
                    var script = document.createElement('script');
                    if (mw.config.get(
                            'wgCSPNonce') !== false) { script.nonce = mw.config.get('wgCSPNonce'); }
                    script.text = code;
                    document.head.appendChild(script);
                    script.parentNode.removeChild(script);
                }

                function enqueue(dependencies, ready, error) {
                    if (allReady(dependencies)) { if (ready !== undefined) { ready(); } return; }
                    if (anyFailed(dependencies)) { if (error !== undefined) { error(new Error('One or more dependencies failed to load'), dependencies); } return; }
                    if (ready !== undefined || error !== undefined) { jobs.push({ dependencies: dependencies.filter(function(module) { var state = registry[module].state; return state === 'registered' || state === 'loaded' || state === 'loading' || state === 'executing'; }), ready: ready, error: error }); }
                    dependencies.forEach(function(module) { if (registry[module].state === 'registered' && queue.indexOf(module) === -1) { queue.push(module); } });
                    mw.loader.work();
                }

                function execute(module) {
                    var key, value, media, i, urls, cssHandle, siteDeps, siteDepErr, runScript, cssPending = 0;
                    if (registry[module].state !== 'loaded') {
                        throw new Error('Module in state "' + registry[module].state +
                            '" may not execute: ' + module);
                    }
                    registry[module].state = 'executing';
                    runScript = function() {
                        var script, markModuleReady, nestedAddScript, mainScript;
                        script = registry[module].script;
                        markModuleReady = function() { setAndPropagate(module, 'ready'); };
                        nestedAddScript = function(arr, callback, i) {
                            if (i >= arr.length) { callback(); return; }
                            queueModuleScript(arr[i], module, function() { nestedAddScript(arr, callback, i + 1); });
                        };
                        try {
                            if (Array.isArray(script)) { nestedAddScript(script, markModuleReady, 0); } else if (typeof script === 'function' || (typeof script === 'object' && script !== null)) {
                                if (typeof script === 'function') { if (module === 'jquery') { script(); } else { script(window.$, window.$, mw.loader.require, registry[module].module); } } else {
                                    mainScript = script.files[script.main];
                                    if (typeof mainScript !== 'function') { throw new Error('Main file in module ' + module + ' must be a function'); }
                                    mainScript(makeRequireFunction(registry[module], script.main), registry[module].module);
                                }
                                markModuleReady();
                            } else if (typeof script === 'string') {
                                domEval(script);
                                markModuleReady();
                            } else { markModuleReady(); }
                        } catch (e) {
                            setAndPropagate(module, 'error');
                            mw.trackError('resourceloader.exception', { exception: e, module: module, source: 'module-execute' });
                        }
                    };
                    if (registry[module].messages) { mw.messages.set(registry[module].messages); }
                    if (registry[module].templates) { mw.templates.set(module, registry[module].templates); }
                    cssHandle = function() {
                        cssPending++;
                        return function() {
                            var runScriptCopy;
                            cssPending--;
                            if (cssPending === 0) {
                                runScriptCopy = runScript;
                                runScript = undefined;
                                runScriptCopy();
                            }
                        };
                    };
                    if (registry[module].style) {
                        for (key in registry[module].style) {
                            value = registry[module].style[key];
                            media = undefined;
                            if (key !== 'url' && key !== 'css') {
                                if (typeof value === 'string') { addEmbeddedCSS(value, cssHandle()); } else {
                                    media = key;
                                    key = 'bc-url';
                                }
                            }
                            if (Array.isArray(value)) { for (i = 0; i < value.length; i++) { if (key === 'bc-url') { addLink(value[i], media, marker); } else if (key === 'css') { addEmbeddedCSS(value[i], cssHandle()); } } } else if (typeof value === 'object') {
                                for (media in value) {
                                    urls = value[media];
                                    for (i = 0; i < urls.length; i++) { addLink(urls[i], media, marker); }
                                }
                            }
                        }
                    }
                    if (module === 'user') {
                        try { siteDeps = resolve(['site']); } catch (e) {
                            siteDepErr = e;
                            runScript();
                        }
                        if (siteDepErr === undefined) { enqueue(siteDeps, runScript, runScript); }
                    } else if (cssPending === 0) { runScript(); }
                }

                function sortQuery(o) {
                    var key, sorted = {},
                        a = [];
                    for (key in o) { a.push(key); }
                    a.sort();
                    for (key = 0; key < a.length; key++) { sorted[a[key]] = o[a[key]]; }
                    return sorted;
                }

                function buildModulesString(moduleMap) {
                    var p, prefix, str = [],
                        list = [];

                    function restore(suffix) { return p + suffix; }
                    for (prefix in moduleMap) {
                        p = prefix === '' ? '' : prefix + '.';
                        str.push(p + moduleMap[prefix].join(','));
                        list.push.apply(list, moduleMap[prefix].map(restore));
                    }
                    return { str: str.join('|'), list: list };
                }

                function resolveIndexedDependencies(modules) {
                    var i, j, deps;

                    function resolveIndex(dep) { return typeof dep === 'number' ? modules[dep][0] : dep; }
                    for (i = 0; i < modules.length; i++) { deps = modules[i][2]; if (deps) { for (j = 0; j < deps.length; j++) { deps[j] = resolveIndex(deps[j]); } } }
                }

                function makeQueryString(params) {
                    return Object.keys(params).map(function(key) { return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]); }).join('&');
                }

                function batchRequest(batch) {
                    var reqBase, splits, b, bSource, bGroup, source, group, i, modules, sourceLoadScript, currReqBase, currReqBaseLength, moduleMap, currReqModules, l, lastDotIndex, prefix, suffix, bytesAdded;

                    function doRequest() {
                        var query = Object.create(currReqBase),
                            packed = buildModulesString(moduleMap);
                        query.modules = packed.str;
                        query.version = getCombinedVersion(packed.list);
                        query = sortQuery(query);
                        addScript(sourceLoadScript + '?' + makeQueryString(query));
                    }
                    if (!batch.length) { return; }
                    batch.sort();
                    reqBase = { "lang": "fr", "skin": "chameleon" };
                    splits = Object.create(null);
                    for (b = 0; b < batch.length; b++) {
                        bSource = registry[batch[b]].source;
                        bGroup = registry[batch[b]].group;
                        if (!splits[bSource]) { splits[bSource] = Object.create(null); }
                        if (!splits[bSource][bGroup]) { splits[bSource][bGroup] = []; }
                        splits[bSource][bGroup].push(batch[b]);
                    }
                    for (source in splits) {
                        sourceLoadScript = sources[source];
                        for (group in splits[source]) {
                            modules = splits[source][group];
                            currReqBase = Object.create(reqBase);
                            if (group === 0 && mw.config.get('wgUserName') !== null) { currReqBase.user = mw.config.get('wgUserName'); }
                            currReqBaseLength = makeQueryString(currReqBase).length + 23;
                            l = currReqBaseLength;
                            moduleMap = Object.create(null);
                            currReqModules = [];
                            for (i = 0; i < modules.length; i++) {
                                lastDotIndex = modules[i].lastIndexOf('.');
                                prefix = modules[i].substr(0, lastDotIndex);
                                suffix = modules[i].slice(lastDotIndex + 1);
                                bytesAdded = moduleMap[prefix] ? suffix.length + 3 : modules[i].length + 3;
                                if (currReqModules.length && l + bytesAdded > mw.loader.maxQueryLength) {
                                    doRequest();
                                    l = currReqBaseLength;
                                    moduleMap = Object.create(null);
                                    currReqModules = [];
                                    mw.track('resourceloader.splitRequest', { maxQueryLength: mw.loader.maxQueryLength });
                                }
                                if (!moduleMap[prefix]) { moduleMap[prefix] = []; }
                                l += bytesAdded;
                                moduleMap[prefix].push(suffix);
                                currReqModules.push(modules[i]);
                            }
                            if (currReqModules.length) { doRequest(); }
                        }
                    }
                }

                function asyncEval(implementations, cb) {
                    if (!implementations.length) { return; }
                    mw.requestIdleCallback(function() {
                        try {
                            domEval(
                                implementations.join(';'));
                        } catch (err) { cb(err); }
                    });
                }

                function getModuleKey(module) { return module in registry ? (module + '@' + registry[module].version) : null; }

                function splitModuleKey(key) { var index = key.indexOf('@'); if (index === -1) { return { name: key, version: '' }; } return { name: key.slice(0, index), version: key.slice(index + 1) }; }

                function registerOne(module, version, dependencies, group, source, skip) {
                    if (module in registry) { throw new Error('module already registered: ' + module); }
                    registry[module] = { module: { exports: {} }, packageExports: {}, version: String(version || ''), dependencies: dependencies || [], group: typeof group === 'undefined' ? null : group, source: typeof source === 'string' ? source : 'local', state: 'registered', skip: typeof skip === 'string' ? skip : null };
                }
                return {
                    moduleRegistry: registry,
                    maxQueryLength: 2000,
                    addStyleTag: newStyleTag,
                    enqueue: enqueue,
                    resolve: resolve,
                    work: function() {
                        var implementations, sourceModules, batch = [],
                            q = 0;
                        for (; q < queue.length; q++) {
                            if (queue[q] in registry && registry[queue[q]].state === 'registered') {
                                if (batch.indexOf(
                                        queue[q]) === -1) {
                                    batch.push(queue[q]);
                                    registry[queue[q]].state = 'loading';
                                }
                            }
                        }
                        queue = [];
                        if (!batch.length) { return; }
                        mw.loader.store.init();
                        if (mw.loader.store.enabled) {
                            implementations = [];
                            sourceModules = [];
                            batch = batch.filter(function(module) {
                                var implementation = mw.loader.store.get(module);
                                if (implementation) {
                                    implementations.push(implementation);
                                    sourceModules.push(module);
                                    return false;
                                }
                                return true;
                            });
                            asyncEval(implementations, function(err) {
                                var failed;
                                mw.loader.store.stats.failed++;
                                mw.loader.store.clear();
                                mw.trackError('resourceloader.exception', { exception: err, source: 'store-eval' });
                                failed = sourceModules.filter(function(module) { return registry[module].state === 'loading'; });
                                batchRequest(failed);
                            });
                        }
                        batchRequest(batch);
                    },
                    addSource: function(ids) {
                        var id;
                        for (id in ids) {
                            if (id in sources) { throw new Error('source already registered: ' + id); }
                            sources[id] = ids[id];
                        }
                    },
                    register: function(modules) {
                        var i;
                        if (typeof modules === 'object') {
                            resolveIndexedDependencies(modules);
                            for (i = 0; i < modules.length; i++) {
                                registerOne.apply(
                                    null, modules[i]);
                            }
                        } else { registerOne.apply(null, arguments); }
                    },
                    implement: function(module, script, style, messages, templates) {
                        var split = splitModuleKey(module),
                            name = split.name,
                            version = split.version;
                        if (!(name in registry)) { mw.loader.register(name); }
                        if (registry[name].script !== undefined) { throw new Error('module already implemented: ' + name); }
                        if (version) { registry[name].version = version; }
                        registry[name].script = script || null;
                        registry[name].style = style || null;
                        registry[name].messages = messages || null;
                        registry[name].templates = templates || null;
                        if (registry[name].state !== 'error' && registry[name].state !== 'missing') { setAndPropagate(name, 'loaded'); }
                    },
                    load: function(modules, type) {
                        if (typeof modules === 'string' && /^(https?:)?\/?\//.test(modules)) { if (type === 'text/css') { addLink(modules); } else if (type === 'text/javascript' || type === undefined) { addScript(modules); } else { throw new Error('Invalid type ' + type); } } else {
                            modules = typeof modules === 'string' ? [modules] : modules;
                            enqueue(resolveStubbornly(modules), undefined, undefined);
                        }
                    },
                    state: function(states) {
                        var module, state;
                        for (module in states) {
                            state = states[module];
                            if (!(module in registry)) { mw.loader.register(module); }
                            setAndPropagate(module, state);
                        }
                    },
                    getVersion: function(module) { return module in registry ? registry[module].version : null; },
                    getState: function(module) { return module in registry ? registry[module].state : null; },
                    getModuleNames: function() { return Object.keys(registry); },
                    require: function(moduleName) { var state = mw.loader.getState(moduleName); if (state !== 'ready') { throw new Error('Module "' + moduleName + '" is not loaded'); } return registry[moduleName].module.exports; },
                    store: {
                        enabled: null,
                        MODULE_SIZE_MAX: 1e5,
                        items: {},
                        queue: [],
                        stats: { hits: 0, misses: 0, expired: 0, failed: 0 },
                        toJSON: function() { return { items: mw.loader.store.items, vary: mw.loader.store.vary, asOf: Math.ceil(Date.now() / 1e7) }; },
                        key: "MediaWikiModuleStore:wiki_prod",
                        vary: "chameleon:1:fr",
                        init: function() {
                            var raw, data;
                            if (this.enabled !== null) { return; }
                            if (!true || /Firefox/.test(navigator.userAgent)) {
                                this.clear();
                                this.enabled = !1;
                                return;
                            }
                            try {
                                raw = localStorage.getItem(this.key);
                                this.enabled = !0;
                                data = JSON.parse(raw);
                                if (data && typeof data.items === 'object' && data.vary === this.vary && Date.now() < (data.asOf * 1e7) + 259e7) { this.items = data.items; return; }
                            } catch (e) {}
                            if (raw === undefined) { this.enabled = !1; }
                        },
                        get: function(module) {
                            var key;
                            if (!this.enabled) { return false; }
                            key = getModuleKey(module);
                            if (key in this.items) { this.stats.hits++; return this.items[key]; }
                            this.stats.misses++;
                            return false;
                        },
                        add: function(module) {
                            if (!this.enabled) { return; }
                            this.queue.push(module);
                            this.requestUpdate();
                        },
                        set: function(module) {
                            var key, args, src, encodedScript, descriptor = mw.loader.moduleRegistry[module];
                            key = getModuleKey(module);
                            if (key in this.items || !descriptor || descriptor.state !== 'ready' || !descriptor.version || descriptor.group === 1 || descriptor.group === 0 || [descriptor.script, descriptor.style, descriptor.messages, descriptor.templates].indexOf(undefined) !== -1) { return; }
                            try {
                                if (typeof descriptor.script === 'function') { encodedScript = String(descriptor.script); } else if (
                                    typeof descriptor.script === 'object' && descriptor.script && !Array.isArray(descriptor.script)) { encodedScript = '{' + 'main:' + JSON.stringify(descriptor.script.main) + ',' + 'files:{' + Object.keys(descriptor.script.files).map(function(key) { var value = descriptor.script.files[key]; return JSON.stringify(key) + ':' + (typeof value === 'function' ? value : JSON.stringify(value)); }).join(',') + '}}'; } else { encodedScript = JSON.stringify(descriptor.script); }
                                args = [JSON.stringify(key), encodedScript, JSON.stringify(descriptor.style), JSON.stringify(descriptor.messages), JSON.stringify(descriptor.templates)];
                            } catch (e) { mw.trackError('resourceloader.exception', { exception: e, source: 'store-localstorage-json' }); return; }
                            src = 'mw.loader.implement(' + args.join(',') + ');';
                            if (src.length > this.MODULE_SIZE_MAX) { return; }
                            this.items[key] = src;
                        },
                        prune: function() {
                            var key, module;
                            for (key in this.items) {
                                module = key.slice(0, key.indexOf('@'));
                                if (getModuleKey(module) !== key) {
                                    this.stats.expired++;
                                    delete this.items[key];
                                } else if (this.items[key].length > this.MODULE_SIZE_MAX) { delete this.items[key]; }
                            }
                        },
                        clear: function() { this.items = {}; try { localStorage.removeItem(this.key); } catch (e) {} },
                        requestUpdate: (function() {
                            var hasPendingWrites = !1;

                            function flushWrites() {
                                var data, key;
                                mw.loader.store.prune();
                                while (mw.loader.store.queue.length) { mw.loader.store.set(mw.loader.store.queue.shift()); }
                                key = mw.loader.store.key;
                                try {
                                    localStorage.removeItem(key);
                                    data = JSON.stringify(mw.loader.store);
                                    localStorage.setItem(key, data);
                                } catch (e) { mw.trackError('resourceloader.exception', { exception: e, source: 'store-localstorage-update' }); }
                                hasPendingWrites = !1;
                            }

                            function onTimeout() { mw.requestIdleCallback(flushWrites); }
                            return function() {
                                if (!hasPendingWrites) {
                                    hasPendingWrites = !0;
                                    setTimeout(onTimeout, 2000);
                                }
                            };
                        }())
                    }
                };
            }())
        };
        window.mw = window.mediaWiki = mw;
    }());
    mw.requestIdleCallbackInternal = function(callback) {
        setTimeout(function() {
            var start = mw.now();
            callback({ didTimeout: !1, timeRemaining: function() { return Math.max(0, 50 - (mw.now() - start)); } });
        }, 1);
    };
    mw.requestIdleCallback = window.
    requestIdleCallback ? window.requestIdleCallback.bind(window) : mw.requestIdleCallbackInternal;
    (function() {
        mw.loader.addSource({ "local": "/load.php" });
        mw.loader.register([
            ["site", "ewz5x", [1]],
            ["site.styles", "hbtav", [], 2],
            ["noscript", "r22l1", [], 3],
            ["filepage", "1yjvh"],
            ["user", "k1cuu", [], 0],
            ["user.styles", "8fimp", [], 0],
            ["user.defaults", "16h32"],
            ["user.options", "1dpod", [6], 1],
            ["user.tokens", "tffin", [], 1],
            ["mediawiki.skinning.elements", "i20eb"],
            ["mediawiki.skinning.content", "1428n"],
            ["mediawiki.skinning.interface", "101qj"],
            ["jquery.makeCollapsible.styles", "loznk"],
            ["mediawiki.skinning.content.parsoid", "1obf8"],
            ["mediawiki.skinning.content.externallinks", "n59yq"],
            ["jquery", "1noll"],
            ["mediawiki.base", "uupor", [15]],
            ["jquery.chosen", "i3rpq"],
            ["jquery.client", "cwc6t"],
            ["jquery.color", "z90uj"],
            ["jquery.confirmable", "ho4ti", [144]],
            ["jquery.cookie", "1fdv0"],
            ["jquery.form", "1h25e"],
            ["jquery.fullscreen", "1n6ha"],
            ["jquery.getAttrs", "8wtj2"],
            ["jquery.highlightText", "57m83", [116]],
            ["jquery.hoverIntent",
                "dl80b"
            ],
            ["jquery.i18n", "48y7o", [143]],
            ["jquery.lengthLimit", "wuhte", [99]],
            ["jquery.makeCollapsible", "4r69r", [12]],
            ["jquery.mw-jump", "ykc4y"],
            ["jquery.spinner", "dtz12"],
            ["jquery.jStorage", "bl5li"],
            ["jquery.suggestions", "1jf1r", [25]],
            ["jquery.tabIndex", "240we"],
            ["jquery.tablesorter", "l1uzp", [36, 145, 116]],
            ["jquery.tablesorter.styles", "11jrx"],
            ["jquery.textSelection", "1fsnd", [18]],
            ["jquery.throttle-debounce", "19vxv"],
            ["jquery.tipsy", "1k6qg"],
            ["jquery.ui", "d71gt"],
            ["jquery.ui.core", "1yeum", [40]],
            ["jquery.ui.core.styles", "3m146", [40]],
            ["jquery.ui.accordion", "1n2be", [40]],
            ["jquery.ui.autocomplete", "1n2be", [40]],
            ["jquery.ui.button", "1n2be", [40]],
            ["jquery.ui.datepicker", "1n2be", [40]],
            ["jquery.ui.dialog", "1n2be", [40]],
            ["jquery.ui.draggable", "3m146", [40]],
            ["jquery.ui.droppable", "3m146", [40]],
            ["jquery.ui.menu", "1n2be", [40]],
            ["jquery.ui.mouse", "3m146", [40]],
            ["jquery.ui.position", "3m146", [40]],
            ["jquery.ui.progressbar", "1n2be", [40]],
            ["jquery.ui.resizable", "1n2be", [40]],
            ["jquery.ui.selectable",
                "1n2be", [40]
            ],
            ["jquery.ui.slider", "1n2be", [40]],
            ["jquery.ui.sortable", "3m146", [40]],
            ["jquery.ui.tabs", "1n2be", [40]],
            ["jquery.ui.tooltip", "1n2be", [40]],
            ["jquery.ui.widget", "3m146", [40]],
            ["jquery.effects.core", "3m146", [40]],
            ["jquery.effects.blind", "3m146", [40]],
            ["jquery.effects.clip", "3m146", [40]],
            ["jquery.effects.drop", "3m146", [40]],
            ["jquery.effects.highlight", "3m146", [40]],
            ["jquery.effects.scale", "3m146", [40]],
            ["jquery.effects.shake", "3m146", [40]],
            ["moment", "4pmxe", [141, 116]],
            ["mediawiki.template", "1oeb3"],
            ["mediawiki.template.mustache", "1o9pb", [69]],
            ["mediawiki.template.regexp", "1h7vj", [69]],
            ["mediawiki.apipretty", "effkh"],
            ["mediawiki.api", "nli0d", [104, 8]],
            ["mediawiki.content.json", "1hjzx"],
            ["mediawiki.confirmCloseWindow", "1mz1o"],
            ["mediawiki.debug", "dua2g", [235]],
            ["mediawiki.diff.styles", "9jcmt"],
            ["mediawiki.feedback", "1byq8", [92, 243]],
            ["mediawiki.feedlink", "8ne02"],
            ["mediawiki.filewarning", "uprj0", [235, 247]],
            ["mediawiki.ForeignApi", "11qqf", [82]],
            ["mediawiki.ForeignApi.core", "aehp7", [113, 73, 231]],
            ["mediawiki.helplink", "61960"],
            ["mediawiki.hlist", "1n4xj"],
            ["mediawiki.htmlform", "u5kce", [28, 116]],
            ["mediawiki.htmlform.checker", "xsnpo", [116]],
            ["mediawiki.htmlform.ooui", "mg7gm", [235]],
            ["mediawiki.htmlform.styles", "p95g8"],
            ["mediawiki.htmlform.ooui.styles", "1dbcd"],
            ["mediawiki.icon", "y7ox3"],
            ["mediawiki.inspect", "akok9", [99, 116]],
            ["mediawiki.messagePoster", "1pd1y", [81]],
            ["mediawiki.messagePoster.wikitext", "1enh7", [92]],
            ["mediawiki.notification", "gy13j", [116, 123]],
            ["mediawiki.notify", "1w9s9"],
            ["mediawiki.notification.convertmessagebox", "1lw8a", [94]],
            ["mediawiki.notification.convertmessagebox.styles", "1vzoz"],
            ["mediawiki.RegExp", "3m146", [116]],
            ["mediawiki.String", "152v5"],
            ["mediawiki.pager.tablePager", "1dzqj"],
            ["mediawiki.pulsatingdot", "c57kt"],
            ["mediawiki.searchSuggest", "bxtr2", [24, 33, 73, 7]],
            ["mediawiki.storage", "1r040"],
            ["mediawiki.Title", "z88dt", [99, 116]],
            ["mediawiki.Upload", "1vbta", [73]],
            ["mediawiki.ForeignUpload", "bibgt", [81, 105]],
            ["mediawiki.ForeignStructuredUpload",
                "9rqwv", [106]
            ],
            ["mediawiki.Upload.Dialog", "sao4a", [109]],
            ["mediawiki.Upload.BookletLayout", "hrhw3", [105, 144, 114, 227, 68, 238, 243, 248, 249]],
            ["mediawiki.ForeignStructuredUpload.BookletLayout", "1tg49", [107, 109, 148, 214, 208]],
            ["mediawiki.toc", "r9h9z", [120]],
            ["mediawiki.toc.styles", "1camp"],
            ["mediawiki.Uri", "m5gdo", [116, 71]],
            ["mediawiki.user", "1qvt5", [73, 103, 7]],
            ["mediawiki.userSuggest", "1jzro", [33, 73]],
            ["mediawiki.util", "1t4wt", [18]],
            ["mediawiki.viewport", "cme4d"],
            ["mediawiki.checkboxtoggle", "wxlop"],
            ["mediawiki.checkboxtoggle.styles", "le15l"],
            ["mediawiki.cookie", "z0p04", [21]],
            ["mediawiki.experiments", "17uc3"],
            ["mediawiki.editfont.styles", "qah9m"],
            ["mediawiki.visibleTimeout", "10o04"],
            ["mediawiki.action.delete", "11t2u", [28, 235]],
            ["mediawiki.action.delete.file", "1x8jz", [28, 235]],
            ["mediawiki.action.edit", "1v8i6", [37, 127, 73, 122, 210]],
            ["mediawiki.action.edit.styles", "1hi9a"],
            ["mediawiki.action.edit.collapsibleFooter", "1v7rr", [29, 90, 103]],
            ["mediawiki.action.edit.preview", "9fkje", [31, 37, 73, 77, 144,
                235
            ]],
            ["mediawiki.action.history", "1toq9", [29]],
            ["mediawiki.action.history.styles", "1vu5p"],
            ["mediawiki.action.view.dblClickEdit", "17s6h", [116, 7]],
            ["mediawiki.action.view.metadata", "1l2t2", [140]],
            ["mediawiki.action.view.categoryPage.styles", "1jj6n"],
            ["mediawiki.action.view.postEdit", "1at29", [144, 94]],
            ["mediawiki.action.view.redirect", "pp2yi", [18]],
            ["mediawiki.action.view.redirectPage", "nc8l8"],
            ["mediawiki.action.view.rightClickEdit", "151uj"],
            ["mediawiki.action.edit.editWarning", "15nti", [37, 75, 144]],
            ["mediawiki.action.view.filepage", "1foxu"],
            ["mediawiki.language", "6nur5", [142]],
            ["mediawiki.cldr", "tc5i3", [143]],
            ["mediawiki.libs.pluralruleparser", "zqfng"],
            ["mediawiki.jqueryMsg", "1dabt", [141, 116, 7]],
            ["mediawiki.language.months", "q0lpn", [141]],
            ["mediawiki.language.names", "1krlz", [141]],
            ["mediawiki.language.specialCharacters", "2fo2x", [141]],
            ["mediawiki.libs.jpegmeta", "1i7en"],
            ["mediawiki.page.gallery", "hs21z", [38, 150]],
            ["mediawiki.page.gallery.styles", "1r1cd"],
            [
                "mediawiki.page.gallery.slideshow", "t9dfm", [73, 238, 257, 259]
            ],
            ["mediawiki.page.ready", "tc5ua", [73, 95]],
            ["mediawiki.page.startup", "aw03i"],
            ["mediawiki.page.patrol.ajax", "1wj8h", [31, 73, 95]],
            ["mediawiki.page.watch.ajax", "52kxt", [73, 144, 95]],
            ["mediawiki.page.rollback.confirmation", "13ixb", [20]],
            ["mediawiki.page.image.pagination", "8wa7a", [31, 116]],
            ["mediawiki.rcfilters.filters.base.styles", "q5n2q"],
            ["mediawiki.rcfilters.highlightCircles.seenunseen.styles", "1ndat"],
            ["mediawiki.rcfilters.filters.dm", "mgygi", [113, 144, 114, 231]],
            ["mediawiki.rcfilters.filters.ui", "11wjg", [29, 160, 205, 244, 251, 253, 254, 255, 257, 258]],
            ["mediawiki.interface.helpers.styles", "w8soh"],
            ["mediawiki.special", "1skg4"],
            ["mediawiki.special.apisandbox", "5qhvz", [29, 144, 205, 211, 234, 249, 254]],
            ["mediawiki.special.block", "1cjlm", [85, 208, 222, 215, 223, 220, 249, 251]],
            ["mediawiki.misc-authed-ooui", "1vxt0", [87, 205, 210]],
            ["mediawiki.special.changeslist", "hbwyh"],
            ["mediawiki.special.changeslist.enhanced", "1ndfj"],
            [
                "mediawiki.special.changeslist.legend", "gw6nq"
            ],
            ["mediawiki.special.changeslist.legend.js", "1470q", [29, 120]],
            ["mediawiki.special.contributions", "1hnnd", [29, 144, 208, 234]],
            ["mediawiki.special.edittags", "1bonc", [17, 28]],
            ["mediawiki.special.import", "dgxxh"],
            ["mediawiki.special.preferences.ooui", "10lnv", [75, 122, 96, 103, 215]],
            ["mediawiki.special.preferences.styles.ooui", "1wpum"],
            ["mediawiki.special.recentchanges", "19055", [205]],
            ["mediawiki.special.revisionDelete", "1jub2", [28]],
            ["mediawiki.special.search", "6jqoz", [225]],
            ["mediawiki.special.search.commonsInterwikiWidget", "1enmw", [113, 73, 144]],
            ["mediawiki.special.search.interwikiwidget.styles", "sxszg"],
            ["mediawiki.special.search.styles", "1r72m"],
            ["mediawiki.special.undelete", "7h0x7", [205, 210]],
            ["mediawiki.special.unwatchedPages", "16u1d", [73, 95]],
            ["mediawiki.special.upload", "1gi14", [31, 73, 75, 144, 148, 163, 69]],
            ["mediawiki.special.userlogin.common.styles", "1vyvq"],
            ["mediawiki.special.userlogin.login.styles", "1elxo"],
            [
                "mediawiki.special.userlogin.signup.js", "1ayhu", [73, 86, 144]
            ],
            ["mediawiki.special.userlogin.signup.styles", "lxrpp"],
            ["mediawiki.special.userrights", "a7xlo", [28, 96]],
            ["mediawiki.special.watchlist", "1519b", [73, 144, 95, 235]],
            ["mediawiki.special.version", "1smky"],
            ["mediawiki.legacy.config", "1vtoa"],
            ["mediawiki.legacy.commonPrint", "15brr"],
            ["mediawiki.legacy.protect", "kiqh2", [28]],
            ["mediawiki.legacy.shared", "108jg"],
            ["mediawiki.legacy.oldshared", "mui2u"],
            ["mediawiki.ui", "12b29"],
            ["mediawiki.ui.checkbox", "1ho0b"],
            ["mediawiki.ui.radio", "1guc5"],
            ["mediawiki.ui.anchor", "u9wm9"],
            ["mediawiki.ui.button", "1dv63"],
            ["mediawiki.ui.input", "1vaq7"],
            ["mediawiki.ui.icon", "11esa"],
            ["mediawiki.ui.text", "1aioy"],
            ["mediawiki.widgets", "11lph", [73, 95, 206, 238, 248]],
            ["mediawiki.widgets.styles", "131vq"],
            ["mediawiki.widgets.AbandonEditDialog", "tb0x4", [243]],
            ["mediawiki.widgets.DateInputWidget", "sdhmc", [209, 68, 238, 259]],
            ["mediawiki.widgets.DateInputWidget.styles", "19j4q"],
            ["mediawiki.widgets.visibleLengthLimit",
                "67l0r", [28, 235]
            ],
            ["mediawiki.widgets.datetime", "1i5u7", [116, 235, 258, 259]],
            ["mediawiki.widgets.expiry", "7ex77", [211, 68, 238]],
            ["mediawiki.widgets.CheckMatrixWidget", "sxt8r", [235]],
            ["mediawiki.widgets.CategoryMultiselectWidget", "99t0l", [81, 238]],
            ["mediawiki.widgets.SelectWithInputWidget", "1imc7", [216, 238]],
            ["mediawiki.widgets.SelectWithInputWidget.styles", "1qp3e"],
            ["mediawiki.widgets.SizeFilterWidget", "88mce", [218, 238]],
            ["mediawiki.widgets.SizeFilterWidget.styles", "19orn"],
            ["mediawiki.widgets.MediaSearch", "2oegf", [81, 238]],
            ["mediawiki.widgets.UserInputWidget", "1fhyb", [73, 238]],
            ["mediawiki.widgets.UsersMultiselectWidget", "1kqry", [73, 238]],
            ["mediawiki.widgets.NamespacesMultiselectWidget", "xc61d", [238]],
            ["mediawiki.widgets.TitlesMultiselectWidget", "yatzl", [205]],
            ["mediawiki.widgets.TagMultiselectWidget.styles", "6z7jf"],
            ["mediawiki.widgets.SearchInputWidget", "eezpu", [102, 205, 254]],
            ["mediawiki.widgets.SearchInputWidget.styles", "6fckw"],
            ["mediawiki.widgets.StashedFileWidget", "13mm1", [73, 235]],
            ["easy-deflate.core", "8cvgz"],
            ["easy-deflate.deflate", "1sei9", [228]],
            ["easy-deflate.inflate", "1sjvi", [228]],
            ["oojs", "1czp8"],
            ["mediawiki.router", "10tac", [233]],
            ["oojs-router", "1meh8", [231]],
            ["oojs-ui", "3m146", [241, 238, 243]],
            ["oojs-ui-core", "6bvf0", [141, 231, 237, 236, 245]],
            ["oojs-ui-core.styles", "91es4"],
            ["oojs-ui-core.icons", "3926n"],
            ["oojs-ui-widgets", "cvytp", [235, 240]],
            ["oojs-ui-widgets.styles", "1hlj7"],
            ["oojs-ui-widgets.icons", "1uoix"],
            ["oojs-ui-toolbars", "1nqhp", [235, 242]],
            ["oojs-ui-toolbars.icons", "1933s"],
            ["oojs-ui-windows", "cssmu", [235, 244]],
            ["oojs-ui-windows.icons", "q1qq8"],
            ["oojs-ui.styles.indicators", "1296y"],
            ["oojs-ui.styles.icons-accessibility", "1tjla"],
            ["oojs-ui.styles.icons-alerts", "156w7"],
            ["oojs-ui.styles.icons-content", "b5gqk"],
            ["oojs-ui.styles.icons-editing-advanced", "1cpdx"],
            ["oojs-ui.styles.icons-editing-citation", "kumlz"],
            ["oojs-ui.styles.icons-editing-core", "1123n"],
            ["oojs-ui.styles.icons-editing-list", "1l99l"],
            ["oojs-ui.styles.icons-editing-styling", "3e59s"],
            [
                "oojs-ui.styles.icons-interactions", "i0cif"
            ],
            ["oojs-ui.styles.icons-layout", "4dbfn"],
            ["oojs-ui.styles.icons-location", "1dw8l"],
            ["oojs-ui.styles.icons-media", "ut2jv"],
            ["oojs-ui.styles.icons-moderation", "1c1r0"],
            ["oojs-ui.styles.icons-movement", "21o25"],
            ["oojs-ui.styles.icons-user", "1idbq"],
            ["oojs-ui.styles.icons-wikimedia", "id00p"],
            ["skins.monobook.styles", "1auia"],
            ["skins.monobook.responsive", "r6k07"],
            ["skins.monobook.mobile", "18an8", [116]],
            ["skins.timeless", "fvrn1"],
            ["skins.timeless.js", "xjojp", [34]],
            ["skins.timeless.mobile", "b70vy"],
            ["skins.vector.styles", "npt24"],
            ["skins.vector.styles.responsive", "1wctt"],
            ["skins.vector.js", "18dq1", [34, 116]],
            ["mmv", "1f7df", [19, 23, 38, 39, 113, 144, 276]],
            ["mmv.ui.ondemandshareddependencies", "1kni9", [271, 234]],
            ["mmv.ui.download.pane", "riuen", [197, 205, 272]],
            ["mmv.ui.reuse.shareembed", "15loa", [205, 272]],
            ["mmv.ui.tipsyDialog", "1pwmi", [271]],
            ["mmv.bootstrap", "be11j", [95, 201, 203, 278, 233]],
            ["mmv.bootstrap.autostart", "6inkm", [276]],
            ["mmv.head", "hyj42", [114]],
            [
                "ext.cargo.main", "163y2"
            ],
            ["ext.cargo.purge", "1ny7t"],
            ["ext.cargo.recreatedata", "2mc1h", [144, 235]],
            ["ext.cargo.maps", "eq2cx"],
            ["ext.cargo.calendar.jquery1", "ssd8l", [68]],
            ["ext.cargo.calendar.jquery3", "1cduv", [68]],
            ["ext.cargo.timelinebase", "18e9m"],
            ["ext.cargo.timeline", "t3z2d", [285]],
            ["ext.cargo.datatables", "1crqc"],
            ["ext.cargo.nvd3", "pc539"],
            ["ext.cargo.exhibit", "cws6m"],
            ["ext.cargo.slick", "3v9h6"],
            ["ext.scribunto.errors", "1uesq", [47]],
            ["ext.scribunto.logs", "hdhq7"],
            ["ext.scribunto.edit", "mpgdq", [31, 73]],
            ["ext.Question2Answer.script", "19gal"],
            ["ext.cirrus.serp", "1r8yo", [113]],
            ["ext.cirrus.explore-similar", "std9v", [73, 70]],
            ["ext.embedVideo", "1balh"],
            ["ext.embedVideo-evl", "t8xrn", [297, 73]],
            ["ext.embedVideo.styles", "p5zby"],
            ["ext.relatedArticles.cards", "dma1t", [301, 116, 231]],
            ["ext.relatedArticles.lib", "1lq2u"],
            ["ext.relatedArticles.readMore.gateway", "vbs1t", [231]],
            ["ext.relatedArticles.readMore.bootstrap", "1wza2", [302, 38, 113, 121, 114, 117]],
            ["ext.relatedArticles.readMore", "8r95c", [116]],
            [
                "ext.popups.images", "1q6bp"
            ],
            ["ext.popups", "r0nmu"],
            ["ext.popups.main", "rylq7", [305, 113, 121, 144, 201, 203, 114]],
            ["ext.cite.styles", "hqit7"],
            ["ext.cite.a11y", "1k59t"],
            ["ext.cite.ux-enhancements", "1nz9j"],
            ["ext.cite.style", "18kuq"],
            ["ext.carousel.js", "zy8it", [41]],
            ["ext.bootstrap.styles", "188gt"],
            ["ext.bootstrap.scripts", "4nqrr"],
            ["ext.bootstrap", "3m146", [314, 313]],
            ["skin.chameleon.sticky", "1j15n", [], 4],
            ["ext.cargo.drilldown", "o8b9q", [44, 45, 235]],
            ["ext.cargo.cargoquery", "pile4", [44, 87, 116]],
            ["zzz.ext.bootstrap.styles", "188gt"]
        ]);
        mw.config.set({
            "debug": !1,
            "skin": "chameleon",
            "stylepath": "/skins",
            "wgUrlProtocols": "bitcoin\\:|ftp\\:\\/\\/|ftps\\:\\/\\/|geo\\:|git\\:\\/\\/|gopher\\:\\/\\/|http\\:\\/\\/|https\\:\\/\\/|irc\\:\\/\\/|ircs\\:\\/\\/|magnet\\:|mailto\\:|mms\\:\\/\\/|news\\:|nntp\\:\\/\\/|redis\\:\\/\\/|sftp\\:\\/\\/|sip\\:|sips\\:|sms\\:|ssh\\:\\/\\/|svn\\:\\/\\/|tel\\:|telnet\\:\\/\\/|urn\\:|worldwind\\:\\/\\/|xmpp\\:|\\/\\/",
            "wgArticlePath": "/wiki/$1",
            "wgScriptPath": "",
            "wgScript": "/index.php",
            "wgSearchType": "CirrusSearch",
            "wgVariantArticlePath": !1,
            "wgActionPaths": {},
            "wgServer": "https://wiki.tripleperformance.fr",
            "wgServerName": "wiki.tripleperformance.fr",
            "wgUserLanguage": "fr",
            "wgContentLanguage": "fr",
            "wgTranslateNumerals": !0,
            "wgVersion": "1.34.1",
            "wgEnableAPI": !0,
            "wgEnableWriteAPI": !0,
            "wgFormattedNamespaces": { "-2": "Média", "-1": "Spécial", "0": "", "1": "Discussion", "2": "Utilisateur", "3": "Discussion utilisateur", "4": "Pratiques Agro-écologiques", "5": "Discussion Pratiques Agro-écologiques", "6": "Fichier", "7": "Discussion fichier", "8": "MediaWiki", "9": "Discussion MediaWiki", "10": "Modèle", "11": "Discussion modèle", "12": "Aide", "13": "Discussion aide", "14": "Catégorie", "15": "Discussion catégorie", "828": "Module", "829": "Discussion module" },
            "wgNamespaceIds": {
                "média": -2,
                "spécial": -1,
                "": 0,
                "discussion": 1,
                "utilisateur": 2,
                "discussion_utilisateur": 3,
                "pratiques_agro-écologiques": 4,
                "discussion_pratiques_agro-écologiques": 5,
                "fichier": 6,
                "discussion_fichier": 7,
                "mediawiki": 8,
                "discussion_mediawiki": 9,
                "modèle": 10,
                "discussion_modèle": 11,
                "aide": 12,
                "discussion_aide": 13,
                "catégorie": 14,
                "discussion_catégorie": 15,
                "module": 828,
                "discussion_module": 829,
                "discuter": 1,
                "discussion_image": 7,
                "utilisatrice": 2,
                "discussion_utilisatrice": 3,
                "image": 6,
                "image_talk": 7,
                "media": -2,
                "special": -1,
                "talk": 1,
                "user": 2,
                "user_talk": 3,
                "project": 4,
                "project_talk": 5,
                "file": 6,
                "file_talk": 7,
                "mediawiki_talk": 9,
                "template": 10,
                "template_talk": 11,
                "help": 12,
                "help_talk": 13,
                "category": 14,
                "category_talk": 15,
                "module_talk": 829
            },
            "wgContentNamespaces": [0],
            "wgSiteName": "Wiki Triple Performance",
            "wgDBname": "wiki_prod",
            "wgWikiID": "wiki_prod-hpwiki_",
            "wgExtraSignatureNamespaces": [],
            "wgExtensionAssetsPath": "/extensions",
            "wgCookiePrefix": "wiki_prod_hpwiki_",
            "wgCookieDomain": "",
            "wgCookiePath": "/",
            "wgCookieExpiration": 2592000,
            "wgCaseSensitiveNamespaces": [],
            "wgLegalTitleChars": " %!\"$\u0026'()*,\\-./0-9:;=?@A-Z\\\\\\^_`a-z~+\\u0080-\\uFFFF",
            "wgIllegalFileChars": ":/\\\\",
            "wgForeignUploadTargets": ["local"],
            "wgEnableUploads": !0,
            "wgCommentByteLimit": null,
            "wgCommentCodePointLimit": 500,
            "wgMultimediaViewer": { "infoLink": "https://mediawiki.org/wiki/Special:MyLanguage/Extension:Media_Viewer/About", "discussionLink": "https://mediawiki.org/wiki/Special:MyLanguage/Extension_talk:Media_Viewer/About", "helpLink": "https://mediawiki.org/wiki/Special:MyLanguage/Help:Extension:Media_Viewer", "useThumbnailGuessing": !1, "durationSamplingFactor": !1, "durationSamplingFactorLoggedin": !1, "networkPerformanceSamplingFactor": !1, "actionLoggingSamplingFactorMap": !1, "attributionSamplingFactor": !1, "dimensionSamplingFactor": !1, "imageQueryParameter": !1, "recordVirtualViewBeaconURI": !1, "tooltipDelay": 1000, "extensions": { "jpg": "default", "jpeg": "default", "gif": "default", "svg": "default", "png": "default", "tiff": "default", "tif": "default" } },
            "wgMediaViewer": !0,
            "cgDownArrowImage": "/extensions/Cargo/drilldown/resources/down-arrow.png",
            "cgRightArrowImage": "/extensions/Cargo/drilldown/resources/right-arrow.png",
            "wgCirrusSearchFeedbackLink": !1,
            "wgRelatedArticlesCardLimit": 3,
            "wgPopupsVirtualPageViews": !1,
            "wgPopupsGateway": "mwApiPlain",
            "wgPopupsEventLogging": !1,
            "wgPopupsRestGatewayEndpoint": "/api/rest_v1/page/summary/",
            "wgPopupsStatsvSamplingRate": 0,
            "wgCiteVisualEditorOtherGroup": !1,
            "wgCiteResponsiveReferences": !0
        });
        mw.config.set(window.RLCONF || {});
        mw.loader.state(window.RLSTATE || {});
        mw.loader.load(window.RLPAGEMODULES || []);
        RLQ = window.RLQ || [];
        RLQ.push = function(fn) { if (typeof fn === 'function') { fn(); } else { RLQ[RLQ.length] = fn; } };
        while (RLQ[0]) { RLQ.push(RLQ.shift()); }
        NORLQ = { push: function() {} };
    }());
}