
var fs = require('fs');
var net = require('net');
var child_process = require('child_process');
var readline = require('readline');

var envConfig = {
  thunderbirdPath: '\"%ProgramFiles(x86)%\\Mozilla' +
    '\ Thunderbird\\Thunderbird.exe\"',
  chromeFilePath: 'chrome://mozilla_test/content/index.html'
};

function getStartThunderbirdCmd() {
  var startThunderbirdCmd = envConfig.thunderbirdPath + ' -chrome ' +
    envConfig.chromeFilePath + ' -jsconsole';
  console.log(startThunderbirdCmd);
  return startThunderbirdCmd;
}

function getFilePathFromArgs() {
  var args = process.argv.slice(2);
  var filePath = args[0];

  if(!filePath) {
    throw new Error('please specific the file path');
  }
  return filePath;
}

function generateActionBuffer() {
  function generateActionObj() {
    var fileBuffer = fs.readFileSync(getFilePathFromArgs());
    var fileListObj = JSON.parse(fileBuffer.toString());
    return { action: 'addTest', args: fileListObj };
  }
  var actionBuffer = new Buffer( JSON.stringify(generateActionObj()) );
  var headerBuffer =  new Buffer('mozilla_test');
  var packageBuffer = new Buffer(actionBuffer.length + 4 + headerBuffer.length);
  headerBuffer.copy(packageBuffer);
  packageBuffer.writeInt32BE(actionBuffer.length, headerBuffer.length);
  actionBuffer.copy(packageBuffer, headerBuffer.length + 4);
  return packageBuffer;
}


function startClient() {
  var clientSocket = net.connect({port: 8888}, function() {
    clientSocket.on('data', function(buffer) {
      var header = new Buffer('mozilla_test');
      var statusBuf = buffer.slice(header.length + 4);
      var obj = JSON.parse(statusBuf.toString());
      console.log('status of action' + obj.action + ' is ' + obj.status);
      clientSocket.end();
    });

    clientSocket.on('error', function(error) {
      clientSocket.destroy();
      console.log('rise a error ' + error + ', prepare to restart...');
      startClient();
    });

    clientSocket.write(generateActionBuffer());
  });
}

function requestAction() {
  var child = child_process.exec(getStartThunderbirdCmd(),
    function(err, stdout, stderr) {
    if(err) {
      console.log(err);
    }
    console.log('stdout: ' + stdout);
    console.log('stderr: ' + stderr);
  });
  startClient();
}


function endThunderbirdRun(callback) {
  var taskListProc = child_process.exec('tasklist',
    function(err, stdout, stderr) {
    var result = /thunderbird\.exe\s+(\d+)/.exec(stdout);
    if(!result) return callback();
    var killCmd = 'taskkill /F /PID ' + result[1];
    child_process.exec(killCmd, function(err, stdout, stderr) {
      callback();
    });
  });
}

endThunderbirdRun(requestAction);

