// engine.worker.js
var require = function(name) { console.log('拦截require:', name); return {}; };

importScripts('pikafish.js');

let engine = null;
let readyResolve = null;

self.onmessage = async (e) => {
  const msg = e.data;
  
  if (msg.type === 'init') {
    try {
      const threads = msg.threads || 4;
      const hashSize = msg.hash || 512;
      
      self.postMessage({type: 'log', message: '下载NNUE...'});
      const resp = await fetch('pikafish.data');
      const nnue = await resp.arrayBuffer();
      self.postMessage({type: 'log', message: 'NNUE加载完成: ' + nnue.byteLength});
      
      self.postMessage({type: 'log', message: '开始初始化wasm...'});
      
      engine = await Pikafish({
        nnueBuffer: nnue,
        onReceiveStdout: (line) => {
          if (line.trim() === 'readyok' && readyResolve) {
            const r = readyResolve;
            readyResolve = null;
            r();
          }
          self.postMessage({type: 'stdout', line: line});
        },
        onReceiveStderr: (line) => {
          self.postMessage({type: 'log', message: 'stderr: ' + line});
        },
        locateFile: (path) => {
          self.postMessage({type: 'log', message: 'locateFile: ' + path});
          return path;
        },
        mainScriptUrlOrBlob: 'pthread.js',
        onRuntimeInitialized: () => {
          self.postMessage({type: 'log', message: 'onRuntimeInitialized回调'});
        },
      });
      
      self.postMessage({type: 'log', message: '引擎初始化完成，配置' + threads + '线程/' + hashSize + 'MB...'});
      engine.sendCommand('uci');
      engine.sendCommand('setoption name Threads value ' + threads);
      engine.sendCommand('setoption name Hash value ' + hashSize);
      engine.sendCommand('isready');
      
      await new Promise((resolve) => {
        readyResolve = resolve;
        setTimeout(() => {
          if (readyResolve) { readyResolve = null; resolve(); }
        }, 10000);
      });
      
      self.postMessage({type: 'ready'});
    } catch(err) {
      self.postMessage({type: 'error', message: err.toString() + ' | ' + (err.stack||'')});
    }
  } else if (msg.type === 'command' && engine) {
    engine.sendCommand(msg.command);
  }
};
