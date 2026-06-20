const { spawn } = require('child_process');
const path = require('path');

// 启动 Vite 研发服务
const vite = spawn('npx', ['vite'], { 
  cwd: path.join(__dirname, '..'),
  shell: true, 
  stdio: 'inherit' 
});

// 延迟 2.5 秒等待 Vite 端口就绪，然后拉起 Electron
setTimeout(() => {
  const electron = spawn('npx', ['electron', '.'], { 
    cwd: path.join(__dirname, '..'),
    shell: true, 
    stdio: 'inherit' 
  });

  // 当 Electron 关闭时，自动杀掉 Vite 服务并退出
  electron.on('close', () => {
    vite.kill();
    process.exit();
  });
}, 2500);
